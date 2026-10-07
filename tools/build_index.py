#!/usr/bin/env python3
"""Validates every plugin and writes index.json.

    python3 tools/build_index.py              rewrite index.json
    python3 tools/build_index.py --check      fail if index.json is out of date
    python3 tools/build_index.py --validate   only check the plugins (optionally: ids)

Winnie downloads index.json first, then each plugin's files, and refuses any
file whose SHA-256 does not match the one recorded here. The rules below are
the same ones the app enforces before it installs a plugin.

Standard library only.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPOSITORY = "tonymtz/winnie-plugins"
SCHEMA = 1

SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
IDENTIFIER = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")
HOST = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")
VERSION = re.compile(r"^\d+\.\d+\.\d+$")
COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")

ALLOWED_EXTENSIONS = {".json", ".js", ".md"}
MAX_FILE_BYTES = 256 * 1024
MAX_LINE_LENGTH = 240
# Code must be readable in the repository: no dynamic code, no encoded blobs.
BANNED_IN_CODE = ["eval(", "Function(", "import(", "atob(", "fromCharCode", "\\x", "\\u00"]

CATEGORIES = {"tag-sources", "artwork", "lyrics", "batch-tools", "themes"}
FIELDS = {"title", "artist", "album", "albumArtist", "year", "track", "genre", "composer"}
SIDECAR_EXTENSIONS = {"lrc", "txt", "nfo", "json"}
PALETTE_KEYS = {"text", "textSecondary", "surface", "surfaceRaised", "tint", "selected",
                "accent", "accentHover", "onAccent", "dirty"}


class Invalid(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Invalid(message)


def check_localized(value, what):
    if isinstance(value, str):
        require(value.strip(), f"{what} is empty")
        return
    require(isinstance(value, dict) and value.get("en"), f"{what} needs text or an object with an \"en\" entry")
    for language, text in value.items():
        require(isinstance(text, str) and text.strip(), f"{what}.{language} is empty")


def check_code(path):
    source = path.read_text(encoding="utf-8")
    for number, line in enumerate(source.splitlines(), start=1):
        require(len(line) <= MAX_LINE_LENGTH,
                f"{path.name}:{number} is longer than {MAX_LINE_LENGTH} characters (minified code is not accepted)")
        for banned in BANNED_IN_CODE:
            require(banned not in line, f"{path.name}:{number} uses \"{banned}\", which is not allowed")
        require(all(ch == "\t" or ord(ch) >= 32 for ch in line), f"{path.name}:{number} has control characters")
    return source


def check_plugin(folder):
    files = sorted(p for p in folder.iterdir())
    for path in files:
        require(path.is_file() and not path.is_symlink(), f"{path.name}: only plain files are allowed")
        require(SAFE_NAME.match(path.name), f"{path.name}: unsupported file name")
        require(path.suffix in ALLOWED_EXTENSIONS, f"{path.name}: only .json, .js and .md files are allowed")
        require(path.stat().st_size <= MAX_FILE_BYTES, f"{path.name}: larger than {MAX_FILE_BYTES} bytes")

    manifest_path = folder / "plugin.json"
    require(manifest_path.exists(), "plugin.json is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    require(manifest.get("schema") == SCHEMA, f"schema must be {SCHEMA}")
    require(manifest.get("id") == folder.name, "id must match the folder name")
    require(SAFE_NAME.match(manifest["id"]), "id has unsupported characters")
    for key in ("name", "author"):
        require(isinstance(manifest.get(key), str) and manifest[key].strip(), f"{key} is missing")
    require(VERSION.match(str(manifest.get("version", ""))), "version must look like 1.0.0")
    require(manifest.get("category") in CATEGORIES, f"category must be one of {sorted(CATEGORIES)}")
    check_localized(manifest.get("description"), "description")
    require(isinstance(manifest.get("listed", True), bool), "listed must be true or false")

    permissions = manifest.get("permissions", {})
    for host in permissions.get("network", []):
        require(isinstance(host, str) and "*" not in host,
                f"network host \"{host}\": wildcards are not allowed, list each host exactly")
        require(HOST.match(host), f"network host \"{host}\" must be an exact lower-case host name (no scheme, port or path)")
    for extension in permissions.get("sidecar", []):
        require(extension in SIDECAR_EXTENSIONS, f"sidecar extension \"{extension}\" is not allowed")

    contributes = manifest.get("contributes", {})
    actions = contributes.get("actions", [])
    main = manifest.get("main")
    source = ""
    if main is not None:
        require(main.endswith(".js") and (folder / main).is_file(), "main must name a .js file in the plugin folder")
    for path in files:
        if path.suffix == ".js":
            code = check_code(path)
            if path.name == main:
                source = code
    require(not actions or main, "actions need a main script")

    for action in actions:
        require(SAFE_NAME.match(str(action.get("id", ""))), "action id is missing or unsupported")
        check_localized(action.get("title"), f"action {action.get('id')} title")
        function = str(action.get("function", ""))
        require(IDENTIFIER.match(function), f"action {action.get('id')} needs a function name")
        require(re.search(r"function\s+" + re.escape(function) + r"\s*\(", source),
                f"{main} does not define function {function}()")

    for field in contributes.get("fields", []):
        require(field.get("field") in FIELDS, f"field must be one of {sorted(FIELDS)}")
        require(field.get("control") == "select", "the only supported control is \"select\"")
        options = field.get("options")
        require(isinstance(options, list) and options and all(isinstance(o, str) and o.strip() for o in options),
                "select needs a list of options")

    for theme in contributes.get("themes", []):
        require(SAFE_NAME.match(str(theme.get("id", ""))), "theme id is missing or unsupported")
        check_localized(theme.get("name"), f"theme {theme.get('id')} name")
        require(theme.get("light") or theme.get("dark"), "a theme needs a light or a dark palette")
        for scheme in ("light", "dark"):
            for key, value in (theme.get(scheme) or {}).items():
                require(key in PALETTE_KEYS, f"unknown palette key \"{key}\"")
                require(isinstance(value, str) and COLOR.match(value), f"{scheme}.{key} must look like #RRGGBB")

    entry = {
        "id": manifest["id"],
        "name": manifest["name"],
        "author": manifest["author"],
        "version": manifest["version"],
        "icon": manifest.get("icon", "puzzle"),
        "category": manifest["category"],
        "description": manifest["description"],
        "listed": manifest.get("listed", True),
        "network": permissions.get("network", []),
        "path": f"plugins/{folder.name}",
        "files": [
            {
                "path": path.name,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "size": path.stat().st_size,
            }
            for path in files
        ],
    }
    return entry


def main():
    entries, problems = [], []
    only = [argument for argument in sys.argv[1:] if not argument.startswith("--")]
    for missing in only:
        if not (ROOT / "plugins" / missing).is_dir():
            problems.append(f"plugins/{missing}: no such plugin")
    for folder in sorted((ROOT / "plugins").iterdir()):
        if not folder.is_dir() or (only and folder.name not in only):
            continue
        try:
            entries.append(check_plugin(folder))
        except (Invalid, json.JSONDecodeError, UnicodeDecodeError, KeyError) as error:
            problems.append(f"plugins/{folder.name}: {error}")

    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1

    if "--validate" in sys.argv:
        print(f"{len(entries)} plugin(s) pass the rules")
        return 0

    index = {"schema": SCHEMA, "repository": REPOSITORY, "plugins": entries}
    rendered = json.dumps(index, indent=2, ensure_ascii=False) + "\n"
    index_path = ROOT / "index.json"

    if "--check" in sys.argv:
        if not index_path.exists() or index_path.read_text(encoding="utf-8") != rendered:
            print("index.json is out of date: run python3 tools/build_index.py", file=sys.stderr)
            return 1
        print(f"{len(entries)} plugins valid, index.json up to date")
        return 0

    index_path.write_text(rendered, encoding="utf-8")
    print(f"{len(entries)} plugins valid, index.json written")
    return 0


if __name__ == "__main__":
    sys.exit(main())

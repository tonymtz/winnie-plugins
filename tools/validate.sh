#!/bin/sh
# Checks that plugins are well built and cannot break Winnie.
#
#   tools/validate.sh                 every plugin, plus index.json
#   tools/validate.sh my-plugin       one plugin (or several)
#
# Three checks, in order:
#   1. Rules     file types, readable source, manifest fields, exact network
#                hosts (tools/build_index.py --validate).
#   2. Behaviour every action is run in a JavaScript engine against a stand-in
#                for the app, under bad conditions: offline, server errors,
#                empty and malformed responses, tracks without tags, a full
#                disk. A plugin fails if it crashes, hangs, calls a host or
#                writes a file type it did not declare, or sets an unknown tag.
#   3. Index     index.json matches the plugins (only when checking everything).
#
# Needs python3 and either macOS (JavaScriptCore is built in) or Node.js.
# Set WINNIE_JS_ENGINE to force a particular engine binary.

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TIMEOUT=20
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc

if [ -n "${WINNIE_JS_ENGINE:-}" ]; then
  ENGINE=$WINNIE_JS_ENGINE
elif [ -x "$JSC" ]; then
  ENGINE=$JSC
elif command -v node >/dev/null 2>&1; then
  ENGINE=node
else
  echo "error: no JavaScript engine found. Install Node.js (macOS has one built in)." >&2
  exit 2
fi
command -v python3 >/dev/null 2>&1 || { echo "error: python3 is required." >&2; exit 2; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/winnie-validate.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

failed=0

echo "== Rules"
if ! python3 "$ROOT/tools/build_index.py" --validate "$@"; then
  echo "Fix the problems above first; behaviour checks were skipped."
  exit 1
fi

if [ "$#" -gt 0 ]; then
  plugins="$*"
else
  plugins=$(cd "$ROOT/plugins" && ls)
fi

echo "== Behaviour"
for id in $plugins; do
  folder="$ROOT/plugins/$id"
  [ -d "$folder" ] || continue

  # Assemble harness + plugin script + a table of its action functions.
  bundle="$WORK/$id.js"
  if ! python3 - "$folder" "$ROOT/tools/harness.js" "$bundle" <<'PY'
import json, sys
from pathlib import Path

folder, harness, bundle = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
manifest = json.loads((folder / "plugin.json").read_text(encoding="utf-8"))
main = manifest.get("main")
if not main:
    sys.exit(3)  # no code to run
functions = sorted({a["function"] for a in manifest.get("contributes", {}).get("actions", [])})
table = ", ".join(f'"{name}": typeof {name} === "function" ? {name} : undefined' for name in functions)
bundle.write_text(
    harness.read_text(encoding="utf-8")
    + "\n// ---- plugin script ----\n"
    + (folder / main).read_text(encoding="utf-8")
    + "\n// ---- run ----\n"
    + f"__h.run({json.dumps(manifest)}, {{ {table} }});\n",
    encoding="utf-8",
)
PY
  then
    echo "  ok    $id (no script: data only)"
    continue
  fi

  # perl's alarm stops a script that never returns (an endless loop would
  # leave Winnie's plugin buttons disabled until relaunch).
  output=$(perl -e 'alarm shift; exec @ARGV' "$TIMEOUT" "$ENGINE" "$bundle" 2>&1)
  status=$?

  if echo "$output" | grep -q "^HARNESS OK"; then
    echo "  ok    $id ($(echo "$output" | sed -n 's/^HARNESS OK //p'))"
  else
    failed=1
    echo "  FAIL  $id"
    if [ "$status" -eq 142 ] || [ "$status" -eq 14 ]; then
      echo "        did not finish within ${TIMEOUT}s (endless loop?)"
    fi
    problems=$(echo "$output" | sed -n 's/^PROBLEM /        /p')
    if [ -n "$problems" ]; then
      echo "$problems" | head -8
      count=$(echo "$problems" | wc -l | tr -d ' ')
      [ "$count" -gt 8 ] && echo "        ... and $((count - 8)) more"
    elif ! echo "$output" | grep -q "^HARNESS"; then
      # The script did not even load: show the engine's own error.
      echo "$output" | sed 's/^/        /' | head -20
    fi
  fi
done

if [ "$#" -eq 0 ]; then
  echo "== Index"
  python3 "$ROOT/tools/build_index.py" --check || failed=1
fi

if [ "$failed" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Validation failed."
fi
exit "$failed"

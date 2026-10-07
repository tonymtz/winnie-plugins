# Winnie plugins

Plugins for Winnie, the audio tag editor for macOS and iPad. This repository
is the only place Winnie installs plugins from: the app reads `index.json`
here, shows the plugins in its plugin manager, and downloads the ones the user
picks.

| Plugin | What it does |
| --- | --- |
| `lrclib-lyrics` | Finds lyrics on lrclib.net and saves them as `.lrc` or `.txt` next to the audio file |
| `musicbrainz-lookup` | Fills in a track's empty tags from MusicBrainz |
| `genres-picker` | Turns the Genre field into a dropdown with a fixed list |
| `theme-midnight`, `theme-paper` | Colour themes with light and dark palettes |
| `sample-plugin` | Template for authors; unlisted, so it never appears in the app |

## What a plugin can do

| Contribution | What it adds | Needs code? |
| --- | --- | --- |
| **Actions** | A button in the inspector that runs a function on the selected track | Yes (`main.js`) |
| **Fields** | Turns a tag field from free text into a dropdown with a fixed list | No |
| **Themes** | A light and/or dark colour palette | No |

A plugin only ever *adds* to Winnie. It cannot remove or replace the app's own
buttons, fields or behaviour.

## Rules

`tools/validate.sh` checks these on every pull request, and Winnie checks them
again on the device before installing anything.

- **Readable source only.** Plain `.json`, `.js` and `.md` files. Minified or
  generated code, `eval`, `Function(...)`, dynamic `import` and encoded
  strings are rejected.
- **No network unless declared.** A plugin connects to nothing by default. To
  call a service it lists the exact host under `permissions.network`.
  Wildcards are not allowed: `api.example.org` does not cover `example.org` or
  `cdn.example.org`, each host is listed on its own. Requests are HTTPS GET
  only, and a redirect to an unlisted host is blocked. The plugin manager
  shows users the hosts before they install.
- **No files beyond the selected track.** A script never sees a path. It can
  write `<audio file name>.<ext>` next to the selected file, for the
  extensions it lists under `permissions.sidecar`.
- **Tag changes are staged, never saved.** The user reviews them and presses Save.
- **No self-updates.** An installed plugin stays at its version until the
  user presses Update in the plugin manager.
- **macOS and iPad.** Plugins are data and JavaScript, so one plugin runs on both.

## Quick start

```sh
cp -R plugins/sample-plugin plugins/my-plugin
# edit plugins/my-plugin/plugin.json: set "id" to "my-plugin", remove "listed": false
tools/validate.sh my-plugin
python3 tools/build_index.py
```

Then open a pull request.

## Documentation

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): writing, validating and trying a plugin in the app; how updates and the "New" badge work; review checklist.
- [docs/API.md](docs/API.md): every `plugin.json` field and the `winnie` script API.

## Layout

```
index.json                  generated: every plugin, its hosts, and a SHA-256 per file
plugins/<id>/plugin.json    manifest (id must equal the folder name)
plugins/<id>/main.js        script, only if the plugin has actions
tools/validate.sh           checks a plugin is well built and safe to run
tools/build_index.py        rule checks, and rebuilds index.json
tools/harness.js            the stand-in app that validate.sh runs scripts against
```

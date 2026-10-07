# Plugin reference

## plugin.json

```json
{
  "schema": 1,
  "id": "my-plugin",
  "name": "My Plugin",
  "author": "Your Name",
  "version": "1.0.0",
  "icon": "wand",
  "category": "tag-sources",
  "listed": true,
  "description": { "en": "What it does.", "es": "Lo que hace." },
  "main": "main.js",
  "permissions": {
    "network": ["api.example.org"],
    "sidecar": ["txt"]
  },
  "contributes": {
    "actions": [],
    "fields": [],
    "themes": []
  }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `schema` | yes | Always `1` |
| `id` | yes | Must equal the folder name. Letters, digits, `.`, `_`, `-` |
| `name`, `author` | yes | Shown on the plugin's card |
| `version` | yes | `major.minor.patch`. Raise it whenever a published plugin changes |
| `icon` | no | `wand`, `list`, `alignLeft`, `moon`, `palette`, `tags`, `image`, `layers`, `music`, `disc`, `search`, `language`, `cursor`, `download`, `wave`. Anything else shows a puzzle piece |
| `category` | yes | `tag-sources`, `artwork`, `lyrics`, `batch-tools` or `themes` |
| `listed` | no | `false` hides the plugin from the plugin manager. Default `true` |
| `description` | yes | Localized text (see below) |
| `main` | with actions | The `.js` file that holds the action functions |
| `permissions` | no | See below. Leaving it out means no network and no files |
| `contributes` | no | What the plugin adds |

**Localized text** is either a plain string or an object keyed by language
code. `en` is required; `es` is the other language Winnie speaks.

### permissions.network

The exact hosts the plugin may contact. Nothing else is reachable.

- One entry per host, lower case, no scheme, port or path: `"lrclib.net"`.
- **No wildcards.** `"*.example.org"` and `"*"` are rejected. A host does not
  cover its subdomains or its parent domain.
- Requests are HTTPS GET. A redirect is followed only if it stays on a listed host.
- An empty list or a missing key means the plugin never touches the network.
- The hosts are copied into `index.json` and shown in the plugin manager. If
  the plugin's own list differs from the index, Winnie refuses to install it.

### permissions.sidecar

Extensions of the files the plugin may write next to the selected audio file:
`lrc`, `txt`, `nfo`, `json`. The file name is always the audio file's name
with that extension; a plugin cannot choose a folder or another name.

### contributes.actions

```json
{ "id": "fetch-lyrics", "title": { "en": "Fetch Lyrics", "es": "Buscar letra" }, "icon": "alignLeft", "function": "fetchLyrics" }
```

Adds a button under the tag fields. `function` names a top-level function in
`main`. Actions run on the single selected track.

### contributes.fields

```json
{ "field": "genre", "control": "select", "options": ["Jazz", "Rock"] }
```

Turns a tag field into a dropdown. `field` is one of `title`, `artist`,
`album`, `albumArtist`, `year`, `track`, `genre`, `composer`. `select` is the
only control. A file whose current value is not on the list keeps that value
as an extra option, so opening a file never loses a tag. Disabling the plugin
turns the field back into free text.

### contributes.themes

```json
{
  "id": "mine",
  "name": { "en": "Mine" },
  "light": { "accent": "#0F766E", "accentHover": "#115E59" },
  "dark": { "accent": "#14B8A6" }
}
```

At least one of `light` and `dark`. Every key is optional `#RRGGBB`; whatever
is left out keeps Winnie's own colour for that appearance.

| Key | Used for |
| --- | --- |
| `text`, `textSecondary` | Primary and secondary text, icons |
| `surface` | Window background |
| `surfaceRaised` | Cards and focused fields |
| `tint` | Borders, hover fills, progress tracks (at various opacities) |
| `selected` | Selected row and active navigation item (defaults to `tint`) |
| `accent`, `accentHover` | Primary buttons, toggles, the logo (hover defaults to `accent`) |
| `onAccent` | Text on accent-coloured buttons |
| `dirty` | Text of unsaved values (defaults to `accent`) |

Installing a theme plugin applies its first theme immediately. Users switch
themes, or go back to Winnie's own colours, in Preferences ▸ General. Light,
Dark and Auto keep working with any theme.

## Script API

Each action function is called with the selected track and may return a
message.

```js
function fetchLyrics(track) {
  if (!track.title) throw new Error("Add a title first.");
  var response = winnie.http.get("https://lrclib.net/api/search?track_name=" + encodeURIComponent(track.title));
  if (response.status !== 200) throw new Error("Could not reach lrclib.net.");
  // ...
  return "Lyrics saved.";
}
```

### The track

All values are strings, trimmed, and reflect what is in the inspector right
now (including unsaved edits). Missing tags are `""`.

| Property | Example |
| --- | --- |
| `fileName` | `"01 - First Light.flac"` |
| `baseName` | `"01 - First Light"` |
| `format` | `"flac"`, `"mp3"` or `"m4a"` |
| `title`, `artist`, `album`, `albumArtist`, `year`, `track`, `genre`, `composer` | tag values; `track` looks like `"4"` or `"4/12"` |

### Results

| The function… | Winnie shows… |
| --- | --- |
| returns a string | the string, under the buttons |
| returns nothing | nothing |
| throws `new Error("message")` | the message, as a failure |

### winnie

| Member | |
| --- | --- |
| `winnie.language` | `"en"` or `"es"`: the app's language, for your messages |
| `winnie.http.get(url, headers)` | Synchronous HTTPS GET. Returns `{ status, body }`. `status` is `0` if the host is not declared, the URL is not `https://`, the device is offline, or the response is larger than 2 MB. `headers` is optional; `User-Agent` and `Cookie` are set by Winnie |
| `winnie.tags.set({ field: value })` | Stages values on the selected track as unsaved edits. Unknown fields are ignored; values are trimmed and capped at 512 characters |
| `winnie.files.writeSidecar(ext, text)` | Writes `<baseName>.<ext>` (UTF-8, up to 1 MB) next to the audio file, replacing an existing one. Returns `true` on success, `false` if `ext` is not declared or the write failed |
| `winnie.files.hasSidecar(ext)` | Whether that file exists |
| `winnie.log(text)` | Printed in debug builds only |

### The environment

Scripts run in JavaScriptCore with the language itself and nothing else:
no `fetch`, `XMLHttpRequest`, `require`, `import`, DOM, timers, `console`, or
file system. `eval` and `Function` are removed. Each run starts from a clean
context, so nothing is remembered between runs.

Scripts run off the main thread, so a slow request never freezes the app, but
the plugin buttons stay disabled until the function returns. Winnie cannot
interrupt a script: never loop without a bound.

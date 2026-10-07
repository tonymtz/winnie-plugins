# Developing plugins

## Requirements

- `python3` (standard library only)
- A JavaScript engine: macOS has one built in; elsewhere install Node.js
- To try a plugin in the app: a debug build of Winnie from Xcode

## 1. Start from the sample

```sh
cp -R plugins/sample-plugin plugins/my-plugin
```

In `plugins/my-plugin/plugin.json` set `id` to `my-plugin` (it must match the
folder name) and remove `"listed": false` when you want it to appear in the
plugin manager. Delete the contributions you do not need: a theme or a field
plugin is just `plugin.json`, with no `main` and no `permissions`.

See [API.md](API.md) for every field and the script API.

## 2. Write defensively

Winnie catches whatever a script throws, so a bad plugin cannot take the app
down, but a user who sees `TypeError: undefined is not an object` has a broken
plugin. The validator fails scripts that do this. In practice:

- Check `response.status` before using `response.body`. It is `0` when the
  device is offline.
- Wrap `JSON.parse` in `try`/`catch`, and check the shape of what you get
  back before reading into it.
- Expect empty tags. `track.title` is `""` for an untagged file.
- Throw `new Error("a sentence for the user")` for problems the user can act on.
- Return a short message saying what happened.
- Never loop without a bound; Winnie cannot interrupt a script.
- Use `winnie.language` to answer in English or Spanish.

## 3. Validate

```sh
tools/validate.sh my-plugin     # one plugin
tools/validate.sh               # everything, plus index.json
```

It runs three checks and exits non-zero if any fails:

1. **Rules.** Allowed file types and sizes, readable source (no minified
   lines, `eval`, `Function(`, `import(`, encoded strings), manifest fields,
   exact network hosts with no wildcards, allowed sidecar extensions, every
   action's function defined in `main`.
2. **Behaviour.** Each action is run in a real JavaScript engine against a
   stand-in for the app (`tools/harness.js`): three tracks (full tags, no
   tags, awkward characters) × eleven server responses (offline, 500, 503,
   404, empty body, HTML instead of JSON, empty and junk JSON) × disk
   writable or full. A plugin fails if it:
   - crashes with a `TypeError`, `ReferenceError`, `SyntaxError` or
     `RangeError`, or does not load at all;
   - does not finish within 20 seconds;
   - requests a host that is not in `permissions.network`, or a non-HTTPS URL;
   - writes a file type that is not in `permissions.sidecar`;
   - sets a tag field that does not exist, or sets one to a non-text value;
   - returns something other than a string, or throws an `Error` with no message.
3. **Index.** `index.json` matches the plugins (when run without arguments).

Example of a failure:

```
== Behaviour
  FAIL  my-plugin
        do-it [full tags, empty body]: crashed with SyntaxError: JSON Parse error: Unexpected EOF
        do-it [no tags, offline]: requested host "cdn.example.org", which is not listed under permissions.network
```

The harness checks that a script copes with bad conditions. It does not know
what your service really returns, so also try the plugin for real (next step).

## 4. Try it in the app

A debug build of Winnie can read plugins from a local checkout instead of
GitHub. In Xcode, edit the scheme's Run arguments (or pass them on the command
line):

```
-uitestPluginSource /path/to/winnie-plugins
-uitestInstallPlugins my-plugin
```

- `-uitestPluginSource <folder>` uses that folder as the repository. Run
  `python3 tools/build_index.py` first: the app verifies every file against
  `index.json`, exactly as it does for GitHub.
- `-uitestInstallPlugins id1,id2` installs those plugins at launch (optional;
  you can also install from the plugin manager). Unlisted plugins cannot be
  installed this way either; remove `"listed": false` while testing.
- `-uitestTheme <plugin-id>/<theme-id>` selects a theme at launch.
- `-uitestFresh YES` runs with throwaway settings and plugins.

These options exist only in debug builds. Release builds always use
`https://raw.githubusercontent.com/tonymtz/winnie-plugins/main`.

The app's sandbox only lets it read folders the user picked, so with a
sandboxed build keep the checkout somewhere the app can read, or run the
iPad simulator build, which can read the host's files.

## 5. Publish

```sh
tools/validate.sh
python3 tools/build_index.py
git add plugins/my-plugin index.json
```

Open a pull request. CI runs `tools/validate.sh`. Once merged to `main` the
plugin is live: the app reads `index.json` straight from that branch.

## How installs, updates and badges work

- **Install.** The app downloads `index.json`, checks that it names
  `tonymtz/winnie-plugins`, downloads each file of the plugin, and compares
  size and SHA-256 with the index. It then re-checks the plugin rules on the
  device. Anything that does not match is refused and nothing is installed.
- **Update.** Installed plugins are files on the device and are never
  replaced in the background. When `version` in the index is higher than the
  installed one, the plugin manager shows an Update button. Changing a
  plugin's files without raising `version` means existing users never get the
  change, so always bump it.
- **New badge.** The app remembers which plugin ids it has shown. A plugin
  added to the repository later gets a "New" badge the next time the user
  opens the plugin manager. On the very first visit nothing is marked new.
- **Unlisted.** `"listed": false` plugins are in `index.json` but the app
  never shows or installs them.
- **Removing a plugin from the repository** does not uninstall it for users
  who already have it; it stays in their Installed list until they remove it.

## Review checklist (maintainers)

Automated checks cover structure and robustness. A person still has to read
the code, because whatever is merged to `main` reaches users:

- Does the script do what the description says, and only that?
- Is every host in `permissions.network` necessary, and is it the service's
  real host? What does the plugin send there (it can only send tag text and
  file names, but check the query strings)?
- Are sidecar writes expected by the user (clear from the action's title)?
- Is `version` raised if a published plugin changed?
- Was `index.json` regenerated in the same pull request (CI fails otherwise)?

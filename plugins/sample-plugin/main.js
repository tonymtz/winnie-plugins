// Sample Plugin
// A small tour of everything a plugin can do. Copy this folder, rename it,
// and change "id" in plugin.json to match the new folder name.
//
// Each action in plugin.json names a function in this file. Winnie calls it
// with the selected track:
//
//   track.fileName   "01 - First Light.flac"
//   track.baseName   "01 - First Light"
//   track.format     "flac" | "mp3" | "m4a"
//   track.title, track.artist, track.album, track.albumArtist,
//   track.year, track.track, track.genre, track.composer
//
// Return a string to show a message under the button. Throw an Error to show
// it as a failure.

// Action 1: change tags. The edit is staged, not saved: the user still
// reviews it and presses Save Changes.
function tidyTitle(track) {
  if (!track.title) {
    throw new Error("This track has no title yet.");
  }
  var tidy = String(track.title).replace(/\s+/g, " ").trim();
  if (tidy === track.title) {
    return "The title is already tidy.";
  }
  winnie.tags.set({ title: tidy });
  return "Title tidied.";
}

// Action 2: write a file next to the audio file. Only the extensions listed
// under permissions.sidecar are allowed, and the name is always the audio
// file's own name with that extension.
function exportTags(track) {
  var lines = [
    "Title: " + track.title,
    "Artist: " + track.artist,
    "Album: " + track.album,
    "Year: " + track.year
  ];
  if (!winnie.files.writeSidecar("txt", lines.join("\n") + "\n")) {
    throw new Error("The file could not be written.");
  }
  winnie.log("exported tags for " + track.fileName);
  return "Saved " + track.baseName + ".txt";
}

// To call a web API, list its host under permissions.network and use:
//
//   var response = winnie.http.get("https://example.org/api?q=" + encodeURIComponent(track.title));
//   if (response.status !== 200) throw new Error("Could not reach the service.");
//
// response.status is 0 when the request was blocked or the device is offline.
// Wrap JSON.parse in try/catch: tools/validate.sh feeds every action empty
// and malformed responses and fails the plugin if it trips over them.

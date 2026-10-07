// LRCLIB Lyrics
// Looks the selected track up on https://lrclib.net and saves the lyrics next
// to the audio file: "<name>.lrc" when synced lyrics exist, "<name>.txt"
// otherwise. Nothing is written into the audio file itself.

var MESSAGES = {
  en: {
    needTitle: "Add a title first so the track can be looked up.",
    offline: "Could not reach lrclib.net.",
    notFound: "No lyrics found for this track.",
    instrumental: "LRCLIB lists this track as instrumental.",
    savedSynced: "Synced lyrics saved as ",
    savedPlain: "Lyrics saved as ",
    writeFailed: "The lyrics file could not be written."
  },
  es: {
    needTitle: "Añade primero un título para poder buscar la pista.",
    offline: "No se pudo conectar con lrclib.net.",
    notFound: "No se encontró la letra de esta pista.",
    instrumental: "LRCLIB indica que esta pista es instrumental.",
    savedSynced: "Letra sincronizada guardada como ",
    savedPlain: "Letra guardada como ",
    writeFailed: "No se pudo escribir el archivo de la letra."
  }
};

function text(key) {
  var table = MESSAGES[winnie.language] || MESSAGES.en;
  return table[key];
}

function sameText(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

// The response body as a list; anything unexpected counts as "no results".
function parseList(body) {
  try {
    var parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

// Prefers an exact title + artist match that has synced lyrics.
function pickBest(results, track) {
  var best = null;
  var bestScore = -1;
  for (var i = 0; i < results.length; i++) {
    var item = results[i] || {};
    var score = 0;
    if (sameText(item.trackName, track.title)) score += 4;
    if (track.artist && sameText(item.artistName, track.artist)) score += 3;
    if (track.album && sameText(item.albumName, track.album)) score += 1;
    if (item.syncedLyrics) score += 2;
    if (item.plainLyrics) score += 1;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function fetchLyrics(track) {
  if (!track.title) {
    throw new Error(text("needTitle"));
  }

  var url = "https://lrclib.net/api/search?track_name=" + encodeURIComponent(track.title);
  if (track.artist) url += "&artist_name=" + encodeURIComponent(track.artist);
  if (track.album) url += "&album_name=" + encodeURIComponent(track.album);

  var response = winnie.http.get(url);
  if (response.status !== 200) {
    throw new Error(text("offline"));
  }

  var results = parseList(response.body);
  if (results.length === 0) {
    return text("notFound");
  }

  var match = pickBest(results, track);
  if (!match) {
    return text("notFound");
  }
  if (match.syncedLyrics) {
    if (!winnie.files.writeSidecar("lrc", match.syncedLyrics)) throw new Error(text("writeFailed"));
    return text("savedSynced") + track.baseName + ".lrc";
  }
  if (match.plainLyrics) {
    if (!winnie.files.writeSidecar("txt", match.plainLyrics)) throw new Error(text("writeFailed"));
    return text("savedPlain") + track.baseName + ".txt";
  }
  return match.instrumental ? text("instrumental") : text("notFound");
}

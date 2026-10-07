// MusicBrainz Lookup
// Searches https://musicbrainz.org for the selected track and fills in the
// tags that are empty. Existing values are never replaced, and nothing is
// written to disk: the new values show up as unsaved edits for you to review.

var MESSAGES = {
  en: {
    nothingMissing: "This track already has all of its tags.",
    offline: "Could not reach MusicBrainz.",
    busy: "MusicBrainz is busy. Try again in a moment.",
    notFound: "No confident match on MusicBrainz.",
    filled: "Filled from MusicBrainz: "
  },
  es: {
    nothingMissing: "Esta pista ya tiene todas sus etiquetas.",
    offline: "No se pudo conectar con MusicBrainz.",
    busy: "MusicBrainz está ocupado. Inténtalo de nuevo en un momento.",
    notFound: "No hay una coincidencia fiable en MusicBrainz.",
    filled: "Completado desde MusicBrainz: "
  }
};

var FIELD_NAMES = {
  en: { title: "title", artist: "artist", album: "album", albumArtist: "album artist", year: "year", track: "track" },
  es: { title: "título", artist: "artista", album: "álbum", albumArtist: "artista del álbum", year: "año", track: "pista" }
};

var LOOKUP_FIELDS = ["title", "artist", "album", "albumArtist", "year", "track"];
var MINIMUM_SCORE = 85;

function text(key) {
  var table = MESSAGES[winnie.language] || MESSAGES.en;
  return table[key];
}

function quote(value) {
  return '"' + String(value).replace(/["\\]/g, " ") + '"';
}

// "03 - First Light" -> "First Light"
function titleFromFileName(baseName) {
  return String(baseName).replace(/^\s*\d+\s*[-._)]\s*/, "").replace(/_/g, " ").trim();
}

function creditName(credits) {
  if (!credits || credits.length === 0) return "";
  var name = "";
  for (var i = 0; i < credits.length; i++) {
    var credit = credits[i] || {};
    name += (credit.name || "") + (credit.joinphrase || "");
  }
  return name.trim();
}

// The recordings in a search response; anything unexpected counts as "no results".
function parseRecordings(body) {
  try {
    var parsed = JSON.parse(body);
    return parsed && Array.isArray(parsed.recordings) ? parsed.recordings : [];
  } catch (error) {
    return [];
  }
}

function isStudioAlbum(release) {
  var group = release["release-group"] || {};
  var secondary = group["secondary-types"] || [];
  return release.status === "Official" && group["primary-type"] === "Album" && secondary.length === 0;
}

function sameText(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

// The album the user already typed wins; otherwise the earliest studio album.
// Compilations, live albums and bootlegs are never used to fill the album in.
function pickRelease(releases, wantedAlbum) {
  var best = null;
  for (var i = 0; i < (releases || []).length; i++) {
    var release = releases[i] || {};
    if (wantedAlbum && sameText(release.title, wantedAlbum)) return release;
    if (!wantedAlbum && isStudioAlbum(release)) {
      if (!best || String(release.date || "9999") < String(best.date || "9999")) best = release;
    }
  }
  return best;
}

// Prefers the original studio recording over live takes and re-recordings:
// best rank first, then the earliest first release.
function pickRecording(recordings, wantedAlbum) {
  var best = null;
  var bestRank = -1;
  var bestDate = "";
  for (var i = 0; i < recordings.length; i++) {
    var recording = recordings[i] || {};
    if (!(Number(recording.score) >= MINIMUM_SCORE)) continue;
    var rank = Number(recording.score);
    if (pickRelease(recording.releases, wantedAlbum)) rank += 20;
    if (/live|demo|remix/i.test(recording.disambiguation || "")) rank -= 20;
    var date = String(recording["first-release-date"] || "9999");
    if (rank > bestRank || (rank === bestRank && date < bestDate)) {
      best = recording;
      bestRank = rank;
      bestDate = date;
    }
  }
  return best;
}

function fillMissingTags(track) {
  var missing = LOOKUP_FIELDS.filter(function (field) { return !track[field]; });
  if (missing.length === 0) {
    return text("nothingMissing");
  }

  var title = track.title || titleFromFileName(track.baseName);
  var query = "recording:" + quote(title);
  if (track.artist) query += " AND artist:" + quote(track.artist);
  if (track.album) query += " AND release:" + quote(track.album);

  var url = "https://musicbrainz.org/ws/2/recording?fmt=json&limit=25&query=" + encodeURIComponent(query);
  var response = winnie.http.get(url);
  if (response.status === 503) {
    throw new Error(text("busy"));
  }
  if (response.status !== 200) {
    throw new Error(text("offline"));
  }

  var recordings = parseRecordings(response.body);
  var recording = pickRecording(recordings, track.album);
  if (!recording) {
    return text("notFound");
  }

  var release = pickRelease(recording.releases, track.album);
  var found = {
    title: recording.title || "",
    artist: creditName(recording["artist-credit"]),
    album: "",
    albumArtist: "",
    year: String(recording["first-release-date"] || "").slice(0, 4),
    track: ""
  };

  if (release) {
    found.album = release.title || "";
    found.albumArtist = creditName(release["artist-credit"]) || found.artist;
    if (!found.year && release.date) found.year = String(release.date).slice(0, 4);
    var medium = release.media && release.media[0];
    var position = medium && medium.track && medium.track[0] && medium.track[0].number;
    if (position && /^\d+$/.test(position)) {
      found.track = medium["track-count"] ? position + "/" + medium["track-count"] : position;
    }
  }

  var changes = {};
  var names = [];
  var labels = FIELD_NAMES[winnie.language] || FIELD_NAMES.en;
  missing.forEach(function (field) {
    if (found[field]) {
      changes[field] = found[field];
      names.push(labels[field]);
    }
  });

  if (names.length === 0) {
    return text("notFound");
  }
  winnie.tags.set(changes);
  return text("filled") + names.join(", ") + ".";
}

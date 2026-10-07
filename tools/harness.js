// Test harness used by tools/validate.sh. Not part of any plugin.
//
// validate.sh puts three things in one file and runs it with JavaScriptCore
// (macOS) or Node: this harness, the plugin's script, and a table of the
// plugin's action functions. The harness provides a stand-in for the `winnie`
// object that Winnie gives plugins, then calls every action under a set of
// awkward conditions: offline, server errors, empty and malformed responses,
// tracks with no tags. A well-built plugin survives all of them.

var __h = {
  manifest: null,
  scenario: null,
  problems: [],
  calls: 0,
  out: typeof print === "function" ? print : function (line) { console.log(line); }
};

__h.KNOWN_FIELDS = ["title", "artist", "album", "albumArtist", "year", "track", "genre", "composer"];

__h.problem = function (text) {
  __h.problems.push(__h.scenario.action + " [" + __h.scenario.name + "]: " + text);
};

__h.hostOf = function (url) {
  var match = /^https:\/\/([^\/:?#]+)(?::\d+)?(?:[\/?#]|$)/.exec(String(url));
  return match ? match[1].toLowerCase() : null;
};

// The same surface the app provides (see docs/API.md), with recorded misuse.
var winnie = Object.freeze({
  language: "en",
  http: Object.freeze({
    get: function (url, headers) {
      __h.calls += 1;
      if (__h.calls > 50) throw new Error("__harness: more than 50 requests in one action");
      var host = __h.hostOf(url);
      var allowed = (__h.manifest.permissions && __h.manifest.permissions.network) || [];
      if (host === null) {
        __h.problem("requested \"" + url + "\", which is not an https:// URL");
        return { status: 0, body: "" };
      }
      if (allowed.indexOf(host) === -1) {
        __h.problem("requested host \"" + host + "\", which is not listed under permissions.network");
        return { status: 0, body: "" };
      }
      return { status: __h.scenario.status, body: __h.scenario.body };
    }
  }),
  tags: Object.freeze({
    set: function (changes) {
      if (changes === null || typeof changes !== "object") {
        __h.problem("winnie.tags.set was called without an object");
        return;
      }
      Object.keys(changes).forEach(function (field) {
        if (__h.KNOWN_FIELDS.indexOf(field) === -1) __h.problem("set unknown tag field \"" + field + "\"");
        var value = changes[field];
        if (typeof value !== "string" && typeof value !== "number") {
          __h.problem("set \"" + field + "\" to a " + (value === null ? "null" : typeof value) + " instead of text");
        }
      });
    }
  }),
  files: Object.freeze({
    writeSidecar: function (extension, text) {
      var allowed = (__h.manifest.permissions && __h.manifest.permissions.sidecar) || [];
      if (allowed.indexOf(String(extension)) === -1) {
        __h.problem("wrote a ." + extension + " file, which is not listed under permissions.sidecar");
        return false;
      }
      if (typeof text !== "string") __h.problem("writeSidecar was given a " + typeof text + " instead of text");
      return __h.scenario.canWrite;
    },
    hasSidecar: function () { return false; }
  }),
  log: function () {}
});

__h.FULL_TRACK = {
  fileName: "03 - Glass Highway.flac", baseName: "03 - Glass Highway", format: "flac",
  title: "Glass Highway", artist: "Cassette Motel", album: "Polar Sunrise", albumArtist: "Cassette Motel",
  year: "2024", track: "3/5", genre: "Synthwave", composer: ""
};
__h.BARE_TRACK = {
  fileName: "track.mp3", baseName: "track", format: "mp3",
  title: "", artist: "", album: "", albumArtist: "", year: "", track: "", genre: "", composer: ""
};
__h.ODD_TRACK = {
  fileName: "Ünïcödé \"quoted\" & <odd>.m4a", baseName: "Ünïcödé \"quoted\" & <odd>", format: "m4a",
  title: "  Ünïcödé \"quoted\" \\ & <odd>?  ", artist: "A/B", album: "", albumArtist: "", year: "abcd",
  track: "x/y", genre: "", composer: ""
};

__h.SCENARIOS = [
  { name: "offline", status: 0, body: "" },
  { name: "server error", status: 500, body: "Internal Server Error" },
  { name: "rate limited", status: 503, body: "" },
  { name: "not found", status: 404, body: "{}" },
  { name: "empty body", status: 200, body: "" },
  { name: "not JSON", status: 200, body: "<html>maintenance</html>" },
  { name: "empty list", status: 200, body: "[]" },
  { name: "empty object", status: 200, body: "{}" },
  { name: "null", status: 200, body: "null" },
  { name: "list of junk", status: 200, body: "[null, 1, \"x\", {}]" },
  { name: "object of junk", status: 200, body: "{\"recordings\":[null,{}],\"results\":[null],\"items\":7,\"data\":null}" }
];

// Errors a plugin raises on purpose are fine: Winnie shows the message. These
// types mean the script tripped over something it did not expect.
__h.isBug = function (error) {
  return error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError
    || error instanceof RangeError || !(error instanceof Error);
};

__h.run = function (manifest, actions) {
  __h.manifest = manifest;
  var tracks = [["full tags", __h.FULL_TRACK], ["no tags", __h.BARE_TRACK], ["odd characters", __h.ODD_TRACK]];
  var declared = (manifest.contributes && manifest.contributes.actions) || [];
  var runs = 0;

  declared.forEach(function (action) {
    var fn = actions[action.function];
    if (typeof fn !== "function") {
      __h.problems.push(action.id + ": function " + action.function + "() is not defined at the top level of the script");
      return;
    }
    tracks.forEach(function (pair) {
      __h.SCENARIOS.forEach(function (base) {
        [true, false].forEach(function (canWrite) {
          __h.scenario = {
            action: action.id, name: pair[0] + ", " + base.name + (canWrite ? "" : ", disk full"),
            status: base.status, body: base.body, canWrite: canWrite
          };
          __h.calls = 0;
          runs += 1;
          var track = JSON.parse(JSON.stringify(pair[1]));
          try {
            var returned = fn(track);
            if (returned !== undefined && returned !== null && typeof returned !== "string") {
              __h.problem("returned a " + typeof returned + "; return a message string or nothing");
            }
          } catch (error) {
            if (String(error && error.message).indexOf("__harness:") === 0) {
              __h.problem(String(error.message).replace("__harness: ", ""));
            } else if (__h.isBug(error)) {
              __h.problem("crashed with " + (error && error.name ? error.name : typeof error) + ": "
                + (error && error.message ? error.message : error));
            } else if (!error.message) {
              __h.problem("threw an Error with no message for the user");
            }
          }
        });
      });
    });
  });

  __h.problems.forEach(function (line) { __h.out("PROBLEM " + line); });
  __h.out("HARNESS " + (__h.problems.length === 0 ? "OK" : "FAILED") + " " + declared.length + " action(s), " + runs + " runs");
};

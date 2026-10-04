#!/usr/bin/env node
"use strict";

// Comprehensive test suite for Model.js — the pure-JS data layer.
// Run:  node tests/model.test.js
//
// The loader injects a tiny synthetic wordlist via setWordlist() so tests
// execute in < 50 ms.  All public helpers are exercised via the
// module.exports surface — no QML, no network.

var fs   = require("fs");
var path = require("path");
var assert = require("assert");

// ── Load Model.js under test ────────────────────────────────────────────────
var src = fs.readFileSync(path.join(__dirname, "..", "Model.js"), "utf8");
var releaseVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "plugin.json"), "utf8")).version;

// Tiny synthetic wordlist that still lets the fuzzy-match code exercise its
// prefilter / scoring logic.
var TINY_WORDLIST = [
  '"hello","world","set","run","bank","cat","dog","go","see","the",'
  + '"a","an","in","on","at","to","for","of","is","it","you","we",'
  + '"he","she","my","me","no","not","but","or","so","if","do","up",'
  + '"be","am","as","by","good","food","hood","mood","blood","flood"'
].join("");

var stripped = src
  .replace(/^const /gm, "var ");

// Model.js defines all public symbols as top-level var/function declarations
// but never assigns them to module.exports (it's designed for QML's `import`).
// We need to add explicit export lines so Node can reach them.
var PUBLIC_SYMBOLS = [
  "LANGUAGES","LANG_BY_VALUE","langLabel","langWikiName","defaultLanguage","languages",
  "apiBase","setPluginVersion","lookupArgs","parseResponse","normalizeEntry","normalizeMeaning","normalizeDefinition","stringList",
  "parseSections","stripInlineHeaders","WIKT_POS_KEYS","WIKT_SKIP_DROP","WIKT_LANGUAGE_ALIASES",
  "wiktCanonicalPos","wiktExtractIpa","wiktIsInflectionLine","wiktExtractDefs",
  "parseWiktionaryWikitext","summaryLabel","sourceLabel","levenshtein","fuzzyMatch","setWordlist",
  "setDataDir","websterKey","websterBucket","websterCanonicalPos","parseWebsterJson",
  "ADAPTER_WEBSTER","ADAPTER_WIKTIONARY","ADAPTERS","adaptersFor"
];
var exportLines = PUBLIC_SYMBOLS.map(function (s) { return "exports." + s + " = " + s + ";"; }).join("\n");

var M = {};
var fn = new Function("module", "exports", stripped + "\n" + exportLines + "\nmodule.exports = exports;");
fn.call(M, M, M);

// Inject the tiny wordlist so fuzzyMatch works in tests.
M.setWordlist(["hello","world","set","run","bank","cat","dog","go","see","the","a","an","in","on","at","to","for","of","is","it","you","we","he","she","my","me","no","not","but","or","so","if","do","up","be","am","as","by","good","food","hood","mood","blood","flood"]);

// ── Minimal test harness ────────────────────────────────────────────────────
var _group = "";
var _pass  = 0;
var _fail  = 0;

function group(name, body) { _group = name; body(); }
function test(name, body) {
  try { body(); _pass++; }
  catch (e) {
    _fail++;
    console.error("  FAIL  [" + _group + "] " + name);
    console.error("        " + e.message);
  }
}

// Alias — shorter than assert.strictEqual for the common case
function eq(a, b, msg) { assert.strictEqual(a, b, msg || (JSON.stringify(a) + " === " + JSON.stringify(b))); }
function deepEq(a, b, msg) { assert.deepStrictEqual(a, b, msg); }

// ═══════════════════════════════════════════════════════════════════════════
// 1 — LANGUAGES
// ═══════════════════════════════════════════════════════════════════════════
group("LANGUAGES", function () {
  test("is an array of 23 languages", function () {
    eq(M.languages().length, 23);
  });

  test("each entry has value, label, wikiName (all non-empty strings)", function () {
    M.languages().forEach(function (l) {
      eq(typeof l.value,   "string");
      eq(typeof l.label,   "string");
      eq(typeof l.wikiName, "string");
      assert(l.value.length   > 0, "value empty");
      assert(l.label.length   > 0, "label empty");
      assert(l.wikiName.length > 0, "wikiName empty");
    });
  });

  test("sorted alphabetically by English label", function () {
    var L = M.languages();
    for (var i = 1; i < L.length; i++) {
      assert(L[i - 1].label.localeCompare(L[i].label) <= 0,
        L[i - 1].label + " > " + L[i].label);
    }
  });

  test("English present with value 'en'", function () {
    var en = M.languages().filter(function (l) { return l.value === "en"; });
    eq(en.length, 1);
  });

  test("Thai present with native wikiName ภาษาไทย", function () {
    var th = M.languages().filter(function (l) { return l.value === "th"; });
    eq(th.length, 1);
    eq(th[0].wikiName, "ภาษาไทย");
  });

  test("Japanese present with native wikiName 日本語", function () {
    var ja = M.languages().filter(function (l) { return l.value === "ja"; });
    eq(ja.length, 1);
    eq(ja[0].wikiName, "日本語");
  });

  test("Korean present with native wikiName 한국어", function () {
    var ko = M.languages().filter(function (l) { return l.value === "ko"; });
    eq(ko.length, 1);
    eq(ko[0].wikiName, "한국어");
  });

  test("no duplicate values", function () {
    var seen = {};
    M.languages().forEach(function (l) {
      assert(!seen[l.value], "dup: " + l.value);
      seen[l.value] = true;
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 — langLabel / langWikiName / defaultLanguage
// ═══════════════════════════════════════════════════════════════════════════
group("langLabel", function () {
  test("'en' → 'English'",          function () { eq(M.langLabel("en"), "English"); });
  test("'th' → 'Thai'",             function () { eq(M.langLabel("th"), "Thai"); });
  test("unknown code → code itself", function () { eq(M.langLabel("xx"), "xx"); });
  test("empty → 'English'",         function () { eq(M.langLabel(""), "English"); });
  test("null → 'English'",          function () { eq(M.langLabel(null), "English"); });
  test("undefined → 'English'",     function () { eq(M.langLabel(undefined), "English"); });
  test("case-insensitive",          function () { eq(M.langLabel("EN"), "English"); eq(M.langLabel("Th"), "Thai"); });
});

group("langWikiName", function () {
  test("'en' → 'English'",          function () { eq(M.langWikiName("en"), "English"); });
  test("'th' → 'ภาษาไทย'",           function () { eq(M.langWikiName("th"), "ภาษาไทย"); });
  test("unknown → 'English'",       function () { eq(M.langWikiName("zz"), "English"); });
  test("null → 'English'",          function () { eq(M.langWikiName(null), "English"); });
  test("undefined → 'English'",     function () { eq(M.langWikiName(undefined), "English"); });
});

group("defaultLanguage", function () {
  test("returns 'en'", function () { eq(M.defaultLanguage(), "en"); });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 — apiBase
// ═══════════════════════════════════════════════════════════════════════════
group("apiBase", function () {
  test("builds English URL by default", function () {
    var u = M.apiBase();
    assert(u.indexOf("https://en.wiktionary.org") === 0);
    assert(u.indexOf("action=query")   > -1);
    assert(u.indexOf("prop=extracts") > -1);
    assert(u.indexOf("explaintext=1") > -1);
    assert(u.indexOf("format=json")   > -1);
    assert(u.indexOf("titles=")       > -1);
  });
  test("'th' → th.wiktionary.org", function () { assert(M.apiBase("th").indexOf("https://th.wiktionary.org") === 0); });
  test("'ja' → ja.wiktionary.org", function () { assert(M.apiBase("ja").indexOf("https://ja.wiktionary.org") === 0); });
  test("unknown 'xx' falls back to en (allowlist)", function () { assert(M.apiBase("xx").indexOf("en.wiktionary.org") > -1); });
  test("trims + lowercases", function () { assert(M.apiBase("  TH  ").indexOf("th.wiktionary.org") > -1); });
  test("whitespace-only falls back to en", function () { assert(M.apiBase("   ").indexOf("en.wiktionary.org") > -1); });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 — lookupArgs
// ═══════════════════════════════════════════════════════════════════════════
group("lookupArgs", function () {
  test("empty word → empty array", function () {
    deepEq(M.lookupArgs(""), []);
    deepEq(M.lookupArgs(null), []);
    deepEq(M.lookupArgs(undefined), []);
  });
  test("starts with curl -fsS --max-time 5", function () {
    var a = M.lookupArgs("hello");
    eq(a[0], "curl");
    assert(a.indexOf("-fsS") > -1);
    assert(a.indexOf("--max-time") > -1);
    assert(a.indexOf("5") > -1);
  });
  test("includes -H User-Agent", function () {
    M.setPluginVersion(releaseVersion);
    var a = M.lookupArgs("hello");
    var i = a.indexOf("User-Agent: dank-dictionary/" + releaseVersion);
    assert(i > -1, "UA header missing");
    eq(a[i - 1], "-H");
  });
  test("User-Agent follows injected manifest version", function () {
    M.setPluginVersion("9.8.7");
    assert(M.lookupArgs("hello").indexOf("User-Agent: dank-dictionary/9.8.7") > -1);
    M.setPluginVersion(releaseVersion);
  });
  test("last arg is the URL with titles=<word>", function () {
    var url = M.lookupArgs("hello").slice(-1)[0];
    assert(url.indexOf("titles=hello") > -1);
  });
  test("URL-encodes spaces", function () {
    var url = M.lookupArgs("hello world").slice(-1)[0];
    assert(url.indexOf("titles=hello%20world") > -1 || url.indexOf("titles=hello+world") > -1);
  });
  test("uses the right base URL per language", function () {
    assert(M.lookupArgs("hi", "en").slice(-1)[0].indexOf("en.wiktionary.org") > -1);
    assert(M.lookupArgs("hi", "th").slice(-1)[0].indexOf("th.wiktionary.org") > -1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5 — parseResponse (empty / invalid / notfound)
// ═══════════════════════════════════════════════════════════════════════════
function mkWikiResp(title, extract, missing) {
  var page = missing ? { missing: "", title: title } : { pageid: 1, title: title, extract: extract };
  return JSON.stringify({ query: { pages: { "1": page } } });
}

group("parseResponse — empty/invalid", function () {
  test("empty string → empty",    function () { var r = M.parseResponse("");   eq(r.ok, false); eq(r.kind, "empty"); });
  test("null → empty",            function () { var r = M.parseResponse(null); eq(r.ok, false); eq(r.kind, "empty"); });
  test("non-JSON → invalid",      function () { var r = M.parseResponse("not json"); eq(r.ok, false); eq(r.kind, "invalid"); });
  test("JSON number → invalid",   function () { var r = M.parseResponse("42");  eq(r.ok, false); eq(r.kind, "invalid"); });
  test("empty array → empty",     function () { var r = M.parseResponse("[]");  eq(r.ok, false); eq(r.kind, "empty"); });
});

group("parseResponse — Wiktionary success", function () {
  test("parses valid extract", function () {
    var r = M.parseResponse(mkWikiResp("hello", "== English ==\n=== Interjection ===\nhello (plural hellos)\nA greeting."));
    eq(r.ok, true);
    eq(r.entry.word, "hello");
    eq(r.entry.source, "wiktionary");
    eq(r.entry.language, "en");
    assert(r.entry.meanings.length > 0);
  });
  test("missing page → notfound", function () {
    var r = M.parseResponse(mkWikiResp("xyz", "", true));
    eq(r.ok, false); eq(r.kind, "notfound");
  });
  test("empty extract → empty", function () {
    var r = M.parseResponse(mkWikiResp("hello", ""));
    eq(r.ok, false); eq(r.kind, "empty");
  });
  test("empty pages → empty", function () {
    var r = M.parseResponse(JSON.stringify({ query: { pages: {} } }));
    eq(r.ok, false); eq(r.kind, "empty");
  });
  test("passes langCode through", function () {
    var r = M.parseResponse(mkWikiResp("hello", "== English ==\n=== Noun ===\nA greeting or salutation.\nA form of address."), "en");
    eq(r.ok, true); eq(r.entry.language, "en");
  });
});

group("parseResponse — Free Dictionary legacy", function () {
  test("parses legacy array", function () {
    var resp = JSON.stringify([{
      word: "hello", phonetic: "/hɛˈloʊ/",
      phonetics: [{ text: "/hɛˈloʊ/", audio: "" }],
      meanings: [{ partOfSpeech: "interjection", definitions: [{ definition: "A greeting." }] }]
    }]);
    var r = M.parseResponse(resp);
    eq(r.ok, true); eq(r.entry.word, "hello"); eq(r.entry.source, "dictionaryapi"); eq(r.entry.phonetic, "/hɛˈloʊ/");
  });
  test("legacy not-found with title/message/resolution", function () {
    var r = M.parseResponse(JSON.stringify({ title: "Not Found", message: "No def", resolution: "Check spelling" }));
    eq(r.ok, false); eq(r.kind, "notfound"); eq(r.error, "No def"); assert(!("hint" in r));
  });
  test("legacy not-found without resolution", function () {
    var r = M.parseResponse(JSON.stringify({ title: "Not Found", message: "No def" }));
    eq(r.ok, false); eq(r.kind, "notfound"); assert(!("hint" in r));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6 — normalizeEntry (Free Dictionary branch)
// ═══════════════════════════════════════════════════════════════════════════
group("normalizeEntry", function () {
  test("non-object → null",     function () { eq(M.normalizeEntry(null), null); eq(M.normalizeEntry(42), null); eq(M.normalizeEntry("s"), null); });
  test("empty word → null",     function () { eq(M.normalizeEntry({ word: "" }), null); eq(M.normalizeEntry({ word: "  " }), null); });
  test("no meanings → null",    function () { eq(M.normalizeEntry({ word: "hi" }), null); });
  test("phonetic from top-level field", function () {
    var r = M.normalizeEntry({ word: "t", phonetic: "/t/", meanings: [{ partOfSpeech: "n", definitions: [{ definition: "defn" }] }] });
    eq(r.phonetic, "/t/");
  });
  test("phonetic from phonetics[0].text", function () {
    var r = M.normalizeEntry({ word: "t", phonetics: [{ text: "/t/" }], meanings: [{ partOfSpeech: "n", definitions: [{ definition: "defn" }] }] });
    eq(r.phonetic, "/t/");
  });
  test("audioUrl from phonetics", function () {
    var r = M.normalizeEntry({ word: "t", phonetics: [{ audio: "https://x.com/a.mp3" }], meanings: [{ partOfSpeech: "n", definitions: [{ definition: "defn" }] }] });
    eq(r.audioUrl, "https://x.com/a.mp3");
  });
  test("filters empty partOfSpeech", function () {
    var r = M.normalizeEntry({ word: "t", meanings: [
      { partOfSpeech: "", definitions: [{ definition: "a" }] },
      { partOfSpeech: "n", definitions: [{ definition: "b" }] }
    ]});
    eq(r.meanings.length, 1);
  });
  test("filters empty definition text", function () {
    var r = M.normalizeEntry({ word: "t", meanings: [{ partOfSpeech: "n", definitions: [{ definition: "" }, { definition: "ok" }] }] });
    eq(r.meanings[0].definitions.length, 1);
  });
  test("audioUrl empty when no audio", function () {
    var r = M.normalizeEntry({ word: "t", meanings: [{ partOfSpeech: "n", definitions: [{ definition: "x" }] }] });
    eq(r.audioUrl, "");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7 — normalizeMeaning / normalizeDefinition / stringList
// ═══════════════════════════════════════════════════════════════════════════
group("normalizeMeaning", function () {
  test("null / string → null",       function () { eq(M.normalizeMeaning(null), null); eq(M.normalizeMeaning("x"), null); });
  test("empty partOfSpeech → null",  function () { eq(M.normalizeMeaning({ partOfSpeech: "" }), null); });
  test("all empty defs → null",      function () { eq(M.normalizeMeaning({ partOfSpeech: "n", definitions: [{ definition: "" }, { definition: null }] }), null); });
  test("synonyms/antonyms normalised", function () {
    var r = M.normalizeMeaning({ partOfSpeech: "n", definitions: [{ definition: "x" }], synonyms: ["a", "b"], antonyms: [] });
    deepEq(r.synonyms, ["a", "b"]);
    deepEq(r.antonyms, []);
  });
});

group("normalizeDefinition", function () {
  test("non-object → null",         function () { eq(M.normalizeDefinition(null), null); eq(M.normalizeDefinition("x"), null); });
  test("empty def text → null",     function () { eq(M.normalizeDefinition({ definition: "" }), null); eq(M.normalizeDefinition({ definition: "  " }), null); });
  test("valid definition normalised", function () {
    var r = M.normalizeDefinition({ definition: "A type.", example: "Ex.", synonyms: ["s"], antonyms: [] });
    eq(r.definition, "A type."); eq(r.example, "Ex."); deepEq(r.synonyms, ["s"]);
  });
  test("missing example → empty string", function () {
    var r = M.normalizeDefinition({ definition: "A type." });
    eq(r.example, "");
  });
});

group("stringList", function () {
  test("non-array → []",  function () { deepEq(M.stringList(null), []); deepEq(M.stringList(42), []); deepEq(M.stringList("x"), []); });
  test("filters blanks",  function () { deepEq(M.stringList(["a", "", "b", "  "]), ["a", "b"]); });
  test("trims whitespace", function () { deepEq(M.stringList(["  hi  ", "  lo  "]), ["hi", "lo"]); });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8 — parseSections
// ═══════════════════════════════════════════════════════════════════════════
group("parseSections", function () {
  test("flat siblings", function () {
    var s = M.parseSections("== English ==\nSome text\n== French ==\nDu texte");
    eq(s.length, 2);
    eq(s[0].title, "English"); eq(s[0].level, 2);
    eq(s[1].title, "French");
    assert(s[0].body.indexOf("Some text") > -1);
  });
  test("nested children", function () {
    var s = M.parseSections("== English ==\n=== Noun ===\nA word.\n=== Verb ===\nTo act.");
    eq(s.length, 1);
    eq(s[0].children.length, 2);
    eq(s[0].children[0].title, "Noun");
    eq(s[0].children[1].title, "Verb");
  });
  test("empty / null → []", function () { deepEq(M.parseSections(""), []); deepEq(M.parseSections(null), []); });
  test("BOM stripped", function () {
    var s = M.parseSections("\uFEFF== English ==\nBody");
    eq(s.length, 1); eq(s[0].title, "English");
  });
  test("CRLF handled", function () {
    var s = M.parseSections("== English ==\r\nBody");
    eq(s.length, 1);
    assert(s[0].body.indexOf("Body") > -1);
  });
  test("deeply nested (level-4 under level-3 under level-2)", function () {
    var s = M.parseSections("== English ==\n=== Etymology 1 ===\n==== Noun ====\nA word.\n==== Verb ====\nTo act.");
    eq(s[0].children.length, 1);
    eq(s[0].children[0].title, "Etymology 1");
    eq(s[0].children[0].children.length, 2);
    eq(s[0].children[0].children[0].title, "Noun");
  });
  test("section markers excluded from body", function () {
    var s = M.parseSections("== English ==\n=== Noun ===\nA word.");
    assert(s[0].body.indexOf("== English ==") === -1);
    assert(s[0].children[0].body.indexOf("=== Noun ===") === -1);
  });
  test("level-2 child pops back correctly", function () {
    var s = M.parseSections("== A ==\n=== 1 ===\nbody1\n== B ==\n=== 2 ===\nbody2");
    eq(s.length, 2);
    eq(s[0].title, "A"); eq(s[0].children.length, 1); eq(s[0].children[0].title, "1");
    eq(s[1].title, "B"); eq(s[1].children.length, 1); eq(s[1].children[0].title, "2");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9 — stripInlineHeaders
// ═══════════════════════════════════════════════════════════════════════════
group("stripInlineHeaders", function () {
  test("strips ==== Header ====", function () {
    var r = M.stripInlineHeaders("Text\n==== Synonyms ====\nmore");
    assert(r.indexOf("Synonyms") === -1);
    assert(r.indexOf("Text") > -1 && r.indexOf("more") > -1);
  });
  test("strips == Header ==", function () {
    var r = M.stripInlineHeaders("A\n== Notes ==\nB");
    assert(r.indexOf("== Notes ==") === -1);
  });
  test("preserves non-header == usage", function () {
    var r = M.stripInlineHeaders("A definition with == emphasis == in it.");
    assert(r.indexOf("emphasis") > -1);
  });
  test("empty / null → ''", function () { eq(M.stripInlineHeaders(""), ""); eq(M.stripInlineHeaders(null), ""); });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10 — wiktCanonicalPos
// ═══════════════════════════════════════════════════════════════════════════
group("wiktCanonicalPos", function () {
  test("adj → adjective",          function () { eq(M.wiktCanonicalPos("adj"), "adjective"); });
  test("adv → adverb",             function () { eq(M.wiktCanonicalPos("adv"), "adverb"); });
  test("auxiliary verb → verb",    function () { eq(M.wiktCanonicalPos("auxiliary verb"), "verb"); });
  test("modal verb → verb",        function () { eq(M.wiktCanonicalPos("modal verb"), "verb"); });
  test("gerund → verb",            function () { eq(M.wiktCanonicalPos("gerund"), "verb"); });
  test("participle → verb",        function () { eq(M.wiktCanonicalPos("participle"), "verb"); });
  test("infinitive → verb",        function () { eq(M.wiktCanonicalPos("infinitive"), "verb"); });
  test("proper noun → noun",       function () { eq(M.wiktCanonicalPos("proper noun"), "noun"); });
  test("name → noun",              function () { eq(M.wiktCanonicalPos("name"), "noun"); });
  test("standard POS pass through", function () {
    ["noun","verb","adjective","adverb","preposition","conjunction","pronoun","interjection"].forEach(function (p) {
      eq(M.wiktCanonicalPos(p), p);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11 — wiktExtractIpa
// ═══════════════════════════════════════════════════════════════════════════
group("wiktExtractIpa", function () {
  test("slash-delimited /hɛˈloʊ/", function () { eq(M.wiktExtractIpa("IPA: /hɛˈloʊ/"), "/hɛˈloʊ/"); });
  test("bracket-delimited [hɛloʊ]",  function () { eq(M.wiktExtractIpa("IPA: [hɛloʊ]"), "[hɛloʊ]"); });
  test("no IPA → ''",                function () { eq(M.wiktExtractIpa("no IPA here"), ""); });
  test("empty / null → ''",          function () { eq(M.wiktExtractIpa(""), ""); eq(M.wiktExtractIpa(null), ""); });
  test("multiple — returns first",   function () { eq(M.wiktExtractIpa("IPA: /a/ or /b/"), "/a/"); });
  test("no IPA prefix 'Audio' — no match", function () { eq(M.wiktExtractIpa("Audio (US): /kæt/"), ""); });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12 — wiktIsInflectionLine
// ═══════════════════════════════════════════════════════════════════════════
group("wiktIsInflectionLine", function () {
  test("third-person singular", function () { eq(M.wiktIsInflectionLine("runs (third-person singular simple present)", "run"), true); });
  test("present participle",    function () { eq(M.wiktIsInflectionLine("running (present participle)", "run"), true); });
  test("simple past",           function () { eq(M.wiktIsInflectionLine("ran (simple past)", "run"), true); });
  test("past participle",       function () { eq(M.wiktIsInflectionLine("run (past participle)", "run"), true); });
  test("plural",                function () { eq(M.wiktIsInflectionLine("cats (plural)", "cat"), true); });
  test("comparative",           function () { eq(M.wiktIsInflectionLine("bigger (comparative)", "big"), true); });
  test("superlative",           function () { eq(M.wiktIsInflectionLine("biggest (superlative)", "big"), true); });
  test("diminutive",            function () { eq(M.wiktIsInflectionLine("doggy (diminutive)", "dog"), true); });
  test("not comparable",        function () { eq(M.wiktIsInflectionLine("unique (not comparable)", "unique"), true); });
  test("regular def → false",   function () { eq(M.wiktIsInflectionLine("A common word.", "test"), false); });
  test("empty / null → false",  function () { eq(M.wiktIsInflectionLine("", "test"), false); eq(M.wiktIsInflectionLine(null, "test"), false); });
  test("trailing text after ) → false", function () { eq(M.wiktIsInflectionLine("runs (third-person) extra", "run"), false); });
  test("UK/US annotation",      function () { eq(M.wiktIsInflectionLine("colour (UK)", "colour"), true); });
  test("dialectal annotation",  function () { eq(M.wiktIsInflectionLine("gonna (dialectal)", "gonna"), true); });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13 — wiktExtractDefs
// ═══════════════════════════════════════════════════════════════════════════
group("wiktExtractDefs", function () {
  test("simple definitions extracted", function () {
    var d = M.wiktExtractDefs("apple", "A common, round fruit.\nUsed in cooking.");
    assert(d.length >= 1); assert(d[0].definition.length > 0);
  });
  test("strips inflection header", function () {
    var d = M.wiktExtractDefs("run", "runs (third-person singular simple present)\n\nTo move quickly through an area.");
    d.forEach(function (x) { assert(x.definition.indexOf("third-person") === -1); });
    assert(d.length >= 1);
  });
  test("filters Synonyms lines", function () {
    var d = M.wiktExtractDefs("hi", "A greeting.\nSynonyms: hey, howdy");
    d.forEach(function (x) { assert(x.definition.indexOf("Synonyms") === -1); });
  });
  test("filters Antonyms lines", function () {
    var d = M.wiktExtractDefs("good", "Excellent quality.\nAntonyms: bad, poor");
    d.forEach(function (x) { assert(x.definition.indexOf("Antonyms") === -1); });
  });
  test("filters label-only lines without rejecting short definitions", function () {
    var d = M.wiktExtractDefs("x", "(transitive)\nA cat.");
    deepEq(d.map(function (x) { return x.definition; }), ["A cat."]);
  });
  test("empty body → []", function () { deepEq(M.wiktExtractDefs("x", ""), []); deepEq(M.wiktExtractDefs("x", null), []); });
  test("definition shape: { definition, example, synonyms, antonyms }", function () {
    var d = M.wiktExtractDefs("x", "A real definition for testing purposes.\nAnother line of the definition.");
    assert(d.length >= 1);
    var f = d[0]; eq(typeof f.definition, "string"); eq(typeof f.example, "string"); assert(Array.isArray(f.synonyms)); assert(Array.isArray(f.antonyms));
  });
  test("filters Alternative forms lines", function () {
    var d = M.wiktExtractDefs("x", "Alternative forms of foo\nA real definition for testing.");
    d.forEach(function (x) { assert(x.definition.indexOf("Alternative forms") === -1); });
  });
  test("filters Coordinate terms", function () {
    var d = M.wiktExtractDefs("x", "A useful word for something important.\nCoordinate terms: foo, bar");
    d.forEach(function (x) { assert(x.definition.indexOf("Coordinate terms") === -1); });
  });
  test("filters For more quotations", function () {
    var d = M.wiktExtractDefs("x", "A good definition of the word.\nFor more quotations using this term");
    d.forEach(function (x) { assert(x.definition.indexOf("For more quotations") === -1); });
  });
  test("filters year-prefixed attribution", function () {
    var body = "\"Hello,\" he said.\n2020: Some attribution text.";
    var d = M.wiktExtractDefs("hello", body);
    deepEq(d.map(function (x) { return x.definition; }), ['"Hello," he said.']);
  });
  test("filters label-only parentheticals like (transitive)", function () {
    var d = M.wiktExtractDefs("x", "(archaic)\nTo do something important.");
    d.forEach(function (x) { assert(x.definition.indexOf("(archaic)") === -1); });
  });
  test("filters footnote-style references [1]", function () {
    var d = M.wiktExtractDefs("x", "A definition.\n[1]\nAnother definition.");
    d.forEach(function (x) { assert(x.definition !== "[1]"); });
  });
  test("filters number-range lines like '1990 - 2000, 2010'", function () {
    var d = M.wiktExtractDefs("x", "A definition.\n1990 - 2000, 2010.\nAnother definition.");
    d.forEach(function (x) { assert(/^\d+\s*-\s*\d+,\s*\d/.test(x.definition) === false); });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14 — parseWiktionaryWikitext
// ═══════════════════════════════════════════════════════════════════════════
function mkEng(text) { return "== English ==\n" + text; }

group("parseWiktionaryWikitext", function () {
  test("basic English noun", function () {
    var e = M.parseWiktionaryWikitext("hello", mkEng("=== Etymology 1 ===\n==== Noun ====\nhello (plural hellos)\n\nA greeting or salutation."));
    eq(e.word, "hello"); eq(e.source, "wiktionary"); eq(e.language, "en");
    assert(e.meanings.length >= 1);
    assert(e.meanings.some(function (m) { return m.partOfSpeech === "noun"; }));
  });
  test("IPA from Pronunciation section", function () {
    var e = M.parseWiktionaryWikitext("hello", mkEng("=== Pronunciation ===\nIPA: /hɛˈloʊ/\n=== Etymology 1 ===\n==== Noun ====\nA greeting or salutation.\nA form of address."));
    eq(e.phonetic, "/hɛˈloʊ/");
  });
  test("empty text → null", function () { eq(M.parseWiktionaryWikitext("x", "", "en"), null); eq(M.parseWiktionaryWikitext("x", null, "en"), null); });
  test("multiple etymologies → multiple meanings", function () {
    var e = M.parseWiktionaryWikitext("set", mkEng("=== Etymology 1 ===\n==== Noun ====\nFirst meaning.\nA first meaning.\n=== Etymology 2 ===\n==== Verb ====\nSecond meaning.\nA second meaning."));
    assert(e !== null); assert(e.meanings.length >= 2);
  });
  test("skips WIKT_SKIP_DROP sections (synonyms, derived terms, etc.)", function () {
    var e = M.parseWiktionaryWikitext("x", mkEng("==== Noun ====\nA greeting or salutation.\nA form of address.\n=== Synonyms ===\nhi, hey"), "en");
    assert(e !== null);
    e.meanings.forEach(function (m) { assert(m.partOfSpeech !== "synonyms"); });
  });
  test("loose mode for Thai", function () {
    var e = M.parseWiktionaryWikitext("สวัสดี", "== ภาษาไทย ==\n=== คำนาม ===\nสวัสดี means hello.\nA common greeting word.", "th");
    eq(e !== null, true); eq(e.language, "th");
  });
  test("loose mode for Japanese", function () {
    var e = M.parseWiktionaryWikitext("猫", "== 日本語 ==\n=== 名詞 ===\nねこ means cat.\nA common animal.", "ja");
    eq(e !== null, true); eq(e.language, "ja");
  });
  test("falls back to first level-2 if no language match", function () {
    var e = M.parseWiktionaryWikitext("test", "== Français ==\n==== Noun ====\nA test word.\nUsed in French.", "en");
    assert(e !== null, "should fall back");
  });
  test("language stamp in output", function () {
    var e = M.parseWiktionaryWikitext("hello", mkEng("==== Noun ====\nA greeting or salutation.\nA form of address."), "en");
    eq(e.language, "en");
  });
  test("meanings shape: { partOfSpeech, definitions[], synonyms[], antonyms[] }", function () {
    var e = M.parseWiktionaryWikitext("hello", mkEng("==== Noun ====\nA greeting or salutation.\nA form of address."));
    assert(e.meanings.length >= 1);
    var m = e.meanings[0];
    eq(typeof m.partOfSpeech, "string"); assert(Array.isArray(m.definitions)); assert(Array.isArray(m.synonyms)); assert(Array.isArray(m.antonyms));
    assert(m.definitions.length >= 1); eq(typeof m.definitions[0].definition, "string");
  });
  test("WIKT_POS_KEYS covers known POS: adjective, adverb, pronoun, etc.", function () {
    var text = mkEng("=== Etymology 1 ===\n==== Adjective ====\nSomething descriptive.\nA meaning that describes.\n==== Adverb ====\nSomething manner.\nA word used to modify.\n==== Pronoun ====\nA pronoun word.\nA word used in place.\n==== Interjection ====\nAn interjection.\nA word used to exclaim.\n==== Preposition ====\nA preposition.\nA word showing relation.\n==== Conjunction ====\nA conjunction.\nA word connecting parts.\n==== Determiner ====\nA determiner.\nA word specifying noun.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    var pos = e.meanings.map(function (m) { return m.partOfSpeech; });
    assert(pos.indexOf("adjective") > -1, "should have adjective: " + pos);
    assert(pos.indexOf("adverb") > -1, "should have adverb: " + pos);
    assert(pos.indexOf("pronoun") > -1, "should have pronoun: " + pos);
    assert(pos.indexOf("interjection") > -1, "should have interjection: " + pos);
    assert(pos.indexOf("preposition") > -1, "should have preposition: " + pos);
    assert(pos.indexOf("conjunction") > -1, "should have conjunction: " + pos);
    assert(pos.indexOf("determiner") > -1, "should have determiner: " + pos);
  });
  test("etymology body text filtered (not emitted as a definition)", function () {
    var text = mkEng("=== Etymology 1 ===\nFrom Old English.\n==== Noun ====\nA greeting or salutation.\nA form of address.");
    var e = M.parseWiktionaryWikitext("hello", text, "en");
    e.meanings.forEach(function (m) {
      m.definitions.forEach(function (d) {
        assert(d.definition.indexOf("From Old English") === -1);
      });
    });
  });
  test("pronunciation section body filtered (not emitted as a definition)", function () {
    var text = mkEng("=== Etymology 1 ===\n==== Pronunciation ====\nIPA: /x/\n==== Noun ====\nA greeting or salutation.\nA form of address.");
    var e = M.parseWiktionaryWikitext("hello", text, "en");
    e.meanings.forEach(function (m) {
      m.definitions.forEach(function (d) {
        assert(d.definition.indexOf("IPA:") === -1);
      });
    });
  });
  test("loose mode emits raw section title as POS for unknown POS names", function () {
    var text = "== ไทย ==\n=== คำนาม ===\nสวัสดี หมายถึง hello.\nใช้ทักทายคนทั่วไป.";
    var e = M.parseWiktionaryWikitext("สวัสดี", text, "th");
    assert(e !== null); assert(e.meanings.length >= 1);
    eq(e.meanings[0].partOfSpeech, "คำนาม");
  });
  test("non-POS section with level > 3 is visited (recursion)", function () {
    var text = mkEng("=== Etymology 1 ===\n==== Notes ====\n===== Noun =====\nA greeting or salutation.\nA form of address.");
    var e = M.parseWiktionaryWikitext("hello", text, "en");
    assert(e !== null);
  });
});

group("Wiktionary parser audit regressions", function () {
  test("single-line ASCII definition survives first-block filtering", function () {
    deepEq(M.wiktExtractDefs("document", "A written or printed record.").map(function (d) { return d.definition; }), ["A written or printed record."]);
  });
  test("first definition survives when separated from another sense", function () {
    deepEq(M.wiktExtractDefs("record", "A written account.\n\nA stored sound recording.").map(function (d) { return d.definition; }), ["A written account.", "A stored sound recording."]);
  });
  test("single-line definition ending in a regional annotation is preserved", function () {
    deepEq(M.wiktExtractDefs("colour", "A color (UK)").map(function (d) { return d.definition; }), ["A color (UK)"]);
  });
  test("bare Unicode headword is removed without losing its short definition", function () {
    deepEq(M.wiktExtractDefs("猫", "猫\n\n飼い猫。").map(function (d) { return d.definition; }), ["飼い猫。"]);
  });
  test("bare multiword headword is removed", function () {
    deepEq(M.wiktExtractDefs("ice cream", "ice cream\n\nA frozen dessert.").map(function (d) { return d.definition; }), ["A frozen dessert."]);
  });
  test("month-led definitions survive without looking like dates", function () {
    ["May be used to express permission.", "March is the third month.", "January weather can be cold."].forEach(function (sense) {
      deepEq(M.wiktExtractDefs("term", sense).map(function (d) { return d.definition; }), [sense]);
    });
  });
  test("dated quotation attribution and its following quotation are filtered", function () {
    var body = "A genuine definition.\nMay 12, 2020: An author, A Book:\nA sufficiently long quoted example.";
    deepEq(M.wiktExtractDefs("term", body).map(function (d) { return d.definition; }), ["A genuine definition."]);
  });
  test("metadata words at the start of real definitions are preserved", function () {
    ["Source of a river.", "Notes played together."].forEach(function (sense) {
      deepEq(M.wiktExtractDefs("term", sense).map(function (d) { return d.definition; }), [sense]);
    });
  });
  test("short quotation following dated attribution is not emitted as a sense", function () {
    var body = "A genuine definition.\n2020: Author, A Book:\nHi.";
    deepEq(M.wiktExtractDefs("term", body).map(function (d) { return d.definition; }), ["A genuine definition."]);
  });
  test("selected edition's canonical section is preferred over an earlier language", function () {
    var text = mkEng("=== Noun ===\nAn English definition.") + "\n== French ==\n=== Nom ===\nUne définition française.";
    var e = M.parseWiktionaryWikitext("terme", text, "fr");
    assert(e !== null);
    eq(e.meanings[0].definitions[0].definition, "Une définition française.");
  });
  test("French native alias selects the requested section among other languages", function () {
    var text = mkEng("=== Noun ===\nAn English definition.") + "\n== Français ==\n=== Nom ===\nUne définition française.";
    var e = M.parseWiktionaryWikitext("terme", text, "fr");
    assert(e !== null);
    eq(e.language, "fr");
    deepEq(e.meanings[0].definitions.map(function (d) { return d.definition; }), ["Une définition française."]);
  });
  test("German decorated native heading is preferred over an earlier language", function () {
    var text = mkEng("=== Noun ===\nAn English definition.") + "\n== Haus (Deutsch) ==\n=== Substantiv ===\nEin Gebäude zum Wohnen.";
    var e = M.parseWiktionaryWikitext("Haus", text, "de");
    assert(e !== null);
    eq(e.language, "de");
    eq(e.meanings[0].definitions[0].definition, "Ein Gebäude zum Wohnen.");
  });
  test("Spanish native heading is preferred over an earlier language", function () {
    var text = mkEng("=== Noun ===\nAn English definition.") + "\n== Español ==\n=== Sustantivo ===\nUn edificio para vivir.";
    var e = M.parseWiktionaryWikitext("casa", text, "es");
    assert(e !== null);
    eq(e.language, "es");
    eq(e.meanings[0].definitions[0].definition, "Un edificio para vivir.");
  });
  test("colon-led senses survive metadata recognition", function () {
    ["Source: the origin of something.", "Notes: musical tones."].forEach(function (sense) {
      deepEq(M.wiktExtractDefs("term", sense).map(function (d) { return d.definition; }), [sense]);
    });
  });
  test("year-comma senses survive without attribution cues", function () {
    ["1837, an early locomotive design.", "2020, a leap year."].forEach(function (sense) {
      deepEq(M.wiktExtractDefs("term", sense).map(function (d) { return d.definition; }), [sense]);
    });
  });
  test("year-comma attributed quotations remain excluded", function () {
    deepEq(M.wiktExtractDefs("term", "A genuine sense.\n1837, Dickens wrote:\nA quoted example.").map(function (d) { return d.definition; }), ["A genuine sense."]);
  });
  test("year-led definition survives when it is not an attribution", function () {
    deepEq(M.wiktExtractDefs("year", "2020 is a leap year.").map(function (d) { return d.definition; }), ["2020 is a leap year."]);
  });
  ["Abbreviation", "Acronym", "Ellipsis"].forEach(function (pos) {
    test("English accepts the " + pos + " section without loose fallback", function () {
      var e = M.parseWiktionaryWikitext("term", mkEng("=== " + pos + " ===\nA shortened expression."), "en");
      assert(e !== null);
      eq(e.meanings[0].partOfSpeech, pos.toLowerCase());
      eq(e.meanings[0].definitions[0].definition, "A shortened expression.");
    });
  });
  test("English unknown metadata sections remain excluded", function () {
    eq(M.parseWiktionaryWikitext("term", mkEng("=== Metadata ===\nA long administrative note."), "en"), null);
  });
  test("Japanese level-4 POS under an etymology is parsed", function () {
    var text = "== 日本語 ==\n=== Etymology 1 ===\nFrom a historical form.\n==== 名詞 ====\n猫\n\n飼い猫。";
    var e = M.parseWiktionaryWikitext("猫", text, "ja");
    assert(e !== null);
    eq(e.meanings[0].partOfSpeech, "名詞");
    deepEq(e.meanings[0].definitions.map(function (d) { return d.definition; }), ["飼い猫。"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15 — summaryLabel / sourceLabel
// ═══════════════════════════════════════════════════════════════════════════
group("summaryLabel", function () {
  test("joined POS list", function () {
    eq(M.summaryLabel({ meanings: [{ partOfSpeech: "noun" }, { partOfSpeech: "verb" }, { partOfSpeech: "adj" }] }), "noun · verb · adj");
  });
  test("null / undefined → ''", function () { eq(M.summaryLabel(null), ""); eq(M.summaryLabel(undefined), ""); });
  test("empty meanings → ''", function () { eq(M.summaryLabel({}), ""); eq(M.summaryLabel({ meanings: [] }), ""); });
  test("skips entries without partOfSpeech", function () {
    eq(M.summaryLabel({ meanings: [null, { partOfSpeech: "noun" }, { partOfSpeech: "" }] }), "noun");
  });
});

group("sourceLabel", function () {
  test("wiktionary → 'Wiktionary'",     function () { eq(M.sourceLabel({ source: "wiktionary" }), "Wiktionary"); });
  test("dictionaryapi → 'Free Dict'",   function () { eq(M.sourceLabel({ source: "dictionaryapi" }), "Free Dictionary"); });
  test("unknown source → raw value",    function () { eq(M.sourceLabel({ source: "custom" }), "custom"); });
  test("null / no source → ''",         function () { eq(M.sourceLabel(null), ""); eq(M.sourceLabel({}), ""); });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16 — levenshtein
// ═══════════════════════════════════════════════════════════════════════════
group("levenshtein", function () {
  test("identical → 0",                   function () { eq(M.levenshtein("hello", "hello"), 0); });
  test("empty vs empty → 0",              function () { eq(M.levenshtein("", ""), 0); });
  test("empty vs 'abc' → 3",              function () { eq(M.levenshtein("", "abc"), 3); });
  test("'abc' vs empty → 3",              function () { eq(M.levenshtein("abc", ""), 3); });
  test("one substitution: 'cat' vs 'bat' → 1", function () { eq(M.levenshtein("cat", "bat"), 1); });
  test("one insertion: 'cat' vs 'cats' → 1",    function () { eq(M.levenshtein("cat", "cats"), 1); });
  test("one deletion: 'cats' vs 'cat' → 1",     function () { eq(M.levenshtein("cats", "cat"), 1); });
  test("'hello' vs 'helo' → 1",           function () { eq(M.levenshtein("hello", "helo"), 1); });
  test("'hello' vs 'helllo' → 1",         function () { eq(M.levenshtein("hello", "helllo"), 1); });
  test("symmetry: d(a,b) == d(b,a)",      function () { eq(M.levenshtein("abc", "xyz"), M.levenshtein("xyz", "abc")); });
  test("'kitten' vs 'sitting' → 3",       function () { eq(M.levenshtein("kitten", "sitting"), 3); });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17 — fuzzyMatch
// ═══════════════════════════════════════════════════════════════════════════
group("fuzzyMatch", function () {
  test("exact match → autoMatch", function () {
    var r = M.fuzzyMatch("hello");
    eq(r.autoMatch, "hello"); deepEq(r.alternatives, []);
  });
  test("1-char typo → autoMatch if clear winner", function () {
    var r = M.fuzzyMatch("helllo");
    eq(r.autoMatch, "hello");
  });
  test("ambiguous query → alternatives", function () {
    M.setWordlist(["cat", "cot"]);
    try {
      deepEq(M.fuzzyMatch("cut"), { autoMatch: null, alternatives: ["cat", "cot"] });
    } finally {
      M.setWordlist(JSON.parse("[" + TINY_WORDLIST + "]"));
    }
  });
  test("empty / single char → no match", function () {
    deepEq(M.fuzzyMatch(""), { autoMatch: null, alternatives: [] });
    deepEq(M.fuzzyMatch("a"), { autoMatch: null, alternatives: [] });
    deepEq(M.fuzzyMatch(null), { autoMatch: null, alternatives: [] });
  });
  test("non-letter chars stripped", function () {
    var r = M.fuzzyMatch("123hello456");
    eq(r.autoMatch, "hello");
  });
  test("very long gibberish → no match", function () {
    var r = M.fuzzyMatch("xyzzyplugh");
    eq(r.autoMatch, null); deepEq(r.alternatives, []);
  });
  test("alternatives are word strings", function () {
    var r = M.fuzzyMatch("godd");
    r.alternatives.forEach(function (w) { eq(typeof w, "string"); });
  });
  test("alternatives limited to 3", function () {
    var r = M.fuzzyMatch("godd");
    assert(r.alternatives.length <= 3);
  });
  test("accented characters remain significant to fuzzy matching", function () {
    M.setWordlist(["café"]);
    try {
      deepEq(M.fuzzyMatch("café"), { autoMatch: "café", alternatives: [] });
    } finally {
      M.setWordlist(JSON.parse("[" + TINY_WORDLIST + "]"));
    }
  });
  test("number-only query → no match", function () {
    var r = M.fuzzyMatch("12345");
    eq(r.autoMatch, null); deepEq(r.alternatives, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18 — parseSections edge cases
// ═══════════════════════════════════════════════════════════════════════════
group("parseSections — edge cases", function () {
  test("single section with no children", function () {
    var s = M.parseSections("== English ==\nJust body text.");
    eq(s.length, 1); eq(s[0].children.length, 0);
    assert(s[0].body.indexOf("Just body text.") > -1);
  });
  test("3 consecutive level-2 sections", function () {
    var s = M.parseSections("== A ==\n1\n== B ==\n2\n== C ==\n3");
    eq(s.length, 3); eq(s[0].title, "A"); eq(s[1].title, "B"); eq(s[2].title, "C");
  });
  test("level-5 (deeply nested) section", function () {
    var s = M.parseSections("== L2 ==\n=== L3 ===\n==== L4 ====\n===== L5 =====\nDeep.");
    eq(s[0].children[0].children[0].children.length, 1);
    eq(s[0].children[0].children[0].children[0].title, "L5");
    assert(s[0].children[0].children[0].children[0].body.indexOf("Deep.") > -1);
  });
  test("body text on same line as marker is excluded from body", function () {
    // "== English ==" is a header marker — the body should NOT contain it
    var s = M.parseSections("== English ==\nSome body.");
    assert(s[0].body.indexOf("== English ==") === -1);
    assert(s[0].body.indexOf("Some body.") > -1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19 — plugin.json sanity
// ═══════════════════════════════════════════════════════════════════════════
group("plugin.json", function () {
  var manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "plugin.json"), "utf8"));
  test("version is 1.3.0", function () { eq(manifest.version, "1.3.0"); });
  test("id matches DMS IPC target", function () { eq(manifest.id, "dankDictionary"); });
  test("type is composite", function () { eq(manifest.type, "composite"); });
  test("capabilities includes dankbar-widget", function () { assert(manifest.capabilities.indexOf("dankbar-widget") > -1); });
  test("widget component exists", function () {
    eq(typeof manifest.components.widget, "string");
    assert(fs.existsSync(path.join(__dirname, "..", manifest.components.widget)));
  });
  test("daemon component exists", function () {
    eq(typeof manifest.components.daemon, "string");
    assert(fs.existsSync(path.join(__dirname, "..", manifest.components.daemon)));
  });
  test("name is Dank Dictionary", function () { eq(manifest.name, "Dank Dictionary"); });
  test("description mentions Wiktionary", function () { assert(manifest.description.toLowerCase().indexOf("wiktionary") > -1); });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20 — wiktExtractDefs: additional coverage
// ═══════════════════════════════════════════════════════════════════════════
group("wiktExtractDefs — additional", function () {
  test("filters 'See also' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nSee also: foo, bar");
    d.forEach(function (x) { assert(x.definition.indexOf("See also") === -1); });
  });
  test("filters 'External links' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nExternal links");
    d.forEach(function (x) { assert(x.definition.indexOf("External links") === -1); });
  });
  test("filters 'Usage notes' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nUsage notes: blah");
    d.forEach(function (x) { assert(x.definition.indexOf("Usage notes") === -1); });
  });
  test("filters 'Trivia' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nTrivia: blah");
    d.forEach(function (x) { assert(x.definition.indexOf("Trivia") === -1); });
  });
  test("filters 'Footnotes' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nFootnotes: blah");
    d.forEach(function (x) { assert(x.definition.indexOf("Footnotes") === -1); });
  });
  test("filters 'Anagram' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nAnagrams: blah");
    d.forEach(function (x) { assert(x.definition.indexOf("Anagram") === -1); });
  });
  test("filters 'Compare' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nCompare: blah");
    d.forEach(function (x) { assert(x.definition.indexOf("Compare:") === -1); });
  });
  test("filters 'Quotations' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nQuotations: blah");
    d.forEach(function (x) { assert(x.definition.indexOf("Quotations") === -1); });
  });
  test("filters 'Related terms' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nRelated terms: blah");
    d.forEach(function (x) { assert(x.definition.indexOf("Related terms") === -1); });
  });
  test("filters 'Derived terms' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nDerived terms: blah");
    d.forEach(function (x) { assert(x.definition.indexOf("Derived terms") === -1); });
  });
  test("filters 'History' lines", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nHistory: blah");
    d.forEach(function (x) { assert(x.definition.indexOf("History:") === -1); });
  });
  test("preserves colon-led Notes senses", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nNotes: blah");
    deepEq(d.map(function (x) { return x.definition; }), ["A real definition.", "Notes: blah"]);
  });
  test("preserves colon-led Source senses", function () {
    var d = M.wiktExtractDefs("x", "A real definition.\nSource: blah");
    deepEq(d.map(function (x) { return x.definition; }), ["A real definition.", "Source: blah"]);
  });
  test("filters 'January 2020: ...' attribution", function () {
    var body = "A real definition.\nJanuary 2020: Some attribution text.";
    var d = M.wiktExtractDefs("x", body);
    deepEq(d.map(function (x) { return x.definition; }), ["A real definition."]);
  });
  test("filters 'c. 1990: ...' attribution", function () {
    var body = "A real definition.\nc. 1990: Some attribution text.";
    var d = M.wiktExtractDefs("x", body);
    deepEq(d.map(function (x) { return x.definition; }), ["A real definition."]);
  });
  test("strips leading * from lines", function () {
    var d = M.wiktExtractDefs("x", "* A real definition that is long enough.\nUsed in everyday speech.");
    assert(d.length >= 1);
    assert(d[0].definition.indexOf("*") !== 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 21 — WIKT_SKIP_DROP coverage
// ═══════════════════════════════════════════════════════════════════════════
group("WIKT_SKIP_DROP sections ignored", function () {
  var skipSections = [
    "Translations", "Derived terms", "Related terms", "Descendants",
    "References", "Further reading", "Anagrams", "Conjugation",
    "Declension", "Inflection", "See also", "External links", "Quotations",
    "Homophones", "Hyponyms", "Hypernyms", "Meronyms", "Holonyms",
    "Troponyms", "Coordinate terms", "Alternative forms", "Synonyms",
    "Antonyms", "Usage notes"
  ];
  skipSections.forEach(function (sec) {
    test("skips '" + sec + "'", function () {
      var text = "== English ==\n==== Noun ====\nA real definition.\nUsed in everyday speech.\n=== " + sec + " ===\nSome noise.";
      var e = M.parseWiktionaryWikitext("x", text, "en");
      assert(e !== null);
      e.meanings.forEach(function (m) { assert(m.partOfSpeech.toLowerCase() !== sec.toLowerCase()); });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 22 — parseWiktionaryWikitext: additional POS coverage
// ═══════════════════════════════════════════════════════════════════════════
group("parseWiktionaryWikitext — additional POS", function () {
  test("proper noun → noun", function () {
    var text = mkEng("==== Proper noun ====\nLondon is a city.\nA major world capital.");
    var e = M.parseWiktionaryWikitext("London", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "noun"; }));
  });
  test("numeral → numeral", function () {
    var text = mkEng("==== Numeral ====\nThe numeral form.\nA numeric word.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "numeral"; }));
  });
  test("contraction → contraction", function () {
    var text = mkEng("==== Contraction ====\nAbbreviated form.\nA shortened version.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "contraction"; }));
  });
  test("letter → letter", function () {
    var text = mkEng("==== Letter ====\nThe letter A.\nA character in the alphabet.");
    var e = M.parseWiktionaryWikitext("A", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "letter"; }));
  });
  test("symbol → symbol", function () {
    var text = mkEng("==== Symbol ====\nThe symbol for pi.\nA mathematical constant.");
    var e = M.parseWiktionaryWikitext("π", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "symbol"; }));
  });
  test("initialism → initialism", function () {
    var text = mkEng("==== Initialism ====\nAbbreviation.\nAn abbreviated form.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "initialism"; }));
  });
  test("prefix → prefix", function () {
    var text = mkEng("==== Prefix ====\nAttached before root.\nA bound morpheme.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "prefix"; }));
  });
  test("suffix → suffix", function () {
    var text = mkEng("==== Suffix ====\nAttached after root.\nA bound morpheme.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "suffix"; }));
  });
  test("phrase → phrase", function () {
    var text = mkEng("==== Phrase ====\nA phrase.\nA multi-word expression.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "phrase"; }));
  });
  test("idiom → idiom", function () {
    var text = mkEng("==== Idiom ====\nAn idiomatic expression.\nA figurative phrase.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "idiom"; }));
  });
  test("proverb → proverb", function () {
    var text = mkEng("==== Proverb ====\nA proverb.\nA traditional saying.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "proverb"; }));
  });
  test("article → article", function () {
    var text = mkEng("==== Article ====\nA grammatical article.\nA function word.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); assert(e.meanings.some(function (m) { return m.partOfSpeech === "article"; }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 23 — parseWiktionaryWikitext: IPA extraction integration
// ═══════════════════════════════════════════════════════════════════════════
group("parseWiktionaryWikitext — IPA integration", function () {
  test("IPA preserved across multiple Pronunciation subsections", function () {
    var text = mkEng("=== Etymology 1 ===\n==== Pronunciation ====\nIPA: /æ/\n==== Pronunciation ====\nIPA: /b/\n==== Noun ====\nA test word.\nUsed in testing.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); eq(e.phonetic, "/b/");
  });
  test("phonetic empty when no Pronunciation section", function () {
    var text = mkEng("==== Noun ====\nA greeting or salutation.\nA form of address.");
    var e = M.parseWiktionaryWikitext("hello", text, "en");
    eq(e.phonetic, "");
  });
  test("IPA under Etymology > Pronunciation (nested)", function () {
    var text = mkEng("=== Etymology 1 ===\n==== Pronunciation ====\nIPA: /tɛst/\n==== Noun ====\nA test word.\nUsed in testing.");
    var e = M.parseWiktionaryWikitext("test", text, "en");
    eq(e.phonetic, "/tɛst/");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 24 — parseWiktionaryWikitext: fallback and edge cases
// ═══════════════════════════════════════════════════════════════════════════
group("parseWiktionaryWikitext — fallback/edges", function () {
  test("no language match → first level-2 used", function () {
    var text = "== Français ==\n==== Noun ====\nA test word.\nUsed in French.";
    var e = M.parseWiktionaryWikitext("test", text, "en");
    assert(e !== null); eq(e.language, "en");
  });
  test("no sections at all → null", function () {
    eq(M.parseWiktionaryWikitext("x", "Just some random text with no headers.", "en"), null);
  });
  test("only empty section bodies → null", function () {
    var text = "== English ==\n=== Etymology 1 ===\n==== Noun ====\n";
    var e = M.parseWiktionaryWikitext("x", text, "en");
    eq(e, null);
  });
  test("audioUrl always empty (not provided by Wiktionary extracts)", function () {
    var text = mkEng("==== Noun ====\nA greeting or salutation.\nA form of address.");
    var e = M.parseWiktionaryWikitext("hello", text, "en");
    eq(e.audioUrl, "");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 25 — apiBase: edge cases
// ═══════════════════════════════════════════════════════════════════════════
group("apiBase — edge cases", function () {
  test("very short code 'a' falls back to en (allowlist)", function () {
    var u = M.apiBase("a");
    assert(u.indexOf("https://en.wiktionary.org") > -1);
  });
  test("numeric code '123' falls back to en (allowlist)", function () {
    var u = M.apiBase("123");
    assert(u.indexOf("https://en.wiktionary.org") > -1);
  });
  test("URL always ends with 'titles='", function () {
    ["en", "th", "ja", "ko", "fr", "de"].forEach(function (c) {
      assert(M.apiBase(c).endsWith("titles="), "should end with titles= for " + c);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dictionary adapters (issue #12)
// ═══════════════════════════════════════════════════════════════════════════

// Tiny synthetic Webster's letter-bucket JSON in the exact shape
// scripts/build-webster.py emits: {key: {w, pr, pos: [[rawPos, [defs]]]}}.
var WEBSTER_FIXTURE = JSON.stringify({
  "apple": { "w": "Apple", "pr": "(ap'p'l)", "pos": [
    ["n", ["The fleshy pome of a rosaceous tree.", "Any round fruit resembling an apple."]],
    ["v. i.", ["To grow like an apple."]]
  ]},
  "a": { "w": "A", "pr": "", "pos": [
    ["", ["The first letter of the English alphabet."]]
  ]}
});

group("adaptersFor — chain ordering", function () {
  test("english resolves to [webster1913, wiktionary]", function () {
    var ids = M.adaptersFor("en").map(function (a) { return a.id; });
    assert.deepStrictEqual(ids, ["webster1913", "wiktionary"]);
  });
  test("other languages resolve to [wiktionary] only", function () {
    ["fr", "ja", "th", "de"].forEach(function (c) {
      var ids = M.adaptersFor(c).map(function (a) { return a.id; });
      assert.deepStrictEqual(ids, ["wiktionary"], c);
    });
  });
  test("unknown language falls back to english chain", function () {
    var ids = M.adaptersFor("xx").map(function (a) { return a.id; });
    assert.deepStrictEqual(ids, ["wiktionary"], "xx is not a webster language");
  });
  test("registry order is the fallback order", function () {
    var ids = M.ADAPTERS.map(function (a) { return a.id; });
    assert.deepStrictEqual(ids, ["webster1913", "wiktionary"]);
  });
  test("every adapter has the full interface", function () {
    M.ADAPTERS.forEach(function (a) {
      assert(typeof a.id === "string" && a.id !== "", "id");
      assert(typeof a.label === "string" && a.label !== "", "label");
      assert(Array.isArray(a.languages) && a.languages.length > 0, "languages");
      assert(typeof a.argsFor === "function", "argsFor");
      assert(typeof a.parse === "function", "parse");
    });
  });
});

group("webster adapter — argsFor", function () {
  test("no data dir -> no argv (chain skips it)", function () {
    M.setDataDir("");
    assert.deepStrictEqual(M.ADAPTER_WEBSTER.argsFor("apple", "en"), []);
  });
  test("builds a gzip argv for the right letter bucket", function () {
    M.setDataDir("/tmp/data");
    assert.deepStrictEqual(
      M.ADAPTER_WEBSTER.argsFor("Apple", "en"),
      ["gzip", "-dc", "/tmp/data/a.json.gz"]);
    assert.deepStrictEqual(
      M.ADAPTER_WEBSTER.argsFor("cab", "en"),
      ["gzip", "-dc", "/tmp/data/c.json.gz"]);
  });
  test("non-alpha headwords use the other bucket", function () {
    M.setDataDir("/tmp/data");
    assert.deepStrictEqual(
      M.ADAPTER_WEBSTER.argsFor("1st-class", "en"),
      ["gzip", "-dc", "/tmp/data/other.json.gz"]);
  });
  test("empty word -> no argv", function () {
    M.setDataDir("/tmp/data");
    assert.deepStrictEqual(M.ADAPTER_WEBSTER.argsFor("  ", "en"), []);
    M.setDataDir("");
  });
});

group("websterCanonicalPos", function () {
  var cases = {
    "n": "noun", "n.": "noun", "prop. n.": "noun",
    "v. t.": "verb", "v. i.": "verb", "v.": "verb",
    "a.": "adjective", "adv.": "adverb", "prep.": "preposition",
    "pron.": "pronoun", "conj.": "conjunction", "interj.": "interjection",
    "definite article": "article", "": ""
  };
  Object.keys(cases).forEach(function (raw) {
    test(JSON.stringify(raw) + " -> " + JSON.stringify(cases[raw]), function () {
      assert.strictEqual(M.websterCanonicalPos(raw), cases[raw]);
    });
  });
  test("unknown pos passes through raw", function () {
    assert.strictEqual(M.websterCanonicalPos("particle"), "particle");
  });
});

group("parseWebsterJson", function () {
  test("shapes a bucket entry into the canonical entry", function () {
    var r = M.parseWebsterJson(WEBSTER_FIXTURE, "apple");
    assert(r.ok, "should be ok");
    assert.strictEqual(r.entry.word, "Apple");
    assert.strictEqual(r.entry.phonetic, "(ap'p'l)");
    assert.strictEqual(r.entry.source, "webster1913");
    assert.strictEqual(r.entry.language, "en");
    assert.strictEqual(M.sourceLabel(r.entry), "Webster's 1913");
    assert.strictEqual(r.entry.meanings.length, 2);
    assert.strictEqual(r.entry.meanings[0].partOfSpeech, "noun");
    assert.strictEqual(r.entry.meanings[0].definitions.length, 2);
    assert.strictEqual(r.entry.meanings[0].definitions[0].definition,
      "The fleshy pome of a rosaceous tree.");
    assert.strictEqual(r.entry.meanings[1].partOfSpeech, "verb");
  });
  test("lookup is case-insensitive", function () {
    assert(M.parseWebsterJson(WEBSTER_FIXTURE, "Apple").ok);
    assert(M.parseWebsterJson(WEBSTER_FIXTURE, "APPLE").ok);
  });
  test("empty partOfSpeech survives (panel hides the header)", function () {
    var r = M.parseWebsterJson(WEBSTER_FIXTURE, "a");
    assert(r.ok);
    assert.strictEqual(r.entry.meanings[0].partOfSpeech, "");
    assert.strictEqual(r.entry.meanings[0].definitions[0].definition,
      "The first letter of the English alphabet.");
  });
  test("missing headword -> notfound", function () {
    var r = M.parseWebsterJson(WEBSTER_FIXTURE, "selfie");
    assert(!r.ok && r.kind === "notfound");
  });
  test("empty stdout -> empty", function () {
    var r = M.parseWebsterJson("", "apple");
    assert(!r.ok && r.kind === "empty");
  });
  test("garbage stdout -> invalid", function () {
    var r = M.parseWebsterJson("not json", "apple");
    assert(!r.ok && r.kind === "invalid");
  });
  test("adapter parse delegates to parseWebsterJson", function () {
    var r = M.ADAPTER_WEBSTER.parse(WEBSTER_FIXTURE, "apple", "en");
    assert(r.ok && r.entry.source === "webster1913");
  });
});

group("websterKey / websterBucket", function () {
  test("key is lowercased with collapsed whitespace", function () {
    assert.strictEqual(M.websterKey("  Apple  "), "apple");
    assert.strictEqual(M.websterKey("a 1"), "a 1");
  });
  test("bucket is the first letter, else other", function () {
    assert.strictEqual(M.websterBucket("apple"), "a");
    assert.strictEqual(M.websterBucket("1st-class"), "other");
    assert.strictEqual(M.websterBucket(""), "other");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Run
// ═══════════════════════════════════════════════════════════════════════════
console.log("");
console.log("Model.js test suite");
console.log("===================");
run();
console.log("");

function run() {
  console.log(_pass + " passed, " + _fail + " failed, " + (_pass + _fail) + " total");
  if (_fail > 0) process.exit(1);
}

// Dictionary API helpers. Pure data + URL building — no Qt, no Quickshell — so
// the same parse/build logic could be unit tested under node. The QML side
// owns the network call (curl via Process), text-field state, and rendering.

// ---- Languages ----
//
// Data-driven list of supported target languages. Each entry carries a
// BCP 47 `value` (the dropdown's stored value), an English `label`
// for the menu, and the native `wikiName` — the heading Wiktionary uses
// for its own language section in that edition (e.g. "English" on
// en.wikt, "ภาษาไทย" on th.wikt, "日本語" on ja.wikt). The native name is
// what the parser matches against, so getting it right is the
// difference between a clean parse and an empty meaning[] on the
// first lookup.
//
// The dropdown sorts editions alphabetically by English label.
var LANGUAGES = [
  { value: "ar", label: "Arabic",        wikiName: "العربية" },
  { value: "bn", label: "Bengali",       wikiName: "বাংলা" },
  { value: "zh", label: "Chinese",       wikiName: "漢語" },
  { value: "nl", label: "Dutch",         wikiName: "Nederlands" },
  { value: "en", label: "English",       wikiName: "English" },
  { value: "fr", label: "French",        wikiName: "Français" },
  { value: "de", label: "German",        wikiName: "Deutsch" },
  { value: "hi", label: "Hindi",         wikiName: "हिन्दी" },
  { value: "id", label: "Indonesian",    wikiName: "Bahasa Indonesia" },
  { value: "it", label: "Italian",       wikiName: "Italiano" },
  { value: "ja", label: "Japanese",      wikiName: "日本語" },
  { value: "ko", label: "Korean",        wikiName: "한국어" },
  { value: "ms", label: "Malay",         wikiName: "Bahasa Melayu" },
  { value: "fa", label: "Persian",       wikiName: "فارسی" },
  { value: "pl", label: "Polish",        wikiName: "język polski" },
  { value: "pt", label: "Portuguese",    wikiName: "Português" },
  { value: "ru", label: "Russian",       wikiName: "Русский" },
  { value: "es", label: "Spanish",       wikiName: "Español" },
  { value: "sw", label: "Swahili",       wikiName: "Kiswahili" },
  { value: "sv", label: "Swedish",       wikiName: "Svenska" },
  { value: "th", label: "Thai",          wikiName: "ภาษาไทย" },
  { value: "tr", label: "Turkish",       wikiName: "Türkçe" },
  { value: "vi", label: "Vietnamese",    wikiName: "Tiếng Việt" }
].sort(function (a, b) { return a.label.localeCompare(b.label) })

var LANG_BY_VALUE = {}
for (var i = 0; i < LANGUAGES.length; i++) LANG_BY_VALUE[LANGUAGES[i].value] = LANGUAGES[i]

function langLabel(value) {
  var l = LANG_BY_VALUE[String(value || "en").toLowerCase()]
  return l ? l.label : String(value || "en")
}
function langWikiName(value) {
  var l = LANG_BY_VALUE[String(value || "en").toLowerCase()]
  return l ? l.wikiName : "English"
}

function defaultLanguage() { return "en" }

function languages() { return LANGUAGES }

// ---- API layer ----
//
// URL construction for the Wiktionary MediaWiki extracts endpoint and
// the curl argv array that the QML Process element runs.
function apiBase(langCode) {
  var code = String(langCode || defaultLanguage()).trim().toLowerCase() || defaultLanguage()
  // Allowlist: only known Wiktionary editions may become a subdomain.
  // Without this, a future caller passing an arbitrary string could turn
  // the URL into an attacker domain via fragment/host tricks
  // (e.g. "evil.com#"). Falls back to the default language.
  if (!LANG_BY_VALUE[code]) code = defaultLanguage()
  return "https://" + code + ".wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles="
}

// Inject the release metadata from plugin.json; no duplicated release literal.
var pluginVersion = ""
function setPluginVersion(version) {
  pluginVersion = String(version || "").replace(/[^0-9A-Za-z.+-]/g, "")
}

// Build curl argv, pre-encoding the title with encodeURIComponent here.
// The User-Agent identifies this plugin to Wikimedia.
function lookupArgs(word, langCode) {
  var w = String(word || "").trim()
  if (w === "") return []
  return [
    "curl", "-fsS", "--max-time", "5", "--proto", "=https",
    "--max-filesize", "2097152",
    "-H", "User-Agent: dank-dictionary" + (pluginVersion ? "/" + pluginVersion : "") + " (https://github.com/quantavil/dank-dictionary)",
    apiBase(langCode) + encodeURIComponent(w)
  ]
}

// Exact spelling wins; case-sensitive editions can then resolve common variants.
function titleVariants(word) {
  var exact = String(word || "").trim()
  var lower = exact.toLowerCase()
  var capital = lower.charAt(0).toUpperCase() + lower.slice(1)
  var out = []
  ;[exact, lower, capital].forEach(function(value) {
    if (value && out.indexOf(value) < 0) out.push(value)
  })
  return out
}

// ---- Response parsing & normalisation ----
//
// Turns raw API response text (or legacy Free Dictionary JSON) into the
// canonical { word, phonetic, audioUrl, source, language, meanings } shape.
// The Wiktionary branch delegates the heavy lifting to the extract parser
// below; the Free Dictionary branch normalises in place.
function parseResponse(raw, langCode, word) {
  var text = String(raw || "").trim()
  if (text === "") {
    return { ok: false, kind: "empty", error: "empty response" }
  }
  var data = null
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, kind: "invalid", error: "could not parse response" }
  }
  if (!data || typeof data !== "object") {
    return { ok: false, kind: "invalid", error: "could not parse response" }
  }

  if (data.error) return { ok: false, kind: "network", error: "Wiktionary is unavailable. Try again later." }

  // Wiktionary envelope: { query: { pages: { "<id>": { ... } } } }
  if (data.query && data.query.pages && typeof data.query.pages === "object") {
    var pages = data.query.pages
    var pageIds = Object.keys(pages)
    if (pageIds.length === 0) {
      return { ok: false, kind: "empty", error: "no entry returned" }
    }
    var ordered = []
    var variants = titleVariants(word)
    for (var v = 0; v < variants.length; v++) {
      for (var i = 0; i < pageIds.length; i++) {
        var candidate = pages[pageIds[i]]
        if (candidate && candidate.title === variants[v] && ordered.indexOf(candidate) < 0)
          ordered.push(candidate)
      }
    }
    for (var i = 0; i < pageIds.length; i++) {
      var candidate = pages[pageIds[i]]
      if (ordered.indexOf(candidate) < 0) ordered.push(candidate)
    }
    var present = false
    for (var i = 0; i < ordered.length; i++) {
      var page = ordered[i]
      if (!page || page.missing !== undefined) continue
      present = true
      var entry = normalizeEntry(page, langCode)
      if (entry) return { ok: true, entry: entry, variants: pageIds.length }
    }
    return { ok: false, kind: present ? "empty" : "notfound", error: present
      ? "No usable definitions returned by Wiktionary."
      : "no entry for \"" + String(word || "word") + "\"" }
  }

  // Tested Free Dictionary compatibility shapes use a top-level array of
  // entries with `title`/`message` for not-found responses.
  if (!Array.isArray(data) && data.title && data.message) {
    return {
      ok: false,
      kind: "notfound",
      error: String(data.message)
    }
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, kind: "empty", error: "no entry returned" }
  }

  var legacyEntry = normalizeEntry(data[0], langCode)
  if (!legacyEntry) return { ok: false, kind: "empty", error: "no entry returned" }
  return { ok: true, entry: legacyEntry, variants: data.length }
}

// Normalize one entry into the shape the panel renders. Drops anything that
// isn't a primitive string/array; the API occasionally returns nulls.
//
// Two shapes accepted:
//   - Wiktionary page: { title, extract, ... }
//     The extract is plain text with the MediaWiki `=`/`==`/`===` section
//     markers preserved. parseWiktionaryWikitext walks it tree-wise
//     (language → parts-of-speech → defs) and emits a clean structured
//     entry — see that function below for the section parser.
//   - Free Dictionary entry: { word, phonetic, phonetics, meanings, ... }
//     Existing logic.
function normalizeEntry(raw, langCode) {
  if (!raw || typeof raw !== "object") return null

  // Wiktionary branch.
  if (raw.extract != null) {
    var title = String(raw.title || "").trim()
    if (title === "") return null
    return parseWiktionaryWikitext(title, raw.extract, langCode)
  }

  // Free Dictionary branch.
  var word = String(raw.word || "").trim()
  if (word === "") return null

  var phonetic = String(raw.phonetic || "").trim()
  if (phonetic === "" && Array.isArray(raw.phonetics)) {
    for (var i = 0; i < raw.phonetics.length; i++) {
      var p = raw.phonetics[i]
      if (p && typeof p === "object" && p.text) {
        phonetic = String(p.text).trim()
        if (phonetic !== "") break
      }
    }
  }

  var audioUrl = ""
  if (Array.isArray(raw.phonetics)) {
    for (var j = 0; j < raw.phonetics.length; j++) {
      var ph = raw.phonetics[j]
      if (ph && typeof ph === "object" && ph.audio && String(ph.audio).trim() !== "") {
        audioUrl = String(ph.audio).trim()
        break
      }
    }
  }

  var meanings = []
  if (Array.isArray(raw.meanings)) {
    for (var k = 0; k < raw.meanings.length; k++) {
      var m = normalizeMeaning(raw.meanings[k])
      if (m) meanings.push(m)
    }
  }

  if (meanings.length === 0) return null

  return {
    word: word,
    phonetic: phonetic,
    audioUrl: audioUrl,
    source: "dictionaryapi",
    meanings: meanings
  }
}

function normalizeMeaning(raw) {
  if (!raw || typeof raw !== "object") return null
  var pos = String(raw.partOfSpeech || "").trim()
  if (pos === "") return null

  var defs = []
  if (Array.isArray(raw.definitions)) {
    for (var i = 0; i < raw.definitions.length; i++) {
      var d = normalizeDefinition(raw.definitions[i])
      if (d) defs.push(d)
    }
  }

  if (defs.length === 0) return null

  return {
    partOfSpeech: pos,
    definitions: defs,
    synonyms: stringList(raw.synonyms),
    antonyms: stringList(raw.antonyms)
  }
}

function normalizeDefinition(raw) {
  if (!raw || typeof raw !== "object") return null
  var text = String(raw.definition || "").trim()
  if (text === "") return null
  return {
    definition: text,
    example: raw.example ? String(raw.example).trim() : "",
    synonyms: stringList(raw.synonyms),
    antonyms: stringList(raw.antonyms)
  }
}

function stringList(value) {
  if (!Array.isArray(value)) return []
  var out = []
  for (var i = 0; i < value.length; i++) {
    var s = String(value[i] || "").trim()
    if (s !== "") out.push(s)
  }
  return out
}

// ---- Wiktionary extract parser ----
//
// The extracts endpoint returns plain text with the MediaWiki section
// markers left in: `==` for language, `===` for major subsections
// inside a language (Pronunciation, Etymology, parts of speech), and
// `====` for sub-subsections — often useful, since for words with
// multiple etymologies the parts-of-speech sit at level 4
// (`set`'s `Verb` under `Etymology 1`, for example). explaintext=1
// already strips templates and formatting; what we have to do is
// structural: turn this:
//
//   == English ==
//   === Etymology 1 ===
//   ==== Noun ====
//   apple (plural apples)
//   A common, round fruit...
//
// into:
//
//   { partOfSpeech: "noun", definitions: [{ definition: "A common, round fruit..." }] }

function parseSections(text) {
  text = String(text || "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "")
  var root = { level: 0, title: "", body: "", children: [] }
  var stack = [root]
  var lines = text.split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = /^(={1,6})\s*([^{}=\n][^{}=\n]*?)\s*\1\s*$/.exec(lines[i])
    if (m) {
      var lvl = m[1].length
      while (stack.length > 1 && stack[stack.length - 1].level >= lvl) stack.pop()
      var sec = { level: lvl, title: String(m[2]).trim(), body: "", children: [] }
      stack[stack.length - 1].children.push(sec)
      stack.push(sec)
    } else if (stack.length > 1) {
      var top = stack[stack.length - 1]
      top.body += (top.body ? "\n" : "") + lines[i]
    }
  }
  return root.children
}

function stripInlineHeaders(text) {
  return String(text || "").replace(/^={2,}[^\n=].{0,80}?={2,}\s*$/gm, "").trim()
}

var WIKT_POS_KEYS = {
  noun: 1, verb: 1, adjective: 1, adj: 1, adverb: 1, adv: 1,
  pronoun: 1, preposition: 1, postposition: 1, particle: 1,
  interjection: 1, conjunction: 1, determiner: 1, article: 1,
  numeral: 1, contraction: 1, letter: 1, symbol: 1, initialism: 1,
  abbreviation: 1, acronym: 1, ellipsis: 1,
  prefix: 1, suffix: 1, infix: 1, circumfix: 1, "combining form": 1,
  phrase: 1, idiom: 1, proverb: 1, clause: 1, predicative: 1,
  "auxiliary verb": 1, "modal verb": 1, "proper noun": 1, name: 1,
  ordinal: 1, cardinal: 1, gerund: 1, participle: 1, infinitive: 1
}
var WIKT_SKIP_DROP = {
  translations: 1, "derived terms": 1, "related terms": 1,
  descendants: 1, references: 1, "further reading": 1,
  anagrams: 1, conjugation: 1, declension: 1, inflection: 1,
  "see also": 1, "external links": 1, quotations: 1,
  homophones: 1, hyponyms: 1, hypernyms: 1,
  meronyms: 1, holonyms: 1, troponyms: 1,
  "coordinate terms": 1, "alternative forms": 1,
  synonyms: 1, antonyms: 1, "usage notes": 1
}

function wiktCanonicalPos(t) {
  if (t === "adj") return "adjective"
  if (t === "adv") return "adverb"
  if (t === "auxiliary verb" || t === "modal verb" || t === "gerund" ||
      t === "participle" || t === "infinitive") return "verb"
  if (t === "proper noun" || t === "name") return "noun"
  return t
}

function wiktExtractIpa(body) {
  var m = /(?:IPA|МФА)[^:\n]*:\s*\/([^\n/]+)\//.exec(body)
  if (m) return "/" + m[1] + "/"
  var m2 = /(?:IPA|МФА)[^:\n]*:\s*\[([^\n\]]+)\]/.exec(body)
  if (m2) return "[" + m2[1] + "]"
  return ""
}

function wiktIsInflectionLine(line, headword) {
  if (!line || line.indexOf("(") < 0) return false
  var openIdx = line.indexOf("(")
  var closeIdx = line.lastIndexOf(")")
  if (openIdx < 0 || closeIdx < 0 || closeIdx !== line.length - 1) return false
  var head = line.substring(0, openIdx).trim().toLowerCase()
  var annot = line.substring(openIdx + 1, closeIdx)
  if (!head || !annot) return false
  var heads = head.split(/[,\s]+/).filter(Boolean)
  if (!heads.length) return false
  var hw = String(headword || "").trim().toLowerCase()
  var headOK = true
  for (var i = 0; head !== hw && i < heads.length; i++) {
    var p = heads[i]
    if (p === hw || p === hw + "s" || p === hw + "es") continue
    if (/^[a-z]+'$/.test(p)) continue
    if (heads.length === 1 && /^[a-z]+$/.test(p)) continue
    headOK = false
    break
  }
  if (!headOK) return false
  return /third-person|present participle|simple past|past participle|plural|comparative|superlative|diminutive|feminine|masculine|neuter|genitive|nominative|accusative|dative|ablative|not comparable|UK|US|dialectal|imperative|auxiliary|conjugation|^by$|predicative/i.test(annot)
}

function wiktExtractDefs(headword, body) {
  var t = stripInlineHeaders(String(body || "").replace(/\s+$/, "").trim())
  if (!t) return []
  var blocks = t.split(/\n\s*\n/)

  if (blocks.length) {
    var first = blocks[0]
    var fLines = first.split("\n")
    if (fLines.length === 1) {
      var stripped = fLines[0].trim().toLowerCase()
      var hw = String(headword || "").trim().toLowerCase()
      var parts = stripped.split(/\s*,\s*/).filter(Boolean)
      var headMatch = parts.length > 0
      for (var i = 0; i < parts.length && headMatch; i++) {
        var p = parts[i]
        if (p === hw || p === hw + "s" || p === hw + "es") continue
        headMatch = false
      }
      if (headMatch || wiktIsInflectionLine(first, headword)) blocks.shift()
    }
  }

  var skipRE = /^\s*(?:(?:Synonyms?|Antonyms?|Coordinate terms?|Related terms?|Derived terms?|Usage notes|See also|External links|Trivia|Footnotes|History|Compare|Quotations|Anagrams?)(?:\s*:|\s*$)|For more quotations using this term\b)/i
  // A comma after a year can introduce a sense. Require an attribution cue
  // (a trailing citation colon or an author reporting a quotation).
  var months = "(?:January|February|March|April|May|June|July|August|September|October|November|December)"
  var dateStart = "(?:(?:(?:c\\.|ca\\.|circa)\\s*)?[12]\\d{3}(?:\\s+" + months + "(?:\\s+\\d{1,2})?)?|" + months + "\\s+(?:(?:\\d{1,2}[, ]+)?[12]\\d{3}|\\d{1,2}))"
  var attrStartRE = new RegExp("^" + dateStart + "\\s*(?::|,\\s*(?:.+:\\s*$|.+\\b(?:wrote|writes|said|says|quoted|quoting)\\b))", "i")
  var onlyLabelRE = /^\([A-Za-z][A-Za-z ,]*\)\s*$/
  var numberRangeRE = /^\d+\s*-\s*\d+,\s*\d/

  var defs = []
  function emit(text) {
    var s = String(text || "").replace(/\s+$/, "").trim()
    if (!s) return
    if (/^\[[^\]]+\]\s*$/.test(s)) return
    if (attrStartRE.test(s)) return
    if (onlyLabelRE.test(s)) return
    if (numberRangeRE.test(s)) return
    defs.push({ definition: s, example: "", synonyms: [], antonyms: [] })
  }

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i].trim()
    if (!block) continue
    if (/^Alternative forms\s+of\s+/i.test(block)) continue
    var bLines = block.split("\n")
    for (var j = 0; j < bLines.length; j++) {
      var line = bLines[j].replace(/\s+$/, "").trim()
      if (!line) continue
      if (skipRE.test(line)) continue
      if (line.charAt(0) === "*") line = line.substring(1).trim()
      if (attrStartRE.test(line)) {
        if (j + 1 < bLines.length) {
          var next = bLines[j + 1].replace(/\s+$/, "").trim()
          if (next && !skipRE.test(next) && !attrStartRE.test(next) &&
              !onlyLabelRE.test(next)) {
            // This is the attributed quotation, not another definition.
            j++
          }
        }
        continue
      }
      emit(line)
    }
  }
  return defs
}

// Known native headings in addition to each language's canonical wikiName.
var WIKT_LANGUAGE_ALIASES = { zh: ["汉语", "中文"], hi: ["हिंदी"], th: ["ไทย"], fr: ["français"], de: ["deutsch"], es: ["español"] }

// Native structural headings observed in extracts from the supported editions.
// Etymology containers recurse; pronunciation and auxiliary sections never become POS.
var WIKT_STRUCTURE = {
  etymology: ["etymology", "étymologie", "etimologia", "etimologia / derivazione", "etimología", "etymologie", "woordherkomst en -opbouw", "этимология", "семантические свойства", "รากศัพท์", "語源", "字源", "詞源", "词源", "etimologi", "köken", "từ nguyên", "ریشه لغت", "ریشه‌شناسی", "व्युत्पत्ति"],
  pronunciation: ["pronunciation", "prononciation", "pronuncia", "pronúncia", "uitspraak", "произношение", "การออกเสียง", "発音", "發音", "发音", "讀音", "读音", "উচ্চারণ", "sebutan", "söyleniş", "cách phát âm", "آوایش", "उच्चारण", "النطق"],
  skip: ["traductions", "traducciones", "traduzione", "tradução", "vertalingen", "übersetzungen", "перевод", "terjemahan", "tafsiri", "översättningar", "çeviriler", "dịch", "คำแปลภาษาอื่น", "翻译", "翻譯", "برگردان‌ها", "অনুবাদসমূহ", "anagrammes", "anagramas", "voir aussi", "véase también", "ver também", "références", "referências", "kaynakça", "tham khảo", "библиография", "морфологические и синтаксические свойства", "родственные слова", "синонимы", "антонимы", "гиперонимы", "гипонимы", "anagramme", "aussprache", "silbentrennung", "sillabazione", "synoniemen", "synonymes", "sinonimi", "sinônimos", "คำพ้องความ", "ดูเพิ่ม", "รูปแบบอื่น", "tulisan jawi", "tesaurus", "từ tương tự", "chữ nôm", "woordafbreking", "gangbaarheid", "meer informatie", "verwijzingen", "관련 표현", "관련 어휘", "熟語", "成句", "सम्बन्धित शब्द", "parole derivate", "alterati", "proverbi e modi di dire", "terbitan", "ligações externas", "información adicional", "пословицы и поговорки", "анаграммы"]
}

function wiktStructure(key) {
  for (var kind in WIKT_STRUCTURE)
    if (WIKT_STRUCTURE[kind].indexOf(key) >= 0) return kind
  return ""
}

// German and Polish extracts use body labels rather than definition subsections.
function wiktLocalizedDefs(headword, body, edition) {
  var text = String(body || "")
  if (edition === "de" && /(?:^|\n)Bedeutungen:\s*\n/.test(text)) {
    text = text.split(/(?:^|\n)Bedeutungen:\s*\n/)[1].split(/\n[^\n\[\]]+:\s*(?:\n|$)/)[0]
    text = text.replace(/^\[\d+[a-z]?\]\s*/gm, "")
  }
  return wiktExtractDefs(headword, text)
}

function parseWiktionaryWikitext(headword, rawText, langCode) {
  var top = parseSections(rawText)
  if (!top.length) return null

  // Prefer the selected edition's language, including known native aliases.
  // Other headword languages are valid in that edition: preserve the original
  // first-language fallback. entry.language identifies the source edition.
  var target = String(langCode || defaultLanguage()).toLowerCase()
  var targetName = langWikiName(target).toLowerCase()
  var labelLower = langLabel(target).toLowerCase()
  var aliases = WIKT_LANGUAGE_ALIASES[target] || []
  var lang = null
  var languageLevel = top.some(function(node) { return node.level === 1 }) ? 1 : 2
  for (var i = 0; i < top.length; i++) {
    var t = top[i]
    if (t.level !== languageLevel) continue
    var titleLower = t.title.toLowerCase()
    var decorated = /\(([^()]+)\)\s*$/.exec(titleLower)
    var headingLanguage = decorated ? decorated[1].trim() : titleLower
    if (headingLanguage === targetName || headingLanguage === labelLower || aliases.indexOf(headingLanguage) !== -1) {
      lang = t
      break
    }
  }
  if (!lang) {
    for (var i = 0; i < top.length; i++) {
      if (top[i].level === languageLevel) { lang = top[i]; break }
    }
  }
  if (!lang) return null

  // Strict mode for English (where POS names map to known keys). Loose
  // mode elsewhere: subsections at level 3 or deeper with real defs are
  // surfaced with its raw title as the part-of-speech — useful until
  // we accumulate per-language POS dictionaries (Thai/Japanese/etc.).
  var loose = target !== "en"

  var meanings = []
  var phonetic = ""

  function visit(node) {
    var key = node.title.toLowerCase().trim()
    var keyBase = key.replace(/\s*[0-9۰-۹]+$/, "").trim()
    var structure = wiktStructure(keyBase)
    if (structure === "pronunciation") {
      phonetic = phonetic || wiktExtractIpa(node.body)
      return
    }
    if (structure === "etymology") {
      for (var i = 0; i < node.children.length; i++) visit(node.children[i])
      return
    }
    if (WIKT_SKIP_DROP[keyBase] || structure === "skip") return
    if (WIKT_POS_KEYS[key]) {
      var defs = wiktExtractDefs(headword, node.body)
      if (defs.length) {
        meanings.push({
          partOfSpeech: wiktCanonicalPos(key),
          definitions: defs,
          synonyms: [],
          antonyms: []
        })
      }
      return
    }
    if (loose && node.level > lang.level) {
      phonetic = phonetic || wiktExtractIpa(node.body)
      var looseDefs = wiktLocalizedDefs(headword, node.body, target)
      if (looseDefs.length && node.title.trim().length > 0 && node.title.trim().length < 30) {
        meanings.push({
          partOfSpeech: node.title.trim(),
          definitions: looseDefs,
          synonyms: [],
          antonyms: []
        })
        return
      }
    }
    for (var i = 0; i < node.children.length; i++) visit(node.children[i])
  }

  if (target === "pl") {
    var senses = /(?:^|\n)znaczenia:\s*\n([\s\S]*?)(?=\n[^\n]+:\s*(?:\n|$)|$)/.exec(lang.body)
    if (senses) {
      var lines = senses[1].trim().split("\n").filter(function(line) { return line.trim() !== "" })
      var label = lines.length && !/^\(\d/.test(lines[0]) ? lines.shift() : "znaczenia"
      var definitions = wiktExtractDefs(headword, lines.filter(function(line) { return /^\(\d+\.\d+\)/.test(line) }).join("\n").replace(/^\(\d+\.\d+\)\s*/gm, ""))
      if (definitions.length) meanings.push({ partOfSpeech: label, definitions: definitions, synonyms: [], antonyms: [] })
      phonetic = wiktExtractIpa(lang.body)
    }
  }
  if (target === "id" && !lang.children.length) {
    var blocks = lang.body.trim().split(/\n\s*\n/)
    var definitions = wiktExtractDefs(headword, blocks.length > 1 ? blocks[1] : "")
    if (definitions.length) meanings.push({ partOfSpeech: "", definitions: definitions, synonyms: [], antonyms: [] })
  }
  for (var i = 0; i < lang.children.length; i++) visit(lang.children[i])

  if (!meanings.length) return null
  return {
    word: String(headword || "").trim(),
    phonetic: phonetic,
    audioUrl: "",
    source: "wiktionary",
    language: target,
    meanings: meanings
  }
}

// ---- Display helpers ----
//
// Pure formatting functions that turn parsed entry data into short
// UI labels. No I/O, no side effects.

// Short status line for the hero label under the search box.
function summaryLabel(entry) {
  if (!entry || !entry.meanings) return ""
  var pos = []
  for (var i = 0; i < entry.meanings.length; i++) {
    if (entry.meanings[i] && entry.meanings[i].partOfSpeech) {
      if (pos.indexOf(entry.meanings[i].partOfSpeech) < 0) pos.push(entry.meanings[i].partOfSpeech)
    }
  }
  return pos.join(" · ")
}

// Display label for the data source, surfaced as a small muted tag in the
// panel header. Empty when the entry doesn't carry a source field.
function sourceLabel(entry) {
  if (!entry || !entry.source) return ""
  if (entry.source === "wiktionary") return "Wiktionary"
  if (entry.source === "dictionaryapi") return "Free Dictionary"
  if (entry.source === "webster1913") return "Webster's 1913"
  return String(entry.source)
}

// ---- Fuzzy match ----
//
// English candidates come from the successfully decoded Webster bucket.
// This keeps suggestions in the bundled dictionary and includes rare headwords.
// Adjacent transpositions count as one edit; ambiguous candidates remain choices.
//
// Return shape:
//   { autoMatch: "hello", alternatives: [] }           — single clear winner
//   { autoMatch: null,   alternatives: [..., ] }      — reviewable alternatives
//   { autoMatch: null,   alternatives: [] }            — nothing within threshold

// Levenshtein edit distance. Two rolling rows, no allocations past the
// initial buffer; the smaller string drives the inner loop so the cost
// is O(|a| · |b|) with |b| ≤ |a|.
function levenshtein(a, b) {
  if (a === b) return 0
  var al = a.length, bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  // Make sure v1 is the shorter side to keep work bounded.
  if (al < bl) {
    var tmp = a; a = b; b = tmp
    var tlen = al; al = bl; bl = tlen
  }
  var v0 = []; var v1 = []
  for (var i = 0; i <= bl; i++) v0[i] = i
  for (var i = 0; i < al; i++) {
    v1[0] = i + 1
    var ai = a.charCodeAt(i)
    for (var j = 0; j < bl; j++) {
      var cost = ai === b.charCodeAt(j) ? 0 : 1
      // min of: insert (v1[j]+1), delete (v0[j+1]+1), substitute (v0[j]+cost)
      var ins = v1[j] + 1
      var del = v0[j + 1] + 1
      var sub = v0[j] + cost
      var m = ins < del ? ins : del
      if (sub < m) m = sub
      v1[j + 1] = m
    }
    var swap = v0; v0 = v1; v1 = swap
  }
  return v0[bl]
}


// Restricted Damerau-Levenshtein (optimal string alignment) distance.
function damerauLevenshtein(a, b) {
  var rows = [[], [], []]
  for (var j = 0; j <= b.length; j++) rows[0][j] = j
  for (var i = 1; i <= a.length; i++) {
    var current = rows[i % 3], previous = rows[(i - 1) % 3], earlier = rows[(i + 1) % 3]
    current[0] = i
    for (var j = 1; j <= b.length; j++) {
      var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1))
        current[j] = Math.min(current[j], earlier[j - 2] + 1)
    }
  }
  return rows[a.length % 3][b.length]
}

// Per-panel candidates, refreshed when the offline adapter parses a bucket.
var _WORDLIST = []

function setWordlist(list) {
  if (Array.isArray(list)) _WORDLIST = list
}

var AUTO_MATCH_MAX_NORMALIZED = 0.22    // ("helllo" -> "hello" = 0.14, well under)
var ALTERNATIVES_MAX_NORMALIZED = 0.40   // distance / max length
var ALTERNATIVES_DISTANCE_LIMIT = 3     // hard cap on raw edits
var AUTO_MATCH_GAP = 0.08                // next candidate must trail by at least this much in score
var ALTERNATIVES_TO_SHOW = 3

function fuzzyMatch(rawQuery) {
  var query = String(rawQuery || "").toLowerCase().trim()
  // Drop anything that isn't a letter — the API path encodes the same query
  // verbatim, but for suggestions we only want word-shaped strings.
  var q = ""
  for (var i = 0; i < query.length; i++) {
    var ch = query.charCodeAt(i)
    if ((ch >= 97 && ch <= 122) ||
        ch === 0xe9 || ch === 0xe8 || ch === 0xea || ch === 0xeb ||
        ch === 0xe0 || ch === 0xe2 || ch === 0xee || ch === 0xef ||
        ch === 0xf1) {
      q += query[i]
    }
  }
  if (q.length < 2) return { autoMatch: null, alternatives: [] }

  var qlen = q.length
  var results = []
  for (var k = 0; k < _WORDLIST.length; k++) {
    var w = _WORDLIST[k]
    var wlen = w.length
    // First-letter and length prefilters. Length diff is loose here;
    // the score below penalizes large gaps all the same.
    if (w.charAt(0) !== q.charAt(0)) continue
    if (Math.abs(wlen - qlen) > ALTERNATIVES_DISTANCE_LIMIT) continue
    var d = damerauLevenshtein(q, w)
    if (d > ALTERNATIVES_DISTANCE_LIMIT) continue
    // Normalized score: 0 = identical, larger = worse. The longest-side
    // length is the denom so a 1-edit typo on a 12-letter word scores
    // better than the same typo on a 3-letter word.
    var score = d / Math.max(qlen, wlen)
    results.push({ word: w, distance: d, score: score })
  }

  // Sort by score (best = smallest), then by absolute distance, then by
  // closer-length match, then alphabetical as a stable final tiebreak.
  results.sort(function (a, b) {
    if (a.score !== b.score) return a.score - b.score
    if (a.distance !== b.distance) return a.distance - b.distance
    var ad = Math.abs(a.word.length - qlen)
    var bd = Math.abs(b.word.length - qlen)
    if (ad !== bd) return ad - bd
    if (a.word < b.word) return -1
    if (a.word > b.word) return 1
    return 0
  })

  // Tally inside the candidate-quality threshold. Outside it the words
  // are too distant to be a useful typo correction.
  var inBand = []
  for (var r = 0; r < results.length; r++) {
    if (results[r].score > ALTERNATIVES_MAX_NORMALIZED) break
    inBand.push(results[r])
  }

  if (inBand.length === 0) return { autoMatch: null, alternatives: [] }

  var top = inBand[0]
  var autoOk = top.score <= AUTO_MATCH_MAX_NORMALIZED &&
               (inBand.length === 1 ||
                (inBand[1].score - top.score) >= AUTO_MATCH_GAP)
  if (autoOk) return { autoMatch: top.word, alternatives: [] }

  // Ambiguous — surface the top alternatives so the user can pick one.
  var alts = []
  for (var n = 0; n < inBand.length && n < ALTERNATIVES_TO_SHOW; n++) {
    alts.push(inBand[n].word)
  }
  return { autoMatch: null, alternatives: alts }
}

// ---- Dictionary adapters ----
//
// Every dictionary source is an adapter — a plain object with a uniform
// interface:
//
//   {
//     id: "webster1913",                  // stable id, used in logs/tests
//     label: "Webster's 1913",            // human label (panel source tag)
//     languages: ["en"],                  // language values it can serve
//     argsFor: function (word, lang),     // argv for the QML Process ([] = skip)
//     parse: function (stdout, word, lang)
//                                          // -> {ok:true, entry} | {ok:false, kind, error}
//   }
//
// adaptersFor(lang) returns the ordered chain for a language. Panel.qml
// tries the chain in order and takes the first ok result; any other result
// (notfound, empty, invalid, or a process failure) advances to the next
// adapter. When the chain is exhausted the panel falls back to the existing
// fuzzy-recovery / notfound UI.
//
// Adding a future source is a new adapter object plus one line in ADAPTERS —
// the lookup flow itself never changes.

// Base directory of the bundled offline data (data/webster), injected from
// QML at startup via setDataDir() — same pattern as setWordlist(). Empty
// means no local data available; the local adapter then yields no argv and
// the chain skips straight to the network.
var _DATA_DIR = ""

function setDataDir(dir) {
  _DATA_DIR = String(dir || "")
}

// Normalize a lookup word to the key scheme scripts/build-webster.py used:
// lowercased, whitespace collapsed.
function websterKey(word) {
  return String(word || "").trim().toLowerCase().replace(/\s+/g, " ")
}

// Bucket file for a normalized key: first letter a-z, else "other".
function websterBucket(key) {
  var c = String(key || "").charAt(0)
  return (c >= "a" && c <= "z") ? c : "other"
}

// Map GCIDE part-of-speech abbreviations to the canonical labels the panel
// renders. Unknown values pass through raw (loose mode), matching the
// Wiktionary parser's treatment of unlisted languages.
function websterCanonicalPos(raw) {
  var p = String(raw || "").trim().toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim()
  if (p === "") return ""
  if (p === "v t") return "transitive verb"
  if (p === "v i") return "intransitive verb"
  if (p === "p p") return "past participle"
  if (p === "n pl") return "plural noun"
  if (p === "p pr") return "present participle"
  if (p === "n" || p === "prop n" || p === "proper n") return "noun"
  if (p === "a") return "adjective"
  if (p === "adv") return "adverb"
  if (p === "prep" || p === "preposition") return "preposition"
  if (p === "pron" || p === "pronoun") return "pronoun"
  if (p === "conj" || p === "conjunction") return "conjunction"
  if (p === "interj" || p === "interjection") return "interjection"
  // "particle" contains "article" — match the whole word, not a substring.
  if (p === "art" || p === "article" || p.slice(-8) === " article") return "article"
  if (p === "v" || p.charAt(0) === "v" && (p.charAt(1) === " " || p.length === 1)) return "verb"
  return String(raw || "").trim()
}

// Parse the stdout of the webster1913 adapter's gzip process: the whole
// letter-bucket JSON, from which we pull the single headword entry and
// shape it into the canonical entry the panel renders.
function parseWebsterJson(stdout, word) {
  var text = String(stdout || "").trim()
  if (text === "") {
    return { ok: false, kind: "empty", error: "empty dictionary data" }
  }
  var data = null
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, kind: "invalid", error: "could not parse dictionary data" }
  }
  if (!data || typeof data !== "object") {
    return { ok: false, kind: "invalid", error: "could not parse dictionary data" }
  }
  setWordlist(Object.keys(data).filter(function(candidate) { return /^[a-z]{2,30}$/.test(candidate) }))
  var key = websterKey(word)
  var raw = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
  if (!raw || typeof raw !== "object") {
    return { ok: false, kind: "notfound", error: "no entry for \"" + String(word || "").trim() + "\"" }
  }

  var meanings = []
  var groups = Array.isArray(raw.pos) ? raw.pos : []
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i]
    if (!Array.isArray(g) || g.length < 2) continue
    var defs = []
    var rawDefs = Array.isArray(g[1]) ? g[1] : []
    for (var j = 0; j < rawDefs.length; j++) {
      var d = String(rawDefs[j] || "").trim()
      if (d !== "") defs.push({ definition: d, example: "", synonyms: [], antonyms: [] })
    }
    if (defs.length === 0) continue
    meanings.push({
      partOfSpeech: websterCanonicalPos(g[0]),
      definitions: defs,
      synonyms: [],
      antonyms: []
    })
  }
  if (meanings.length === 0) {
    return { ok: false, kind: "empty", error: "no entry returned" }
  }

  return {
    ok: true,
    entry: {
      word: String(raw.w || word || "").trim(),
      phonetic: String(raw.pr || "").trim(),
      audioUrl: "",
      source: "webster1913",
      language: "en",
      meanings: meanings
    }
  }
}

var ADAPTER_WEBSTER = {
  id: "webster1913",
  label: "Webster's 1913",
  languages: ["en"],
  argsFor: function (word, lang) {
    var key = websterKey(word)
    if (key === "" || _DATA_DIR === "") return []
    return ["gzip", "-dc", _DATA_DIR + "/" + websterBucket(key) + ".json.gz"]
  },
  parse: function (stdout, word, lang) {
    return parseWebsterJson(stdout, word)
  }
}

var ADAPTER_WIKTIONARY = {
  id: "wiktionary",
  label: "Wiktionary",
  languages: ["*"],
  wordsFor: function (word, lang) { return titleVariants(word) },
  argsFor: function (word, lang) {
    return lookupArgs(word, lang)
  },
  parse: function (stdout, word, lang) {
    return parseResponse(stdout, lang, word)
  }
}

// Registry order IS the fallback chain order. English resolves to
// [webster1913, wiktionary] — offline-first with a network fallback;
// every other language resolves to [wiktionary].
var ADAPTERS = [ADAPTER_WEBSTER, ADAPTER_WIKTIONARY]

function adaptersFor(langCode) {
  var lang = String(langCode || defaultLanguage()).trim().toLowerCase() || defaultLanguage()
  var out = []
  for (var i = 0; i < ADAPTERS.length; i++) {
    var a = ADAPTERS[i]
    if (!a || !Array.isArray(a.languages)) continue
    if (a.languages.indexOf("*") >= 0 || a.languages.indexOf(lang) >= 0) out.push(a)
  }
  return out
}

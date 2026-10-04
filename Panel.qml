pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Widgets
import "."
import "Model.js" as Model
import "wordlist.js" as Wordlist

// Dictionary search panel. The bar widget owns a magnify glyph that toggles
// this popup; everything user-facing lives here — the search field, the
// fetch lifecycle, and the rendered entry.
//
// Layout: a search field pinned to the top, a meaning stack beneath that
// grows from the entry's parts of speech. The entry is treated as a
// read-out rather than a picker, so there's no per-row cursor — arrows move
// the field caret instead, Enter fires search, Esc closes the panel.
Item {
  id: root
  property var hostWidget: null
  property var parentPopout: null
  property var closePopout: function() {}
  readonly property bool opened: parentPopout ? parentPopout.shouldBeVisible : false
  implicitHeight: panelColumn.implicitHeight

  function close() {
    cancelLookup()
    closePopout()
  }

  function search(word) {
    var q = String(word || "").trim()
    root.programmaticEdit = true
    searchField.text = q
    root.programmaticEdit = false
    root.query = q
    runLookup()
    refreshFocus()
  }

  onParentPopoutChanged: {
    if (parentPopout) {
      parentPopout.contentHandlesKeys = true
      if (root.hostWidget) {
        root.hostWidget.parentPopout = parentPopout
        Qt.callLater(root.hostWidget.finishOpening)
      }
    }
    refreshFocus()
  }

  Connections {
    target: root.parentPopout
    function onShouldBeVisibleChanged() {
      if (root.opened) root.refreshFocus()
      else root.cancelLookup()
    }
  }

  Keys.onPressed: function(event) {
    if (event.key === Qt.Key_Escape) {
      if (searchField.getActiveFocus() && searchField.text.length > 0)
        searchField.text = ""
      else root.close()
      event.accepted = true
    } else if (event.text === "/" && !searchField.getActiveFocus()) {
      root.refreshFocus()
      event.accepted = true
    }
  }

  // ---- Search state. status drives which body section (hero + list) the
  //      panel shows; entry holds the parsed response on success.
  property string query: ""
  property var entry: null
  property string status: "idle"        // "idle" | "loading" | "ok" | "notfound" | "error" | "suggestions"
  property string statusMessage: ""

  // Target language for lookups. Driven by the dropdown in the popup
  // header; default comes from Model.defaultLanguage so the panel and
  // data layer stay in sync.
  property string language: Model.defaultLanguage ? Model.defaultLanguage() : "en"

  // ---- Fuzzy state. Populated only when the user's exact query was a 404
  //      and the local wordlist surfaced closer candidates. suggestions is
  //      the chip list shown for the user to choose from; originalQuery is
  //      what the user typed before auto-match rewrote query to a better
  //      word (kept so we can render a "showing 'X' for 'Y'" hint).
  property var suggestions: []
  property string originalQuery: ""
  property bool isAutoMatched: false

  // Suppress the user-edit reset in applyEdited when the *plugin itself*
  // rewrites the search field (auto-match path: we set searchField.text to
  // the chosen candidate, and the resulting onTextChanged would otherwise
  // clobber isAutoMatched and originalQuery mid-fetch).
  property bool programmaticEdit: false

  // ---- Adapter chain. Model.adaptersFor(language) returns the ordered list
  //      of dictionary sources for the current language — e.g. English
  //      resolves to [webster1913, wiktionary], offline-first with a network
  //      fallback. The panel tries the chain in order; the first ok result
  //      wins and any other outcome advances to the next adapter. Adding a
  //      future source is a new adapter plus one line in Model.js.
  property var adapterQueue: []
  property int adapterIndex: 0

  readonly property color contentForeground: Theme.surfaceText
  readonly property string contentFontFamily: Theme.fontFamily

  readonly property string heroSummary: entry ? Model.summaryLabel(entry) : ""
  readonly property int panelWidth: Math.round(Theme.fontSizeMedium * 30)
  readonly property int panelMaxHeight: Math.min(Math.round(Theme.fontSizeMedium * 44),
    parentPopout && parentPopout.screen ? parentPopout.screen.height - (hostWidget ? hostWidget.barThickness : 48) - Theme.spacingXL * 2 : 620)

  // Bundled offline dictionary data (data/webster). Same URL-to-path
  // decoding: Qt.resolvedUrl returns a
  // percent-encoded file:// URL, so strip the scheme and decode it back
  // into a real filesystem path for the lookup process.
  readonly property string dataDir: {
    var url = String(Qt.resolvedUrl("data/webster"))
    var raw = url.replace(/^file:\/\//, "/")
    try { return decodeURIComponent(raw) } catch (e) { return raw }
  }

  // ---- Reset all result-related state back to idle. Called from search(),
  //      runLookup(), applyEdited(), and the language-change handler.
  function resetResults() {
    root.entry = null
    root.status = "idle"
    root.statusMessage = ""
    root.suggestions = []
    root.originalQuery = ""
    root.isAutoMatched = false
  }

  FileView {
    id: manifestFile
    path: Qt.resolvedUrl("plugin.json")
    blockLoading: true
  }

  // Inject the bundled wordlist into Model.js so fuzzyMatch() can use it,
  // and the bundled offline data dir so the local adapter can find it.
  Component.onCompleted: {
    Model.setPluginVersion(JSON.parse(manifestFile.text()).version)
    if (typeof Model.setWordlist === "function" && typeof Wordlist.ENGLISH_WORDLIST !== "undefined")
      Model.setWordlist(Wordlist.ENGLISH_WORDLIST)
    if (typeof Model.setDataDir === "function")
      Model.setDataDir(root.dataDir)
    if (root.hostWidget) root.hostWidget.panelItem = root
  }

  Component.onDestruction: {
    cancelLookup()
    if (root.hostWidget && root.hostWidget.panelItem === root)
      root.hostWidget.panelItem = null
  }

  // ---- Bindings need the source data checked before any property
  //      access; pulling the wording into functions lets the body
  //      short-circuit cleanly when entry is null mid-fetch (the
  //      auto-match recovery path blanks entry briefly between lookups).
  function autoMatchedNote() {
    if (!root.entry || !root.originalQuery) return ""
    return "Showing \"" + root.entry.word + "\" (closest match for \"" + root.originalQuery + "\")."
  }
  function entryWord() {
    return root.entry ? String(root.entry.word || "") : ""
  }
  function entryPhonetic() {
    return root.entry ? String(root.entry.phonetic || "") : ""
  }

  // ---- Focus handling. The field owns initial focus; Esc redirects to close.
  function refreshFocus() {
    if (!root.opened) return
    // DMS first focuses its popup container. Focus the editor after that turn.
    Qt.callLater(function() {
      Qt.callLater(function() {
        if (!root.opened) return
        searchField.forceActiveFocus()
        if (String(searchField.text || "").length > 0) searchField.selectAll()
      })
    })
  }

  // ---- Lookup. The active query is the one in the field; if it changes
  //      while a request is in flight we kill the running process so a
  //      stale response can't overwrite the newer one. Each adapter writes
  //      to stdout; we parse it once on completion and advance down the
  //      chain until one succeeds.
  function runLookup(preserveRecovery) {
    cancelLookup()
    var q = String(searchField.text || "").trim()
    root.query = q
    if (q === "") {
      lookupProc.running = false
      root.resetResults()
      return
    }
    root.adapterQueue = (typeof Model.adaptersFor === "function")
      ? Model.adaptersFor(root.language) : []
    root.adapterIndex = 0

    root.statusMessage = ""
    if (!preserveRecovery) root.resetResults()
    else {
      root.entry = null
      root.suggestions = []
    }
    root.status = "loading"
    runAdapter()
  }

  property int lookupGeneration: 0
  property int activeGeneration: -1
  property var activeAdapter: null
  property string activeQuery: ""
  property string activeLanguage: ""
  property var pendingArgs: []
  property bool processStarted: false
  property bool processExited: false
  property bool stdoutFinished: false
  property string adapterOutput: ""
  property bool processBusy: false

  function cancelLookup() {
    root.lookupGeneration++
    root.pendingArgs = []
    if (lookupProc.running) lookupProc.running = false
    if (root.status === "loading") root.status = "idle"
  }

  function startPendingAdapter() {
    if (root.pendingArgs.length === 0 || root.status !== "loading") return
    if (root.processBusy) return
    lookupProc.command = root.pendingArgs
    root.pendingArgs = []
    root.activeGeneration = root.lookupGeneration
    root.activeAdapter = root.adapterQueue[root.adapterIndex]
    root.activeQuery = root.query
    root.activeLanguage = root.language
    root.processStarted = false
    root.processExited = false
    root.stdoutFinished = false
    root.adapterOutput = ""
    root.processBusy = true
    lookupProc.running = true
  }

  // Run the current adapter in the chain. Adapters whose argsFor() yields
  // no argv (e.g. the local adapter with no data dir, or an empty query)
  // are skipped without touching the process.
  function runAdapter() {
    while (root.adapterIndex < root.adapterQueue.length) {
      var adapter = root.adapterQueue[root.adapterIndex]
      var args = []
      try {
        args = adapter.argsFor(root.query, root.language) || []
      } catch (e) {
        console.warn("dank-dictionary: adapter", adapter && adapter.id, "argsFor failed:", e)
      }
      if (args.length > 0) {
        root.pendingArgs = args
        // A canceled process must finish before the next run captures its state.
        if (!root.processBusy) Qt.callLater(root.startPendingAdapter)
        return
      }
      root.adapterIndex++
    }
    // No adapter could even start — handle as an exhausted chain.
    onAdapterChainExhausted({ ok: false, kind: "error", error: "no dictionary source available" })
  }

  // Advance to the next adapter in the chain. Returns true when another
  // adapter started; false when the chain is exhausted.
  function tryNextAdapter() {
    root.adapterIndex++
    if (root.adapterIndex < root.adapterQueue.length) {
      runAdapter()
      return true
    }
    return false
  }

  // The whole chain failed. `result` is the last adapter's outcome and
  // drives the same end states a single-source lookup used to produce:
  // notfound-ish results get fuzzy recovery, anything else is an error.
  function onAdapterChainExhausted(result) {
    root.entry = null
    if (result && (result.kind === "notfound" || result.kind === "invalid" || result.kind === "empty")) {
      if (root.isAutoMatched) {
        // Recovery round tripped without finding a working word —
        // don't loop, just show the notfound state.
        root.isAutoMatched = false
        root.status = "notfound"
        root.statusMessage = "no definition found for \"" + (root.originalQuery || root.query) + "\""
        return
      }
      root.originalQuery = root.query
      var fuzzy = root.language === "en" ? Model.fuzzyMatch(root.query) : null
      if (fuzzy && fuzzy.autoMatch) {
        // Rewrite the field to the candidate so the user can see what
        // we fetched, keep it marked "auto", and fetch it. The next
        // round will see isAutoMatched === true on any further 404.
        // programmaticEdit suppresses applyEdited's user-reset clauses
        // while the field is being updated by us, not the user.
        root.isAutoMatched = true
        root.programmaticEdit = true
        searchField.text = fuzzy.autoMatch
        root.query = fuzzy.autoMatch
        root.programmaticEdit = false
        root.runLookup(true)
        return
      }
      if (fuzzy && fuzzy.alternatives && fuzzy.alternatives.length > 0) {
        root.suggestions = fuzzy.alternatives
        root.status = "suggestions"
        root.statusMessage = "no definition found for \"" + root.originalQuery + "\""
      } else {
        root.status = "notfound"
        root.statusMessage = "no definition found for \"" + root.originalQuery + "\""
      }
    } else {
      root.status = "error"
      root.statusMessage = (result && result.error) || "could not look up the word"
    }
  }

  // The grammar of "search" — Enter fires immediately; typing clears any
  // pending requests and resets state so a stale response can't surprise
  // the user. Esc clears the field before closing the popup.
  // When programmaticEdit is true (auto-match recovery just rewrote the
  // field to a candidate word) we skip the user-reset clauses so the
  // isAutoMatched flag survives into the second lookup.
  function applyEdited() {
    if (root.programmaticEdit) return
    if (root.status === "loading") root.cancelLookup()
    var q = String(searchField.text || "").trim()
    root.query = q
    if (q === "") {
      lookupProc.running = false
      root.resetResults()
      return
    }
    // Don't auto-fire on every keystroke — the API is rate-limited and
    // half-typed words make noise — but clear any in-flight result so the
    // panel doesn't show stale data next to fresh text.
    if (root.status === "ok" || root.status === "notfound" || root.status === "error" || root.status === "suggestions") {
      root.resetResults()
    }
  }

  // All process events join here. A normal run needs both EOF and exit,
  // in either order; FailedToStart has neither started nor exited signals.
  function adapterEvent(event, output) {
    if (!root.processBusy) return
    if (event === "started") root.processStarted = true
    else if (event === "stdout") {
      root.stdoutFinished = true
      root.adapterOutput = output
    } else if (event === "exited") root.processExited = true
    else if (event === "stopped") {
      if (root.processStarted) return
      root.processExited = true
      root.stdoutFinished = true
    }
    if (!root.processExited || !root.stdoutFinished) return

    root.processBusy = false
    if (root.status === "loading" && root.activeGeneration === root.lookupGeneration) {
      var result = { ok: false, kind: "error", error: "could not start the dictionary command" }
      if (root.processStarted) {
        try {
          result = root.activeAdapter.parse(root.adapterOutput, root.activeQuery, root.activeLanguage)
        } catch (e) {
          console.warn("dank-dictionary: adapter", root.activeAdapter && root.activeAdapter.id, "parse failed:", e)
          result = { ok: false, kind: "error", error: "could not parse the dictionary response" }
        }
      }
      if (result && result.ok) {
        root.entry = result.entry
        root.status = "ok"
        root.statusMessage = ""
      } else if (!root.tryNextAdapter()) {
        root.onAdapterChainExhausted(result)
      }
    }
    if (root.pendingArgs.length > 0) Qt.callLater(root.startPendingAdapter)
  }

  Process {
    id: lookupProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.adapterEvent("stdout", text)
    }
    onStarted: root.adapterEvent("started", "")
    onExited: root.adapterEvent("exited", "")
    onRunningChanged: {
      if (!running) {
        var generation = root.activeGeneration
        Qt.callLater(function() {
          if (generation === root.activeGeneration && !lookupProc.running)
            root.adapterEvent("stopped", "")
        })
      }
    }
  }

  onOpenedChanged: {
    if (opened) {
      if (root.hostWidget) DictionaryState.activateHost(root.hostWidget)
      refreshFocus()
    }
  }

  Column {
      id: panelColumn
      width: (parent ? parent.width : 0)
      spacing: (Theme.spacingM * 1.167)

        // ---------- Hero: title + entry summary (parts of speech) + lang dropdown
        Item {
          width: (parent ? parent.width : 0)
          implicitHeight: Math.max(heroIcon.implicitHeight, heroLabels.implicitHeight, languageDropdown.implicitHeight)

          DankIcon {
            id: heroIcon
            name: "menu_book"
            color: root.contentForeground
            size: Math.round(Theme.fontSizeLarge * 1.65)
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
          }

          Column {
            id: heroLabels
            anchors.left: heroIcon.right
            anchors.leftMargin: (Theme.spacingM * 1.167)
            anchors.right: languageDropdown.left
            anchors.rightMargin: (Theme.spacingM * 0.833)
            anchors.verticalCenter: parent.verticalCenter
            spacing: (Theme.spacingXS / 2)

            Text {
              text: "Dank Dictionary"
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Theme.fontSizeLarge
              font.bold: true
              elide: Text.ElideRight
              width: (parent ? parent.width : 0)
            }

            Text {
              text: {
                if (root.status === "ok" && root.entry) {
                  var parts = root.heroSummary
                  return parts === "" ? "found" : parts
                }
                if (root.status === "loading") return "looking up…"
                if (root.status === "notfound") return "no definition"
                if (root.status === "error") return "couldn't reach the API"
                return "look up a word"
              }
              textFormat: Text.PlainText
              color: Theme.surfaceVariantText
              font.family: root.contentFontFamily
              font.pixelSize: Theme.fontSizeSmall
              font.bold: true
              font.letterSpacing: 1.2
              elide: Text.ElideRight
              width: (parent ? parent.width : 0)
            }
          }

          // Language switcher in the top right of the popup. Data-driven
          // from Model.languages() (sorted alphabetically by English
          // label in JS) so adding a language is a one-entry edit.
          // Changing language clears the previous query and result.
          DankDropdown {
            id: languageDropdown
            readonly property var languages: Model.languages()
            options: languages.map(function(item) { return item.label })
            currentValue: {
              for (var i = 0; i < languages.length; i++)
                if (languages[i].value === root.language) return languages[i].label
              return "English"
            }
            compactMode: true
            dropdownWidth: Theme.fontSizeMedium * 10
            alignPopupRight: true
            // DMS hosts this menu inside the popup window; short panels need
            // a bounded scrolling list rather than the default 400px menu.
            maxPopupHeight: Math.max(1, Math.min(Theme.fontSizeMedium * 20,
                root.height - Theme.spacingS * 2))
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            onValueChanged: function(label) {
              var newValue = root.language
              for (var i = 0; i < languages.length; i++)
                if (languages[i].label === label) newValue = languages[i].value
              if (newValue === root.language) return
              root.cancelLookup()
              root.language = newValue
              root.resetResults()
              root.programmaticEdit = true
              searchField.text = ""
              root.programmaticEdit = false
              root.query = ""
              root.refreshFocus()
            }
          }
        }

        // ---------- Search field ----------
        Rectangle {
          width: (parent ? parent.width : 0)
          height: 1
          color: Theme.outlineVariant
        }

        RowLayout {
          width: (parent ? parent.width : 0)
          spacing: Theme.spacingS
          DankTextField {
            id: searchField
            Layout.fillWidth: true
            Layout.preferredHeight: Math.round(Theme.fontSizeMedium * 3)
            placeholderText: "Search a word…"
            leftIconName: "search"
            showClearButton: true
            onTextEdited: root.applyEdited()
            onAccepted: {
              root.runLookup()
            }
          }
          DankButton {
            Layout.preferredWidth: Theme.fontSizeMedium * 6
            Layout.preferredHeight: Math.round(Theme.fontSizeMedium * 3)
            text: "Search"
            enabled: searchField.text.trim() !== "" && root.status !== "loading"
            buttonHeight: Math.round(Theme.fontSizeMedium * 3)
            onClicked: {
              root.runLookup()
            }
          }
        }

        // ---------- Body ----------
        Rectangle {
          width: (parent ? parent.width : 0)
          height: 1
          color: Theme.outlineVariant
        }

        // Body container — one slot per response state, only the active one
        // is visible. Pinned at top-left, full column width. Each branch
        // carries its own spacing/typography so swapping them doesn't
        // shift adjacent layout.
        Item {
          id: body
          width: (parent ? parent.width : 0)
          implicitHeight: bodyColumn.implicitHeight

          Column {
            id: bodyColumn
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            spacing: (Theme.spacingS)

            // Idle — no query yet.
            Column {
              width: (parent ? parent.width : 0)
              visible: root.status === "idle"
              spacing: (Theme.spacingS * 0.75)

              Text {
                width: (parent ? parent.width : 0)
                text: "Type a word in the field above, then press Enter to look it up."
                color: Theme.surfaceVariantText
                font.family: root.contentFontFamily
                font.pixelSize: Theme.fontSizeMedium
                wrapMode: Text.WordWrap
              }

              Text {
                width: (parent ? parent.width : 0)
                text: "English uses bundled Webster’s 1913 data first, with Wiktionary as fallback."
                color: Theme.surfaceVariantText
                font.family: root.contentFontFamily
                font.pixelSize: Theme.fontSizeSmall
                wrapMode: Text.WordWrap
              }
            }

            // Loading indicator runs only while the popup is open.
            Row {
              visible: root.status === "loading"
              spacing: (Theme.spacingM * 0.833)
              width: (parent ? parent.width : 0)

              Item {
                width: (Theme.fontSizeMedium * 1.286)
                height: (Theme.fontSizeMedium * 1.286)
                anchors.verticalCenter: parent.verticalCenter

                DankIcon {
                  anchors.centerIn: parent
                  name: "menu_book"
                  color: Theme.primary
                  size: Theme.fontSizeLarge
                  transformOrigin: Item.Center

                  NumberAnimation on rotation {
                    from: 0
                    to: 360
                    duration: 900
                    loops: Animation.Infinite
                    running: root.opened && root.status === "loading"
                  }
                }
              }

              Text {
                text: "Looking up \"" + root.query + "\"…"
                textFormat: Text.PlainText
                color: Theme.surfaceVariantText
                font.family: root.contentFontFamily
                font.pixelSize: Theme.fontSizeMedium
                anchors.verticalCenter: parent.verticalCenter
              }
            }

            // Suggestions from the local fuzzy match.
            Column {
              width: (parent ? parent.width : 0)
              visible: root.status === "suggestions"
              spacing: (Theme.spacingS)

              Text {
                width: (parent ? parent.width : 0)
                text: "No definition for \"" + (root.originalQuery || root.query) + "\"."
                textFormat: Text.PlainText
                color: Theme.surfaceVariantText
                font.family: root.contentFontFamily
                font.pixelSize: Theme.fontSizeMedium
                wrapMode: Text.WordWrap
              }

              Text {
                width: (parent ? parent.width : 0)
                text: "Did you mean:"
                color: Theme.surfaceVariantText
                font.family: root.contentFontFamily
                font.pixelSize: Theme.fontSizeSmall
                font.bold: true
                font.letterSpacing: 1.0
              }

              // Chip row — one clickable Button per candidate.
              Flow {
                width: (parent ? parent.width : 0)
                spacing: (Theme.spacingS * 0.75)

                Repeater {
                  model: root.suggestions

                  DankButton {
                    required property string modelData
                    text: modelData
                    textColor: root.contentForeground
                    onClicked: root.search(modelData)
                  }
                }
              }
            }

            // Not found (no fuzzy candidates).
            Column {
              width: (parent ? parent.width : 0)
              visible: root.status === "notfound"
              spacing: (Theme.spacingXS)

              Text {
                width: (parent ? parent.width : 0)
                text: "No definition for \"" + (root.originalQuery || root.query) + "\"."
                textFormat: Text.PlainText
                color: Theme.surfaceVariantText
                font.family: root.contentFontFamily
                font.pixelSize: Theme.fontSizeMedium
                wrapMode: Text.WordWrap
              }

              Text {
                width: (parent ? parent.width : 0)
                visible: root.statusMessage !== ""
                text: root.statusMessage
                textFormat: Text.PlainText
                color: Theme.surfaceVariantText
                font.family: root.contentFontFamily
                font.pixelSize: Theme.fontSizeSmall
                wrapMode: Text.WordWrap
              }
            }

            // Error.
            Column {
              width: (parent ? parent.width : 0)
              visible: root.status === "error"
              spacing: (Theme.spacingXS)

              Text {
                width: (parent ? parent.width : 0)
                text: "Couldn't look up \"" + root.query + "\"."
                textFormat: Text.PlainText
                color: Theme.surfaceVariantText
                font.family: root.contentFontFamily
                font.pixelSize: Theme.fontSizeMedium
                wrapMode: Text.WordWrap
              }

              Text {
                width: (parent ? parent.width : 0)
                text: root.statusMessage
                textFormat: Text.PlainText
                color: Theme.surfaceVariantText
                font.family: root.contentFontFamily
                font.pixelSize: Theme.fontSizeSmall
                wrapMode: Text.WordWrap
              }
            }
          }
        }

        // ---------- Results: word header + scrollable meaning list ----------
        Column {
          width: (parent ? parent.width : 0)
          spacing: (Theme.spacingM * 0.833)
          visible: root.status === "ok" && root.entry !== null

          // Auto-match note. Only rendered when the user's original query
          // was misspelled and we silently fetched the closest match.
          // The text body is computed by a JS function so the ternary
          // doesn't evaluate the .word property on a null entry — that
          // pattern raises "Cannot read property 'word' of null" in QML
          // because it pre-evaluates both sides of `?:`.
          Text {
            width: (parent ? parent.width : 0)
            visible: root.isAutoMatched && root.originalQuery !== "" && root.entry !== null
            text: root.autoMatchedNote()
            textFormat: Text.PlainText
            color: Theme.surfaceVariantText
            font.family: root.contentFontFamily
            font.pixelSize: Theme.fontSizeSmall
            font.italic: true
            wrapMode: Text.WordWrap
          }

          Row {
            width: (parent ? parent.width : 0)
            spacing: (Theme.spacingM * 0.833)

            Text {
              id: wordText
              text: root.entryWord()
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Math.round(Theme.fontSizeLarge * 1.65)
              font.bold: true
              elide: Text.ElideRight
              width: (parent ? parent.width : 0) - phoneticLabel.width - sourceTag.width - (Theme.fontSizeMedium * 1.429)
              anchors.verticalCenter: parent.verticalCenter
            }

            Text {
              id: phoneticLabel
              text: root.entryPhonetic()
              textFormat: Text.PlainText
              color: Theme.surfaceVariantText
              font.family: root.contentFontFamily
              font.pixelSize: Theme.fontSizeMedium
              font.italic: true
              anchors.verticalCenter: parent.verticalCenter
              visible: text !== ""
            }

            // Small muted source tag (e.g. "Wiktionary") to make it obvious
            // which data source filled the panel.
            Text {
              id: sourceTag
              text: root.entry ? Model.sourceLabel(entry) : ""
              textFormat: Text.PlainText
              color: Theme.surfaceVariantText
              font.family: root.contentFontFamily
              font.pixelSize: Theme.fontSizeSmall
              font.italic: true
              anchors.verticalCenter: parent.verticalCenter
              visible: text !== ""
            }
          }

          Flickable {
            id: resultScroll
            width: (parent ? parent.width : 0)
            height: Math.min(
              root.panelMaxHeight - (Theme.fontSizeMedium * 22.857),
              Math.max((Theme.fontSizeMedium * 11.429), root.entry
                ? Math.min((Theme.fontSizeMedium * 38.571), meaningStack.implicitHeight + (Theme.spacingL))
                : (Theme.fontSizeMedium * 11.429))
            )
            contentWidth: width
            contentHeight: meaningStack.implicitHeight + (Theme.spacingL)
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentHeight > height

            Column {
              id: meaningStack
              width: resultScroll.width
              spacing: (Theme.spacingM * 1.167)

              Repeater {
                model: root.entry ? root.entry.meanings : []

                Column {
                  required property var modelData
                  required property int index
                  width: (parent ? parent.width : 0)
                  spacing: (Theme.spacingS * 0.75)

                  RowLayout {
                    width: (parent ? parent.width : 0)
                    spacing: (Theme.spacingS)
                    // Some offline entries never declare a part of speech
                    // (letters, prefixes) — render their definitions with
                    // no header instead of an empty gold label.
                    visible: modelData.partOfSpeech !== ""

                    Text {
                      text: modelData.partOfSpeech
                      textFormat: Text.PlainText
                      color: Theme.primary
                      font.family: root.contentFontFamily
                      font.pixelSize: Theme.fontSizeSmall
                      font.bold: true
                      font.letterSpacing: 1.4
                      font.italic: true
                      Layout.alignment: Qt.AlignVCenter
                    }

                    Rectangle {
                      Layout.fillWidth: true
                      Layout.preferredHeight: 1
                      color: Theme.surfaceVariantText
                      Layout.alignment: Qt.AlignVCenter
                    }
                  }

                  Repeater {
                    model: modelData.definitions

                    Column {
                      required property var modelData
                      required property int index
                      width: (parent ? parent.width : 0)
                      spacing: (Theme.spacingXS / 2)

                      Row {
                        width: (parent ? parent.width : 0)
                        spacing: (Theme.spacingS)

                        Text {
                          text: (index + 1) + "."
                          color: Theme.surfaceVariantText
                          font.family: root.contentFontFamily
                          font.pixelSize: Theme.fontSizeMedium
                          width: (Theme.fontSizeMedium * 1.429)
                          horizontalAlignment: Text.AlignRight
                          anchors.top: parent.top
                          anchors.topMargin: 2
                        }

                        Text {
                          width: (parent ? parent.width : 0) - (Theme.fontSizeMedium * 1.429) - (Theme.spacingS)
                          text: modelData.definition
                          textFormat: Text.PlainText
                          color: root.contentForeground
                          font.family: root.contentFontFamily
                          font.pixelSize: Theme.fontSizeMedium
                          wrapMode: Text.WordWrap
                        }
                      }

                      Text {
                        width: (parent ? parent.width : 0) - (Theme.fontSizeMedium * 1.429) - (Theme.spacingS)
                        x: (Theme.fontSizeMedium * 1.429) + (Theme.spacingS)
                        visible: modelData.example !== ""
                        text: "\"" + modelData.example + "\""
                        textFormat: Text.PlainText
                        color: Theme.surfaceVariantText
                        font.family: root.contentFontFamily
                        font.pixelSize: Theme.fontSizeSmall
                        font.italic: true
                        wrapMode: Text.WordWrap
                      }
                    }
                  }

                  Text {
                    visible: modelData.synonyms.length > 0
                    width: (parent ? parent.width : 0)
                    text: "synonyms: " + modelData.synonyms.join(", ")
                    textFormat: Text.PlainText
                    color: Theme.surfaceVariantText
                    font.family: root.contentFontFamily
                    font.pixelSize: Theme.fontSizeSmall
                    wrapMode: Text.WordWrap
                  }

                  Text {
                    visible: modelData.antonyms.length > 0
                    width: (parent ? parent.width : 0)
                    text: "antonyms: " + modelData.antonyms.join(", ")
                    textFormat: Text.PlainText
                    color: Theme.surfaceVariantText
                    font.family: root.contentFontFamily
                    font.pixelSize: Theme.fontSizeSmall
                    wrapMode: Text.WordWrap
                  }
                }
              }

              Item {
                width: (parent ? parent.width : 0)
                height: (Theme.spacingXS)
              }
            }
          }
        }

      }
}

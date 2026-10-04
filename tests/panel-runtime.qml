import QtQuick
import Quickshell
import "../" as Dictionary
import "../Model.js" as Model

ShellRoot {
    id: root
    property int checks: 0
    property int phase: -2
    property int ticks: 0
    property int recoveryGeneration: 0
    property string failure: ""

    function check(condition, message) {
        if (!condition) throw new Error(message)
        checks++
    }
    function findPartOfSpeechLabel(item, text) {
        if ("text" in item && item.text === text && item.parent &&
            item.parent.children.length === 2 && item.parent.children[1].height === 1)
            return item
        for (var i = 0; i < item.children.length; i++) {
            var found = findPartOfSpeechLabel(item.children[i], text)
            if (found) return found
        }
        return null
    }
    function findSearchField(item) {
        if (typeof item.getActiveFocus === "function") return item
        for (var i = 0; i < item.children.length; i++) {
            var found = findSearchField(item.children[i])
            if (found) return found
        }
        return null
    }
    function stealFocus() { frameworkFocus.forceActiveFocus() }
    function next() { phase++; ticks = 0 }
    function finish(error) {
        if (error) console.error("PANEL_RUNTIME_FAIL " + error)
        else console.log("PANEL_RUNTIME_PASS " + checks + " checks")
        Qt.quit()
    }

    QtObject {
        id: popup
        property bool shouldBeVisible: false
        property bool contentHandlesKeys: false
        property var screen: null
    }
    Item {
        id: host
        property var panelItem: null
        property var parentPopout: null
        property int barThickness: 48
        property bool opening: false
        function finishOpening() {}
    }
    Window {
        id: testWindow
        width: 480
        height: 900
        visible: true
        Component.onCompleted: requestActivate()
        Item {
            id: frameworkFocus
            anchors.fill: parent
            Dictionary.Panel {
                id: panel
                width: 420
                hostWidget: host
                parentPopout: popup
                closePopout: function() { popup.shouldBeVisible = false }
            }
        }
    }

    Timer {
        interval: 10
        repeat: true
        running: true
        onTriggered: {
            try {
                root.ticks++
                if (root.ticks > 300) throw new Error("timeout in phase " + root.phase + ": " + panel.status)
                switch (root.phase) {
                case -2:
                    frameworkFocus.forceActiveFocus()
                    root.check(!popup.shouldBeVisible, "popup starts closed")
                    popup.shouldBeVisible = true
                    // PluginPopout queues its container focus after child open hooks.
                    Qt.callLater(root.stealFocus)
                    root.next()
                    break
                case -1:
                    if (root.ticks < 3) break
                    var field = root.findSearchField(panel)
                    root.check(field !== null, "actual editor wrapper is reachable")
                    root.check(field.getActiveFocus(), "first click open restores editor focus after host container focus")
                    root.next()
                    break
                case 0:
                    root.check(host.panelItem === panel, "loaded panel registered with host")
                    root.check(popup.contentHandlesKeys, "popup delegates keys to editor content")
                    root.check(panel.implicitHeight > 0, "popup content reports implicit height")
                    panel.search("hello")
                    root.next()
                    break
                case 1:
                    if (panel.status === "loading") break
                    root.check(panel.status === "ok", "offline lookup succeeds")
                    root.check(panel.entry.word === "hello" && panel.entry.source === "webster1913",
                               "actual gzip collector and Webster adapter parse fixture")
                    var label = root.findPartOfSpeechLabel(panel, panel.entry.meanings[0].partOfSpeech)
                    root.check(label !== null, "part of speech header is rendered")
                    var divider = label.parent.children[1]
                    root.check(divider.x + divider.width <= label.parent.width + 1,
                               "part of speech divider fits after its label")
                    panel.search("slow")
                    root.next()
                    break
                case 2:
                    if (!panel.processBusy || !panel.activeAdapter || panel.activeAdapter.id !== "wiktionary") break
                    root.check(panel.activeQuery === "slow", "delayed fallback lookup started")
                    panel.search("world")
                    root.check(panel.query === "world" && panel.status === "loading", "new search replaces pending query")
                    root.next()
                    break
                case 3:
                    if (panel.status === "loading") break
                    root.check(panel.status === "ok" && panel.entry.word === "world", "latest search wins after cancellation")
                    root.check(!panel.processBusy && panel.pendingArgs.length === 0, "canceled process and queue drained")
                    panel.search("helllo")
                    root.next()
                    break
                case 4:
                    if (panel.status === "loading") break
                    root.check(panel.status === "ok" && panel.entry.word === "hello", "typo recovers through actual wordlist")
                    root.check(panel.isAutoMatched && panel.originalQuery === "helllo" && panel.query === "hello",
                               "automatic recovery preserves original query and flag")
                    root.check(panel.autoMatchedNote().indexOf("helllo") >= 0, "recovery note names original query")
                    panel.search("dictinary")
                    root.recoveryGeneration = panel.lookupGeneration
                    root.next()
                    break
                case 5:
                    if (panel.status === "loading") break
                    root.check(panel.status === "notfound" && panel.query === "dictionary", "second miss terminates recovery")
                    root.check(panel.lookupGeneration === root.recoveryGeneration + 1, "only one automatic recovery lookup runs")
                    root.check(!panel.isAutoMatched, "failed recovery clears match flag")
                    root.check(panel.originalQuery === "dictinary", "failed recovery preserves the typed query")
                    root.check(panel.statusMessage.indexOf("dictinary") >= 0, "failed recovery message names the typed query")
                    root.next()
                    break
                case 6:
                    if (root.ticks < 15) break
                    root.check(panel.status === "notfound" && !panel.processBusy && panel.pendingArgs.length === 0,
                               "second miss remains terminal without repeating requests")
                    panel.search("slow")
                    root.next()
                    break
                case 7:
                    if (!panel.processBusy || !panel.activeAdapter || panel.activeAdapter.id !== "wiktionary") break
                    panel.close()
                    root.check(!popup.shouldBeVisible && panel.status === "idle", "closing hides popup and cancels loading")
                    root.next()
                    break
                case 8:
                    if (root.ticks < 65) break
                    root.check(panel.status === "idle" && !panel.processBusy && panel.pendingArgs.length === 0,
                               "closed popup ignores canceled process completion")
                    popup.shouldBeVisible = true
                    panel.search("hello")
                    Qt.callLater(root.stealFocus)
                    root.next()
                    break
                case 9:
                    if (panel.status === "loading") break
                    root.check(panel.status === "ok" && panel.entry.word === "hello", "lookup works after reopening")
                    root.check(root.findSearchField(panel).getActiveFocus(), "reopen restores editor focus after queued host focus")
                    panel.search("")
                    root.check(panel.status === "idle" && panel.entry === null && panel.query === "", "empty search resets results")
                    panel.adapterQueue = [
                        {
                            id: "missing-executable",
                            argsFor: function() { return ["/nonexistent/dank-dictionary-runtime-command"] },
                            parse: function() { return { ok: false, kind: "notfound" } }
                        },
                        {
                            id: "valid-fixture",
                            argsFor: function() { return ["gzip", "-dc", panel.dataDir + "/h.json.gz"] },
                            parse: function(text, word) { return Model.parseWebsterJson(text, word) }
                        }
                    ]
                    panel.query = "hello"
                    panel.status = "loading"
                    panel.adapterIndex = 0
                    panel.runAdapter()
                    root.next()
                    break
                case 10:
                    if (panel.status === "loading") break
                    root.check(panel.status === "ok" && panel.entry.word === "hello",
                               "failed-to-start adapter advances to valid process")
                    root.check(panel.adapterIndex === 1 && !panel.processBusy,
                               "failed-to-start process releases busy state")
                    panel.search("world")
                    root.next()
                    break
                case 11:
                    if (panel.status === "loading") break
                    root.check(panel.status === "ok" && panel.entry.word === "world",
                               "regular search works after failed-to-start fallback")
                    panel.search("")
                    panel.language = "fr"
                    panel.query = "helllo"
                    panel.onAdapterChainExhausted({ kind: "notfound" })
                    root.check(panel.status === "notfound" && !panel.isAutoMatched && panel.query === "helllo",
                               "French misses do not auto-match English words")
                    root.check(panel.suggestions.length === 0, "French misses do not suggest English words")
                    panel.language = "th"
                    panel.query = "helllo"
                    panel.onAdapterChainExhausted({ kind: "notfound" })
                    root.check(panel.status === "notfound" && !panel.isAutoMatched && panel.query === "helllo",
                               "Thai misses do not auto-match English words")
                    popup.shouldBeVisible = false
                    frameworkFocus.forceActiveFocus()
                    popup.shouldBeVisible = true
                    // Close before deferred refresh: hidden content must not take focus.
                    popup.shouldBeVisible = false
                    frameworkFocus.forceActiveFocus()
                    root.next()
                    break
                case 12:
                    if (root.ticks < 3) break
                    root.check(!root.findSearchField(panel).getActiveFocus(), "closed popup ignores late deferred editor focus")
                    root.check(frameworkFocus.activeFocus, "focus stays with host after immediate close")
                    root.finish(null)
                    break
                }
            } catch (error) {
                root.finish(error)
            }
        }
    }
}

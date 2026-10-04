import QtQuick
import Quickshell.Io
import "."

// DMS instantiates this composite surface once, independent of bar count.
Item {
    id: root

    property string pluginId: "dankDictionary"
    property var pluginService: null

    function dispatch(action, word) {
        var host = DictionaryState.currentHost()
        if (!host) return "ERROR: Add Dank Dictionary to a DankBar before using IPC."
        switch (action) {
        case "open": host.openPanel(); break
        case "close": host.closePanel(); break
        case "toggle": host.togglePanel(); break
        case "search": host.search(word); break
        default: return "ERROR: Unknown dictionary action."
        }
        return "OK"
    }

    function currentStatus() {
        var host = DictionaryState.currentHost()
        var panel = host ? (host.panelItem || host) : null
        return JSON.stringify({
            hostCount: DictionaryState.hostCount,
            opened: !!(host && host.opened),
            status: panel && panel.status !== undefined ? panel.status : "idle",
            query: panel && panel.query !== undefined ? panel.query : "",
            language: panel && panel.language !== undefined ? panel.language : "en"
        })
    }

    IpcHandler {
        target: "dankDictionary"

        function open(): string { return root.dispatch("open", "") }
        function close(): string { return root.dispatch("close", "") }
        function toggle(): string { return root.dispatch("toggle", "") }
        function search(word: string): string { return root.dispatch("search", word) }
        function status(): string { return root.currentStatus() }
    }
}

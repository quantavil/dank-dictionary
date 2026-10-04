import QtQuick
import Quickshell
import "../" as Dictionary
ShellRoot {
    QtObject { id: host; property var panelItem: null }
    Window {
        width: 420
        height: 900
        visible: true
        Dictionary.Panel { id: panel; width: 420; hostWidget: host }
    }
    Timer {
        interval: 10
        running: true
        repeat: true
        property int ticks: 0
        onTriggered: {
            ticks++
            if (ticks === 1) panel.search("hello")
            if (panel.status === "ok") {
                if (host.panelItem !== panel || panel.entry.word !== "hello")
                    console.error("MANIFEST_RUNTIME_FAIL")
                else console.log("MANIFEST_RUNTIME_PASS 2 checks")
                Qt.quit()
            } else if (ticks > 200) {
                console.error("MANIFEST_RUNTIME_FAIL " + panel.status)
                Qt.quit()
            }
        }
    }
}

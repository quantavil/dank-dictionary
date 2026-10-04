import QtQuick
import Quickshell
import "../" as Dictionary

ShellRoot {
    id: root
    property int checks: 0

    function check(condition, message) {
        if (!condition) throw new Error(message)
        checks++
    }

    Component {
        id: hostFactory
        Item {
            property bool opened: false
            property int searches: 0
            property var panelItem: QtObject {
                property string status: "idle"
                property string query: ""
                property string language: "en"
            }
            function openPanel() { opened = true }
            function closePanel() { opened = false }
            function togglePanel() { opened = !opened }
            function search(word) {
                searches++
                panelItem.query = word
                panelItem.status = "ok"
                openPanel()
            }
        }
    }

    Dictionary.DictionaryDaemon { id: daemon }

    Timer {
        interval: 1
        running: true
        onTriggered: {
            var first = null
            var second = null
            try {
                var state = Dictionary.DictionaryState
                root.check(state.hostCount === 0, "registry starts empty")
                root.check(daemon.dispatch("search", "empty").indexOf("ERROR:") === 0,
                           "no host produces explicit error")
                var initial = JSON.parse(daemon.currentStatus())
                root.check(initial.hostCount === 0 && !initial.opened && initial.status === "idle",
                           "empty status is readable")

                first = hostFactory.createObject(root)
                second = hostFactory.createObject(root)
                root.check(first !== null && second !== null, "fake hosts instantiate")
                state.registerHost(first)
                state.registerHost(first)
                root.check(state.hostCount === 1, "duplicate registration ignored")
                state.registerHost(second)
                root.check(state.hostCount === 2, "two live hosts registered")
                root.check(state.currentHost() === first, "first host owns initial routing")

                root.check(daemon.dispatch("open", "") === "OK" && first.opened,
                           "open routes to first host")
                daemon.dispatch("open", "")
                root.check(first.opened && !second.opened, "repeated open stays open")
                daemon.dispatch("close", "")
                root.check(!first.opened, "close routes correctly")
                daemon.dispatch("toggle", "")
                root.check(first.opened, "toggle opens")
                daemon.dispatch("toggle", "")
                root.check(!first.opened, "toggle closes")

                state.activateHost(second)
                root.check(state.currentHost() === second, "active host changes routing")
                root.check(daemon.dispatch("search", "café") === "OK", "search accepted")
                root.check(second.searches === 1 && first.searches === 0,
                           "exactly one host receives search")
                root.check(second.panelItem.query === "café" && second.opened,
                           "Unicode query delivered and popup opened")
                second.panelItem.language = "fr"
                var current = JSON.parse(daemon.currentStatus())
                root.check(current.hostCount === 2 && current.opened && current.status === "ok"
                           && current.query === "café" && current.language === "fr",
                           "status reflects active panel")
                state.activateHost(null)
                root.check(state.currentHost() === second, "unknown activation ignored")

                state.unregisterHost(second)
                root.check(state.hostCount === 1 && state.currentHost() === first,
                           "owner removal hands routing to survivor")
                daemon.dispatch("search", "survivor")
                root.check(first.searches === 1 && first.panelItem.query === "survivor",
                           "surviving host receives subsequent search")
                state.unregisterHost(second)
                root.check(state.hostCount === 1, "duplicate removal harmless")
                state.unregisterHost(first)
                root.check(state.hostCount === 0 && state.currentHost() === null
                           && state.activeHost === null, "last removal clears references")
                root.check(daemon.dispatch("open", "").indexOf("ERROR:") === 0,
                           "IPC after teardown reports missing host")
                root.check(JSON.parse(daemon.currentStatus()).hostCount === 0,
                           "status remains available after teardown")
                console.log("STATE_RUNTIME_PASS " + root.checks + " checks")
            } catch (error) {
                console.error("STATE_RUNTIME_FAIL " + error)
            } finally {
                if (first) {
                    Dictionary.DictionaryState.unregisterHost(first)
                    first.destroy()
                }
                if (second) {
                    Dictionary.DictionaryState.unregisterHost(second)
                    second.destroy()
                }
                Qt.quit()
            }
        }
    }
}

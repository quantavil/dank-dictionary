pragma Singleton
import QtQuick

// The daemon owns IPC once; bar instances register here for popup routing.
Item {
    id: root

    property var hosts: []
    property var activeHost: null
    readonly property int hostCount: hosts.length

    function registerHost(host) {
        if (!host || hosts.indexOf(host) !== -1) return
        var next = hosts.slice()
        next.push(host)
        hosts = next
        if (!activeHost) activeHost = host
    }

    function unregisterHost(host) {
        var next = []
        for (var i = 0; i < hosts.length; i++) {
            if (hosts[i] !== host) next.push(hosts[i])
        }
        hosts = next
        if (activeHost === host) activeHost = next.length ? next[0] : null
    }

    function activateHost(host) {
        if (hosts.indexOf(host) !== -1) activeHost = host
    }

    function currentHost() {
        if (activeHost && hosts.indexOf(activeHost) !== -1) return activeHost
        return hosts.length ? hosts[0] : null
    }
}

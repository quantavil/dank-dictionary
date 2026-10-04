pragma ComponentBehavior: Bound
import QtQuick
import qs.Common
import qs.Widgets
import qs.Modules.Plugins
import "."

PluginComponent {
  id: root
  property var panelItem: null
  property var parentPopout: null
  property bool opening: false
  property bool pendingSearch: false
  property string pendingQuery: ""
  readonly property bool opened: parentPopout ? parentPopout.shouldBeVisible : opening

  function openPanel() {
    DictionaryState.activateHost(root)
    if (parentPopout) {
      parentPopout.open()
      if (panelItem) panelItem.refreshFocus()
    } else if (!opening) {
      opening = true
      root.triggerPopout()
    }
  }

  function closePanel() {
    opening = false
    pendingSearch = false
    root.closePopout()
  }

  function togglePanel() {
    if (opened) closePanel()
    else openPanel()
  }

  function search(word) {
    pendingQuery = String(word || "")
    pendingSearch = true
    openPanel()
    deliverSearch()
  }

  function deliverSearch() {
    if (panelItem && pendingSearch) {
      pendingSearch = false
      panelItem.search(pendingQuery)
    }
  }

  function finishOpening() {
    if (opening && parentPopout) {
      parentPopout.open()
      opening = false
    }
    deliverSearch()
  }

  onPanelItemChanged: {
    if (panelItem && panelItem.parentPopout) {
      parentPopout = panelItem.parentPopout
      Qt.callLater(finishOpening)
    }
  }

  Component.onDestruction: DictionaryState.unregisterHost(root)

  horizontalBarPill: Component {
    DankIcon {
      name: "dictionary"
      size: root.iconSize
      color: Theme.surfaceText
      Accessible.ignored: true
    }
  }
  verticalBarPill: horizontalBarPill
  popoutWidth: Math.min(Theme.fontSizeMedium * 32, parentScreen ? parentScreen.width - Theme.spacingXL * 2 : 448)
  popoutHeight: 0
  popoutContent: Component {
    Panel { hostWidget: root }
  }

  Component.onCompleted: DictionaryState.registerHost(root)
}

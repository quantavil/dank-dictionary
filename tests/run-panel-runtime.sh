#!/usr/bin/env bash
set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
test_root=$(mktemp -d)
test_log="$test_root/runtime.log"
trap 'rm -rf -- "$test_root"' EXIT

# Run actual panel/model/process code; replace only the DMS visual boundaries.
mkdir -p "$test_root/tests" "$test_root/Common" "$test_root/Widgets" \
    "$test_root/data/webster" "$test_root/bin"
cp "$test_dir/../Panel.qml" "$test_dir/../Model.js" \
    "$test_dir/../wordlist.js" "$test_dir/../DictionaryState.qml" "$test_root/"
rg '^singleton DictionaryState |^Panel ' "$test_dir/../qmldir" > "$test_root/qmldir"
cp "$test_dir/panel-runtime.qml" "$test_root/tests/PanelRuntime.qml"
cat > "$test_root/shell.qml" <<'QML'
import "tests"
PanelRuntime {}
QML
cat > "$test_root/Common/qmldir" <<'QML'
singleton Theme 1.0 Theme.qml
QML
cat > "$test_root/Common/Theme.qml" <<'QML'
pragma Singleton
import QtQuick
QtObject {
    readonly property color surfaceText: "#eeeeee"
    readonly property color surfaceVariantText: "#aaaaaa"
    readonly property color primary: "#88aaff"
    readonly property color outlineVariant: "#666666"
    readonly property string fontFamily: "Sans Serif"
    readonly property int fontSizeSmall: 12
    readonly property int fontSizeMedium: 14
    readonly property int fontSizeLarge: 16
    readonly property int spacingXS: 4
    readonly property int spacingS: 8
    readonly property int spacingM: 12
    readonly property int spacingL: 16
}
QML
cat > "$test_root/Widgets/qmldir" <<'QML'
DankTextField 1.0 DankTextField.qml
DankButton 1.0 DankButton.qml
DankDropdown 1.0 DankDropdown.qml
DankIcon 1.0 DankIcon.qml
QML
cat > "$test_root/Widgets/DankTextField.qml" <<'QML'
import QtQuick
Item {
    id: root
    property alias text: editor.text
    property string placeholderText: ""
    property string leftIconName: ""
    property bool showClearButton: false
    signal textEdited
    signal accepted
    function forceActiveFocus() { editor.forceActiveFocus() }
    function selectAll() { editor.selectAll() }
    function getActiveFocus() { return editor.activeFocus }
    implicitWidth: 200
    implicitHeight: 42
    TextInput {
        id: editor
        anchors.fill: parent
        onTextChanged: root.textEdited()
        onAccepted: root.accepted()
    }
}
QML
cat > "$test_root/Widgets/DankButton.qml" <<'QML'
import QtQuick
Item {
    property string text: ""
    property color textColor: "white"
    property int buttonHeight: 40
    signal clicked
    implicitWidth: Math.max(64, text.length * 8 + 24)
    implicitHeight: buttonHeight
}
QML
cat > "$test_root/Widgets/DankDropdown.qml" <<'QML'
import QtQuick
Item {
    property var options: []
    property string currentValue: ""
    property bool compactMode: true
    property int dropdownWidth: 140
    signal valueChanged(string value)
    implicitWidth: dropdownWidth
    implicitHeight: 40
}
QML
cat > "$test_root/Widgets/DankIcon.qml" <<'QML'
import QtQuick
Item {
    property string name: ""
    property int size: 24
    property color color: "white"
    implicitWidth: size
    implicitHeight: size
}
QML
# No network access: curl returns a controlled miss, delayed for cancellation tests.
cat > "$test_root/bin/curl" <<'BASH_CURL'
#!/usr/bin/env bash
for arg in "$@"; do
    case "$arg" in
        *titles=slow*) sleep 0.5 ;;
    esac
done
printf '%s\n' '{"query":{"pages":{"-1":{"title":"fixture miss","missing":""}}}}'
BASH_CURL
chmod +x "$test_root/bin/curl"
python3 - "$test_root/data/webster" <<'PY'
import gzip
import json
import pathlib
import sys
root = pathlib.Path(sys.argv[1])
for bucket in "abcdefghijklmnopqrstuvwxyz":
    payload = {}
    if bucket == "h":
        payload["hello"] = {"w": "hello", "pr": "", "pos": [["interj.", ["A greeting."]]]}
    elif bucket == "w":
        payload["world"] = {"w": "world", "pr": "", "pos": [["n.", ["The earth."]]]}
    with gzip.open(root / (bucket + ".json.gz"), "wt", encoding="utf-8") as output:
        json.dump(payload, output)
PY

if ! timeout 20s env QT_QPA_PLATFORM=offscreen PATH="$test_root/bin:$PATH" \
    quickshell --no-color -p "$test_root/shell.qml" >"$test_log" 2>&1; then
    cat "$test_log"
    exit 1
fi
if ! rg -q 'PANEL_RUNTIME_PASS [0-9]+ checks' "$test_log" \
    || rg -q 'PANEL_RUNTIME_FAIL|ReferenceError|TypeError|Binding loop|Cannot assign|Unable to assign|Cannot read property' "$test_log"; then
    cat "$test_log"
    exit 1
fi
rg 'PANEL_RUNTIME_PASS' "$test_log"

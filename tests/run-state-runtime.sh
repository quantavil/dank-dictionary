#!/usr/bin/env bash
set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
test_root=$(mktemp -d)
test_log="$test_root/runtime.log"
trap 'rm -rf -- "$test_root"' EXIT

# Quickshell excludes QML files above its config root. Stage the actual
# registry/daemon with a root entry point, keeping the ../ import in the test.
mkdir "$test_root/tests"
cp "$test_dir/../DictionaryState.qml" "$test_dir/../DictionaryDaemon.qml" \
    "$test_root/"
rg '^singleton DictionaryState |^DictionaryDaemon ' "$test_dir/../qmldir" \
    > "$test_root/qmldir"
cp "$test_dir/state-runtime.qml" "$test_root/tests/StateRuntime.qml"
cat > "$test_root/shell.qml" <<'QML'
import "tests"
StateRuntime {}
QML

if ! timeout 20s env QT_QPA_PLATFORM=offscreen quickshell --no-color \
    -p "$test_root/shell.qml" >"$test_log" 2>&1; then
    cat "$test_log"
    exit 1
fi

if ! rg -q 'STATE_RUNTIME_PASS [0-9]+ checks' "$test_log" \
    || rg -q 'STATE_RUNTIME_FAIL' "$test_log"; then
    cat "$test_log"
    exit 1
fi

rg 'STATE_RUNTIME_PASS' "$test_log"

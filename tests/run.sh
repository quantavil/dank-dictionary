#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node lint.test.js
node model.test.js
bash run-state-runtime.sh
bash run-panel-runtime.sh
python3 build-webster.test.py

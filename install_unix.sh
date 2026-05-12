#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
PY=""
for p in python3 python; do if command -v "$p" >/dev/null 2>&1; then PY="$p"; break; fi; done
if [ -z "$PY" ]; then
  echo "[ERROR] Python is required. Install python3, then run this again."
  echo "macOS: install Python from python.org or Homebrew. Linux: install python3/python3-pip using your package manager."
  exit 1
fi
exec "$PY" ./install_universal.py --repair "$@"

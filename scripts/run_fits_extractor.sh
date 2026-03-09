#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_BIN="$SCRIPT_DIR/../.venv-tools/bin/python"
EXTRACTOR="$SCRIPT_DIR/extract_jwst_fits_spectrum.py"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo '{"ok": false, "error": "python-runtime-missing"}'
  exit 0
fi

if [[ ! -f "$EXTRACTOR" ]]; then
  echo '{"ok": false, "error": "extractor-missing"}'
  exit 0
fi

exec "$PYTHON_BIN" "$EXTRACTOR" "$@"

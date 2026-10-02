#!/bin/sh
# Publication checks fail if the scanner is absent or fails.
set -eu
cd "$(dirname "$0")/.."
GITLEAKS_BIN=${GITLEAKS_BIN:-gitleaks}
REPORT_DIR=${REPORT_DIR:-.security-reports}
mkdir -p "$REPORT_DIR"
command -v "$GITLEAKS_BIN" >/dev/null
# Copy the publication candidates, not ignored dependency/build/report folders.
# Includes tracked files even when .gitignore would now hide them.
SCAN_DIR=$(mktemp -d)
trap 'rm -rf "$SCAN_DIR"' EXIT HUP INT TERM
export SCAN_DIR
python3 - <<'COPY'
import os, pathlib, shutil, subprocess
root = pathlib.Path.cwd()
target = pathlib.Path(os.environ['SCAN_DIR'])
names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']).split(b'\0')
for raw in set(names):
    if not raw: continue
    name = os.fsdecode(raw)
    source = root / name
    if source.is_symlink(): raise SystemExit('Review symlinks before publication: ' + name)
    if not source.is_file(): continue  # deleted tracked file; history is scanned separately
    destination = target / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
COPY
"$GITLEAKS_BIN" dir "$SCAN_DIR" --redact=100 --report-format json --report-path "$REPORT_DIR/secrets-current.json"
"$GITLEAKS_BIN" git . --log-opts="--all" --redact=100 --report-format json --report-path "$REPORT_DIR/secrets-history.json"
# Check the Git index as well: .gitignore does not remove tracked private files.
if git ls-files | grep -E '(^|/)(bugreport[^/]*|\.env(\.[^/]*)?|\.DS_Store|node_modules|dist|DerivedData|xcuserdata)(/|$)|\.(p12|mobileprovision|ips|crash)$' | grep -vE '(^|/)\.env\.example$'; then
  echo 'Private or generated files are tracked. Review before publication.' >&2
  exit 1
fi
npm test
git diff --check

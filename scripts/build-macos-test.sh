#!/bin/sh
# Run from macOS with Xcode; no Apple account or certificate is used.
set -eu
cd "$(dirname "$0")/.."
npm test
npm run build:safari
python3 - <<'SYNC'
from pathlib import Path
import shutil
source = Path('dist/S')
target = Path('native/Pakku Safari Preview/Pakku Safari Preview Extension/Resources')
if not (source / 'manifest.json').is_file(): raise SystemExit('Build Safari resources first')
if target.exists(): shutil.rmtree(target)
shutil.copytree(source, target)
SYNC
xcodebuild -project "native/Pakku Safari Preview/Pakku Safari Preview.xcodeproj" \
  -scheme "Pakku Safari Preview" -configuration Release \
  -derivedDataPath .security-tools/native-build \
  ARCHS="arm64 x86_64" ONLY_ACTIVE_ARCH=NO MACOSX_DEPLOYMENT_TARGET=12.0 \
  CODE_SIGNING_ALLOWED=NO build
APP=".security-tools/native-build/Build/Products/Release/Pakku Safari Preview.app"
EXT="$APP/Contents/PlugIns/Pakku Safari Preview Extension.appex"
codesign --force --sign - --options runtime --entitlements native/extension.entitlements "$EXT"
codesign --force --sign - --options runtime --entitlements native/app.entitlements "$APP"
codesign --verify --deep --strict "$APP"
mkdir -p release
ditto -c -k --keepParent --norsrc "$APP" release/Pakku-Safari-Preview-macOS-universal.zip
shasum -a 256 release/Pakku-Safari-Preview-macOS-universal.zip > release/SHA256SUMS.txt

#!/bin/sh
# Builds the zip to upload to the Chrome Web Store.
cd "$(dirname "$0")"
version=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
mkdir -p dist
rm -f "dist/skip-the-critics-$version.zip"
zip -r "dist/skip-the-critics-$version.zip" manifest.json background.js content.js content.css icons -x '.*'
echo "Built dist/skip-the-critics-$version.zip"

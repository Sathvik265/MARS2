#!/bin/bash
set -e

OUTPUT_DIR="apps-only-package"
OUTPUT_ZIP="rbs-apps-only.zip"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_DIR="$ROOT/backend"
FS_DIR="$ROOT/deploy/frontend-server"

echo "== 1/5: Installing backend production dependencies =="
cd "$BACKEND_DIR"
npm install --omit=dev
if [ ! -f "node_modules/.bin/pkg" ]; then
  npm install --save-dev @yao-pkg/pkg
fi
echo "== 2/5: Compiling backend to rbs-backend.exe =="
npx pkg . --targets node22-win-x64 --output dist/rbs-backend.exe

echo "== 3/5: Building frontend production bundle =="
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then npm install; fi
npm run build

echo "== 4/5: Compiling frontend server to rbs-frontend.exe =="
rm -rf "$FS_DIR/build"
cp -R "$FRONTEND_DIR/build" "$FS_DIR/"
cd "$FS_DIR"
if [ ! -d "node_modules" ]; then npm install; fi
npx pkg . --targets node22-win-x64 --public --no-bytecode --output dist/rbs-frontend.exe

echo "== 5/5: Assembling apps-only package =="
cd "$ROOT"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/backend"
mkdir -p "$OUTPUT_DIR/frontend"

# Backend
cp "$BACKEND_DIR/dist/rbs-backend.exe" "$OUTPUT_DIR/backend/"
cp "$BACKEND_DIR/.env" "$OUTPUT_DIR/backend/.env"
sed -i '' 's/DB_USER=.*/DB_USER=postgres/g' "$OUTPUT_DIR/backend/.env"

# Frontend
cp "$FS_DIR/dist/rbs-frontend.exe" "$OUTPUT_DIR/frontend/"
if [ -f "$FRONTEND_DIR/.env.example" ]; then
  cp "$FRONTEND_DIR/.env.example" "$OUTPUT_DIR/frontend/.env"
elif [ -f "$FRONTEND_DIR/.env" ]; then
  cp "$FRONTEND_DIR/.env" "$OUTPUT_DIR/frontend/.env"
fi

# Run scripts
cp "deploy/run-apps-only.ps1" "$OUTPUT_DIR/"
cp "deploy/RunAppsOnly.bat" "$OUTPUT_DIR/"

rm -f "$OUTPUT_ZIP"
cd "$OUTPUT_DIR"
zip -r "../$OUTPUT_ZIP" .

echo "Done. Apps-only package folder: $OUTPUT_DIR"
echo "Zipped package: $OUTPUT_ZIP"

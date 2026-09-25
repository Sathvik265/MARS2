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

echo "== 5/5: Assembling deploy package =="
cd "$ROOT"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/backend"
mkdir -p "$OUTPUT_DIR/frontend"

# Backend — exe + .env + DB dump
cp "$BACKEND_DIR/dist/rbs-backend.exe" "$OUTPUT_DIR/backend/"
if [ -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env" "$OUTPUT_DIR/backend/.env"
else
  cp "$BACKEND_DIR/.env.example" "$OUTPUT_DIR/backend/.env"
fi
sed -i '' 's/DB_USER=.*/DB_USER=postgres/g' "$OUTPUT_DIR/backend/.env"

# Include the DB dump (Final_Dump_Fixed.sql)
if [ -f "$ROOT/Final_Dump_Fixed.sql" ]; then
  cp "$ROOT/Final_Dump_Fixed.sql" "$OUTPUT_DIR/backend/"
elif [ -f "$BACKEND_DIR/Final_Dump_Fixed.sql" ]; then
  cp "$BACKEND_DIR/Final_Dump_Fixed.sql" "$OUTPUT_DIR/backend/"
fi

# Frontend — exe + React production build folder
cp "$FS_DIR/dist/rbs-frontend.exe" "$OUTPUT_DIR/frontend/"

# Copy the React build folder so server.js can serve it from disk
# This MUST be at dist-package/frontend/build/
if [ -d "$FRONTEND_DIR/build" ]; then
  cp -R "$FRONTEND_DIR/build" "$OUTPUT_DIR/frontend/build"
fi

# Deploy / run scripts (matches rbs-deploy-package.zip structure)
[ -f "deploy/run-apps-only.ps1" ]        && cp "deploy/run-apps-only.ps1"        "$OUTPUT_DIR/"
[ -f "deploy/RunAppsOnly.bat" ]          && cp "deploy/RunAppsOnly.bat"          "$OUTPUT_DIR/"
[ -f "deploy/run-local.ps1" ]            && cp "deploy/run-local.ps1"            "$OUTPUT_DIR/"
[ -f "deploy/RunApp.bat" ]               && cp "deploy/RunApp.bat"               "$OUTPUT_DIR/"
[ -f "deploy/RunAppsSetup.bat" ]         && cp "deploy/RunAppsSetup.bat"         "$OUTPUT_DIR/" || \
  [ -f "$ROOT/RunAppsSetup.bat" ]        && cp "$ROOT/RunAppsSetup.bat"          "$OUTPUT_DIR/"
[ -f "deploy/install-services.ps1" ]     && cp "deploy/install-services.ps1"     "$OUTPUT_DIR/"
[ -f "deploy/DEPLOY_PACKAGE_README.md" ] && cp "deploy/DEPLOY_PACKAGE_README.md" "$OUTPUT_DIR/README.md"

rm -f "$OUTPUT_ZIP"
cd "$OUTPUT_DIR"
zip -r "../$OUTPUT_ZIP" .

echo ""
echo "Done. Package folder: $OUTPUT_DIR"
echo "Zipped package: $OUTPUT_ZIP"
echo ""
echo "Package structure:"
echo "  frontend/"
echo "    rbs-frontend.exe  <- Express server exe"
echo "    build/            <- React build (served from disk)"
echo "  backend/"
echo "    rbs-backend.exe   <- API server exe"
echo "    .env              <- Configuration"

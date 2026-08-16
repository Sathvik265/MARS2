#!/bin/bash
set -e

# Default output zip path
OUTPUT_ZIP="rbs-deploy.zip"
if [ ! -z "$1" ]; then
  OUTPUT_ZIP="$1"
fi

# Helper to get absolute path of output zip
get_abs_path() {
  if [[ "$1" = /* ]]; then
    echo "$1"
  else
    echo "$(pwd)/$1"
  fi
}

OUTPUT_ZIP_ABS=$(get_abs_path "$OUTPUT_ZIP")

# Find repo root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

echo "Script Directory: $SCRIPT_DIR"
echo "Repository Root:  $REPO_ROOT"
echo "Target ZIP Path:  $OUTPUT_ZIP_ABS"

FRONTEND_PATH="$REPO_ROOT/restaurant-billing-app/frontend"
BACKEND_PATH="$REPO_ROOT/restaurant-billing-app/backend"
TEMP_DEPLOY="$SCRIPT_DIR/deploy_temp"
WWWROOT="$TEMP_DEPLOY/wwwroot"
BACKEND_DEST="$TEMP_DEPLOY/backend"
TOOLS_DEST="$TEMP_DEPLOY/tools"

# Clean up any existing temp deployment folder
if [ -d "$TEMP_DEPLOY" ]; then
  rm -rf "$TEMP_DEPLOY"
fi
mkdir -p "$WWWROOT"
mkdir -p "$BACKEND_DEST"
mkdir -p "$TOOLS_DEST"

# Build frontend
echo "Building frontend..."
cd "$FRONTEND_PATH"
if [ -d "node_modules" ] && npm run build; then
  echo "Frontend built successfully using existing node_modules."
else
  echo "Installing dependencies..."
  if [ -f "package-lock.json" ]; then
    npm ci || npm install
  else
    npm install
  fi
  npm run build
fi

echo "Copying frontend build to package..."
cp -R "$FRONTEND_PATH/build/"* "$WWWROOT/"

echo "Copying backend files (excluding node_modules) to package..."
cp -R "$BACKEND_PATH/src" "$BACKEND_DEST/"
cp "$BACKEND_PATH/package.json" "$BACKEND_DEST/"
if [ -f "$BACKEND_PATH/package-lock.json" ]; then
  cp "$BACKEND_PATH/package-lock.json" "$BACKEND_DEST/"
fi

# Copy helper scripts
INSTALL_NSSM="$SCRIPT_DIR/install-nssm.ps1"
if [ -f "$INSTALL_NSSM" ]; then
  echo "Including install helper: install-nssm.ps1"
  cp "$INSTALL_NSSM" "$TOOLS_DEST/"
fi

echo "Adding web.config for frontend (SPA rewrite + API proxy)..."
cat << 'EOF' > "$WWWROOT/web.config"
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxyToNode" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:8000/api/{R:1}" />
        </rule>
        <rule name="SPA fallback" stopProcessing="true">
          <match url=".*" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
            <add input="{REQUEST_URI}" pattern="^/api" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
EOF

echo "Creating ZIP package: $OUTPUT_ZIP_ABS"
if [ -f "$OUTPUT_ZIP_ABS" ]; then
  rm -f "$OUTPUT_ZIP_ABS"
fi

# We want the contents of deploy_temp to be at the root of the ZIP file
cd "$TEMP_DEPLOY"
zip -r "$OUTPUT_ZIP_ABS" .

echo "Cleaning temporary files..."
rm -rf "$TEMP_DEPLOY"

echo "Package created successfully: $OUTPUT_ZIP_ABS"

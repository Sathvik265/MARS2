# Deploy restaurant-billing-app to IIS (Windows)

This document describes a clear, repeatable process to package and deploy the project to IIS on Windows. It covers:
- Building the frontend
- Preparing a deploy folder
- Serving the frontend via IIS (static site + SPA rewrite)
- Running the Node backend as a Windows service and proxying `/api` requests via IIS (ARR)
- Packaging and post-deploy checklist

## Prerequisites

- IIS with URL Rewrite and Application Request Routing (ARR) modules installed.
- Node.js installed on the server.
- A mechanism to run Node as a Windows service (recommended: NSSM or pm2-windows-service).
- Access to the server file system and ability to set environment variables (or NSSM service environment).
- TLS certificate for the site (recommended).

## 1. Build the frontend

On your build machine (or server):

```powershell
cd restaurant-billing-app/frontend
npm install
npm run build
```

The production output is `restaurant-billing-app/frontend/build`.

## 2. Prepare the deploy folder

Create a folder `deploy/` with the following structure (example):

```
deploy/
  frontend/    <-- copy contents of build/ here (index.html, static/, icons/, manifest.json, service-worker.js)
  backend/     <-- copy backend runtime files here (src/, package.json)
  backend/.env <-- production environment file (NOT in git)
  scripts/     <-- optional helper scripts (install-service.ps1, deploy.ps1)
```

Do NOT include secrets in the repo. Use `.env` on the server and ensure `.gitignore` contains `.env`.

## 3. Configure IIS to serve the frontend (static SPA)

Create an IIS Site pointing to `deploy/frontend`. Ensure "Static Content" is enabled in IIS features.

Place this `web.config` into the `deploy/frontend` folder to enable SPA fallback while excluding `/api` URLs:

```xml
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="Static files and API" stopProcessing="true">
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
```

This ensures deep links return `index.html` while leaving `/api/*` requests untouched for proxying.

## 4. Run the backend as a Windows service (recommended)

Option A — NSSM (simple and reliable):

1. Download `nssm.exe` and place it on the server (or add to PATH).
2. Install the service:

```powershell
# Example values — adjust paths as needed
nssm install RBSBackend "C:\Program Files\nodejs\node.exe" "C:\inetpub\wwwroot\rbs\backend\src\app.js"
nssm set RBSBackend AppDirectory "C:\inetpub\wwwroot\rbs\backend"
nssm set RBSBackend Start SERVICE_AUTO_START
nssm start RBSBackend
```

Tip: a helper script `install-nssm.ps1` is included in the repository under `restaurant-billing-app/deploy/install-nssm.ps1`. It wraps the `nssm` commands above and accepts convenient parameters:

```powershell
.\restaurant-billing-app\deploy\install-nssm.ps1 \
  -AppPath 'C:\inetpub\wwwroot\rbs\backend\src\app.js' \
  -AppDirectory 'C:\inetpub\wwwroot\rbs\backend' \
  -StartService
```

Notes about NSSM and the helper:
- The script does not bundle `nssm.exe`; download NSSM from https://nssm.cc/ and place `nssm.exe` on the server PATH or pass `-NssmPath 'C:\tools\nssm\nssm.exe'` to the helper.
- Run the helper PowerShell elevated (Administrator) when installing services.
- The app reads its configuration from a `.env` file in the AppDirectory. Ensure the `.env` file is present on the server with the correct database credentials before starting the service.

Option B — pm2-windows-service or other process manager: install and configure per tool docs.

Verify the service is listening on the configured port (e.g., `8000`):

```powershell
netstat -ano | findstr 8000
```

## 5. Proxy `/api/*` requests from IIS to Node (ARR)

Enable the ARR proxy in IIS Manager (Server > Application Request Routing Cache > Server Proxy Settings > Enable proxy).

Add a rewrite rule (global or site-level) to forward `/api/*` to the backend service at `http://127.0.0.1:8000`.
Example rule to add to `web.config` inside the frontend folder (above the SPA rule or as separate rule):

```xml
<rule name="ReverseProxyToNode" stopProcessing="true">
  <match url="^api/(.*)" />
  <action type="Rewrite" url="http://127.0.0.1:8000/api/{R:1}" />
</rule>
```

Notes:
- If you proxy to localhost, keep the backend `CORS` configuration minimal (or restrict to your site origin). The backend already uses CORS for localhost — update it for production domain.

## 6. Service worker and manifest considerations

- Ensure `manifest.json` and the icons (PNG 192x192 and 512x512) are present in the `frontend` folder. Browsers prefer PNGs for install icons.
- The `service-worker.js` file should be at the site root (`/service-worker.js`) so its scope covers the app. The CRA-based setup usually puts it in `build/`.
- Test install flow using Chrome/Edge: open DevTools > Application > Manifest and Service Worker panels to confirm registration and scope.

## 7. Packaging for deploy (zip)

Create a deployment package using the provided script:

```powershell
cd restaurant-billing-app\deploy
.\publish-to-zip.ps1 -OutputZip ..\rbs-deploy.zip
```

Or manually package:

```powershell
cd deploy
Compress-Archive -Path * -DestinationPath ..\rbs-deploy.zip -Force
# Copy rbs-deploy.zip to server and extract to IIS site folder
```

## 8. Post-deploy checklist

- Verify frontend loads: `https://yourhost/` → shows React app.
- Verify backend health: `https://yourhost/api/health` → 200 OK.
- Confirm `/api` calls are proxied and working from the browser.
- Confirm Service worker registered and `manifest.json` icons show correctly in DevTools.
- Install TLS certificate and force HTTPS.
- Verify DB connectivity and permissions; ensure `pg_hba.conf` allows local connections if Postgres on same host.

## 9. Troubleshooting

- 404 on deep links: ensure the `web.config` SPA rewrite is present and URL Rewrite module is installed.
- CORS errors: update backend CORS origins in `src/app.js`.
- Service not starting: check Windows Event Viewer and NSSM stdout/stderr settings.
- DB auth failure: confirm values in `backend/.env` and that Postgres user and database exist.

## 10. Quick reference: minimal `web.config` for frontend

File: `deploy/frontend/web.config`

```xml
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
```

---

If you want, I can:
- Add the `deploy/` scaffold and the `web.config` files into the repo under `restaurant-billing-app/deploy/`.
- Generate a small PowerShell script `deploy/publish-to-zip.ps1` that builds, copies files and creates a zip package.

Which of these would you like me to add?

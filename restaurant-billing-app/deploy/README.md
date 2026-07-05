Deployment helper files for IIS

- `publish-to-zip.ps1` - builds frontend, assembles a deploy package and creates a ZIP.

Usage (from repo root):

```powershell
.\restaurant-billing-app\deploy\publish-to-zip.ps1 -OutputZip ..\rbs-deploy.zip
```

Take the created ZIP to your IIS server and extract into the IIS site folder.

Included helper scripts:

- `install-nssm.ps1` — helper to install the Node backend as a Windows service using NSSM. The publish script will include this helper in the package (tools\install-nssm.ps1) when present alongside `publish-to-zip.ps1`.

Quick `install-nssm.ps1` example (run elevated on the server):

```powershell
.\tools\install-nssm.ps1 -AppPath 'C:\inetpub\wwwroot\anandbhavan\backend\src\app.js' \
  -AppDirectory 'C:\inetpub\wwwroot\anandbhavan\backend' \
  -NssmPath '<pathToNssm.exe>' \
  -StartService
```

The app will read its database configuration from the `.env` file in the AppDirectory. Ensure the `.env` file is present on the server with the correct database credentials before starting the service.

Note: `nssm.exe` is not bundled; download it from https://nssm.cc/ and place it on the server PATH or provide `-NssmPath` to the helper.

Important: the frontend deployment uses IIS rewrite rules, so the IIS URL Rewrite module is required. Download and install it from https://www.iis.net/downloads/microsoft/url-rewrite before deploying the site.

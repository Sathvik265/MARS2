# RBS — "Ship a compiled package, not source" kit

Drop these files into your `restaurant-billing-app/` repo, then run one
script on your own dev machine (which has internet) to produce a package
you can hand to someone else — containing only two `.exe` files and config,
no readable source.

## 1. Files to add/replace in your repo

```
restaurant-billing-app/
  backend/
    package.json              <- replace with backend-package.json.patched (renamed)
  deploy/
    build-package.ps1          <- new
    install-services.ps1       <- new (replaces the old install-nssm.ps1 approach)
    DEPLOY_PACKAGE_README.md   <- new
    frontend-server/
      package.json             <- new
      server.js                <- new
```

Only `backend/package.json` changes — I added:
- `"bin": "src/app.js"`
- a `"pkg"` config block (`node22-win-x64` target — node18 binaries are
  EOL and no longer published, so this targets the current LTS instead)
- a `"build:exe"` script

Nothing else in your backend source changed. Diff to sanity-check:

```json
"bin": "src/app.js",
"pkg": {
  "targets": ["node22-win-x64"],
  "outputPath": "dist"
},
"scripts": {
  "build:exe": "pkg . --output dist/rbs-backend.exe",
  ...
}
```

## 2. Build the package (on your machine, needs internet + Node.js)

```powershell
cd restaurant-billing-app
.\deploy\build-package.ps1
```

This will:
1. Install backend prod deps and `@yao-pkg/pkg`
2. Compile `backend/src/app.js` → `backend/dist/rbs-backend.exe`
3. Build the React production bundle (`npm run build`)
4. Compile a tiny static file server (embeds the bundle) → `frontend-server/dist/rbs-frontend.exe`
5. Assemble everything into `dist-package/` and zip it as `rbs-deploy-package.zip`

Takes a few minutes the first time (pkg downloads a Node.js binary to embed —
about 90MB — that's normal).

## 3. Hand off `rbs-deploy-package.zip`

That's the artifact you give to the other system. It contains:
```
backend/rbs-backend.exe
backend/.env               (template — must be edited with real DB creds)
backend/Final_Dump_Fixed.sql
frontend/rbs-frontend.exe
install-services.ps1
README.md                   (setup steps for whoever runs it — see DEPLOY_PACKAGE_README.md)
```

Follow-up steps for the target machine are in `DEPLOY_PACKAGE_README.md`
(also copied into the package as `README.md`). Short version: install
Postgres, load the SQL dump, edit `.env`, download NSSM, run
`install-services.ps1`. Both exes then run as always-on Windows services
(auto-start on boot) — the backend on port 8000, the frontend on port 3000.
Open `http://localhost:3000` on that machine to use the app.

## Why this approach, and its limits

- **Backend**: `pkg` bundles the Node runtime + your JS into one binary. It's
  not decompiled to plain source by opening it in a text editor, which
  satisfies "the code isn't visible." It's not the same as true encryption —
  someone determined and technical could still extract the bundled JS with
  effort — but it stops casual/accidental exposure and matches what most
  small-business deployments mean by "don't hand over my source."
- **Frontend**: no packaging trick hides a web frontend's JS from the
  browser it runs in — that's inherent to how browsers work, not a gap in
  this setup. `rbs-frontend.exe` just means you're not handing over the
  `frontend/src` folder, `node_modules`, or build tooling — only the final
  built assets, same as any production web deploy.
- **Always running**: NSSM registers both exes as real Windows services
  with automatic startup, so they survive reboots and don't need anyone
  logged in — this is the same mechanism your existing `deploy/DEPLOY_TO_IIS.md`
  used for the backend, just applied to both processes and without requiring
  IIS/ARR/URL-Rewrite on the target machine.

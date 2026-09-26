# Build Instructions & Package Commands

This guide provides the exact steps and commands to compile and package the **Restaurant Billing App** with the latest frontend code, production build assets, and backend binary.

---

## Method 1: Automated 1-Command Build (Recommended)

This script automatically executes all steps: installing dependencies, building the React production bundle, compiling Node.js binaries (`rbs-backend.exe` and `rbs-frontend.exe`), and packaging everything into `rbs-apps-only.zip`.

### **On macOS / Linux Terminal:**
```bash
cd restaurant-billing-app
bash deploy/build-apps-only.sh
```

### **On Windows (PowerShell):**
```powershell
cd restaurant-billing-app
.\deploy\build-package.ps1
```

---

## Method 2: Manual Step-by-Step Commands

If you need to build individual components manually or debug a step:

### **1. Build Frontend Production Bundle**
```bash
cd restaurant-billing-app/frontend
npm install
npm run build
```
> **Output:** Static HTML/JS/CSS bundle located at `restaurant-billing-app/frontend/build/`.

---

### **2. Compile Backend Executable (`rbs-backend.exe`)**
```bash
cd ../backend
npm install --omit=dev
npx pkg . --targets node22-win-x64 --output dist/rbs-backend.exe
```
> **Output:** Single Windows binary located at `restaurant-billing-app/backend/dist/rbs-backend.exe`.

---

### **3. Compile Frontend Express Server Executable (`rbs-frontend.exe`)**
```bash
cd ../deploy/frontend-server
rm -rf build
cp -R ../../frontend/build ./build
npm install
npx pkg . --targets node22-win-x64 --public --no-bytecode --output dist/rbs-frontend.exe
```
> **Output:** Windows server binary located at `restaurant-billing-app/deploy/frontend-server/dist/rbs-frontend.exe`.

---

### **4. Assemble Deployment Package & Create Zip**
Run from project root (`rbs` directory):
```bash
# Create target directory structure
rm -rf apps-only-package rbs-apps-only.zip
mkdir -p apps-only-package/backend apps-only-package/frontend

# Copy backend files
cp restaurant-billing-app/backend/dist/rbs-backend.exe apps-only-package/backend/
cp restaurant-billing-app/backend/.env apps-only-package/backend/ 2>/dev/null || cp restaurant-billing-app/backend/.env.example apps-only-package/backend/.env
cp restaurant-billing-app/Final_Dump_Fixed.sql apps-only-package/backend/ 2>/dev/null

# Copy frontend files
cp restaurant-billing-app/deploy/frontend-server/dist/rbs-frontend.exe apps-only-package/frontend/
cp -R restaurant-billing-app/frontend/build apps-only-package/frontend/build

# Copy launcher scripts
cp restaurant-billing-app/deploy/RunAppsOnly.bat apps-only-package/ 2>/dev/null || cp restaurant-billing-app/RunAppsOnly.bat apps-only-package/
cp restaurant-billing-app/deploy/RunAppsSetup.bat apps-only-package/ 2>/dev/null || cp RunAppsSetup.bat apps-only-package/ 2>/dev/null

# Create ZIP archive
cd apps-only-package
zip -r ../restaurant-billing-app/rbs-apps-only.zip .
cd ..
```

---

## Syncing Updated Package to GitHub

To push the new build and binaries to GitHub so another machine can pull the latest version:

```bash
git add restaurant-billing-app/rbs-apps-only.zip
git add restaurant-billing-app/frontend/src/
git add restaurant-billing-app/backend/src/
git commit -m "Build: Update frontend build and package binaries"
git push origin 3.26
```

On the second system, pull the latest changes:
```bash
git pull origin 3.26
```
Then extract `restaurant-billing-app/rbs-apps-only.zip` or run `RunAppsOnly.bat`.

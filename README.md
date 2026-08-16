<<<<<<< HEAD
# Restaurant Billing App — Deployment Package

This folder contains the compiled application only. There is no readable
source code in here — `backend\rbs-backend.exe` and `frontend\rbs-frontend.exe`
are self-contained executables with the Node.js runtime and all app code
built in.

## What's in this package
```
backend/
  rbs-backend.exe        <- compiled API server
  .env                    <- DB connection config (created/configured automatically or manually)
  Final_Dump_Fixed.sql    <- database schema + seed data
frontend/
  rbs-frontend.exe        <- compiled static web server (serves the UI)
RunApp.bat                <- Double-click to run app directly for testing/development (with auto-DB setup)
run-local.ps1             <- PowerShell script runner invoked by RunApp.bat
install-services.ps1      <- installs both as always-on background Windows services
README.md                 <- this file
```

## One important limitation, up front

The **backend** (`rbs-backend.exe`) is a real compiled binary — its
JavaScript source is not sitting on disk as plain text, so casual inspection
won't reveal your business logic.

The **frontend** cannot be hidden the same way. It's a website: the browser
has to download its JavaScript to run it, so anyone with DevTools open can
always see the frontend's code, same as any web app (your bank's site
included). `rbs-frontend.exe` just serves those files — it doesn't add
protection to them. If frontend confidentiality genuinely matters, that's a
different problem (licensing/legal, or moving that logic server-side) than
packaging can solve.

---

## Running the Application

Ensure PostgreSQL is installed on the target machine before proceeding.

### Method 1: Local Run / Test Mode (No Service Setup)
This method is perfect for testing or quick development checks without setting up persistent background services.

#### Option A: Full App & Database Initialization (Recommended for First Run)
1. **Double-click `RunApp.bat`** at the root of the extracted package folder.
2. If this is your first run or your `backend\.env` is unconfigured, the console will prompt you to enter your PostgreSQL password.
3. The runner will automatically recreate and populate the `restaurant_billing_db` database, and then start the frontend and backend.
4. To stop, press **Enter** in the runner window.

#### Option B: Fast Run / App Only (Skips Database Setup)
Use this option if your database is already populated and you only want to start the frontend and backend quickly.
1. **Double-click `RunAppsOnly.bat`** at the root of the extracted package folder.
2. The runner will skip database initialization and start the frontend and backend directly.
3. To stop, press **Enter** in the runner window.

---

### Method 2: Persistent Service Setup (For Production Deployment)
This method installs the application as always-on Windows services that run in the background and start automatically on boot.

#### 1. Setup the Database and Schema
Using pgAdmin or `psql` (connect to system database `postgres` first):
```
psql -U postgres -d postgres -f backend\Final_Dump_Fixed.sql
```

#### 2. Edit `backend\.env`
Create or edit `backend\.env` and set the real values:
```env
DB_USER=postgres
DB_PASSWORD=<the password you set above>
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restaurant_billing_db
PORT=8000
```

#### 3. Download NSSM
Get `nssm.exe` from https://nssm.cc/ and note its path (e.g. `C:\tools\nssm\nssm.exe`).

#### 4. Install both services (run PowerShell as Administrator)
```powershell
cd path\to\this\extracted\folder
.\install-services.ps1 -NssmPath 'C:\tools\nssm\nssm.exe' -StartServices
```

This registers `RBSBackend` and `RBSFrontend` as Windows services set to **Automatic** startup — they come up on boot with no one needing to log in or open a terminal, and keep running in the background indefinitely.

#### 5. Use the app
Open a browser on this machine to:
```
http://localhost:3000
```

#### Checking on it later
```powershell
Get-Service RBSBackend, RBSFrontend      # check status
nssm restart RBSBackend                  # restart if needed
```
Logs are written to `backend\service-std*.log` and `frontend\service-std*.log`.

#### Uninstalling
```powershell
nssm stop RBSBackend
nssm remove RBSBackend confirm
nssm stop RBSFrontend
nssm remove RBSFrontend confirm
```
=======
# Restaurant Billing Application

This is a restaurant billing application built using the PERN stack (PostgreSQL, Express, React, Node.js). The application allows users to manage billing records efficiently.

## Project Structure

```text
restaurant-billing-app
├── backend
│   ├── migrations                 # Database migration scripts
│   ├── src
│   │   ├── app.js                 # Main entry point for the backend server
│   │   ├── db
│   │   │   └── index.js           # PostgreSQL database connection setup
│   │   ├── models
│   │   │   ├── billingModel.js    # Handles database queries for bills
│   │   │   ├── userModel.js       # Handles database queries for users
│   │   │   ├── shiftModel.js      # Handles database queries for shifts
│   │   │   ├── itemModel.js       # Handles database queries for items
│   │   │   ├── pricingModel.js    # Handles database queries for item pricing
│   │   │   ├── transactionModel.js# Handles database queries for transactions
│   │   │   └── invoiceModel.js    # Handles database queries for invoices
│   │   ├── controllers
│   │   │   ├── billingController.js
│   │   │   ├── userController.js
│   │   │   ├── shiftController.js
│   │   │   ├── itemController.js
│   │   ├── routes
│   │   │   ├── billingRoutes.js
│   │   │   ├── userRoutes.js
│   │   │   ├── shiftRoutes.js
│   │   │   ├── itemRoutes.js
│   ├── .env                       # Backend environment variables
│   ├── package.json
├── frontend
│   ├── public                     # Static assets
│   ├── src                        # Frontend source code (React)
│   ├── .env                       # Frontend environment variables
│   ├── package.json
├── dbscrpt.txt                    # Full database creation and update scripts
├── ER_Diagram.md                  # Detailed ER diagram documentation
├── docker-compose.yml             # Docker configuration
└── README.md                      # Project documentation
```

## Database Design

### Entity Relationship Diagram (ERD)

The following diagram illustrates the database schema and relationships after the final updates.

![Database ER Diagram]
![alt text](image.png)

> Note: The image above is a generated preview of the Mermaid diagram.

#### Table Relationships:

- **Sections** (`tables`): Master table for restaurant sections/tables.
- **Bills**: Linked to `sections` via `table_no`.
- **Orders**: Linked to `bills` via a **composite key** `(table_no, party_no, created_at, track, clerk_initials)` as per Update-3.
- **Shifts & Sessions**: `sessions` track individual shift instances.
- **Audit Log**: Tracks system events, linked to `sessions`.
- **Settings**: Stores global hotel configuration and unique clerk initials.
- **Items**: Managed with JSONB categories for complex item compositions (e.g., Combo plates).

For a more detailed breakdown of fields and constraints, see [ER_Diagram.md](./ER_Diagram.md).

## Getting Started

### Prerequisites

- Node.js
- PostgreSQL
- Docker (optional, for containerization)

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd restaurant-billing-app
   ```

2. Set up the backend:
   - Navigate to the `backend` directory:
     ```bash
     cd backend
     ```
   - Install dependencies:
     ```bash
     npm install
     ```
   - Create a `.env` file in the `backend` directory and add your environment variables.

3. Set up the frontend:
   - Navigate to the `frontend` directory:
     ```bash
     cd ../frontend
     ```
   - Install dependencies:
     ```bash
     npm install
     ```
   - Create a `.env` file in the `frontend` directory.

### Running the Application

- To run the backend:

  ```bash
  cd backend
  npm start
  ```

- To run the frontend:
  ```bash
  cd frontend
  npm start
  ```

### Docker

To run the application using Docker, you can use the provided `docker-compose.yml` file. Run the following command in the root directory of the project:

```bash
docker-compose up
```

### Usage

- The application allows you to create, view, and delete billing records.
- Access the frontend application in your browser at `http://localhost:3000`.

## Login Instructions

The application uses a shift-based login system. You must log in with a valid credential and track.

1. **Credential**:
   - Enter `CLK` for **Clerk** access (standard billing).
   - Enter `SHI` for **Admin** access (full management).

2. **Date**:
   - Automatically set to the current date (read-only).

3. **Track**:
   - Required to identify the terminal or location.
   - Valid options: `` ` ``, ` ` ``, `RBS1`, `RBS2`.
   - **Note**: If a shift for the selected track is **CLOSED**, access will be denied. An admin must re-open it.

4. **Admin Verification**:
   - If logging in as `SHI`, you will be prompted for a password.
   - Enter your admin password to proceed.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or features.

## Automated Setup (Windows)

For a one-click setup experience on Windows, we have provided a PowerShell script inside the `restaurant-billing-app` folder that handles:

- Installing Node.js (LTS), PostgreSQL 17, and pgAdmin 4
- Configuring the database and user
- Installing dependencies and starting the application

**To run the setup:**

1. Open PowerShell as **Administrator**.
2. Navigate to the application directory:
   ```powershell
   cd "restaurant-billing-app"
   ```
3. Run the script:
   ```powershell
   .\setup_and_run.ps1
   ```
4. Follow the on-screen prompts to set your database password.

The script will automatically launch the backend API on port 8000 and the frontend React app on port 3000.

## Latest Updates (Version-1)

- **Shifts Issue Fixed**: Resolved bugs related to shift tracking and management.
- **Keyboard Shortcuts Added**:
  - Global navigation shortcuts (Ctrl+Alt+1-4) for Dashboard, Reports, Reconciliation, Settings.
  - Specific Report shortcuts (Ctrl+Shift+1-4).
  - Billing Screen navigation enhanced (Tab/Enter moves Table -> Party -> Item Code).
- **Bill Printing**:
  - Fixed "Provisional bill not found" errors during printing.
  - Added Party Number to the printed bill.
  - Ensured correct Clerk Initials are recorded and displayed.

## Keyboard Shortcuts

### Global Navigation

- **Alt + 1**: Go to Billing Screen
- **Alt + 2**: Go to Recent Bills
- **Alt + 3**: Go to Shifts
- **Alt + 4**: Go to Food Menu
- **Alt + 5**: Go to Admin Panel (Admin only)

### Admin Panel Navigation (Admin Only)

- **Ctrl + Alt + 1**: Dashboard
- **Ctrl + Alt + 2**: Reports
- **Ctrl + Alt + 3**: Reconciliation
- **Ctrl + Alt + 4**: Settings

### Report Shortcuts (Admin Only)

- **Ctrl + Shift + 1**: Time Range Report
- **Ctrl + Shift + 2**: Date Range Report
- **Ctrl + Shift + 3**: Shift Report
- **Ctrl + Shift + 4**: Item Report

### Billing Screen

- **F1**: Open Help Panel (Search Menu Items)
- **PageDown**: Move focus to Item Code input
- **End** or **Home**: Print Bill
- **Ctrl + F**: Open Help Panel (Search Menu Items)
- **Esc**:
  - Close Help Panel
  - Return focus to Table Number (if in Item Code)
  - Cancel Quantity Edit
- **Table Number Input**:
  - **Enter** or **Tab**: Load table data and move to Party Number
- **Party Number Input**:
  - **Enter** or **Tab**: Move directly to Item Code (skipping Section)
- **Item Code Input**:
  - **ArrowDown**: Move focus to the first bill item row
  - **Enter**: Add item to bill
- **Bill Items (Grid)**:
  - **ArrowUp / ArrowDown**: Navigate between rows
  - **Enter**: Edit Quantity for selected row
- **Quantity Input (Edit Mode)**:
  - **Enter**: Save quantity and return to Item Code
  - **Esc**: Cancel edit and return to Item Code

### Recent Bills Screen

- **ArrowUp / ArrowDown**: Navigate through bills list
- **Enter** or **Space**: Expand/Collapse selected bill details
- **Enter** or **Space**: Expand/Collapse selected bill details
- **F3** or **Alt + S**: Focus Search Box
- **Esc**: Clear Search

### Food Menu Screen

- **Alt + S**: Focus Search Box

## License

This project is licensed under the MIT License. See the LICENSE file for details.
>>>>>>> origin/3.26

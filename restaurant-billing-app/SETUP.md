# Restaurant Billing App - Setup Guide

This guide provides step-by-step instructions to set up and run the Restaurant Billing Application on Windows.

## Prerequisites

Before starting, ensuring you have the following is recommended, although the script aims to install them:

- **OS**: Windows 10 or 11
- **PowerShell**: Run as Administrator

## Method 1: Automated Setup (Recommended)

We have provided a PowerShell script to automate the installation of dependencies (Node.js, PostgreSQL, pgAdmin), database configuration, and starting the application.

1.  **Open PowerShell as Administrator**:
    - Right-click the Start button or search for "PowerShell".
    - Select **Run as Administrator**.

2.  **Navigate to the project directory**:

    ```powershell
    cd "path\to\restaurant-billing-app"
    ```

3.  **Run the Setup Script**:

    ```powershell
    .\setup_and_run.ps1
    ```

    _If you get a security warning, you might need to allow script execution:_

    ```powershell
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
    .\setup_and_run.ps1
    ```

4.  **Follow the On-Screen Prompts**:
    - The script will install Node.js and PostgreSQL if missing.
    - **Important**: When PostgreSQL installs, it may open a separate window. You MUST set a password for the `postgres` user. **Remember this password.**
    - The script will ask you to enter this password to configure the database.

5.  **Access the App**:
    - The Backend will start on port `8000`.
    - The Frontend will open in your default browser at `http://localhost:3000`.

## Method 2: Manual Setup

If the automated script fails, follow these steps.

### 1. Install Dependencies

- **Node.js**: Download and install from [nodejs.org](https://nodejs.org/). Use the LTS version.
- **PostgreSQL**: Download and install from [postgresql.org](https://www.postgresql.org/download/windows/).
  - During installation, set the password for the superuser (`postgres`) to something simple (e.g., `admin`) or remember your choice.
  - Install **pgAdmin 4** (usually included).

### 2. Configure Database

1.  Open **pgAdmin 4**.
2.  Register/Connect to your server (localhost).
3.  Right-click `Databases` -> `Create` -> `Database...`
    - Name: `restaurant_billing_db`
    - Click **Save**.
4.  Right-click the new `restaurant_billing_db` -> `Query Tool`.
5.  Open the `Final_Dump_Fixed.sql` file located in the root folder using a text editor, copy the content, paste it into the Query Tool, and hit the **Play** button (Execute).

### 3. Backend Setup

1.  Navigate to the `backend` folder:
    ```powershell
    cd backend
    ```
2.  Create a file named `.env` and add the following (replace `YOUR_PASSWORD`):
    ```env
    PORT=8000
    DB_USER=postgres
    DB_HOST=localhost
    DB_NAME=restaurant_billing_db
    DB_PASSWORD=YOUR_PASSWORD
    DB_PORT=5432
    NODE_ENV=development
    ```
3.  Install dependencies:
    ```powershell
    npm install
    ```
4.  Start the server:
    ```powershell
    npm start
    ```

### 4. Frontend Setup

1.  Open a new terminal and navigate to the `frontend` folder:
    ```powershell
    cd frontend
    ```
2.  Create a file named `.env`:
    ```env
    REACT_APP_API_URL=http://localhost:8000/api
    ```
3.  Install dependencies:
    ```powershell
    npm install
    ```
4.  Start the client:
    ```powershell
    npm start
    ```

## Troubleshooting

- **"Argument name was not recognized"**: This issue in the setup script has been fixed. Ensure you are using the latest version of `setup_and_run.ps1`.
- **Database Connection Error**: Double-check the `DB_PASSWORD` in `backend/.env` matches what you set during PostgreSQL installation.
- **Port In Use**: If port 8000 or 3000 is taken, close other applications or change the ports in `.env` and `package.json`.

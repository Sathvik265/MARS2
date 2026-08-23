const { Pool } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Locate and load .env file robustly regardless of current working directory or pkg VFS
const possibleEnvPaths = [
    path.join(path.dirname(process.execPath), '.env'), // Next to compiled rbs-backend.exe
    path.join(process.cwd(), '.env'),                 // Current working directory
    path.join(process.cwd(), 'backend', '.env'),      // Subdirectory backend/.env
    path.join(__dirname, '..', '..', '.env'),         // Relative to src/db
];

let envLoadedFrom = null;
for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        envLoadedFrom = envPath;
        break;
    }
}

if (envLoadedFrom) {
    console.log(`[RBS Backend] Loaded .env configuration from: ${envLoadedFrom}`);
} else {
    dotenv.config(); // Fallback default
    console.warn('[RBS Backend] Warning: No explicit .env file found in standard locations. Using environment/defaults.');
}

// Clean and sanitize config values (strip surrounding quotes if present)
const clean = (val, fallback = '') => {
    if (val === undefined || val === null) return fallback;
    let s = String(val).trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
    }
    return s;
};

const dbUser = clean(process.env.DB_USER, 'postgres');
const dbPassword = clean(process.env.DB_PASSWORD, '');
const dbHost = clean(process.env.DB_HOST, '127.0.0.1');
const dbPort = parseInt(clean(process.env.DB_PORT, '5432'), 10) || 5432;
const dbName = clean(process.env.DB_NAME, 'restaurant_billing_db');

console.log(`[RBS Backend] DB Config -> User: '${dbUser}', Host: '${dbHost}', Port: ${dbPort}, Database: '${dbName}', Password provided: ${dbPassword ? 'YES (' + dbPassword.length + ' chars)' : 'NO (empty)'}`);

const pool = new Pool({
    user: dbUser,
    host: dbHost === 'localhost' ? '127.0.0.1' : dbHost, // Prefer 127.0.0.1 on Windows to prevent IPv6 ::1 connection resets
    database: dbName,
    password: dbPassword,
    port: dbPort,
    max: 25,
    idleTimeoutMillis: 600000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    query_timeout: 10000,
});

pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database');
});

pool.on('error', (err) => {
    if (err.message && (err.message.includes('ECONNRESET') || err.message.includes('forcibly closed') || err.code === 'ECONNRESET')) {
        console.log('Database connection pool: Idle connection reset (normal cleanup, will auto-reconnect on next request)');
    } else {
        console.error('Unexpected database client pool error:', err.message);
    }
});

module.exports = pool;
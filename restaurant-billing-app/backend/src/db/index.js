const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    max: 25, // Increase pool size to handle concurrent requests
    idleTimeoutMillis: 600000, // Close idle connections after 10 minutes (prevents frequent socket resets)
    connectionTimeoutMillis: 10000, // Fast fail if connection cannot be established (10 seconds)
    
    // Windows/Network resilience settings:
    keepAlive: true, // Enable TCP Keep-Alive to detect dropped/silent dead connections
    keepAliveInitialDelayMillis: 10000, // Send keep-alive packet after 10 seconds of inactivity
    query_timeout: 10000, // Automatically cancel and release queries that hang for more than 10 seconds
});

// Log a message when connected
pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database');
});

// CRITICAL: Handle unexpected errors on idle pool clients to prevent them from crashing Node process
pool.on('error', (err) => {
    // Suppress scary logs for routine socket resets on idle connections (normal Windows socket cleanup)
    if (err.message && (err.message.includes('ECONNRESET') || err.message.includes('forcibly closed') || err.code === 'ECONNRESET')) {
        console.log('Database connection pool: Idle connection reset (normal cleanup, will auto-reconnect on next request)');
    } else {
        console.error('Unexpected database client pool error:', err.message);
    }
});

module.exports = pool;
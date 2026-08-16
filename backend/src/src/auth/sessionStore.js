const crypto = require("crypto");
const { SESSION_TTL_MS } = require("./config");

const sessions = new Map();

function now() {
  return Date.now();
}

function isExpired(session) {
  return !session || session.expires_at <= now();
}

function cleanupExpiredSessions() {
  const current = now();

  for (const [token, session] of sessions.entries()) {
    if (!session || session.expires_at <= current) {
      sessions.delete(token);
    }
  }
}

function createSession(sessionData) {
  cleanupExpiredSessions();

  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = now();

  sessions.set(token, {
    ...sessionData,
    created_at: createdAt,
    expires_at: createdAt + SESSION_TTL_MS,
  });

  return token;
}

function getSession(token) {
  if (!token) {
    return null;
  }

  const session = sessions.get(token);

  if (isExpired(session)) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function deleteSession(token) {
  if (token) {
    sessions.delete(token);
  }
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  cleanupExpiredSessions,
};

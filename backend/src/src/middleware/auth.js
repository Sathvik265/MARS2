const { AUTH_HEADER_NAME } = require("../auth/config");
const { getSession } = require("../auth/sessionStore");

function extractToken(req) {
  const headerValue = req.get(AUTH_HEADER_NAME) || req.get("authorization");

  if (!headerValue) {
    return null;
  }

  if (headerValue.toLowerCase().startsWith("bearer ")) {
    return headerValue.slice(7).trim();
  }

  return headerValue.trim();
}

function attachAuth(req, res, next) {
  const token = extractToken(req);
  const session = getSession(token);

  if (session) {
    req.auth = {
      token,
      ...session,
    };
  } else {
    req.auth = null;
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ detail: "Authentication required" });
  }

  next();
}

function requireAdminAny(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ detail: "Authentication required" });
  }

  if (!String(req.auth.mode || "").startsWith("admin")) {
    return res.status(403).json({ detail: "Admin access required" });
  }

  next();
}

function requireAdminFull(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ detail: "Authentication required" });
  }

  if (req.auth.mode !== "admin-full") {
    return res.status(403).json({ detail: "Admin full access required" });
  }

  next();
}

function requireSessionCloseAccess(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ detail: "Authentication required" });
  }

  if (String(req.auth.mode || "").startsWith("admin")) {
    return next();
  }

  const targetSessionId = String(
    req.params.sessionId || req.body.session_id || "",
  );

  if (targetSessionId && String(req.auth.session_id || "") === targetSessionId) {
    return next();
  }

  return res.status(403).json({ detail: "Not allowed for this session" });
}

module.exports = {
  attachAuth,
  requireAuth,
  requireAdminAny,
  requireAdminFull,
  requireSessionCloseAccess,
};

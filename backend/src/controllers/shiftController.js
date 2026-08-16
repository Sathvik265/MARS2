const ShiftModel = require("../models/shiftModel");

const shiftController = {
  // Shift routes
  async getAllShifts(req, res) {
    try {
      const shifts = await ShiftModel.getAllShifts();
      res.json(shifts);
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to fetch shifts", details: error.message });
    }
  },

  async getShiftByName(req, res) {
    try {
      const shift = await ShiftModel.getShiftByName(req.params.shiftName);
      if (shift) {
        res.json(shift);
      } else {
        res.status(404).json({ error: "Shift not found" });
      }
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to fetch shift", details: error.message });
    }
  },

  // Session routes
  async getAllSessions(req, res) {
    try {
      const sessions = await ShiftModel.getAllSessions();
      res.json(sessions);
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to fetch sessions", details: error.message });
    }
  },

  async getSessionById(req, res) {
    try {
      const session = await ShiftModel.getSessionById(req.params.sessionId);
      if (session) {
        res.json(session);
      } else {
        res.status(404).json({ error: "Session not found" });
      }
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to fetch session", details: error.message });
    }
  },

  async createSession(req, res) {
    try {
      const session = await ShiftModel.createSession(req.body);
      res.status(201).json(session);
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to create session", details: error.message });
    }
  },

  async closeSession(req, res) {
    try {
      const { closedBy } = req.body;
      // ShiftModel.closeSession(sessionUuid, closedBy)
      const session = await ShiftModel.closeSession(
        req.params.sessionId,
        closedBy
      );
      res.json(session);
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to close session", details: error.message });
    }
  },

  async getOpenSessions(req, res) {
    try {
      const sessions = await ShiftModel.getOpenSessions();
      res.json(sessions);
    } catch (error) {
      res
        .status(500)
        .json({
          error: "Failed to fetch open sessions",
          details: error.message,
        });
    }
  },

  async getSessionsByDate(req, res) {
    try {
      const sessions = await ShiftModel.getSessionsByDate(req.params.date);
      res.json(sessions);
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to fetch sessions", details: error.message });
    }
  },

  async getCurrentShiftType(req, res) {
    try {
      const shiftType = await ShiftModel.getCurrentShiftType();
      res.json({ shift_type: shiftType });
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to get current shift", details: error.message });
    }
  },

  async ensureAllShiftSessionsExist(req, res) {
    // Renamed function
    try {
      const sessions = await ShiftModel.ensureAllShiftSessionsExist(); // Call new function name
      res.json(sessions);
    } catch (error) {
      res
        .status(500)
        .json({
          error: "Failed to ensure shift sessions exist",
          details: error.message,
        });
    }
  },

  // New function to reopen a session
  async reopenSession(req, res) {
    try {
      const { sessionId } = req.params;
      const session = await ShiftModel.reopenSession(sessionId);
      if (session) {
        res.json(session);
      } else {
        res.status(404).json({ error: "Session not found" });
      }
    } catch (error) {
      console.error("Error reopening session:", error);
      res
        .status(500)
        .json({ error: "Failed to reopen session", details: error.message });
    }
  },
};

module.exports = shiftController;

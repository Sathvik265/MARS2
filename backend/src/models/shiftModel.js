const pool = require("../db");
const BillingModel = require('./billingModel');

  const _getTrackColumn = (track) => {
    if (track === "`") return "track_morning";
    if (track === "``") return "track_afternoon";
    if (track === "RBS") return "track_rbs1";
    if (track === "RBS1") return "track_rbs2";
    return "track_morning"; // Fallback
  };
  
  const _resetRunningBill = async (track) => {
    try {
      const colName = _getTrackColumn(track);
      await pool.query(`UPDATE running_bills SET ${colName} = 0 WHERE id = 1`);
    } catch(e) {
      console.error('Error resetting running bill:', e);
    }
  };

const ShiftModel = {
  // ==================== SHIFTS TABLE OPERATIONS ====================

  // Get all shifts
  async getAllShifts() {
    const result = await pool.query("SELECT * FROM shifts ORDER BY id");
    return result.rows;
  },

  // Get shift by name
  async getShiftByName(shiftName) {
    const result = await pool.query(
      "SELECT * FROM shifts WHERE shift_name = $1",
      [shiftName]
    );
    return result.rows[0];
  },

  // ==================== SESSIONS TABLE OPERATIONS ====================

  // Get all sessions
  async getAllSessions() {
    const result = await pool.query(
      "SELECT * FROM sessions ORDER BY session_date DESC, start_time DESC"
    );
    return result.rows;
  },

  // Get session by ID
  async getSessionById(sessionId) {
    const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [
      sessionId,
    ]);
    return result.rows[0];
  },

  // Get session by UUID
  async getSessionByUUID(sessionUuid) {
    const result = await pool.query(
      "SELECT * FROM sessions WHERE session_id = $1",
      [sessionUuid]
    );
    return result.rows[0];
  },

  // Create a new session or update existing if shift_name already exists
  async createSession(sessionData) {
    const {
      shift_name,
      clerk_initials,
      session_date = "1970-01-01", // Default to fixed date
      start_time = null,
      status = "OPEN",
    } = sessionData;

    // Check if a session for this shift_name already exists
    const existingSession = await pool.query(
      `SELECT * FROM sessions WHERE shift_name = $1`,
      [shift_name]
    );

    if (existingSession.rows.length > 0) {
      // If session exists, update its status and other relevant fields
      const sessionId = existingSession.rows[0].id;
      const result = await pool.query(
        `UPDATE sessions
         SET clerk_initials = $1,
             session_date = $2,
             start_time = COALESCE($3, CURRENT_TIMESTAMP),
             status = $4,
             end_time = NULL,
             closed_by = NULL
         WHERE id = $5
         RETURNING *`,
        [clerk_initials, session_date, start_time, status, sessionId]
      );
      if (status === 'OPEN') {
        await _resetRunningBill(shift_name);
      }
      return result.rows[0];
    } else {
      // If no session exists, create a new one
      const result = await pool.query(
        `INSERT INTO sessions (
          shift_name, clerk_initials, session_date, start_time, status
        )
        VALUES ($1, $2, $3, COALESCE($4, CURRENT_TIMESTAMP), $5)
        RETURNING *`,
        [shift_name, clerk_initials, session_date, start_time, status]
      );
      if (status === 'OPEN') {
        await _resetRunningBill(shift_name);
      }
      return result.rows[0];
    }
  },

  // Close a session — also locks the track and snapshots the bill counter
  async closeSession(sessionUuid, closedBy) {
    // First, snapshot the current bill counter for this track
    let lastBillNumber = 0;
    try {
      // Need to know the shift_name before updating
      const preQuery = await pool.query(
        `SELECT shift_name FROM sessions WHERE session_id = $1`,
        [sessionUuid]
      );
      if (preQuery.rows.length > 0) {
        const shiftName = preQuery.rows[0].shift_name;
        const counterRow = await BillingModel.getLastBillNumber(null, shiftName);
        lastBillNumber = parseInt(counterRow?.last_bill_number) || 0;
      }
    } catch (e) {
      console.error('Could not snapshot bill counter on session close:', e);
    }

    const result = await pool.query(
      `UPDATE sessions
         SET status = 'CLOSED',
             end_time = CURRENT_TIMESTAMP,
             closed_by = $1,
             is_locked = TRUE,
             last_bill_number = $3
         WHERE session_id = $2
         RETURNING *`,
      [closedBy, sessionUuid, lastBillNumber]
    );

    const updatedSession = result.rows[0];
    if (!updatedSession) return null;

    if (updatedSession.shift_name) {
      await _resetRunningBill(updatedSession.shift_name);
    }

    return updatedSession;
  },
  // Get open sessions
  async getOpenSessions() {
    const result = await pool.query(
      "SELECT * FROM sessions WHERE status = 'OPEN' ORDER BY start_time DESC"
    );
    return result.rows;
  },

  // Get all sessions (sessionDate is irrelevant)
  async getSessionsByDate(sessionDate) {
    // sessionDate parameter is now ignored
    const result = await pool.query(
      "SELECT * FROM sessions ORDER BY shift_name, start_time" // Order by shift_name
    );
    return result.rows;
  },

  // Get sessions by shift name
  async getSessionsByShift(shiftName) {
    const result = await pool.query(
      "SELECT * FROM sessions WHERE shift_name = $1 ORDER BY session_date DESC, start_time DESC",
      [shiftName]
    );
    return result.rows;
  },

  // Get current open session for a shift
  async getCurrentOpenSession(shiftName) {
    // Removed sessionDate
    const result = await pool.query(
      `SELECT * FROM sessions
         WHERE shift_name = $1
           AND status = 'OPEN'
         ORDER BY start_time DESC
         LIMIT 1`,
      [shiftName]
    );
    return result.rows[0];
  },
  // Get sessions by clerk
  async getSessionsByClerk(clerkInitials) {
    const result = await pool.query(
      "SELECT * FROM sessions WHERE clerk_initials = $1 ORDER BY session_date DESC, start_time DESC",
      [clerkInitials]
    );
    return result.rows;
  },

  // Get sessions in date range
  async getSessionsInDateRange(startDate, endDate) {
    const result = await pool.query(
      `SELECT * FROM sessions 
       WHERE session_date BETWEEN $1 AND $2 
       ORDER BY session_date DESC, start_time DESC`,
      [startDate, endDate]
    );
    return result.rows;
  },

  // Update session
  async updateSession(sessionId, updateData) {
    const { clerk_initials, start_time, end_time, status, closed_by } =
      updateData;

    const updates = [];
    const values = [];
    let paramCounter = 1;

    if (clerk_initials !== undefined) {
      updates.push(`clerk_initials = $${paramCounter++}`);
      values.push(clerk_initials);
    }
    if (start_time !== undefined) {
      updates.push(`start_time = $${paramCounter++}`);
      values.push(start_time);
    }
    if (end_time !== undefined) {
      updates.push(`end_time = $${paramCounter++}`);
      values.push(end_time);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCounter++}`);
      values.push(status);
    }
    if (closed_by !== undefined) {
      updates.push(`closed_by = $${paramCounter++}`);
      values.push(closed_by);
    }

    if (updates.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(sessionId);
    const query = `UPDATE sessions SET ${updates.join(
      ", "
    )} WHERE id = $${paramCounter} RETURNING *`;

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // Delete session
  async deleteSession(sessionId) {
    await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
  },

  // Reopen a closed session — also clears the lock so clerks can access again
  async reopenSession(sessionUuid) {
    const result = await pool.query(
      `UPDATE sessions
       SET status = 'OPEN',
           end_time = NULL,
           closed_by = NULL,
           is_locked = FALSE
       WHERE session_id = $1
       RETURNING *`,
      [sessionUuid]
    );

    const updatedSession = result.rows[0];
    if (!updatedSession) return null;

    return updatedSession;
  },
  // ==================== LOCK / EOD FUNCTIONS ====================

  /**
   * Set or clear the is_locked flag on a track's session.
   * @param {string} shiftName  e.g. 'RBS1'
   * @param {boolean} isLocked  true = locked, false = unlocked
   */
  async setTrackLocked(shiftName, isLocked) {
    const result = await pool.query(
      `UPDATE sessions
         SET is_locked = $1
         WHERE shift_name = $2
         RETURNING session_id, shift_name, status, is_locked, last_bill_number`,
      [isLocked, shiftName]
    );
    return result.rows[0] || null;
  },

  /**
   * Get the lock status + last bill number for a single track.
   * @param {string} shiftName
   */
  async getTrackLockStatus(shiftName) {
    const result = await pool.query(
      `SELECT session_id, shift_name, status, is_locked, last_bill_number,
              clerk_initials, start_time, end_time
         FROM sessions
         WHERE shift_name = $1
         LIMIT 1`,
      [shiftName]
    );
    return result.rows[0] || null;
  },

  /**
   * Get lock status + bill number for ALL tracks.
   * Used by the Admin Track Control dashboard.
   */
  async getAllTrackStatuses() {
    const result = await pool.query(
      `SELECT session_id, shift_name, status, is_locked, last_bill_number,
              clerk_initials, start_time, end_time
         FROM sessions
         ORDER BY shift_name`
    );
    return result.rows;
  },

  // ==================== HELPER FUNCTIONS ====================

  // Get current shift type based on time
  async getCurrentShiftType() {
    const result = await pool.query("SELECT CURRENT_TIME as current_time");
    const currentTime = result.rows[0].current_time;

    const hour = parseInt(currentTime.split(":")[0]);

    if (hour >= 6 && hour < 12) {
      return "`"; // Morning shift
    } else if (hour >= 12 && hour < 18) {
      return "``"; // Afternoon shift
    } else if (hour >= 18 && hour < 22) {
      return "RBS"; // Evening shift
    } else {
      return "RBS1"; // Night shift
    }
  },

  // Ensure all shift types have a session entry, creating if not exists
  async ensureAllShiftSessionsExist() {
    const shifts = ["`", "``", "RBS", "RBS1"];
    const fixedDate = "1970-01-01"; // Use a fixed date as session_date is irrelevant

    const results = [];
    for (const shift of shifts) {
      try {
        // Check if a session for this shift_name already exists
        const existing = await pool.query(
          `SELECT * FROM sessions WHERE shift_name = $1`,
          [shift]
        );

        if (existing.rows.length === 0) {
          // If no session exists, create a new one
          const session = await this.createSession({
            shift_name: shift,
            clerk_initials: "SYS",
            session_date: fixedDate, // Use fixed date
            status: "OPEN", // Start as OPEN
          });
          results.push(session);
        } else {
          results.push(existing.rows[0]); // Add existing session to results
        }
      } catch (error) {
        console.error(`Error ensuring session for ${shift}:`, error);
      }
    }
    return results;
  },

  // Auto-reopen all shift sessions for a new day at 12:00 AM (sets status='OPEN', is_locked=FALSE)
  async autoReopenAllShifts() {
    const shifts = ["`", "``", "RBS", "RBS1"];
    const results = [];
    for (const shiftName of shifts) {
      try {
        const existing = await pool.query(
          `SELECT * FROM sessions WHERE shift_name = $1`,
          [shiftName]
        );

        if (existing.rows.length > 0) {
          const res = await pool.query(
            `UPDATE sessions
             SET status = 'OPEN',
                 is_locked = FALSE,
                 end_time = NULL,
                 closed_by = NULL,
                 start_time = CURRENT_TIMESTAMP
             WHERE shift_name = $1
             RETURNING *`,
            [shiftName]
          );
          if (res.rows.length > 0) {
            await _resetRunningBill(shiftName);
            results.push(res.rows[0]);
          }
        } else {
          const session = await this.createSession({
            shift_name: shiftName,
            clerk_initials: "SYS_AUTO",
            status: "OPEN",
          });
          results.push(session);
        }
      } catch (err) {
        console.error(`Error auto-reopening shift ${shiftName}:`, err);
      }
    }
    return results;
  },
};

module.exports = ShiftModel;

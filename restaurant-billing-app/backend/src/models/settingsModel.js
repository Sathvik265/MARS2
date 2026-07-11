const pool = require("../db");

const SettingsModel = {
  // Get settings for a specific clerk - returns master CLK row but with requested initials
  async getSettings(clerk_initials) {
    const code = clerk_initials ? clerk_initials.toUpperCase() : "CLK";
    const result = await pool.query(
      "SELECT * FROM settings WHERE clerk_initials = 'CLK'"
    );

    if (result.rows.length === 0) {
      const provisioned = await this.ensureSettings("CLK");
      return {
        ...provisioned,
        clerk_initials: code
      };
    }

    return {
      ...result.rows[0],
      clerk_initials: code
    };
  },

  // Update settings globally (updates the master CLK row and syncs to active clerk)
  async updateSettings(clerk_initials, data) {
    const code = clerk_initials ? clerk_initials.toUpperCase() : "CLK";
    const {
      hotel_name,
      address,
      phone,
      gstin,
      sgst_percentage,
      cgst_percentage,
      allowed_clerks,
    } = data;

    // Check if master CLK exists
    const check = await pool.query(
      "SELECT id FROM settings WHERE clerk_initials = 'CLK'"
    );

    if (check.rows.length === 0) {
      await this.ensureSettings("CLK");
    }

    const result = await pool.query(
      `UPDATE settings 
       SET hotel_name = $1, address = $2, phone = $3, gstin = $4, sgst_percentage = $5, cgst_percentage = $6, allowed_clerks = $7
       WHERE clerk_initials = 'CLK' 
       RETURNING *`,
      [
        hotel_name,
        address,
        phone,
        gstin,
        sgst_percentage ?? 2.5,
        cgst_percentage ?? 2.5,
        allowed_clerks ?? 'CLK,V,P,B',
      ],
    );

    // Sync to this specific clerk's settings row as well
    if (code !== "CLK") {
      await pool.query(
        `INSERT INTO settings (hotel_name, address, phone, gstin, sgst_percentage, cgst_percentage, allowed_clerks, clerk_initials, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (clerk_initials) DO UPDATE SET 
           hotel_name = EXCLUDED.hotel_name,
           address = EXCLUDED.address,
           phone = EXCLUDED.phone,
           gstin = EXCLUDED.gstin,
           sgst_percentage = EXCLUDED.sgst_percentage,
           cgst_percentage = EXCLUDED.cgst_percentage,
           allowed_clerks = EXCLUDED.allowed_clerks`,
        [
          hotel_name,
          address,
          phone,
          gstin,
          sgst_percentage ?? 2.5,
          cgst_percentage ?? 2.5,
          allowed_clerks ?? 'CLK,V,P,B',
          code
        ]
      );
    }

    return {
      ...result.rows[0],
      clerk_initials: code
    };
  },

  // Update section setting globally on the master CLK row
  async updateSection(section) {
    const sectionVal = String(section || "L").toUpperCase().slice(0, 10);
    const result = await pool.query(
      `UPDATE settings 
       SET section = $1
       WHERE clerk_initials = 'CLK' 
       RETURNING *`,
      [sectionVal]
    );

    // Sync to other clerks if they exist, but since everything reads from CLK, this is sufficient.
    return result.rows[0];
  },

  // Ensure settings exist for a clerk (auto-provisioning)
  async ensureSettings(clerk_initials) {
    const code = clerk_initials ? clerk_initials.toUpperCase() : "CLK";

    // 1. Check if exists
    const check = await pool.query(
      "SELECT * FROM settings WHERE clerk_initials = $1",
      [code],
    );

    if (check.rows.length > 0) {
      return check.rows[0];
    }

    let defaults = {
      hotel_name: "Default Hotel",
      address: "Address",
      phone: "0000000000",
      gstin: "",
      sgst_percentage: 2.5,
      cgst_percentage: 2.5,
      allowed_clerks: 'CLK,V,P,B',
      section: 'L',
    };

    const template = await pool.query(
      "SELECT * FROM settings WHERE clerk_initials = 'CLK'",
    );

    if (template.rows.length > 0) {
      defaults = { ...template.rows[0] };
    }

    // 3. Insert new row for this clerk
    const result = await pool.query(
      `INSERT INTO settings (hotel_name, address, phone, gstin, sgst_percentage, cgst_percentage, allowed_clerks, section, clerk_initials, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (clerk_initials) DO UPDATE SET hotel_name = EXCLUDED.hotel_name 
       RETURNING *`,
      [
        defaults.hotel_name,
        defaults.address,
        defaults.phone,
        defaults.gstin,
        defaults.sgst_percentage,
        defaults.cgst_percentage,
        defaults.allowed_clerks || 'CLK,V,P,B',
        defaults.section || 'L',
        code,
      ],
    );
    return result.rows[0];
  },

  // Admin feature: List all clerks with settings
  async getAllClerks() {
    const res = await pool.query(
      "SELECT clerk_initials, hotel_name FROM settings ORDER BY clerk_initials",
    );
    return res.rows;
  },
};

module.exports = SettingsModel;

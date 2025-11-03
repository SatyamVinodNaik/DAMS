const express = require("express");
const router = express.Router();
const db = require("../db");

// Fetch all staff data
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT ssn_id, name, position, photo_data, photo_type FROM faculty ORDER BY CASE WHEN position LIKE '%Head of Department%' THEN 0 ELSE 1 END, name ASC"
    );

    const staff = rows.map(row => {
      const initial = row.name?.trim()?.[0]?.toUpperCase() || "?";
      const photo = row.photo_data
        ? `data:${row.photo_type};base64,${row.photo_data.toString("base64")}`
        : null;

      return {
        ssn_id: row.ssn_id,
        name: row.name,
        position: row.position,
        photo,
        initial,
      };
    });

    res.json(staff);
  } catch (err) {
    console.error("Error fetching staff:", err);
    res.status(500).json({ error: "Failed to fetch staff data" });
  }
});



module.exports = router;

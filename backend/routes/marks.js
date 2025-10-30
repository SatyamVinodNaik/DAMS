const express = require("express");
const db = require("../db");
const sgMail = require("@sendgrid/mail");

const router = express.Router();

// ✅ Setup SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ================== 1️⃣ Create / Update Marks ==================
router.post("/", async (req, res) => {
  const { usn, semester, subjects } = req.body;

  if (!usn || !semester || !Array.isArray(subjects)) {
    return res.status(400).json({ message: "Invalid request data" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const sub of subjects) {
      const code = sub.code || "";
      const cie1 = Number(sub.cie1) || 0;
      const cie2 = Number(sub.cie2) || 0;
      const lab = Number(sub.lab) || 0;
      const assignment = Number(sub.assignment) || 0;
      const external = Number(sub.external) || 0;
      const internal = Number(sub.internal) || 0;
      const total = Number(sub.total) || 0;
      const result = sub.result || "F";
      const isLab = sub.isLab ? 1 : 0;

      // ⚠️ Ensure marks table has UNIQUE KEY (usn, semester, subject_code)
      await conn.execute(
        `
        INSERT INTO marks 
          (usn, semester, subject_code, cie1, cie2, lab, assignment, \`external\`, \`internal\`, \`total\`, result, is_lab)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          cie1 = ?,
          cie2 = ?,
          lab = ?,
          assignment = ?,
          \`external\` = ?,
          \`internal\` = ?,
          \`total\` = ?,
          result = ?,
          is_lab = ?,
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          usn, semester, code, cie1, cie2, lab, assignment, external, internal, total, result, isLab,
          cie1, cie2, lab, assignment, external, internal, total, result, isLab
        ]
      );
    }

    await conn.commit();

    // ✅ Send Email Notification
    const [rows] = await db.execute(
      "SELECT email FROM student WHERE usn = ? AND email LIKE '%@gmail.com'",
      [usn]
    );

    if (rows.length > 0) {
      const studentEmail = rows[0].email;
      try {
        await sgMail.send({
          to: studentEmail,
          from: { name: "Dept Marks Update", email: "dams.project25@gmail.com" },
          subject: "📊 Marks Uploaded",
          text: `Dear Student,\n\nYour marks have been uploaded successfully. 
Please log in to the student portal to view your detailed results.\n
Click here: https://cse50-production-f95c.up.railway.app/\n\nRegards,\nCSE Department`,
        });
      } catch (emailErr) {
        console.error("⚠️ SendGrid Error:", emailErr);
      }
    }

    res.json({ message: "Marks saved & email sent successfully" });

  } catch (error) {
    await conn.rollback();
    console.error("🔥 SQL Error:", JSON.stringify(error, null, 2));
    res.status(500).json({ message: "Database error", error: error.sqlMessage || error.message, code: error.code });
  } finally {
    conn.release();
  }
});

// ================== 2️⃣ Get Marks ==================
router.get("/:usn", async (req, res) => {
  try {
    let usn;
    if (req.session.user && req.session.user.role === "student") {
      usn = req.session.user.usn;
    } else {
      usn = req.params.usn || req.query.usn;
      if (!usn) return res.status(401).json({ error: "Unauthorized. Please login or provide ?usn" });
    }

    const [rows] = await db.query(
      `SELECT m.subject_code, s.subject_name, m.semester,
        m.cie1, m.cie2, m.lab, m.assignment, m.\`external\`, s.credit, m.is_lab,
        (CASE WHEN m.is_lab = 1 THEN CEIL((m.cie1 + m.cie2)/50*15) ELSE CEIL((m.cie1 + m.cie2)/50*25) END + m.lab + m.assignment) AS internal,
        (CASE WHEN m.is_lab = 1 THEN CEIL((m.cie1 + m.cie2)/50*15) ELSE CEIL((m.cie1 + m.cie2)/50*25) END + m.lab + m.assignment + m.\`external\`) AS total,
        CASE 
          WHEN (CASE WHEN m.is_lab = 1 THEN CEIL((m.cie1 + m.cie2)/50*15) ELSE CEIL((m.cie1 + m.cie2)/50*25) END + m.lab + m.assignment) >= 20
               AND m.\`external\` >= 18
               AND (CASE WHEN m.is_lab = 1 THEN CEIL((m.cie1 + m.cie2)/50*15) ELSE CEIL((m.cie1 + m.cie2)/50*25) END + m.lab + m.assignment + m.\`external\`) >= 40
          THEN 'P' ELSE 'F'
        END AS result
       FROM marks m
       JOIN subjects s ON m.subject_code = s.subject_code
       WHERE m.usn = ?;`,
      [usn]
    );

    if (!rows.length) return res.status(404).json({ message: "No marks found for this USN" });
    res.json({ usn, subjects: rows });

  } catch (err) {
    console.error("🔥 DB Error:", err);
    res.status(500).json({ message: "Database error", error: err.sqlMessage || err.message, code: err.code });
  }
});

router.post("/saveSgpaCgpa", async (req, res) => {
    const { usn, semester, sgpa } = req.body;

    if (!usn || !semester || sgpa == null) {
        return res.status(400).json({ message: "Missing data" });
    }

    const sgpaNum = parseFloat(sgpa);
    const semNum = parseInt(semester);

    if (isNaN(sgpaNum) || isNaN(semNum)) {
        return res.status(400).json({ message: "Invalid SGPA or semester" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        // Save semester SGPA
        await conn.execute(
            `INSERT INTO student_sgpa (usn, semester, sgpa)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE sgpa=?`,
            [usn, semNum, sgpaNum, sgpaNum]
        );

        // Calculate cumulative CGPA (average of all SGPA)
        const [rows] = await conn.query(
            `SELECT AVG(sgpa) AS cgpa FROM student_sgpa WHERE usn=?`,
            [usn]
        );

        const cgpa = rows[0].cgpa ? Number(rows[0].cgpa).toFixed(2) : sgpaNum;

        // Save CGPA in the same table (semester 0 row)
        await conn.execute(
            `INSERT INTO student_sgpa (usn, semester, sgpa, cgpa)
             VALUES (?, 0, 0, ?)
             ON DUPLICATE KEY UPDATE cgpa=?`,
            [usn, cgpa, cgpa]
        );

        await conn.commit();
        res.json({ message: "SGPA & CGPA saved successfully", cgpa });

    } catch (err) {
        await conn.rollback();
        console.error("Error saving SGPA/CGPA:", err);
        res.status(500).json({ message: err.message || "Failed to save SGPA & CGPA" });
    } finally {
        conn.release();
    }
});



module.exports = router;

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
Click here: https://dams-production-36aa.up.railway.app/\n\nRegards,\nCSE Department`,
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
// Get students by semester & section (for marks entry)
router.get("/students", async (req, res) => {
  const { semester, section } = req.query;
  if (!semester || !section)
    return res.status(400).json({ error: "Semester and Section required" });

  try {
    const [students] = await db.execute(
      "SELECT usn, name FROM student WHERE sem = ? AND section = ? ORDER BY usn",
      [semester, section]
    );
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ✅ Get subjects assigned to faculty based on section + semester + session faculty
// ================== Faculty Assigned Subjects ==================
router.get("/faculty-subjects", async (req, res) => {
  console.log("📡 Faculty Subjects Route HIT");
  console.log("Session user:", req.session.user);
  console.log("Query params:", req.query);

  try {
    if (!req.session.user || req.session.user.role !== "faculty") {
      console.log("❌ Unauthorized access - no session");
      return res.status(403).json({ message: "Unauthorized" });
    }

    const facultyId = req.session.user.ssn_id;
    const { sem, section } = req.query;

    console.log("➡️ Query running with:", facultyId, sem, section);

    const [rows] = await db.query(
      `SELECT s.subject_code, s.subject_name
       FROM faculty_subject fs
       JOIN subjects s ON fs.subject_code = s.subject_code
       WHERE fs.faculty_id = ? AND fs.sem = ? AND fs.section = ?`,
      [facultyId, sem, section]
    );

    console.log("✅ Result:", rows);
    res.json(rows);
  } catch (err) {
    console.error("🔥 Error in faculty-subjects route:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ================== Students by Section ==================
router.get("/students-by-section", async (req, res) => {
  try {
    const { sem, section } = req.query;
    if (!sem || !section)
      return res.status(400).json({ message: "Semester and Section required" });

    const [rows] = await db.query(
      `SELECT usn, name FROM student WHERE sem=? AND section=? ORDER BY usn`,
      [sem, section]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================== 3️⃣ Subject Report (Pass/Fail Filter) ==================
router.get("/report", async (req, res) => {
  const { sem, section, subject, filter } = req.query;

  if (!sem || !section || !subject) {
    return res.status(400).json({ message: "Semester, Section, and Subject required" });
  }

  try {
    let query = `
      SELECT st.usn, st.name, 
             m.cie1, m.cie2, m.lab, m.assignment, m.external, 
             m.internal, m.total, m.result
      FROM marks m
      JOIN student st ON m.usn = st.usn
      WHERE m.semester = ? AND st.section = ? AND m.subject_code = ?
    `;

    const params = [sem, section, subject];

    if (filter === "P") query += " AND m.result = 'P'";
    if (filter === "F") query += " AND m.result = 'F'";

    query += " ORDER BY st.usn";

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("🔥 Error fetching report:", err);
    res.status(500).json({ message: "Database error" });
  }
});




// ================== 2️⃣ Get Marks ==================
// ================== 2️⃣ Get Marks by USN & Semester ==================
router.get("/:usn", async (req, res) => {
  try {
    const usn = req.params.usn;
    const semester = req.query.semester;

    if (!usn) {
      return res.status(400).json({ message: "USN is required" });
    }

    let query = `
      SELECT 
        m.subject_code,
        s.subject_name,
        m.semester,
        m.cie1, m.cie2, m.lab, m.assignment, m.\`external\`, 
        s.credit, m.is_lab,
        (CASE WHEN m.is_lab = 1 THEN CEIL((m.cie1 + m.cie2)/50*15)
              ELSE CEIL((m.cie1 + m.cie2)/50*25) END + m.lab + m.assignment) AS internal,
        (CASE WHEN m.is_lab = 1 THEN CEIL((m.cie1 + m.cie2)/50*15)
              ELSE CEIL((m.cie1 + m.cie2)/50*25) END + m.lab + m.assignment + m.\`external\`) AS total,
        CASE 
          WHEN (CASE WHEN m.is_lab = 1 THEN CEIL((m.cie1 + m.cie2)/50*15)
                     ELSE CEIL((m.cie1 + m.cie2)/50*25) END + m.lab + m.assignment) >= 20
               AND m.\`external\` >= 18
               AND (CASE WHEN m.is_lab = 1 THEN CEIL((m.cie1 + m.cie2)/50*15)
                         ELSE CEIL((m.cie1 + m.cie2)/50*25) END + m.lab + m.assignment + m.\`external\`) >= 40
          THEN 'P' ELSE 'F'
        END AS result
      FROM marks m
      JOIN subjects s ON m.subject_code = s.subject_code
      WHERE m.usn = ?`;

    const params = [usn];

    if (semester) {
      query += " AND m.semester = ?";
      params.push(semester);
    }

    const [rows] = await db.query(query, params);

    if (!rows.length) {
      return res.status(404).json({ message: "No marks found for this student and semester" });
    }

    res.json({ usn, semester, subjects: rows });
  } catch (err) {
    console.error("🔥 DB Error:", err);
    res.status(500).json({ message: "Database error", error: err.sqlMessage || err.message });
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

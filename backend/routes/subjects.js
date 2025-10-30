// routes/subjects.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all subjects by department & semester
router.get('/:department/:semester', async (req, res) => {
  const { department, semester } = req.params;
  try {
    const [rows] = await db.execute(
      'SELECT * FROM subjects WHERE department = ? AND semester = ?',
      [department, semester]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Database error' });
  }
});
// Get subjects based on semester

router.get("/api/subjects-list", async (req, res) => {
  const { semester } = req.query;
  try {
    const [rows] = await db.execute(
      `SELECT * FROM subjects WHERE semester=?`,
      [semester]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// POST assign faculty to a subject
router.post("/api/subjects/faculty", async (req, res) => {
  const { subjectCode, section, faculty_ssn } = req.body;

  if (!subjectCode || !section || !faculty_ssn)
    return res.status(400).json({ error: "Missing fields" });

  try {
    // Delete old assignment first
    await db.execute(
      `DELETE FROM subject_faculty WHERE subject_code=? AND section=?`,
      [subjectCode, section]
    );

    // Insert new assignment(s)
    const facultyList = faculty_ssn.split(",").map(f=>f.trim());
    for(const f of facultyList){
      await db.execute(
        `INSERT INTO subject_faculty (subject_code, section, faculty_id) VALUES (?,?,?)`,
        [subjectCode, section, f]
      );
    }

    res.json({ success:true });
  } catch(err){
    console.error(err);
    res.status(500).json({ error:"Database error" });
  }
});

// GET faculty assignments for a semester + section
router.get("/api/faculty", async (req, res) => {
  const { semester, section } = req.query;
  try {
    const [rows] = await db.execute(
      `SELECT s.subject_code, s.course_type, s.subject_name,
              GROUP_CONCAT(f.name) as faculty_names
       FROM subjects s
       LEFT JOIN subject_faculty sf 
              ON s.subject_code = sf.subject_code AND sf.section = ?
       LEFT JOIN faculty f 
              ON sf.faculty_id = f.ssn_id
       WHERE s.semester = ?
       GROUP BY s.subject_code`,
      [section, semester]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});


module.exports = router;

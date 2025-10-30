const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");

// ================== STUDENT LOGIN ==================
router.post("/student-login", async (req, res) => {
  const { usn, password } = req.body;
  try {
    const [results] = await db.query(
      "SELECT * FROM student WHERE TRIM(usn) = ?",
      [usn.trim()]
    );
    if (!results.length)
      return res.status(404).json({ success: false, message: "Student not found" });

    const student = results[0];
    const match = await bcrypt.compare(password, student.password);
    if (!match)
      return res.status(400).json({ success: false, message: "Invalid password" });

    req.session.user = {
      usn: student.usn.trim(),
      role: "student",
      sem: student.sem,
      section: student.section,
    };
    res.json({ success: true, redirect: "/student-home" });
  } catch {
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// ================== FACULTY LOGIN ==================
router.post("/faculty-login", async (req, res) => {
  const { ssn_id, password } = req.body;
  try {
    const [results] = await db.query(
      "SELECT * FROM faculty WHERE TRIM(ssn_id) = ?",
      [ssn_id.trim()]
    );
    if (!results.length)
      return res.status(404).json({ success: false, message: "Faculty not found" });

    const faculty = results[0];
    const match = await bcrypt.compare(password, faculty.password);
    if (!match)
      return res.status(400).json({ success: false, message: "Invalid password" });

    req.session.user = {
      ssn_id: faculty.ssn_id.trim(),
      role: "faculty",
      name: faculty.name,
    };
    res.json({ success: true, redirect: "/faculty-home" });
  } catch {
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// ================== CURRENT STUDENT INFO ==================
router.get("/current-student", (req, res) => {
  if (req.session.user && req.session.user.role === "student") {
    res.json({
      usn: req.session.user.usn,
      sem: req.session.user.sem,
      section: req.session.user.section,
    });
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
});

// ================== LOGOUT ==================
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true, message: "Logged out" });
  });
});

module.exports = router;

const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db");

// In-memory storage
const upload = multer({ storage: multer.memoryStorage() });

// ================== 🔹 Get Subjects (Faculty-Restricted) ==================
router.get("/subjects", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "faculty") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const facultyId = req.session.user.ssn_id;
    const { semester, section } = req.query;

    if (!semester || !section) {
      return res.status(400).json({ message: "Semester and Section required" });
    }

    // Only subjects handled by this faculty
    const [rows] = await db.query(
      `SELECT s.subject_code, s.subject_name
       FROM faculty_subject fs
       JOIN subjects s ON fs.subject_code = s.subject_code
       WHERE fs.faculty_id = ? AND fs.sem = ? AND fs.section = ?`,
      [facultyId, semester, section]
    );

    res.json(rows);
  } catch (err) {
    console.error("🔥 Error fetching faculty subjects:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ================== 🔹 Upload Notes (Faculty-Restricted) ==================
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "faculty") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const facultyId = req.session.user.ssn_id;
    const { semester, section, subject } = req.body;
    const file = req.file;

    if (!semester || !section || !subject || !file) {
      return res.status(400).json({ message: "All fields required" });
    }

    // Check if faculty is assigned to that subject
    const [assigned] = await db.query(
      `SELECT * FROM faculty_subject
       WHERE faculty_id = ? AND subject_code = ? AND sem = ? AND section = ?`,
      [facultyId, subject, semester, section]
    );

    if (assigned.length === 0) {
      return res.status(403).json({
        message: "You are not assigned to this subject — upload denied.",
      });
    }

    await db.query(
      `INSERT INTO notes 
       (semester, section, subject_code, file_name, file_type, file_data, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        semester,
        section,
        subject,
        file.originalname,
        file.mimetype,
        file.buffer,
        facultyId,
      ]
    );

    res.json({ message: "Note uploaded successfully!" });
  } catch (err) {
    console.error("🔥 Error uploading note:", err);
    res.status(500).json({ message: "Failed to upload note" });
  }
});

// ================== 🔹 Get Notes ==================
router.get("/", async (req, res) => {
  const { semester, section, subject } = req.query;

  if (!semester || !section || !subject) {
    return res.status(400).json({ message: "Semester, section, and subject required" });
  }

  try {
    const [rows] = await db.query(
      `SELECT id, file_name, file_type, uploaded_at 
       FROM notes 
       WHERE semester=? AND section=? AND subject_code=?`,
      [semester, section, subject]
    );
    res.json(rows);
  } catch (err) {
    console.error("🔥 Error fetching notes:", err);
    res.status(500).json({ message: "Failed to fetch notes" });
  }
});

// ================== 🔹 Download Note ==================
router.get("/:id/download", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT file_name, file_type, file_data FROM notes WHERE id=?",
      [id]
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Note not found" });

    const note = rows[0];
    res.setHeader("Content-Type", note.file_type);
    res.setHeader("Content-Disposition", `attachment; filename="${note.file_name}"`);
    res.send(note.file_data);
  } catch (err) {
    console.error("🔥 Error downloading note:", err);
    res.status(500).json({ message: "Failed to download note" });
  }
});

// ================== 🔹 Preview Note ==================
router.get("/:id/preview", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT file_name, file_type, file_data FROM notes WHERE id=?",
      [id]
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Note not found" });

    const note = rows[0];
    res.setHeader("Content-Type", note.file_type);
    res.setHeader("Content-Disposition", "inline");
    res.send(note.file_data);
  } catch (err) {
    console.error("🔥 Error previewing note:", err);
    res.status(500).json({ message: "Failed to preview note" });
  }
});

// ================== 🔹 Delete Single Note ==================
router.delete("/:id", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "faculty") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const facultyId = req.session.user.ssn_id;
    const { id } = req.params;

    // Only allow deleting notes uploaded by this faculty
    const [rows] = await db.query("SELECT uploaded_by FROM notes WHERE id=?", [id]);
    if (!rows.length) return res.status(404).json({ message: "Note not found" });

    if (rows[0].uploaded_by !== facultyId) {
      return res.status(403).json({ message: "You can delete only your own uploads." });
    }

    await db.query("DELETE FROM notes WHERE id=?", [id]);
    res.json({ message: "Note deleted successfully!" });
  } catch (err) {
    console.error("🔥 Error deleting note:", err);
    res.status(500).json({ message: "Failed to delete note" });
  }
});

// ================== 🔹 Delete All Notes (Faculty-Restricted) ==================
router.delete("/", async (req, res) => {
  const { semester, section, subject } = req.body;

  if (!semester || !section || !subject) {
    return res.status(400).json({ message: "Semester, section, and subject required" });
  }

  try {
    if (!req.session.user || req.session.user.role !== "faculty") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const facultyId = req.session.user.ssn_id;

    await db.query(
      "DELETE FROM notes WHERE semester=? AND section=? AND subject_code=? AND uploaded_by=?",
      [semester, section, subject, facultyId]
    );

    res.json({ message: "All your uploaded notes deleted successfully!" });
  } catch (err) {
    console.error("🔥 Error deleting notes:", err);
    res.status(500).json({ message: "Failed to delete notes" });
  }
});


router.get("/student-subjects", async (req, res) => {
  const { semester, section } = req.query;

  if (!semester || !section) {
    return res.status(400).json({ message: "Semester and Section required" });
  }

  try {
    const [rows] = await db.query(
      `SELECT DISTINCT s.subject_code, s.subject_name
       FROM subjects s
       JOIN notes n ON s.subject_code = n.subject_code
       WHERE n.semester=? AND n.section=?`,
      [semester, section]
    );
    res.json(rows);
  } catch (err) {
    console.error("🔥 Error fetching student subjects:", err);
    res.status(500).json({ message: "Failed to fetch subjects" });
  }
});  

// ✅ Count how many new notes (unopened) exist for a student
router.get("/student-new-count", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "student") {
      return res.status(403).json({ count: 0 });
    }

    const studentUsn = req.session.user.usn;

    const [rows] = await db.query(
      `
      SELECT COUNT(*) AS count
      FROM notes n
      LEFT JOIN note_views v ON v.note_id = n.id AND v.usn = ?
      WHERE v.id IS NULL
      `,
      [studentUsn]
    );

    res.json({ count: rows[0]?.count || 0 });
  } catch (err) {
    console.error("🔥 Error counting new notes:", err);
    res.status(500).json({ count: 0 });
  }
});


router.post("/:id/viewed", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "student") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const noteId = req.params.id;
    const studentUsn = req.session.user.usn;

    await db.query(
      `INSERT IGNORE INTO note_views (usn, note_id) VALUES (?, ?)`,
      [studentUsn, noteId]
    );

    res.json({ message: "Marked as viewed" });
  } catch (err) {
    console.error("🔥 Error marking note viewed:", err);
    res.status(500).json({ message: "Failed to mark note as viewed" });
  }
});


module.exports = router;

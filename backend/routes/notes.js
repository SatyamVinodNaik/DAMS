const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db"); // adjust path if needed

// In-memory storage for files
const upload = multer({ storage: multer.memoryStorage() });

// ================== 1️⃣ Get Subjects by Semester ==================
router.get("/subjects", async (req, res) => {
  const { semester } = req.query;
  if (!semester) return res.status(400).json({ message: "Semester required" });

  try {
    const [rows] = await db.query(
      "SELECT subject_code, subject_name FROM subjects WHERE semester=?",
      [semester]
    );
    res.json(rows);
  } catch (err) {
    console.error("🔥 Error fetching subjects:", err);
    res.status(500).json({ message: "Failed to fetch subjects" });
  }
});

// ================== 2️⃣ Upload Notes ==================
router.post("/upload", upload.single("file"), async (req, res) => {
  const { semester, section, subject } = req.body;
  const file = req.file;

  if (!semester || !section || !subject || !file) {
    return res.status(400).json({ message: "All fields required" });
  }

  try {
    await db.query(
      `INSERT INTO notes 
       (semester, section, subject_code, file_name, file_type, file_data, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [semester, section, subject, file.originalname, file.mimetype, file.buffer]
    );
    res.json({ message: "Note uploaded successfully" });
  } catch (err) {
    console.error("🔥 Error uploading note:", err);
    res.status(500).json({ message: "Failed to upload note" });
  }
});

// ================== 3️⃣ Get Notes for Semester/Section/Subject ==================
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

// ================== 4️⃣ Download Note ==================
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

// ================== 5️⃣ Preview Note ==================
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
    res.setHeader("Content-Disposition", "inline"); // preview in browser
    res.send(note.file_data);
  } catch (err) {
    console.error("🔥 Error previewing note:", err);
    res.status(500).json({ message: "Failed to preview note" });
  }
});

// ================== 6️⃣ Delete Single Note ==================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM notes WHERE id=?", [id]);
    res.json({ message: "Note deleted successfully" });
  } catch (err) {
    console.error("🔥 Error deleting note:", err);
    res.status(500).json({ message: "Failed to delete note" });
  }
});

// ================== 7️⃣ Delete All Notes for Subject ==================
router.delete("/", async (req, res) => {
  const { semester, section, subject } = req.body; // or req.query depending on frontend

  if (!semester || !section || !subject) {
    return res.status(400).json({ message: "Semester, section, and subject required" });
  }

  try {
    await db.query(
      "DELETE FROM notes WHERE semester=? AND section=? AND subject_code=?",
      [semester, section, subject]
    );
    res.json({ message: "All notes deleted successfully" });
  } catch (err) {
    console.error("🔥 Error deleting all notes:", err);
    res.status(500).json({ message: "Failed to delete notes" });
  }
});

module.exports = router;
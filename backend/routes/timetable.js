const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ---------------- CREATE UPLOAD DIRECTORY ----------------
const uploadPath = path.join(__dirname, "../uploads/timetables");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

// ---------------- MULTER CONFIG ----------------
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });


// ---------------- CHECK CLASS ADVISOR ----------------
async function getCA(ssn_id) {
    const [rows] = await db.execute(
        "SELECT sem, section FROM class_advisors WHERE faculty_id = ?",
        [ssn_id]
    );
    return rows.length ? rows[0] : null;
}


// ======================================================
// 📌 UPLOAD TIMETABLE — ONLY CLASS ADVISOR CAN UPLOAD
// ======================================================
router.post("/upload", upload.single("timetable"), async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "faculty") {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const facultyId = req.session.user.ssn_id;

        // Check if this faculty is CA
        const ca = await getCA(facultyId);
        if (!ca) {
            return res.status(403).json({ error: "Only Class Advisor can upload timetable" });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Store file path for frontend use
        const filePath = "/uploads/timetables/" + req.file.filename;

        // Insert or update timetable
        await db.execute(
            `INSERT INTO timetable (sem, section, file_path)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE file_path = VALUES(file_path)`,
            [ca.sem, ca.section, filePath]
        );

        res.json({ message: "✅ Timetable uploaded successfully!" });

    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.status(500).json({ error: "Error uploading timetable" });
    }
});


// ======================================================
// 📌 STUDENT CAN VIEW TIMETABLE BASED ON SEM & SECTION
// ======================================================
router.get("/student-view", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "student") {
            return res.status(401).json({ error: "Not logged in" });
        }

        const { sem, section } = req.session.user;

        const [rows] = await db.execute(
            "SELECT file_path FROM timetable WHERE sem = ? AND section = ?",
            [sem, section]
        );

        if (!rows.length) {
            return res.json({ error: "❌ No timetable uploaded yet for your class." });
        }

        res.json({ file: rows[0].file_path });

    } catch (err) {
        console.error("VIEW ERROR:", err);
        res.status(500).json({ error: "Error fetching timetable" });
    }
});

module.exports = router;

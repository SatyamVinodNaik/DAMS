// routes/admin.js

const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db"); 
const router = express.Router();

// Helper for async route error handling
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ================= DROPDOWN DATA =================
router.get("/subjects-list", asyncHandler(async (req, res) => {
    const { semester } = req.query;
    if (!semester) return res.status(400).json({ error: "Semester query parameter is required." });

    const [rows] = await db.execute(
        `SELECT subject_code, subject_name FROM subjects WHERE semester=?`, 
        [semester]
    );
    res.json(rows); 
}));

router.get("/faculty-list", asyncHandler(async (req, res) => {
    const [rows] = await db.execute(`SELECT ssn_id, name FROM faculty`);
    res.json(rows);
}));

// ================= STUDENT CRUD =================
router.post("/student", asyncHandler(async (req, res) => {
    const { usn, name, email, password, section, sem, phone, join_year } = req.body;

    const [existingRows] = await db.query(`SELECT * FROM student WHERE usn = ?`, [usn]);
    const existing = existingRows[0];

    if (existing) {
        // Update student
        if (password) {
            const hashed = await bcrypt.hash(password, 10);
            await db.query(
                `UPDATE student SET name=?, email=?, password=?, section=?, sem=?, phone=?, join_year=? WHERE usn=?`,
                [name, email, hashed, section, sem, phone, join_year, usn]
            );
        } else {
            await db.query(
                `UPDATE student SET name=?, email=?, section=?, sem=?, phone=?, join_year=? WHERE usn=?`,
                [name, email, section, sem, phone, join_year, usn]
            );
        }
        return res.json({ message: "Student updated successfully" });
    }

    // Insert new student
    if (!password) return res.status(400).json({ error: "Password is required for new students" });
    const hashed = await bcrypt.hash(password, 10);
    await db.query(
        `INSERT INTO student (usn, name, email, password, section, sem, phone, join_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [usn, name, email, hashed, section, sem, phone, join_year]
    );
    res.json({ message: "Student added successfully" });
}));

router.get("/student/:usn", asyncHandler(async (req, res) => {
    const [rows] = await db.query(
        `SELECT usn, name, email, section, sem, phone, join_year FROM student WHERE usn = ?`,
        [req.params.usn]
    );
    if (!rows.length) return res.status(404).json({ message: "Student not found" });
    res.json({ ...rows[0], isEdit: true });
}));

// ================= FACULTY CRUD =================
router.post("/faculty", asyncHandler(async (req, res) => {
    const { ssn_id, name, email, password, phone, position } = req.body;

    const [existingRows] = await db.query(`SELECT * FROM faculty WHERE ssn_id = ?`, [ssn_id]);
    const existing = existingRows[0];

    if (existing) {
        // Update faculty
        if (password) {
            const hashed = await bcrypt.hash(password, 10);
            await db.query(
                `UPDATE faculty SET name=?, email=?, password=?, phone=?, position=? WHERE ssn_id=?`,
                [name, email, hashed, phone, position, ssn_id]
            );
        } else {
            await db.query(
                `UPDATE faculty SET name=?, email=?, phone=?, position=? WHERE ssn_id=?`,
                [name, email, phone, position, ssn_id]
            );
        }
        return res.json({ message: "Faculty updated successfully" });
    }

    // Insert new faculty
    if (!password) return res.status(400).json({ error: "Password is required for new faculty" });
    const hashed = await bcrypt.hash(password, 10);
    await db.query(
        `INSERT INTO faculty (ssn_id, name, email, password, phone, position)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ssn_id, name, email, hashed, phone, position]
    );
    res.json({ message: "Faculty added successfully" });
}));

router.get("/faculty/:ssn", asyncHandler(async (req, res) => {
    const [rows] = await db.query(
        `SELECT ssn_id, name, email, phone, position FROM faculty WHERE ssn_id = ?`,
        [req.params.ssn]
    );
    if (!rows.length) return res.status(404).json({ message: "Faculty not found" });
    res.json({ ...rows[0], isEdit: true });
}));

// ================= DELETE STUDENT/FACULTY =================
router.delete("/:type/:id", asyncHandler(async (req, res) => {
    const { type, id } = req.params;
    if (!["student", "faculty"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const idField = type === "student" ? "usn" : "ssn_id";
    const [result] = await db.query(`DELETE FROM ${type} WHERE ${idField}=?`, [id]);

    if (result.affectedRows === 0) return res.status(404).json({ error: `${type} not found` });
    res.json({ message: `${type} deleted successfully` });
}));

// ================= ASSIGN FACULTY =================
router.post("/assign-faculty", asyncHandler(async (req, res) => {
    const { faculty_id, faculty_name, subject_code, section, sem, is_class_advisor } = req.body;

    if (!faculty_id || !faculty_name || !subject_code || !section || !sem)
        return res.status(400).json({ error: "All fields are required" });

    // Clear previous class advisor if needed
    if (is_class_advisor == 1) {
        await db.execute("UPDATE faculty_subject SET is_class_advisor = 0 WHERE section = ?", [section]);
    }

    await db.execute(
        `INSERT INTO faculty_subject (faculty_id, faculty_name, subject_code, section, sem, is_class_advisor)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           faculty_id = VALUES(faculty_id),
           faculty_name = VALUES(faculty_name),
           sem = VALUES(sem),
           is_class_advisor = VALUES(is_class_advisor)`,
        [faculty_id, faculty_name, subject_code, section, sem, is_class_advisor || 0]
    );

    res.json({ message: "✅ Faculty assignment updated successfully!" });
}));

router.get("/assigned-faculty", asyncHandler(async (req, res) => {
    const { subject_code, section } = req.query;
    if (!subject_code || !section)
        return res.status(400).json({ error: "subject_code and section are required" });

    const [rows] = await db.execute(
        `SELECT fs.*, f.name AS faculty_name, s.subject_name
         FROM faculty_subject fs
         JOIN faculty f ON fs.faculty_id = f.ssn_id
         JOIN subjects s ON fs.subject_code = s.subject_code
         WHERE fs.subject_code = ? AND fs.section = ?`,
        [subject_code, section]
    );

    if (!rows.length) return res.status(404).json({ error: "No assignment found" });
    res.json(rows[0]);
}));

// ================= CLASS ADVISOR =================
router.get("/class-advisor/:section", asyncHandler(async (req, res) => {
    const { section } = req.params;

    const [rows] = await db.execute(
        `SELECT f.name AS faculty_name
         FROM class_advisors ca 
         JOIN faculty f ON ca.faculty_id = f.ssn_id
         WHERE ca.section = ? AND ca.is_class_advisor = 1`,
        [section]
    );

    if (!rows.length) return res.status(404).json({ message: "No class advisor assigned yet for this section." });

    res.json(rows[0]);
}));

module.exports = router;

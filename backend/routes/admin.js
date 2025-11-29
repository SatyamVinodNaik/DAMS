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
        `INSERT INTO faculty_subject (faculty_id, faculty_name, subject_code, section, sem)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           faculty_id = VALUES(faculty_id),
           faculty_name = VALUES(faculty_name),
           sem = VALUES(sem)`,
        [faculty_id, faculty_name, subject_code, section, sem]
    );

    res.json({ message: "✅ Faculty assignment updated successfully!" });
}));

// ================= ASSIGN CLASS ADVISOR =================
router.post("/assign-ca", asyncHandler(async (req, res) => {
    const { faculty_id, faculty_name, sem, section } = req.body;

    if (!faculty_id || !faculty_name || !sem || !section)
        return res.status(400).json({ error: "All fields are required" });

    // Make sure only one CA per section per sem
    await db.execute(
        `INSERT INTO class_advisors (faculty_id, faculty_name, sem, section)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           faculty_id = VALUES(faculty_id),
           faculty_name = VALUES(faculty_name)`,
        [faculty_id, faculty_name, sem, section]
    );

    res.json({ message: "✅ Class Advisor assigned successfully!" });
}));

// ================= VIEW CLASS ADVISOR =================
router.get("/view-ca", asyncHandler(async (req, res) => {
    const { sem, section } = req.query;

    if (!sem || !section) {
        return res.status(400).json({ error: "Semester and Section are required" });
    }

    const [rows] = await db.execute(
        `SELECT faculty_id, faculty_name, sem, section
         FROM class_advisors
         WHERE sem = ? AND section = ?`,
        [sem, section]
    );

    if (!rows.length) {
        return res.json({ message: "❌ No Class Advisor assigned for this section yet." });
    }

    res.json(rows[0]);
}));

// ================= VIEW STUDENTS BY SEM & SECTION =================
// ================= VIEW STUDENTS BY SEM & SECTION =================
router.get("/view-students", asyncHandler(async (req, res) => {
    const { sem, section } = req.query;

    if (!sem || !section) {
        return res.status(400).json({ error: "Semester and Section are required" });
    }

    const [rows] = await db.execute(
        `SELECT usn, name, email, section, sem, phone, photo_data, photo_type
         FROM student
         WHERE sem = ? AND section = ?`,
        [sem, section]
    );

    if (!rows.length) {
        return res.json({ message: "❌ No students found for this section." });
    }

    // ✅ Convert each student's photo_data (binary) into base64
    const students = rows.map((s) => {
        let photoBase64 = null;
        if (s.photo_data && s.photo_type) {
            const base64String = Buffer.from(s.photo_data).toString("base64");
            photoBase64 = `data:${s.photo_type};base64,${base64String}`;
        }
        return {
            usn: s.usn,
            name: s.name,
            email: s.email,
            section: s.section,
            sem: s.sem,
            phone: s.phone,
            photo: photoBase64
        };
    });

    res.json(students);
}));
  
// ================= VIEW FACULTY BY SEMESTER =================
// ================= VIEW ALL FACULTY =================
router.get("/view-faculty", asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
        `SELECT ssn_id, name, email, position, phone, photo_data, photo_type
         FROM faculty`
    );

    if (!rows.length) {
        return res.json({ message: "❌ No faculty records found." });
    }

    // ✅ Convert photo_data (binary) to Base64 string
    const facultyList = rows.map((f) => {
        let photoBase64 = null;
        if (f.photo_data && f.photo_type) {
            const base64String = Buffer.from(f.photo_data).toString("base64");
            photoBase64 = `data:${f.photo_type};base64,${base64String}`;
        }

        return {
            ssn_id: f.ssn_id,
            name: f.name,
            email: f.email,
            position: f.position,
            phone: f.phone,
            photo: photoBase64
        };
    });

    res.json(facultyList);
}));

router.get("/view-all-ca", asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
        `SELECT faculty_id, faculty_name, sem, section FROM class_advisors`
    );
    res.json(rows);
}));


module.exports = router;

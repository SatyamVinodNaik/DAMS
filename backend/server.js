const express = require("express");
const path = require("path");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require("bcrypt");
const fs = require("fs");
const cors = require("cors");
const db = require("./db");
const multer = require("multer");
const bodyParser = require("body-parser");
const { transporter } = require("./mailer"); // adjust path if needed

// Routes
const marksRoutes = require("./routes/marks");
const contactRoutes = require("./routes/contact");
const passwordRoutes = require("./routes/password");
const subjectsRoutes = require("./routes/subjects");
const attendanceRoutes = require("./routes/attendance");
const notesRoutes = require("./routes/notes");
const announcementsRoutes = require("./routes/announcements");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const storage = multer.memoryStorage();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000"
    ],
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("src"));

const sessionStore = new MySQLStore({
  host: '127.0.0.1',        // use 127.0.0.1 (avoids socket issues on Windows)
  port: 3306,               // ✅ correct MySQL port
  user: 'root',
  password: '9035882709',
  database: 'department',
  clearExpired: true,
  checkExpirationInterval: 900000,  // 15 mins
  expiration: 1000 * 60 * 60 * 24 * 7, // 7 days
});

const upload = multer({ 
  storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  }
});

app.use(
  session({
    key: "connect.sid",
    secret: "supersecret",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);


// Routes
app.use("/api/marks", marksRoutes);
app.use("/contact", contactRoutes);
app.use("/api", passwordRoutes);
app.use("/api/subjects", subjectsRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api", authRoutes);
app.use("/api/admin", adminRoutes);
// Cache prevention
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Session check route
app.get("/api/session", (req, res) => {
  if (!req.session || !req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user });
});

// Auth middleware
function isAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect("/");
}

const photoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  }
});

app.use(express.static(path.join(__dirname, "../frontend")));
// Static pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "home.html"));
});
app.get("/faculty-home", isAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "../frontend", "facultyHome.html"))
);
app.get("/student-home", isAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "../frontend", "studentHome.html"))
);
app.get("/profile", (req, res) =>
  res.sendFile(path.join(__dirname, "../frontend", "profile.html"))
);

// ================= ADMIN LOGIN =================
app.post("/admin-login", async (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "admin123";

  if (username === adminUser && password === adminPass) {
    req.session.user = { role: "admin" };
    return res.redirect("/admin-panel.html");
  }
  res.status(401).json({ message: "Invalid admin credentials" });
});

// Add Student
// Add or Update Student
app.post("/api/admin/student", async (req, res) => {
  try {
    const { usn, name, email, password, section, sem, phone, join_year } = req.body;

    // Check if student already exists
    const [existing] = await db.query(`SELECT * FROM student WHERE usn = ?`, [usn]);
    if (existing.length > 0) {
      return res.json({
        message: "Student already exists",
        existing: existing[0] // send current data to pre-fill form
      });
    }

    // Insert new student
    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO student (usn, name, email, password, section, sem, phone, join_year)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [usn, name, email, hashed, section, sem, phone, join_year]
    );
    res.json({ message: "Student added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error adding student" });
  }
});

// Add or Update Faculty
app.post("/api/admin/faculty", async (req, res) => {
  try {
    const { ssn_id, name, email, password, phone, position } = req.body;

    // Check if faculty already exists
    const [existing] = await db.query(`SELECT * FROM faculty WHERE ssn_id = ?`, [ssn_id]);
    if (existing.length > 0) {
      return res.json({
        message: "Faculty already exists",
        existing: existing[0] // send current data to pre-fill form
      });
    }

    // Insert new faculty
    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO faculty (ssn_id, name, email, password, phone, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ssn_id, name, email, hashed, phone, position]
    );
    res.json({ message: "Faculty added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error adding faculty" });
  }
});


// Delete Student/Faculty
app.delete("/api/admin/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!["student", "faculty"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const idField = type === "student" ? "usn" : "ssn_id";
    const [result] = await db.query(`DELETE FROM ${type} WHERE ${idField}=?`, [id]);

    if (result.affectedRows === 0) return res.status(404).json({ error: `${type} not found` });

    res.json({ message: `${type} deleted successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error deleting record" });
  }
});

// Get student by USN
// Get student by USN (without password)
app.get("/api/admin/student/:usn", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT usn, name, email, section, sem, phone, join_year FROM student WHERE usn = ?",
      [req.params.usn]
    );
    if (!rows.length) return res.status(404).json({ message: "Student not found" });

    res.json({ ...rows[0], isEdit: true }); // add isEdit flag
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching student" });
  }
});

// Get faculty by SSN (without password)
app.get("/api/admin/faculty/:ssn", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT ssn_id, name, email, phone, position FROM faculty WHERE ssn_id = ?",
      [req.params.ssn]
    );
    if (!rows.length) return res.status(404).json({ message: "Faculty not found" });

    res.json({ ...rows[0], isEdit: true }); // add isEdit flag
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching faculty" });
  }
});

app.post("/api/timetable/upload", isAuth, upload.single("timetable"), async (req, res) => {
  try {
    if (req.session.user.role !== "faculty") {
      return res.status(403).json({ error: "Only faculty can upload timetables" });
    }

    const { semester, section } = req.body;
    if (!semester || !section || !req.file) {
      return res.status(400).json({ error: "Semester, Section and PDF file are required" });
    }

    // Insert into DB
    await db.execute(
      "INSERT INTO timetables (semester, section, file_name, file_data) VALUES (?, ?, ?, ?)",
      [semester, section, req.file.originalname, req.file.buffer]
    );

    res.json({ message: "Timetable uploaded successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get timetable PDF for a student's semester & section
// Get timetable PDF for a student's semester & section
app.get("/api/timetable/me", isAuth, async (req, res) => {
  try {
    if (req.session.user.role !== "student") {
      return res.status(403).send("Only students can access this");
    }

    // Get student info
    const [studentRows] = await db.execute(
      "SELECT sem, section FROM student WHERE usn = ?",
      [req.session.user.usn]
    );

    if (!studentRows.length) return res.status(404).send("Student not found");
    const { sem, section } = studentRows[0];

    // Get timetable
    const [rows] = await db.execute(
      "SELECT file_name, file_data FROM timetables WHERE semester=? AND section=? ORDER BY uploaded_at DESC LIMIT 1",
      [sem, section]
    );

    if (!rows.length) {
      return res
        .status(404)
        .send("<h2 style='text-align:center;margin-top:50px;color:red;'>Timetable not uploaded yet</h2>");
    }

    const timetable = rows[0];
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${timetable.file_name}"`);
    res.send(timetable.file_data);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});




// Initial DB population
/*(async () => {
  try {
    const students = JSON.parse(fs.readFileSync("student.json", "utf8"));
    for (const s of students) {
      const hashed = await bcrypt.hash(s.password, 10);
      await db.query(
        `INSERT IGNORE INTO student (usn, name, email, password, section, sem, phone, join_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.usn, s.name, s.email, hashed, s.section, s.sem, s.phone, s.join_year]
      );
    }

    const faculty = JSON.parse(fs.readFileSync("faculty.json", "utf8"));
    for (const f of faculty) {
      const hashed = await bcrypt.hash(f.password, 10);
      await db.query(
        `INSERT IGNORE INTO faculty (ssn_id, name, email, password, phone, position)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [f.ssn_id, f.name, f.email, hashed, f.phone, f.position]
      );
    }

    console.log("🎉 All data inserted successfully!");
  } catch (err) {
    console.error("❌ DB Error:", err);
  }
})();*/

// Profile API
app.get("/api/profile", isAuth, async (req, res) => {
  try {
    const role = req.session.user.role;
    const id = role === "student" ? req.session.user.usn : req.session.user.ssn_id;
    const table = role === "student" ? "student" : "faculty";
    const idField = role === "student" ? "usn" : "ssn_id";

    const [rows] = await db.query(`SELECT * FROM ${table} WHERE ${idField}=?`, [id]);
    if (!rows.length) return res.status(404).json({ error: "User not found" });

    const user = rows[0];
    let photoUrl = null;

    if (user.photo_data) {
      const buffer = Buffer.isBuffer(user.photo_data)
        ? user.photo_data
        : Buffer.from(user.photo_data, "binary");

      photoUrl = `data:${user.photo_type};base64,${buffer.toString("base64")}`;
    }

    res.json({ role, ...user, photoUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});


app.post("/api/profile-photo", isAuth, photoUpload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const role = req.session.user?.role;
    const table = role === "student" ? "student" : "faculty";
    const idField = role === "student" ? "usn" : "ssn_id";
    const id = role === "student" ? req.session.user?.usn : req.session.user?.ssn_id;

    await db.query(
      `UPDATE ${table} SET photo_data=?, photo_type=? WHERE ${idField}=?`,
      [req.file.buffer, req.file.mimetype, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Profile photo upload error:", err);
    res.status(500).json({ error: "Error uploading photo" });
  }
});

// routes/student.js (or wherever your student-facing APIs are)

// Assuming this route is accessible to the student client

// Attendance alert route
app.post("/api/attendance/alert", async (req, res) => {
  const { usn } = req.body;
  if (!usn) return res.status(400).json({ error: "USN required" });

  try {
    const [students] = await db.execute(
      "SELECT name, email FROM student WHERE usn = ?",
      [usn]
    );
    if (!students.length)
      return res.status(404).json({ error: "Student not found" });
    const student = students[0];

    const [alerts] = await db.execute(
      "SELECT last_sent FROM attendance_alerts WHERE usn = ?",
      [usn]
    );
    const now = new Date();
    if (alerts.length) {
      const lastSent = new Date(alerts[0].last_sent);
      const diffDays = (now - lastSent) / (1000 * 60 * 60 * 24);
      if (diffDays < 15) {
        return res.json({ success: true, message: "Alert already sent recently." });
      }
    }

    const [rows] = await db.execute(
      `
      SELECT s.subject_name,
             SUM(a.hours) AS total_hours,
             SUM(CASE WHEN a.status='Present' THEN a.hours ELSE 0 END) AS attended_hours
      FROM attendance a
      JOIN subjects s ON a.subject_code = s.subject_code
      WHERE a.usn = ?
      GROUP BY a.subject_code
      HAVING (attended_hours / total_hours) * 100 < 75
      `,
      [usn]
    );

    if (!rows.length) {
      return res.json({ success: true, message: "No subjects below 75%" });
    }

    let subjectList = rows.map((r) => {
      const percentage = ((r.attended_hours / r.total_hours) * 100).toFixed(0);
      return `${r.subject_name} (${percentage}%)`;
    });

    const emailText = `Hello ${student.name},\n\nYour attendance is below 75% in the following subjects:\n${subjectList.join(
      "\n"
    )}\n\nPlease take necessary action.\n\nRegards,\nCSE Department`;

    const emailHtml = `<p>Hello <strong>${student.name}</strong>,</p>
      <p>Your attendance is below 75% in the following subjects:</p>
      <ul>${rows
        .map(
          (r) =>
            `<li>${r.subject_name} - <strong>${(
              (r.attended_hours / r.total_hours) *
              100
            ).toFixed(0)}%</strong></li>`
        )
        .join("")}</ul>
      <p>Please take necessary action.</p>
      <p>Regards,<br/>CSE Department</p>`;

    await transporter.sendMail({
      to: student.email,
      subject: "⚠️ Attendance Shortage Alert",
      text: emailText,
      html: emailHtml,
    });

    if (alerts.length) {
      await db.execute("UPDATE attendance_alerts SET last_sent = ? WHERE usn = ?", [
        now,
        usn,
      ]);
    } else {
      await db.execute(
        "INSERT INTO attendance_alerts (usn, last_sent) VALUES (?, ?)",
        [usn, now]
      );
    }

    res.json({ success: true, message: "Attendance alert sent" });
  } catch (err) {
    console.error("Error sending attendance alert:", err);
    res.status(500).json({ error: "Failed to send alert" });
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start Server
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);

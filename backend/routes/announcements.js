const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db");
const sgMail = require("@sendgrid/mail");
const { isAuth } = require("../middleware/auth");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Use in-memory storage for small attachments
const upload = multer({ storage: multer.memoryStorage() });

const BATCH_SIZE = 100;

// ===================================================
// 1️⃣ CREATE ANNOUNCEMENT
// ===================================================
router.post("/", isAuth, upload.single("file"), async (req, res) => {
  try {
    console.log("📩 Incoming announcement data:", req.body);

    let { title, message, type, is_marquee } = req.body;

    // Convert checkbox value
    const marqueeFlag = is_marquee === "true" || is_marquee === "on";

    // Validate required fields
    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    // Ensure valid type
    const validTypes = ["Placement", "Result", "Events", "Alerts", "General"];
    type = validTypes.includes(type) ? type : "General";

    const faculty_id = req.user?.name || req.user?.id || "Faculty";
    const file_type = req.file?.mimetype || null;
    const file_data = req.file?.buffer || null;

    // 🟡 Ensure only one marquee is active at a time
    if (marqueeFlag) {
      await db.execute("UPDATE announcements SET is_marquee = 0");
    }

    // 💾 Save announcement in DB
    await db.execute(
      `INSERT INTO announcements 
        (title, message, faculty_id, type, file_type, file_data, is_marquee, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [title, message, faculty_id, type, file_type, file_data, marqueeFlag ? 1 : 0]
    );

    console.log("✅ Announcement saved successfully.");

    // 🔔 Send emails
    const [students] = await db.execute(
      "SELECT email FROM student WHERE email LIKE '%@gmail.com'"
    );

    const allEmails = students
      .map((s) => s.email)
      .filter((email) => email && email.includes("@"));

    if (allEmails.length > 0) {
      console.log(`📨 Sending to ${allEmails.length} recipients in batches...`);

      for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
        const batch = allEmails.slice(i, i + BATCH_SIZE);

        const msg = {
          from: { name: "Dept Announcements", email: "dams.project25@gmail.com" },
          bcc: batch,
          subject: `📢 New Announcement: ${title}`,
          text: `${message}\n\n- ${faculty_id}`,
          attachments: file_data
            ? [
                {
                  filename: `${title}${
                    file_type === "application/pdf" ? ".pdf" : ""
                  }`,
                  content: file_data.toString("base64"),
                  type: file_type || "application/octet-stream",
                  disposition: "attachment",
                },
              ]
            : [],
        };

        try {
          await sgMail.send(msg);
          console.log(`✅ Email batch ${i / BATCH_SIZE + 1} sent successfully`);
        } catch (err) {
          console.error("❌ SendGrid Error:", err.response?.body || err);
        }
      }
    } else {
      console.log("⚠️ No valid student emails found, skipping email send.");
    }

    res.json({ message: "Announcement created successfully!" });
  } catch (err) {
    console.error("🔥 Error creating announcement:", err);
    res.status(500).json({ error: err.message || "Database or email error" });
  }
});

// ===================================================
// 2️⃣ FETCH ALL ANNOUNCEMENTS
// ===================================================
router.get("/", isAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, title, message, faculty_id, type, file_type, is_marquee, created_at
       FROM announcements
       ORDER BY created_at DESC`
    );

    const announcements = rows.map((r) => ({
      ...r,
      file_url: r.file_type ? `/api/announcements/${r.id}/file` : null,
      is_marquee: !!r.is_marquee, // Ensure boolean
    }));

    res.json(announcements);
  } catch (err) {
    console.error("🔥 Error fetching announcements:", err);
    res.status(500).json({ error: err.message || "Database error" });
  }
});

// ===================================================
// 3️⃣ SERVE FILE BY ID
// ===================================================
router.get("/:id/file", isAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(
      "SELECT file_type, file_data FROM announcements WHERE id=?",
      [id]
    );

    if (!rows.length) return res.status(404).send("File not found");

    res.setHeader("Content-Type", rows[0].file_type || "application/octet-stream");
    res.send(rows[0].file_data);
  } catch (err) {
    console.error("🔥 Error serving file:", err);
    res.status(500).json({ error: err.message || "Error loading file" });
  }
});

module.exports = router;

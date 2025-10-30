const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db"); // adjust if db connection is elsewhere
const { isAuth } = require("../middleware/auth");
const sgMail = require("@sendgrid/mail");

const router = express.Router();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// In-memory OTP store
let otpStore = {};

// ================== CHANGE PASSWORD ==================
router.post("/change-password", isAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword)
      return res.status(400).json({ message: "All fields required" });

    const role = req.session.user.role;
    const id = role === "student" ? req.session.user.usn : req.session.user.ssn_id;
    const table = role === "student" ? "student" : "faculty";
    const idField = role === "student" ? "usn" : "ssn_id";

    const [rows] = await db.query(`SELECT * FROM ${table} WHERE ${idField}=?`, [id]);
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(oldPassword, rows[0].password);
    if (!match) return res.status(400).json({ message: "Old password incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query(`UPDATE ${table} SET password=? WHERE ${idField}=?`, [hashed, id]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
// ================== FORGOT PASSWORD (SEND OTP) ==================
router.post("/forgot-password", async (req, res) => {
  const email = req.body.email?.trim();
  if (!email) return res.status(400).json({ message: "Email required" });

  try {
    // Check if email exists in students or faculty
    let [rows] = await db.query("SELECT * FROM student WHERE email=?", [email]);
    if (!rows.length) [rows] = await db.query("SELECT * FROM faculty WHERE email=?", [email]);
    if (!rows.length) return res.status(404).json({ message: "Email not registered" });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expires: Date.now() + 300000 }; // valid 5 minutes

    // Send OTP email
    const msg = {
      to: email,
      from: process.env.FROM_EMAIL, // verified sender
      subject: "Password Reset OTP",
      text: `Your OTP is: ${otp} (valid for 5 minutes)`,
      html: `<p>Your OTP is: <b>${otp}</b> (valid for 5 minutes)</p>`,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ OTP sent to ${email}`);
      res.json({ message: "OTP sent to email " });
    } catch (error) {
      console.error("❌ SendGrid error:", error.response ? error.response.body : error);
      res.status(500).json({ message: "Failed to send OTP email" });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================== RESET PASSWORD ==================
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    const stored = otpStore[email];
    if (!stored) return res.status(400).json({ message: "OTP not requested" });
    if (Date.now() > stored.expires) return res.status(400).json({ message: "OTP expired" });
    if (stored.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });

    // Hash new password
    const hashed = await bcrypt.hash(newPassword, 10);

    // Update password in student table; if no row affected, try faculty
    let [result] = await db.query("UPDATE student SET password=? WHERE email=?", [hashed, email]);
    if (!result.affectedRows) {
      [result] = await db.query("UPDATE faculty SET password=? WHERE email=?", [hashed, email]);
    }

    // Clear OTP
    delete otpStore[email];

    res.json({ message: "Password reset successful" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router; 
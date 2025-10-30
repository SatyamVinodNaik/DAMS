// routes/contact.js
const express = require("express");
const sgMail = require("@sendgrid/mail");

const router = express.Router();

// Set SendGrid API key from Railway environment variable
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// POST /contact
router.post("/", async (req, res) => {
  const { email, message } = req.body;

  if (!email || !message) {
    return res.status(400).json({ error: "Email and message are required" });
  }

  // Prepare email
  const msg = {
    to: process.env.TO_EMAIL || "dams.project25@gmail.com", // admin inbox
    from: { email: process.env.FROM_EMAIL, name: "CSE Department Website" },
    replyTo: email,
    subject: `📩 New Contact Message from ${email}`,
    text: `Email: ${email}\n\nMessage:\n${message}`,
  };

  try {
    const response = await sgMail.send(msg);
    console.log("✅ Email sent:", response[0].statusCode);
    res.json({ success: true, message: "Message sent successfully!" });
  } catch (error) {
    // Log full SendGrid error
    if (error.response) {
      console.error("❌ SendGrid Error Body:", error.response.body);
    } else {
      console.error("❌ SendGrid Error:", error);
    }
    res.status(500).json({ error: "Failed to send message. Check server logs." });
  }
});

module.exports = router;

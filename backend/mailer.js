const sgMail = require("@sendgrid/mail");
require("dotenv").config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const transporter = {
  async sendMail({ to, subject, text, html }) {
    try {
      const msg = {
        to,
        from: "dams.project25@gmail.com", // ✅ Verified sender email only
        subject,
        text,
        html,
      };

      const [response] = await sgMail.send(msg);
      console.log("✅ Email sent:", response.statusCode);
      return response;
    } catch (error) {
      console.error("❌ SendGrid Error:", error);
      throw error;
    }
  },
};

module.exports = { transporter };

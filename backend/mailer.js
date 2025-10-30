const sgMail = require("@sendgrid/mail");
require('dotenv').config();


// set API key (store in .env)
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const transporter = {
  async sendMail({ to, subject, text, html }) {
    try {
      const msg = {
        to, // recipient email
        from: { email: process.env.FROM_EMAIL, name: "CSE Department" },

        subject,
        text,
        html,
      };

      const response = await sgMail.send(msg);
      console.log("✅ Email sent:", response[0].statusCode);
      return response;
    } catch (error) {
      console.error("❌ Error sending email:", error);
      throw error;
    }
  },
};

module.exports = { transporter };

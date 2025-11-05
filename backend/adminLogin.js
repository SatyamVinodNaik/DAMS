// Temporary script (run once in Node.js console)
const bcrypt = require("bcrypt");
const db = require("./db");

(async () => {
  const admins = [
    { name: "Venki", email: "venkateshsgounskar@gmail.com", password: "admin@123" },
    { name: "Venkatesh", email: "gounskarvs18@gmail.com", password: "admin@123" }
  ];

  for (const a of admins) {
    const hash = await bcrypt.hash(a.password, 10);
    await db.query("INSERT IGNORE INTO admins (name, email, password) VALUES (?, ?, ?)", [a.name, a.email, hash]);
  }

  console.log("✅ Admins inserted!");
})();

const db = require("../db");

function listBorrowers() {
  return db.prepare("SELECT * FROM borrowers ORDER BY id DESC").all();
}

function createBorrower(name, phone) {
  if (!name || !phone) throw new Error("Borrower name and phone are required");
  const result = db.prepare("INSERT INTO borrowers(name,phone) VALUES (?,?)").run(name.trim(), phone.trim());
  return db.prepare("SELECT * FROM borrowers WHERE id=?").get(result.lastInsertRowid);
}

function seedBorrowers(count = 10) {
  const insert = db.prepare("INSERT OR IGNORE INTO borrowers(name,phone) VALUES (?,?)");
  const tx = db.transaction(() => {
    for (let i = 1; i <= count; i++) insert.run(`Borrower ${i}`, `+9100000${String(i).padStart(5,"0")}`);
  });
  tx();
}

module.exports = { listBorrowers, createBorrower, seedBorrowers };

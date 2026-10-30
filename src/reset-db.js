const db = require("./db");
db.exec("DELETE FROM provider_events; DELETE FROM metrics; DELETE FROM calls; DELETE FROM borrowers; DELETE FROM agents; DELETE FROM sqlite_sequence;");
console.log("Database reset.");

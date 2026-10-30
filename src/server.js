const express = require("express");
const cors = require("cors");
const path = require("node:path");
require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use("/api", require("./routes/api"));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(PORT, () => console.log(`SmartDialer running at http://localhost:${PORT}`));
}
module.exports = app;

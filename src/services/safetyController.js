
const db = require("../db");

function evaluateDialRequest(requestedCount, available, queued) {
  const approved = Math.min(requestedCount, available, queued);

  let decision = "APPROVE";
  if (approved === 0 && requestedCount > 0) {
    decision = "REJECT";
  } else if (approved < requestedCount) {
    decision = "REDUCE";
  }

  return { requestedCount, approved, available, queued, decision };
}

// Standalone safety check, retained for existing tests and API compatibility.
function approveDialRequest(requestedCount) {
  if (!Number.isInteger(requestedCount) || requestedCount < 0) {
    throw new Error("requestedCount must be a non-negative integer");
  }

  const tx = db.transaction(() => {
    const available = db.prepare(
      "SELECT COUNT(*) AS n FROM agents WHERE state='AVAILABLE'"
    ).get().n;

    const queued = db.prepare(
      "SELECT COUNT(*) AS n FROM borrowers WHERE status='QUEUED'"
    ).get().n;

    const result = evaluateDialRequest(requestedCount, available, queued);

    db.prepare(
      "INSERT INTO metrics(event_type,detail) VALUES ('SAFETY_DECISION',?)"
    ).run(JSON.stringify(result));

    return result;
  });

  return tx();
}

module.exports = {
  approveDialRequest,
  evaluateDialRequest
};

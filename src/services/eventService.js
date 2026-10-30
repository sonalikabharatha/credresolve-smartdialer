
const db = require("../db");
const { CALL_TRANSITIONS } = require("../domain/states");

const EVENT_TO_STATUS = {
  RINGING: "RINGING",
  ANSWERED: "ANSWERED",
  CONNECTED: "CONNECTED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  NO_ANSWER: "FAILED"
};

function applyProviderEvent({ eventId, callId, type }) {
  if (
    typeof eventId !== "string" ||
    !eventId.trim() ||
    !Number.isInteger(Number(callId)) ||
    Number(callId) <= 0 ||
    !Object.hasOwn(EVENT_TO_STATUS, type)
  ) {
    throw new Error("Invalid provider event");
  }

  const tx = db.transaction(() => {
    // 1. Ignore duplicate events.
    const existing = db.prepare(
      "SELECT id FROM provider_events WHERE event_id=?"
    ).get(eventId);

    if (existing) {
      return { duplicate: true, applied: false };
    }

    // 2. Find the call.
    const call = db.prepare(
      "SELECT * FROM calls WHERE id=?"
    ).get(Number(callId));

    if (!call) {
      throw new Error("Call not found");
    }

    // 3. Validate the call state transition.
    const next = EVENT_TO_STATUS[type];
    const allowed = CALL_TRANSITIONS[call.status];

    if (!allowed || !allowed.has(next)) {
      db.prepare(`
        INSERT INTO provider_events(event_id, call_id, event_type)
        VALUES (?, ?, ?)
      `).run(eventId, callId, type);

      db.prepare(`
        INSERT INTO metrics(event_type, detail)
        VALUES ('IGNORED_EVENT', ?)
      `).run(`Ignored ${type} for call ${callId} in ${call.status}`);

      return {
        duplicate: false,
        applied: false,
        reason: "Out-of-order or invalid transition",
        call
      };
    }

    // 4. Update agent state only if it still owns this call.
    if (next === "ANSWERED" || next === "CONNECTED") {
      const agentUpdate = db.prepare(`
        UPDATE agents
        SET state='CONNECTED',
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?
          AND current_call_id=?
          AND state IN ('RESERVED', 'DIALING', 'CONNECTED')
      `).run(call.agent_id, call.id);

      if (agentUpdate.changes !== 1) {
        throw new Error("Agent is not assigned to this active call");
      }
    }

    // 5. Release the agent after a terminal event.
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(next)) {
      const agentUpdate = db.prepare(`
        UPDATE agents
        SET state='WRAP_UP',
            current_call_id=NULL,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?
          AND current_call_id=?
          AND state IN ('DIALING', 'CONNECTED')
      `).run(call.agent_id, call.id);

      if (agentUpdate.changes !== 1) {
        throw new Error("Cannot release agent: active call assignment mismatch");
      }

      const borrowerStatus =
        next === "COMPLETED" ? "COMPLETED" : "QUEUED";

      db.prepare(`
        UPDATE borrowers
        SET status=?
        WHERE id=?
      `).run(borrowerStatus, call.borrower_id);
    }

    // 6. Update call status.
    db.prepare(`
      UPDATE calls
      SET status=?,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(next, call.id);

    // 7. Record successfully processed event.
    db.prepare(`
      INSERT INTO provider_events(event_id, call_id, event_type)
      VALUES (?, ?, ?)
    `).run(eventId, callId, type);

    return {
      duplicate: false,
      applied: true,
      status: next
    };
  });

  return tx();
}

module.exports = { applyProviderEvent };

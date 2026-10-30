
const db = require("../db");
const { randomUUID } = require("node:crypto");
const ProviderA = require("../providers/providerA");
const ProviderB = require("../providers/providerB");
const { applyProviderEvent } = require("./eventService");
const { evaluateDialRequest } = require("./safetyController");

const providers = {
  A: new ProviderA(),
  B: new ProviderB()
};

function reserveCalls(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Call count must be a non-negative integer");
  }

  const tx = db.transaction(() => {
    // All safety checks and reservations happen in this transaction.
    const available = db.prepare(
      "SELECT COUNT(*) AS n FROM agents WHERE state='AVAILABLE'"
    ).get().n;

    const queued = db.prepare(
      "SELECT COUNT(*) AS n FROM borrowers WHERE status='QUEUED'"
    ).get().n;

    const decision = evaluateDialRequest(count, available, queued);

    db.prepare(
      "INSERT INTO metrics(event_type,detail) VALUES ('SAFETY_DECISION',?)"
    ).run(JSON.stringify(decision));

    if (decision.approved === 0) {
      return { decision, calls: [] };
    }

    const agents = db.prepare(
      "SELECT * FROM agents WHERE state='AVAILABLE' ORDER BY id LIMIT ?"
    ).all(decision.approved);

    const borrowers = db.prepare(
      "SELECT * FROM borrowers WHERE status='QUEUED' ORDER BY id LIMIT ?"
    ).all(decision.approved);

    if (
      agents.length !== decision.approved ||
      borrowers.length !== decision.approved
    ) {
      throw new Error("Resource availability changed during reservation");
    }

    const calls = [];

    for (let i = 0; i < decision.approved; i++) {
      const key = randomUUID();
      const provider = i % 2 === 0 ? "A" : "B";

      const result = db.prepare(`
        INSERT INTO calls
          (borrower_id, agent_id, provider, status, idempotency_key)
        VALUES (?, ?, ?, 'RESERVED', ?)
      `).run(borrowers[i].id, agents[i].id, provider, key);

      const callId = Number(result.lastInsertRowid);

      const agentUpdate = db.prepare(`
        UPDATE agents
        SET state='RESERVED',
            current_call_id=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND state='AVAILABLE'
      `).run(callId, agents[i].id);

      if (agentUpdate.changes !== 1) {
        throw new Error("Agent reservation failed");
      }

      const borrowerUpdate = db.prepare(`
        UPDATE borrowers
        SET status='RESERVED'
        WHERE id=? AND status='QUEUED'
      `).run(borrowers[i].id);

      if (borrowerUpdate.changes !== 1) {
        throw new Error("Borrower reservation failed");
      }

      calls.push(
        db.prepare("SELECT * FROM calls WHERE id=?").get(callId)
      );
    }

    return { decision, calls };
  });

  return tx();
}


async function initiateReservedCall(call) {
  const provider = providers[call.provider];

  try {
    const initiation = db.prepare(`
      UPDATE calls
      SET status='INITIATED', updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='RESERVED'
    `).run(call.id);

    if (initiation.changes !== 1) {
      throw new Error("Call is no longer in RESERVED state");
    }

    const agentUpdate = db.prepare(`
      UPDATE agents
      SET state='DIALING', updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND current_call_id=? AND state='RESERVED'
    `).run(call.agent_id, call.id);

    if (agentUpdate.changes !== 1) {
      throw new Error("Agent is no longer reserved for this call");
    }

    const result = await provider.initiateCall(call);

    db.prepare(`
      UPDATE calls
      SET provider_call_id=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(result.providerCallId, call.id);

    // Use simulated events when the provider supplies them.
    // Otherwise, use the provider's initial event.
    const events = result.simulatedEvents || [
      {
        eventId: `${result.providerCallId}-ringing`,
        type: result.initialEvent
      }
    ];

    for (const event of events) {
      applyProviderEvent({
        eventId: event.eventId,
        callId: call.id,
        type: event.type
      });
    }

    return {
      callId: call.id,
      success: true,
      providerCallId: result.providerCallId
    };

  } catch (error) {
    applyProviderEvent({
      eventId: `failure-${call.id}-${randomUUID()}`,
      callId: call.id,
      type: "FAILED"
    });

    return {
      callId: call.id,
      success: false,
      error: error.message
    };
  }
}

async function dial(requestedCount) {
  const reserved = reserveCalls(requestedCount);

  const outcomes = await Promise.all(
    reserved.calls.map(initiateReservedCall)
  );

  return {
    decision: reserved.decision,
    calls: outcomes
  };
}


function recoverStaleCalls() {
  const tx = db.transaction(() => {
    const staleCalls = db.prepare(`
      SELECT * FROM calls
      WHERE status = 'RESERVED'
        AND updated_at < datetime('now', '-1 minute')
    `).all();

    const recovered = [];

    for (const call of staleCalls) {
      const result = db.prepare(`
        UPDATE calls
        SET status = 'FAILED',
            failure_reason = 'Worker interrupted before provider initiation',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'RESERVED'
      `).run(call.id);

      if (result.changes !== 1) continue;

      db.prepare(`
        UPDATE agents
        SET state = 'AVAILABLE',
            current_call_id = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND current_call_id = ?
          AND state = 'RESERVED'
      `).run(call.agent_id, call.id);

      db.prepare(`
        UPDATE borrowers
        SET status = 'QUEUED'
        WHERE id = ? AND status = 'RESERVED'
      `).run(call.borrower_id);

      recovered.push(call.id);
    }

    if (recovered.length > 0) {
      db.prepare(`
        INSERT INTO metrics(event_type, detail)
        VALUES ('WORKER_RECOVERY', ?)
      `).run(JSON.stringify({ recoveredCallIds: recovered }));
    }

    return recovered;
  });

  return tx();
}

module.exports = {
  dial,
  reserveCalls,
  initiateReservedCall,
  recoverStaleCalls,
  providers
};

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Use a separate database for automated tests
process.env.DB_FILE = path.join(__dirname, "../data/test-smartdialer.db");

const db = require("../src/db");
const { createAgent } = require("../src/services/agentService");
const { createBorrower } = require("../src/services/borrowerService");
const { reserveCalls } = require("../src/services/dialerService");
const { applyProviderEvent } = require("../src/services/eventService");
const { approveDialRequest } = require("../src/services/safetyController");
const ProviderB = require("../src/providers/providerB");
const dialer = require("../src/services/dialerService");

function clean() {
  db.exec("DELETE FROM provider_events; DELETE FROM metrics; DELETE FROM calls; DELETE FROM borrowers; DELETE FROM agents;");
}

test("safety controller caps requested calls to available agents", () => {
  clean(); createAgent("A1"); createAgent("A2");
  createBorrower("B1","+1001"); createBorrower("B2","+1002"); createBorrower("B3","+1003");
  const result = approveDialRequest(3);
  assert.equal(result.approved,2);
  assert.equal(result.decision,"REDUCE");
});

test("reservation creates no more live calls than available agents", () => {
  clean(); createAgent("A1"); createAgent("A2");
  createBorrower("B1","+2001"); createBorrower("B2","+2002"); createBorrower("B3","+2003");
  const result = reserveCalls(3);
  assert.equal(result.calls.length,2);
  const live = db.prepare("SELECT COUNT(*) n FROM calls WHERE status IN ('RESERVED','INITIATED','RINGING','ANSWERED','CONNECTED')").get().n;
  const busy = db.prepare("SELECT COUNT(*) n FROM agents WHERE state IN ('RESERVED','DIALING','CONNECTED')").get().n;
  assert.ok(live <= busy);
});

test("duplicate provider events are idempotent", () => {
  clean(); createAgent("A1"); createBorrower("B1","+3001");
  const call = reserveCalls(1).calls[0];
  db.prepare("UPDATE calls SET status='INITIATED' WHERE id=?").run(call.id);
  const first = applyProviderEvent({eventId:"evt-1",callId:call.id,type:"RINGING"});
  const second = applyProviderEvent({eventId:"evt-1",callId:call.id,type:"RINGING"});
  assert.equal(first.applied,true);
  assert.equal(second.duplicate,true);
});

test("out-of-order event is recorded but does not regress state", () => {
  clean(); createAgent("A1"); createBorrower("B1","+4001");
  const call = reserveCalls(1).calls[0];
  db.prepare("UPDATE calls SET status='INITIATED' WHERE id=?").run(call.id);
  applyProviderEvent({eventId:"evt-ring",callId:call.id,type:"RINGING"});
  const result = applyProviderEvent({eventId:"evt-late-init",callId:call.id,type:"COMPLETED"});
  assert.equal(result.applied,false);
  assert.equal(db.prepare("SELECT status FROM calls WHERE id=?").get(call.id).status,"RINGING");
});



test("Provider B simulates duplicate events", async () => {
  const provider = new ProviderB({
    timeoutRate: 0,
    duplicateRate: 1,
    outOfOrderRate: 0,
    delayMs: 1
  });

  const result = await provider.initiateCall({ id: 1 });

  const events = result.simulatedEvents;
  assert.equal(events.length, 3);
  assert.equal(events[1].eventId, events[2].eventId);
});

test("Provider B simulates out-of-order events", async () => {
  const provider = new ProviderB({
    timeoutRate: 0,
    duplicateRate: 0,
    outOfOrderRate: 1,
    delayMs: 1
  });

  const result = await provider.initiateCall({ id: 1 });

  assert.equal(result.simulatedEvents[0].type, "ANSWERED");
  assert.equal(result.simulatedEvents[1].type, "RINGING");
});

test("Provider B simulates provider timeout", async () => {
  const provider = new ProviderB({
    timeoutRate: 1,
    delayMs: 1
  });

  await assert.rejects(
    provider.initiateCall({ id: 1 }),
    /Provider B timeout/
  );
});


test("Provider B timeout fails the call and releases the agent", async () => {
  clean();

  createAgent("Agent 1");
  createAgent("Agent 2");

  createBorrower("Borrower 1", "+91000009998");
  createBorrower("Borrower 2", "+91000009999");

  const originalTimeoutRate = dialer.providers.B.timeoutRate;

  try {
    dialer.providers.B.timeoutRate = 1;

    await dialer.dial(2);

    const failedCall = db.prepare(
      "SELECT * FROM calls WHERE provider='B' ORDER BY id DESC LIMIT 1"
    ).get();

    assert.ok(failedCall);
    assert.equal(failedCall.status, "FAILED");

    const agent = db.prepare(
      "SELECT * FROM agents WHERE id=?"
    ).get(failedCall.agent_id);

    assert.equal(agent.state, "WRAP_UP");
    assert.equal(agent.current_call_id, null);

    const borrower = db.prepare(
      "SELECT * FROM borrowers WHERE id=?"
    ).get(failedCall.borrower_id);

    assert.equal(borrower.status, "QUEUED");

  } finally {
    dialer.providers.B.timeoutRate = originalTimeoutRate;
  }
});


test("worker recovery releases stale reserved calls", () => {
  clean();

  createAgent("Recovery Agent");
  createBorrower("Recovery Borrower", "+91000008888");

  const call = reserveCalls(1).calls[0];

  // Simulate a worker crash by making the reservation stale.
  db.prepare(`
    UPDATE calls
    SET updated_at = datetime('now', '-2 minutes')
    WHERE id = ?
  `).run(call.id);

  const recovered = dialer.recoverStaleCalls();

  assert.ok(recovered.includes(call.id));

  const updatedCall = db.prepare(
    "SELECT status FROM calls WHERE id=?"
  ).get(call.id);

  const agent = db.prepare(
    "SELECT state, current_call_id FROM agents WHERE id=?"
  ).get(call.agent_id);

  const borrower = db.prepare(
    "SELECT status FROM borrowers WHERE id=?"
  ).get(call.borrower_id);

  assert.equal(updatedCall.status, "FAILED");
  assert.equal(agent.state, "AVAILABLE");
  assert.equal(agent.current_call_id, null);
  assert.equal(borrower.status, "QUEUED");
});

const db = require("./db");
const agents = require("./services/agentService");
const borrowers = require("./services/borrowerService");
const { dial } = require("./services/dialerService");

async function main() {
  const agentCount = Number(process.argv[2] || 50);
  const borrowerCount = Number(process.argv[3] || 500);
  if (db.prepare("SELECT COUNT(*) n FROM agents").get().n === 0) {
    for (let i=1;i<=agentCount;i++) agents.createAgent(`Load Agent ${i}`);
  }
  borrowers.seedBorrowers(borrowerCount);
  const start = Date.now();
  const result = await dial(agentCount * 2);
  const elapsed = Date.now() - start;
  const live = db.prepare("SELECT COUNT(*) n FROM calls WHERE status IN ('RESERVED','INITIATED','RINGING','ANSWERED','CONNECTED')").get().n;
  const busy = db.prepare("SELECT COUNT(*) n FROM agents WHERE state IN ('RESERVED','DIALING','CONNECTED')").get().n;
  console.log({ requested: agentCount*2, approved: result.decision.approved, outcomes: result.calls.length, elapsedMs: elapsed, liveCalls: live, busyAgents: busy, safetyInvariant: live <= busy });
}
main().catch(err => { console.error(err); process.exitCode=1; });

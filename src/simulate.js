const db = require("./db");
const agents = require("./services/agentService");
const borrowers = require("./services/borrowerService");
const { calculateRecommendedCalls } = require("./services/pacingEngine");
const { dial } = require("./services/dialerService");
const { applyProviderEvent } = require("./services/eventService");

async function main() {
  if (db.prepare("SELECT COUNT(*) n FROM agents").get().n === 0) {
    for (let i=1;i<=8;i++) agents.createAgent(`Simulation Agent ${i}`);
  }
  borrowers.seedBorrowers(40);

  for (const scenario of [
    { name: "A: low answer rate", answerRate: 0.20, avgTalkTimeSec: 120 },
    { name: "B: medium answer rate", answerRate: 0.50, avgTalkTimeSec: 90 },
    { name: "C: high answer rate", answerRate: 0.70, avgTalkTimeSec: 180 }
  ]) {
    const proposal = calculateRecommendedCalls(scenario);
    const result = await dial(proposal.recommended);
    console.log(`\n${scenario.name}`);
    console.log("Pacing:", proposal);
    console.log("Safety:", result.decision);
    for (const call of result.calls) {
      if (call.success) {
        applyProviderEvent({ eventId: `answer-${call.callId}`, callId: call.callId, type: "ANSWERED" });
        applyProviderEvent({ eventId: `connect-${call.callId}`, callId: call.callId, type: "CONNECTED" });
        applyProviderEvent({ eventId: `complete-${call.callId}`, callId: call.callId, type: "COMPLETED" });
      }
    }
        // Make agents available for the next simulation scenario
    db.prepare(`
      UPDATE agents
      SET state = 'AVAILABLE',
          current_call_id = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE state = 'WRAP_UP'
    `).run();
  }
  console.log("\nSimulation complete. Open the dashboard to inspect metrics.");
}
main().catch(err => { console.error(err); process.exitCode=1; });

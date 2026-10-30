const db = require("../db");

/*
 * Simple, explainable pacing heuristic. It proposes a count; it never places calls.
 * SafetyController independently approves/reduces/rejects the proposal.
 */
function calculateRecommendedCalls({ answerRate = 0.35, avgTalkTimeSec = 120, setupTimeSec = 5 } = {}) {
  if (!(answerRate > 0 && answerRate <= 1)) throw new Error("answerRate must be in (0, 1]");
  if (!(avgTalkTimeSec > 0) || !(setupTimeSec >= 0)) throw new Error("Invalid timing inputs");

  const available = db.prepare("SELECT COUNT(*) AS n FROM agents WHERE state='AVAILABLE'").get().n;
  const ringing = db.prepare("SELECT COUNT(*) AS n FROM calls WHERE status IN ('INITIATED','RINGING')").get().n;
  const connected = db.prepare("SELECT COUNT(*) AS n FROM calls WHERE status IN ('ANSWERED','CONNECTED')").get().n;
  const queued = db.prepare("SELECT COUNT(*) AS n FROM borrowers WHERE status='QUEUED'").get().n;

  // Expected answered calls during setup window; cap proposal to current idle capacity.
  const setupFraction = Math.min(1, setupTimeSec / avgTalkTimeSec);
  const expectedNearTermFreed = Math.floor(connected * setupFraction * 0.15);
  const rawProposal = Math.ceil((available + expectedNearTermFreed) / answerRate) - ringing;
  const recommended = Math.max(0, Math.min(queued, rawProposal));
  return {
    recommended,
    inputs: { answerRate, avgTalkTimeSec, setupTimeSec },
    observed: { available, ringing, connected, queued },
    explanation: `Proposed ${recommended} call(s): estimated answer rate ${(answerRate * 100).toFixed(0)}%, ${available} currently available agent(s), ${ringing} call(s) ringing.`
  };
}
module.exports = { calculateRecommendedCalls };

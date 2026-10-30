const db = require("../db");

function getMetrics() {
  const count = (sql) => db.prepare(sql).get().n;
  const totalAgents = count("SELECT COUNT(*) n FROM agents");
  const availableAgents = count("SELECT COUNT(*) n FROM agents WHERE state='AVAILABLE'");
  const busyAgents = count("SELECT COUNT(*) n FROM agents WHERE state IN ('RESERVED','DIALING','CONNECTED')");
  const totalCalls = count("SELECT COUNT(*) n FROM calls");
  const connectedCalls = count("SELECT COUNT(*) n FROM calls WHERE status IN ('ANSWERED','CONNECTED','COMPLETED')");
  const completedCalls = count("SELECT COUNT(*) n FROM calls WHERE status='COMPLETED'");
  const failedCalls = count("SELECT COUNT(*) n FROM calls WHERE status='FAILED'");
  return {
    totalAgents, availableAgents, busyAgents,
    utilization: totalAgents ? Number((busyAgents / totalAgents * 100).toFixed(1)) : 0,
    totalCalls, connectedCalls, completedCalls, failedCalls,
    answerRate: totalCalls ? Number((connectedCalls / totalCalls * 100).toFixed(1)) : 0
  };
}
module.exports = { getMetrics };

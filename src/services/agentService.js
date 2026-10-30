const db = require("../db");
const { AGENT_STATES } = require("../domain/states");

function listAgents() {
  return db.prepare("SELECT * FROM agents ORDER BY id").all();
}

function createAgent(name) {
  if (!name || !name.trim()) throw new Error("Agent name is required");
  const result = db.prepare("INSERT INTO agents(name,state) VALUES (?, 'AVAILABLE')").run(name.trim());
  return db.prepare("SELECT * FROM agents WHERE id=?").get(result.lastInsertRowid);
}

function setAgentState(id, state) {
  if (!AGENT_STATES.includes(state)) throw new Error("Invalid agent state");
  if (["RESERVED","DIALING","CONNECTED"].includes(state)) {
    throw new Error("Busy states are managed by the dialer; use AVAILABLE, PAUSED or OFFLINE");
  }
  const agent = db.prepare("SELECT * FROM agents WHERE id=?").get(id);
  if (!agent) throw new Error("Agent not found");
  if (agent.current_call_id && ["PAUSED","OFFLINE"].includes(state)) {
    throw new Error("Cannot pause or take an agent offline while a call is active");
  }
  db.prepare("UPDATE agents SET state=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(state, id);
  return db.prepare("SELECT * FROM agents WHERE id=?").get(id);
}

module.exports = { listAgents, createAgent, setAgentState };

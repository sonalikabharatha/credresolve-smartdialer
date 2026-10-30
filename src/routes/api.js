const express = require("express");
const router = express.Router();
const agents = require("../services/agentService");
const borrowers = require("../services/borrowerService");
const dialer = require("../services/dialerService");
const pacing = require("../services/pacingEngine");
const metrics = require("../services/metricsService");
const { applyProviderEvent } = require("../services/eventService");

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/health", (req,res) => res.json({ status: "ok" }));
router.get("/agents", (req,res) => res.json(agents.listAgents()));
router.post("/agents", (req,res) => {
  try { res.status(201).json(agents.createAgent(req.body.name)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.patch("/agents/:id/state", (req,res) => {
  try { res.json(agents.setAgentState(Number(req.params.id), req.body.state)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.get("/borrowers", (req,res) => res.json(borrowers.listBorrowers()));
router.post("/borrowers", (req,res) => {
  try { res.status(201).json(borrowers.createBorrower(req.body.name, req.body.phone)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.get("/calls", (req,res) => res.json(require("../db").prepare("SELECT * FROM calls ORDER BY id DESC").all()));
router.get("/metrics", (req,res) => res.json(metrics.getMetrics()));
router.post("/dial/progressive", asyncRoute(async (req,res) => {
  const result = await dialer.dial(Number(req.body.count || 1));
  res.json(result);
}));
router.post("/dial/predictive", asyncRoute(async (req,res) => {
  const proposal = pacing.calculateRecommendedCalls(req.body || {});
  const result = await dialer.dial(proposal.recommended);
  res.json({ proposal, safetyDecision: result.decision, calls: result.calls });
}));
router.post("/events", (req,res) => {
  try { res.json(applyProviderEvent(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.post("/seed", (req,res) => {
  const count = Math.min(500, Math.max(1, Number(req.body.count || 10)));
  borrowers.seedBorrowers(count);
  res.json({ seeded: count });
});
module.exports = router;

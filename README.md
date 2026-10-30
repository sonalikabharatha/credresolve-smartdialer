# CredResolve SmartDialer

A safety-first SmartDialer functional prototype for the CredResolve Full Stack Engineer assignment.

> **Important:** This is a local simulation. It does not call real borrowers or connect to a real telecom provider.

## Features
- Progressive dialing: one call reservation per available agent.
- Predictive pacing: an explainable heuristic proposes a dial count.
- Independent Safety Controller: caps requests using available agents and queued borrowers.
- Transactional agent/borrower reservation.
- Database constraint enforcing at most one live call per agent.
- Agent and call lifecycle states.
- Two mock telecom providers with different latency and failure behaviour.
- Idempotent provider events and out-of-order transition protection.
- Dashboard, metrics, simulation, tests and basic load test.

## Requirements
- Node.js 18 or later
- npm

SQLite is embedded through `better-sqlite3`; no separate database server is required.

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000

## First-time demo
1. Add 3–5 agents in Agent management.
2. Click **Add 10 demo borrowers**.
3. Run **Progressive** or **Predictive**.
4. Review the Safety Controller decision and Recent calls table.
5. Refresh the dashboard to see agent and call states.

The mock providers initially return a RINGING event. The event API can be used to simulate later events. For example, find a call ID in Recent calls and send:
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-answer-1","callId":1,"type":"ANSWERED"}'
```
Then send CONNECTED and COMPLETED with unique event IDs to complete the lifecycle.

## API
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET/POST | `/api/agents` | List/create agents |
| PATCH | `/api/agents/:id/state` | Pause/activate agent |
| GET/POST | `/api/borrowers` | List/create borrowers |
| GET | `/api/calls` | List calls |
| GET | `/api/metrics` | Dashboard metrics |
| POST | `/api/dial/progressive` | Progressive dial request `{ "count": 3 }` |
| POST | `/api/dial/predictive` | Predictive request `{ "answerRate": 0.35, "avgTalkTimeSec": 120, "setupTimeSec": 5 }` |
| POST | `/api/events` | Apply provider event |
| POST | `/api/seed` | Add demo borrowers `{ "count": 10 }` |

## Tests and simulation
```bash
npm test
npm run simulate
npm run loadtest
```
Optional load test arguments:
```bash
node src/load-test.js 100 1000
```
Reset local database:
```bash
npm run reset
```

## Predictive pacing and safety
The pacing engine estimates a proposed call count from the current idle-agent count, ringing calls, estimated answer rate, average talk time and setup time. It is deliberately transparent and may be conservative.

The predictive engine cannot place calls. It only returns a proposal. The Safety Controller independently caps that proposal to the number of currently AVAILABLE agents and queued borrowers. The allocator then reserves agents and borrowers in a transaction. The database partial unique index provides an additional invariant: no agent can have more than one live call.

This implementation favours deterministic safety over maximum predictive utilization. A production design could introduce controlled pre-dial reservations with strict expiry and answer-to-agent capacity guarantees, but must not permit a connected call to wait without an agent.

## Failure handling and limitations
- Provider timeout: the call is failed and its agent is released to WRAP_UP.
- Duplicate event: `provider_events.event_id` uniqueness makes it idempotent.
- Out-of-order event: invalid transition is ignored and logged.
- Agent drops offline: new calls cannot reserve the agent. An active call cannot be paused/offlined from the dashboard.
- Worker crash: durable rows remain, but automated lease-based recovery/provider reconciliation is documented as a production next step rather than fully implemented.
- Load test is a basic local demonstration, not a benchmark or proof of 10,000-agent scale.

## Architecture
See:
- `docs/architecture.md`
- `docs/state-machines.md`
- `docs/decisions.md`

## Important production gaps
This is an assignment prototype, not production-ready collections software. Before production: PostgreSQL, multiple worker processes, durable queue/outbox/inbox, provider webhook authentication, agent lease expiry, crash recovery and provider reconciliation, auth/RBAC, PII protection, audit logs, observability and compliance review are required.

## Suggested interview walkthrough
1. Start with the safety invariant.
2. Explain why predictive pacing cannot access provider adapters.
3. Walk through transactional reservation and the unique index.
4. Demonstrate duplicate and out-of-order events.
5. Explain SQLite trade-offs and the PostgreSQL production migration.
6. Be transparent about prototype limitations and next steps.

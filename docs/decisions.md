
# Architecture Decision Record (ADR)

## 1. Context

The assignment requires a working SmartDialer prototype with explicit safety controls, concurrency handling, provider abstraction and failure handling.

The solution should be easy to understand, demonstrate and run locally while keeping important production considerations visible.

## 2. Technology Decisions

### Node.js + Express
Selected as a lightweight HTTP and API layer for implementing dialer operations and exposing REST endpoints.

### SQLite + better-sqlite3
Selected for its zero-server local setup, transaction support, constraints and WAL mode.

This is a prototype choice, not a claim that SQLite is the ideal database for a 10,000-agent production deployment.

### Shared Dialing Architecture
Progressive and predictive dialing strategies share the same safety evaluation and transactional call allocator.

This prevents individual dialing strategies from bypassing the safety boundary.

### Predictive Pacing
A rule-based heuristic is used instead of machine learning because explainability and predictable behaviour are more important than model complexity in this prototype.

The predictive engine proposes a dial count, while the Safety Controller limits approval based on currently available agents and queued borrowers.

### Telecom Provider Abstraction
Two mock providers expose the same `initiateCall` interface but have different latency and failure characteristics.

This demonstrates how provider integrations can be exchanged without changing the core dialing workflow.

### Provider Event Handling
Provider event IDs are unique, and call state transitions are validated against an explicit transition graph.

Duplicate events are ignored, while invalid or out-of-order events are recorded.

## 3. Safety and Transaction Design

Safety evaluation and agent/borrower reservation happen inside the same database transaction.

The allocator:

- Selects only AVAILABLE agents.
- Selects only QUEUED borrowers.
- Reserves each agent and borrower.
- Checks that conditional updates succeed.
- Rolls back the transaction if a reservation fails.

A partial unique database index provides an additional safeguard against assigning multiple live calls to one agent.

Provider calls are initiated only after successful reservation.

## 4. Trade-offs

- Synchronous SQLite operations simplify atomic allocation but limit write concurrency.
- In-process provider calls do not model durable distributed workers.
- The current prototype does not include authentication, campaign tenancy, PII encryption or real telecom integration.
- Recovery after a process crash requires provider reconciliation and reservation leases before production use.
- Predictive pacing is conservative and does not implement true pre-dialing ahead of agent availability.

## 5. Production Next Steps

A production implementation should consider:

1. PostgreSQL for multi-host transactional storage.
2. Transactional outbox and inbox patterns.
3. A durable job queue.
4. Worker leases and crash recovery.
5. Provider webhook signature verification.
6. Secrets management.
7. Audit logging.
8. Role-based access control.
9. PII encryption and retention policies.
10. Load testing across multiple application instances.
11. Monitoring, alerting and provider reconciliation.

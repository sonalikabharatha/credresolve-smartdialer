
const BaseProvider = require("./baseProvider");
const { randomUUID } = require("node:crypto");

class ProviderB extends BaseProvider {
  constructor(options = {}) {
    super("Provider B");

    this.timeoutRate = options.timeoutRate ?? 0.12;
    this.delayMs = options.delayMs ?? 350;
    this.duplicateRate = options.duplicateRate ?? 0.15;
    this.outOfOrderRate = options.outOfOrderRate ?? 0.15;
  }

  async initiateCall(call) {
    await new Promise(resolve => setTimeout(resolve, this.delayMs));

    if (Math.random() < this.timeoutRate) {
      throw new Error("Provider B timeout (simulated)");
    }

    const providerCallId = `B-${randomUUID()}`;

    let events = [
      { type: "RINGING", eventId: randomUUID() },
      { type: "ANSWERED", eventId: randomUUID() }
    ];

    // Simulate out-of-order event delivery.
    if (Math.random() < this.outOfOrderRate) {
      events.reverse();
    }

    // Simulate a duplicate provider event.
    if (Math.random() < this.duplicateRate) {
      events.push({ ...events[events.length - 1] });
    }

    return {
      providerCallId,
      initialEvent: "RINGING",
      simulatedEvents: events
    };
  }
}

module.exports = ProviderB;

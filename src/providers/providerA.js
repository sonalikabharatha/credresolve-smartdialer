const BaseProvider = require("./baseProvider");
const { randomUUID } = require("node:crypto");

class ProviderA extends BaseProvider {
  constructor() { super("Provider A"); }
  async initiateCall(call) {
    await new Promise(resolve => setTimeout(resolve, 80));
    return { providerCallId: `A-${randomUUID()}`, initialEvent: "RINGING" };
  }
}
module.exports = ProviderA;

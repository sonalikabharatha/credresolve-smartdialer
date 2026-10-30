class BaseProvider {
  constructor(name) { this.name = name; }
  async initiateCall() { throw new Error("initiateCall must be implemented"); }
}
module.exports = BaseProvider;

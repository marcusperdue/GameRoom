function createDefaultControllerState() {
  return {
    defaultController: "",
    lastSeen: [],
    profiles: {},
    universalProfile: null,
    emulatorSetup: [],
    updatedAt: null
  };
}

function normalizeControllerState(rawState = {}) {
  const defaults = createDefaultControllerState();
  const profiles = rawState.profiles && typeof rawState.profiles === "object" ? rawState.profiles : {};
  const lastSeen = Array.isArray(rawState.lastSeen) ? rawState.lastSeen : [];

  return {
    ...defaults,
    ...rawState,
    defaultController: typeof rawState.defaultController === "string" ? rawState.defaultController : "",
    lastSeen: lastSeen
      .filter((controller) => controller && typeof controller.id === "string")
      .slice(0, 12)
      .map((controller) => ({
        id: controller.id,
        name: typeof controller.name === "string" ? controller.name : "",
        index: Number.isInteger(controller.index) ? controller.index : 0,
        mapping: typeof controller.mapping === "string" ? controller.mapping : "",
        buttons: Number.isInteger(controller.buttons) ? controller.buttons : 0,
        axes: Number.isInteger(controller.axes) ? controller.axes : 0,
        source: typeof controller.source === "string" ? controller.source : "",
        transport: typeof controller.transport === "string" ? controller.transport : "",
        live: Boolean(controller.live),
        connectedAt: controller.connectedAt || null,
        updatedAt: controller.updatedAt || null
      })),
    profiles,
    universalProfile: rawState.universalProfile && typeof rawState.universalProfile === "object" ? rawState.universalProfile : null,
    emulatorSetup: Array.isArray(rawState.emulatorSetup) ? rawState.emulatorSetup : [],
    updatedAt: rawState.updatedAt || null
  };
}

module.exports = {
  createDefaultControllerState,
  normalizeControllerState
};

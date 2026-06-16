let state = null;
let controllerState = null;
let systemControllerState = { connected: [], paired: [] };
let selectedSystem = "All";
let selectedGameId = null;
let controllerPollTimer = null;
let artworkResults = [];
let artworkSearching = false;
let scanningLibrary = false;
let applyingControllerProfile = false;
let coverCacheVersion = Date.now();
let operationCounter = 0;
const activeOperations = new Map();
let mappingSession = null;
let mappingPollTimer = null;

const systemNav = document.querySelector("#systemNav");
const gameList = document.querySelector("#gameList");
const selectedGame = document.querySelector("#selectedGame");
const heroGame = document.querySelector("#heroGame");
const healthList = document.querySelector("#healthList");
const healthBadge = document.querySelector("#healthBadge");
const setupBanner = document.querySelector("#setupBanner");
const setupTitle = document.querySelector("#setupTitle");
const setupSummary = document.querySelector("#setupSummary");
const systemTitle = document.querySelector("#systemTitle");
const libraryTitle = document.querySelector("#libraryTitle");
const rootPath = document.querySelector("#rootPath");
const storageText = document.querySelector("#storageText");
const searchInput = document.querySelector("#searchInput");
const importButton = document.querySelector("#importButton");
const scanButton = document.querySelector("#scanButton");
const snapshotButton = document.querySelector("#snapshotButton");
const guideButton = document.querySelector("#guideButton");
const guideOverlay = document.querySelector("#guideOverlay");
const guideCloseButton = document.querySelector("#guideCloseButton");
const guideTable = document.querySelector("#guideTable");
const controllerOverlay = document.querySelector("#controllerOverlay");
const controllerCloseButton = document.querySelector("#controllerCloseButton");
const controllerRefreshButton = document.querySelector("#controllerRefreshButton");
const controllerMapButton = document.querySelector("#controllerMapButton");
const controllerApplyButton = document.querySelector("#controllerApplyButton");
const controllerSummary = document.querySelector("#controllerSummary");
const controllerList = document.querySelector("#controllerList");
const controllerTest = document.querySelector("#controllerTest");
const controllerSetupList = document.querySelector("#controllerSetupList");
const controllerMapper = document.querySelector("#controllerMapper");
const artworkOverlay = document.querySelector("#artworkOverlay");
const artworkCloseButton = document.querySelector("#artworkCloseButton");
const artworkSelected = document.querySelector("#artworkSelected");
const artworkResultsPanel = document.querySelector("#artworkResults");
const archiveSearchButton = document.querySelector("#archiveSearchButton");
const googleImagesButton = document.querySelector("#googleImagesButton");
const artworkUrlInput = document.querySelector("#artworkUrlInput");
const artworkUrlSaveButton = document.querySelector("#artworkUrlSaveButton");
const importBiosButton = document.querySelector("#importBiosButton");
const dropZone = document.querySelector("#dropZone");
const shell = document.querySelector(".shell");
const toast = document.querySelector("#toast");
const busyStatus = document.querySelector("#busyStatus");

const systemMeta = {
  All: { label: "All Games", icon: "▦" },
  GameCube: { label: "GameCube", icon: "◇" },
  Wii: { label: "Wii", icon: "◌" },
  PS2: { label: "PS2", icon: "♪" },
  Xbox: { label: "Xbox", icon: "✕" },
  NintendoDS: { label: "Nintendo DS", icon: "●" },
  PS1: { label: "PS1", icon: "♟" },
  PSP: { label: "PSP", icon: "▣" }
};

const guideSystems = [
  "GameCube",
  "PS2",
  "Xbox",
  "NintendoDS",
  "PS1",
  "PSP"
];

const mappingSteps = [
  { path: "face.south", label: "A / Cross", hint: "Press the bottom face button.", type: "button" },
  { path: "face.east", label: "B / Circle", hint: "Press the right face button.", type: "button" },
  { path: "face.west", label: "X / Square", hint: "Press the left face button.", type: "button" },
  { path: "face.north", label: "Y / Triangle", hint: "Press the top face button.", type: "button" },
  { path: "shoulders.left", label: "L / LB", hint: "Press the left shoulder.", type: "button" },
  { path: "shoulders.right", label: "R / RB", hint: "Press the right shoulder.", type: "button" },
  { path: "triggers.left", label: "LT / L2", hint: "Press or pull the left trigger.", type: "button", allowAxis: true },
  { path: "triggers.right", label: "RT / R2", hint: "Press or pull the right trigger.", type: "button", allowAxis: true },
  { path: "menu.back", label: "Select / Back", hint: "Press select, share, or back.", type: "button" },
  { path: "menu.start", label: "Start / Options", hint: "Press start, menu, or options.", type: "button" },
  { path: "dpad.up", label: "D-pad Up", hint: "Press up on the d-pad.", type: "button", allowAxis: true },
  { path: "dpad.down", label: "D-pad Down", hint: "Press down on the d-pad.", type: "button", allowAxis: true },
  { path: "dpad.left", label: "D-pad Left", hint: "Press left on the d-pad.", type: "button", allowAxis: true },
  { path: "dpad.right", label: "D-pad Right", hint: "Press right on the d-pad.", type: "button", allowAxis: true },
  { path: "sticks.leftPress", label: "Left Stick Click", hint: "Click the left stick.", type: "button" },
  { path: "sticks.rightPress", label: "Right Stick Click", hint: "Click the right stick.", type: "button" },
  { path: "axes.leftX", label: "Left Stick Right", hint: "Move the left stick to the right.", type: "axis" },
  { path: "axes.leftY", label: "Left Stick Up", hint: "Move the left stick up.", type: "axis" },
  { path: "axes.rightX", label: "Right Stick Right", hint: "Move the right stick to the right.", type: "axis" },
  { path: "axes.rightY", label: "Right Stick Up", hint: "Move the right stick up.", type: "axis" }
];

async function boot() {
  [state, controllerState, systemControllerState] = await Promise.all([
    window.gameRoom.getState(),
    window.gameRoom.getControllers(),
    window.gameRoom.getSystemControllers()
  ]);
  selectedGameId = state.library[0]?.id ?? null;
  render();
}

function render() {
  rootPath.textContent = displayPath(state.config.rootDir);
  storageText.textContent = `${state.library.length} game${state.library.length === 1 ? "" : "s"} ready`;
  renderScanButton();
  renderSetup();
  renderSystems();
  renderLibrary();
  renderHero();
  renderSelected();
}

function renderScanButton() {
  if (!scanButton) return;
  setButtonLoading(scanButton, scanningLibrary, "Scanning");
}

function renderSystems() {
  const counts = countBySystem();
  const systems = ["All", ...Object.keys(state.systems)];

  systemNav.innerHTML = systems
    .map((system) => {
      const meta = systemMeta[system] || { label: system, icon: "•" };
      const count = system === "All" ? state.library.length : counts[system] || 0;
      const issue = system === "All" ? activeIssues()[0] : issueForSystem(system);
      const status = issue ? "Needs setup" : count ? `${count} game${count === 1 ? "" : "s"}` : "Empty";
      return `<button class="system-card ${selectedSystem === system ? "active" : ""} ${issue ? "needs" : ""}" data-system="${system}" type="button">
        <span class="system-icon">${meta.icon}</span>
        <span class="system-name">${escapeHtml(meta.label)}</span>
        <small>${escapeHtml(status)}</small>
      </button>`;
    })
    .join("");
}

function renderLibrary() {
  const games = visibleGames();
  const meta = systemMeta[selectedSystem] || { label: selectedSystem };
  systemTitle.textContent = selectedSystem === "All" ? "All Games" : meta.label;
  libraryTitle.textContent = selectedSystem === "All" ? "Recently Added" : meta.label;

  if (games.length && !games.some((game) => game.id === selectedGameId)) {
    selectedGameId = games[0].id;
  }

  gameList.innerHTML = games.length
    ? games.map(renderGameRow).join("")
    : `<div class="empty-state">
        <strong>No games here yet</strong>
        <p>${selectedSystem === "All" ? "Add a game and GameRoom will sort it." : `Drop ${escapeHtml(meta.label)} games here or use Add Games.`}</p>
        <button id="emptyAddButton" type="button">Add Games</button>
      </div>`;
}

function renderGameRow(game) {
  const cover = coverUrl(game);
  const issue = issueForSystem(game.system);
  return `<button class="game-card ${selectedGameId === game.id ? "selected" : ""} ${issue ? "needs" : ""}" data-game-id="${game.id}" type="button">
    <div class="poster ${cover ? "has-art" : ""}"${coverStyle(game)}>
      <span>${cover ? "" : coverText(game)}</span>
      ${issue ? "<em>Setup</em>" : ""}
    </div>
    <div class="game-copy">
      <strong>${escapeHtml(game.title)}</strong>
      <span>${labelFor(game.system)} · ${game.format} · ${game.size}</span>
    </div>
  </button>`;
}

function renderHero() {
  const game = state.library.find((item) => item.id === selectedGameId);
  if (!game) {
    heroGame.innerHTML = `<div class="hero-backdrop empty-backdrop"><span>GR</span></div>
      <div class="hero-copy">
        <p class="eyebrow">GameRoom</p>
        <h2>Add your first game</h2>
        <p>Pick a console, add games, then press Play.</p>
        <button class="hero-play" id="heroAddButton" type="button"><span class="action-icon plus-icon" aria-hidden="true"></span>Add Games</button>
      </div>`;
    return;
  }

  const issue = issueForSystem(game.system);
  const cover = coverUrl(game);
  heroGame.innerHTML = `<div class="hero-backdrop ${cover ? "has-art" : ""}"${coverStyle(game)}>
      <span>${coverText(game)}</span>
    </div>
    <div class="hero-copy">
      <p class="eyebrow">${labelFor(game.system)}</p>
      <h2>${escapeHtml(game.title)}</h2>
      <p>${issue ? "Finish setup before launching this game." : `${escapeHtml(game.emulator || "")} · ${escapeHtml(game.format)} · ${escapeHtml(game.size)}`}</p>
      <div class="hero-actions">
        <button class="hero-play ${issue ? "blocked" : ""}" data-play type="button"><span>${issue ? "!" : "▶"}</span>${issue ? "Finish Setup" : "Play"}</button>
        <button class="round-action" data-folder="gameRoot" type="button">⋯</button>
      </div>
    </div>`;
}

function renderSelected() {
  const game = state.library.find((item) => item.id === selectedGameId);
  if (!game) {
    selectedGame.innerHTML = `<div class="detail-art empty-art"><span>GR</span></div>
      <div class="detail-copy">
        <p class="eyebrow">Ready when you are</p>
        <h2>Add your first game</h2>
        <p>Drag a game into GameRoom or use Add Games. Pick the console first for ISO files.</p>
        <button class="primary" id="focusAddButton" type="button">Add Games</button>
      </div>`;
    return;
  }

  const issue = issueForSystem(game.system);
  const cover = coverUrl(game);
  selectedGame.innerHTML = `
    <div class="detail-art ${cover ? "has-art" : ""}"${coverStyle(game)}>
      <span>${coverText(game)}</span>
    </div>
    <div class="detail-copy">
      <p class="eyebrow">${labelFor(game.system)}</p>
      <h2>${escapeHtml(game.title)}</h2>
      <div class="meta">
        <span>${escapeHtml(game.format)}</span>
        <span>${escapeHtml(game.size)}</span>
        <span>${escapeHtml(game.emulator || "")}</span>
      </div>
      ${issue ? renderSetupHint(issue) : `<p class="path">${escapeHtml(displayPath(game.path))}</p>`}
      <button id="playButton" class="primary ${issue ? "blocked" : ""}" data-play type="button"><span>${issue ? "!" : "▶"}</span>${issue ? "Finish Setup" : "Play Game"}</button>
      <div class="detail-actions">
        <button data-folder="gameRoot" type="button"><span>▣</span>Open Game Folder</button>
        <button data-folder="saveRoot" type="button"><span>☁</span>Manage Saves</button>
        <button data-controller-center type="button"><span>◉</span>Controllers</button>
        <button data-artwork-center type="button"><span>▧</span>Artwork</button>
      </div>
    </div>`;
}

function renderSetup() {
  const issues = activeIssues();
  setupBanner.className = issues.length ? "setup-banner needs" : "setup-banner ready hidden";
  healthBadge.textContent = issues.length ? `${issues.length} item${issues.length === 1 ? "" : "s"}` : "Ready";
  healthBadge.className = issues.length ? "issues" : "good";
  setupTitle.textContent = issues.length ? "Finish setup to play everything" : "Ready to play";
  setupSummary.textContent = issues.length
    ? "GameRoom found the exact files or tools needed for your current library."
    : "Games, emulators, saves, and folders are connected.";

  healthList.innerHTML = issues.length
    ? issues.map((item) => `<div class="setup-item">
        <span>!</span>
        <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(displayPath(item.detail))}</small></div>
        <div class="setup-actions">${renderSetupActions(item)}</div>
      </div>`).join("")
    : `<div class="setup-item ok">
        <span>✓</span>
        <div><strong>${state.library.length} game${state.library.length === 1 ? "" : "s"} indexed</strong><small>${escapeHtml(displayPath(state.config.rootDir))}</small></div>
      </div>`;
}

function renderSetupActions(item) {
  const systemName = systemNameForHealthItem(item);
  if (item.label.endsWith(" emulator") && systemName && state.systems[systemName]?.downloadUrl) {
    return `<button data-download-emulator="${escapeAttribute(systemName)}" type="button">Download</button>
      <button data-folder="emulatorRoot" type="button">Folder</button>`;
  }

  const folderKey = item.label.includes("BIOS") ? "biosRoot" : "emulatorRoot";
  return `<button data-folder="${folderKey}" type="button">Open</button>`;
}

function renderSetupHint(issue) {
  const systemName = systemNameForHealthItem(issue);
  const downloadButton = issue.label.endsWith(" emulator") && systemName && state.systems[systemName]?.downloadUrl
    ? `<button data-download-emulator="${escapeAttribute(systemName)}" type="button">Download ${escapeHtml(state.systems[systemName].emulator)}</button>`
    : "";
  return `<div class="inline-setup">
    <strong>${escapeHtml(issue.label)}</strong>
    <p>${escapeHtml(displayPath(issue.detail))}</p>
    ${downloadButton}
  </div>`;
}

function systemNameForHealthItem(item) {
  const label = item?.label || "";
  return Object.keys(state?.systems || {}).find((systemName) => label === `${systemName} emulator` || label === `${systemName} BIOS/files`) || "";
}

function activeIssues() {
  const systemsWithGames = new Set(state.library.map((game) => game.system));
  return state.health.filter((item) => {
    if (item.ok) return false;
    const system = item.label.replace(/ (?:emulator|BIOS\/files)$/, "");
    if (item.label.endsWith(" root")) return true;
    if (item.label.endsWith(" emulator") || item.label.endsWith(" BIOS/files")) {
      return systemsWithGames.has(system);
    }
    return true;
  });
}

function issueForSystem(system) {
  return activeIssues().find((item) => item.label.startsWith(`${system} `)) || null;
}

function visibleGames() {
  const term = searchInput.value.trim().toLowerCase();
  return state.library.filter((game) => {
    const systemMatch = selectedSystem === "All" || game.system === selectedSystem;
    return systemMatch && game.title.toLowerCase().includes(term);
  });
}

function countBySystem() {
  return state.library.reduce((acc, game) => {
    acc[game.system] = (acc[game.system] || 0) + 1;
    return acc;
  }, {});
}

function labelFor(system) {
  return systemMeta[system]?.label || system;
}

function coverText(game) {
  return game.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function coverUrl(game) {
  if (!game.coverPath) return "";
  const version = encodeURIComponent(game.coverUpdatedAt || coverCacheVersion);
  return `file://${encodeURI(absolutePath(game.coverPath)).replace(/'/g, "%27")}?v=${version}`;
}

function coverStyle(game) {
  const cover = coverUrl(game);
  return cover ? ` style="background-image:url(&quot;${escapeAttribute(cover)}&quot;)"` : "";
}

function displayPath(value) {
  if (!value) return "Not configured";
  const root = state?.environment?.rootDir || state?.config?.rootDir || "";
  const rootName = state?.environment?.portableRootName || "GameRoom";
  const normalizedValue = normalizePath(value);
  const normalizedRoot = normalizePath(root);
  if (!isAbsolutePath(normalizedValue) && normalizedValue.includes("/")) return `${rootName}/${normalizedValue}`;
  if (normalizedValue === normalizedRoot) return rootName;
  if (normalizedRoot && normalizedValue.startsWith(`${normalizedRoot}/`)) return `${rootName}/${normalizedValue.slice(normalizedRoot.length + 1)}`;
  return value;
}

function absolutePath(value) {
  const normalizedValue = normalizePath(value);
  if (isAbsolutePath(normalizedValue)) return value;
  const root = normalizePath(state?.environment?.rootDir || "");
  return root ? `${root}/${normalizedValue}` : value;
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/").replace(/\/+$/g, "");
}

function isAbsolutePath(value) {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 3000);
}

function startOperation(message) {
  const id = String(++operationCounter);
  activeOperations.set(id, message);
  renderBusyStatus();
  return id;
}

function finishOperation(id) {
  activeOperations.delete(id);
  renderBusyStatus();
}

function renderBusyStatus() {
  if (!busyStatus) return;
  const messages = Array.from(activeOperations.values());
  const active = messages.length > 0;
  busyStatus.hidden = !active;
  document.body.classList.toggle("app-busy", active);
  if (!active) return;
  busyStatus.querySelector("strong").textContent = messages[messages.length - 1];
}

function normalizeButtonList(buttons) {
  if (!buttons) return [];
  if (buttons instanceof NodeList) return Array.from(buttons).filter(Boolean);
  if (Array.isArray(buttons)) return buttons.filter(Boolean);
  return [buttons].filter(Boolean);
}

function setButtonLoading(button, loading, label = "Working") {
  if (!button) return;

  if (loading) {
    if (!button.dataset.defaultHtml) {
      button.dataset.defaultHtml = button.innerHTML;
      button.dataset.defaultDisabled = button.disabled ? "true" : "false";
    }
    button.classList.add("is-loading");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
    return;
  }

  button.classList.remove("is-loading");
  button.removeAttribute("aria-busy");
  if (button.dataset.defaultHtml) {
    button.innerHTML = button.dataset.defaultHtml;
    button.disabled = button.dataset.defaultDisabled === "true";
    delete button.dataset.defaultHtml;
    delete button.dataset.defaultDisabled;
  }
}

async function withLoading(buttons, options, task) {
  const targets = normalizeButtonList(buttons);
  const status = options?.status || options?.buttonLabel || "Working";
  const buttonLabel = options?.buttonLabel || status;
  const operationId = startOperation(status);
  targets.forEach((button) => setButtonLoading(button, true, buttonLabel));
  try {
    return await task();
  } finally {
    targets.forEach((button) => setButtonLoading(button, false));
    finishOperation(operationId);
  }
}

async function openEmulatorDownload(systemName, button = null) {
  const system = state.systems[systemName];
  if (!system?.downloadUrl) {
    showToast("No download page configured for this emulator");
    return;
  }

  try {
    const result = await withLoading(button, {
      buttonLabel: "Opening",
      status: `Opening ${system.emulator} download`
    }, () => window.gameRoom.openEmulatorDownload(systemName));
    showToast(`Opened ${result.emulator} download page`);
  } catch (error) {
    showToast(userErrorMessage(error));
  }
}

function userErrorMessage(error) {
  return String(error?.message || error || "Something went wrong").replace(
    /^Error invoking remote method '[^']+': Error: /,
    ""
  );
}

function openGuide() {
  renderGuideTable();
  guideOverlay.classList.add("show");
  guideOverlay.setAttribute("aria-hidden", "false");
}

function closeGuide() {
  guideOverlay.classList.remove("show");
  guideOverlay.setAttribute("aria-hidden", "true");
}

function renderGuideTable() {
  if (!guideTable) return;
  guideTable.innerHTML = guideSystems.map((systemName) => {
    const system = state.systems[systemName];
    const title = systemName === "GameCube" ? "GameCube / Wii" : labelFor(systemName);
    return `<div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(emulatorSetupNote(systemName))}</span>
      <button data-download-emulator="${escapeAttribute(systemName)}" type="button">Download ${escapeHtml(system.emulator)}</button>
    </div>`;
  }).join("");
}

function emulatorSetupNote(systemName) {
  const notes = {
    GameCube: "Dolphin emulator. No BIOS for most GameCube/Wii games.",
    PS2: "PCSX2 emulator. Needs PS2 BIOS dumped from your console.",
    Xbox: "xemu emulator. Needs MCPX boot ROM, BIOS/flash image, and Xbox hard drive image.",
    NintendoDS: "melonDS emulator. BIOS/firmware is optional for most games.",
    PS1: "DuckStation emulator. PS1 BIOS is recommended and often required.",
    PSP: "PPSSPP emulator. No BIOS needed."
  };
  return notes[systemName] || `${state.systems[systemName]?.emulator || "Emulator"} download and setup.`;
}

function gamepadApiAvailable() {
  return typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";
}

function connectedGamepads() {
  if (!gamepadApiAvailable()) return [];
  return Array.from(navigator.getGamepads())
    .filter(Boolean)
    .filter((gamepad) => gamepad.connected !== false);
}

function systemConnectedControllers() {
  return Array.isArray(systemControllerState?.connected) ? systemControllerState.connected : [];
}

function systemPairedControllers() {
  return Array.isArray(systemControllerState?.paired) ? systemControllerState.paired : [];
}

function controllerDevices() {
  const webDevices = connectedGamepads().map((gamepad) => ({
    id: `gamepad:${gamepad.index}:${gamepad.id}`,
    name: cleanControllerName(gamepad.id),
    source: "Gamepad API",
    transport: "Browser",
    mapping: gamepad.mapping || "generic",
    buttons: gamepad.buttons.length,
    axes: gamepad.axes.length,
    live: true,
    gamepad
  }));

  const systemDevices = systemConnectedControllers().map((device) => ({
    id: device.id,
    name: cleanControllerName(device.name || device.product),
    source: device.source || "System",
    transport: device.transport || "",
    mapping: device.type || "System controller",
    buttons: 0,
    axes: 0,
    live: false,
    system: device
  }));

  return dedupeUiControllers([...webDevices, ...systemDevices]);
}

function dedupeUiControllers(devices) {
  const seen = new Set();
  return devices.filter((device) => {
    const key = `${device.name}:${device.transport}:${device.mapping}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeControllerDevice(device) {
  return {
    id: device.id,
    name: device.name,
    index: Number.isInteger(device.gamepad?.index) ? device.gamepad.index : 0,
    mapping: device.mapping || "generic",
    buttons: device.buttons || 0,
    axes: device.axes || 0,
    source: device.source || "",
    transport: device.transport || "",
    live: Boolean(device.live),
    standardMap: standardMapForDevice(device),
    updatedAt: new Date().toISOString()
  };
}

function defaultStandardMap() {
  return {
    face: {
      south: buttonBinding(0),
      east: buttonBinding(1),
      west: buttonBinding(2),
      north: buttonBinding(3)
    },
    shoulders: {
      left: buttonBinding(4),
      right: buttonBinding(5)
    },
    triggers: {
      left: buttonBinding(6),
      right: buttonBinding(7)
    },
    menu: {
      back: buttonBinding(8),
      start: buttonBinding(9),
      home: buttonBinding(16)
    },
    sticks: {
      leftPress: buttonBinding(10),
      rightPress: buttonBinding(11)
    },
    dpad: {
      up: buttonBinding(12),
      down: buttonBinding(13),
      left: buttonBinding(14),
      right: buttonBinding(15)
    },
    axes: {
      leftX: axisBinding(0, 1),
      leftY: axisBinding(1, -1),
      rightX: axisBinding(2, 1),
      rightY: axisBinding(3, -1)
    }
  };
}

function standardMapForDevice(device = null) {
  if (mappingSession?.deviceId && device?.id === mappingSession.deviceId) return cloneMap(mappingSession.map);
  const saved = controllerState?.universalProfile;
  if (sameControllerIdentity(device, saved?.controller) && saved.standardMap) return normalizeStandardMap(saved.standardMap);
  return defaultStandardMap();
}

function sameControllerIdentity(device = null, savedController = null) {
  if (!device || !savedController) return false;
  if (device.id && savedController.id && device.id === savedController.id) return true;
  const deviceName = cleanControllerName(device.name);
  const savedName = cleanControllerName(savedController.name || savedController.id);
  return Boolean(deviceName && savedName && deviceName === savedName);
}

function normalizeStandardMap(map = {}) {
  const defaults = defaultStandardMap();
  const next = cloneMap(defaults);
  for (const step of mappingSteps) {
    const binding = normalizeBinding(getPath(map, step.path), getPath(defaults, step.path), step.type);
    setPath(next, step.path, binding);
  }
  return next;
}

function normalizeBinding(binding, fallback, type = "button") {
  if (Number.isInteger(binding)) return type === "axis" ? axisBinding(binding, fallback?.direction || 1) : buttonBinding(binding);
  if (!binding || typeof binding !== "object") return cloneMap(fallback);
  if (binding.type === "axis" || type === "axis") {
    const index = Number.isInteger(binding.index) ? binding.index : fallback?.index || 0;
    const direction = binding.direction === undefined ? fallback?.direction || 1 : Number(binding.direction) < 0 ? -1 : 1;
    return axisBinding(index, direction);
  }
  const index = Number.isInteger(binding.index) ? binding.index : fallback?.index || 0;
  return buttonBinding(index);
}

function buttonBinding(index) {
  return { type: "button", index, label: `Button ${index}` };
}

function axisBinding(index, direction = 1) {
  const sign = direction < 0 ? -1 : 1;
  return { type: "axis", index, direction: sign, label: `Axis ${index + 1}${sign > 0 ? "+" : "-"}` };
}

function cloneMap(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPath(source, pathName) {
  return pathName.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
}

function setPath(target, pathName, value) {
  const keys = pathName.split(".");
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    cursor[key] = cursor[key] || {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

function activeController(devices = controllerDevices()) {
  if (!devices.length) return null;
  return devices.find((device) => device.id === controllerState?.defaultController) || devices[0];
}

function renderControllerCenter() {
  const devices = controllerDevices();
  const selected = activeController(devices);
  const paired = systemPairedControllers();
  const savedName = defaultControllerName();
  const isSupported = gamepadApiAvailable();
  const hasLiveInput = devices.some((device) => device.live);
  const isReady = devices.length > 0;

  controllerSummary.innerHTML = `<div class="${isReady ? "ready" : "waiting"}">
    <span>${isReady ? "Ready" : "Waiting"}</span>
    <div>
      <strong>${isReady ? `${devices.length} controller${devices.length === 1 ? "" : "s"} detected` : controllerWaitingTitle(paired)}</strong>
      <p>${escapeHtml(controllerSummaryText(devices, paired, savedName, hasLiveInput, isSupported))}</p>
    </div>
  </div>`;

  controllerList.innerHTML = devices.length
    ? devices.map((device) => renderControllerCard(device, controllerState?.defaultController || "")).join("")
    : renderNoController(savedName, isSupported, paired);

  controllerTest.innerHTML = selected?.live ? renderInputTest(selected.gamepad) : selected ? renderSystemInputFallback(selected) : `<div class="input-empty">
    <strong>Nothing to test yet</strong>
    <p>Connect by USB or pair over Bluetooth, then press any controller button.</p>
  </div>`;

  renderControllerSetupList();
  renderControllerMapper(selected);
  controllerMapButton.disabled = !selected?.live || Boolean(mappingSession?.active);
  controllerApplyButton.disabled = applyingControllerProfile || !isReady;
  if (applyingControllerProfile) {
    setButtonLoading(controllerApplyButton, true, "Applying");
  } else {
    setButtonLoading(controllerApplyButton, false);
    controllerApplyButton.disabled = !isReady;
  }
}

function renderControllerMapper(selected) {
  if (!controllerMapper) return;
  if (!selected?.live) {
    controllerMapper.innerHTML = `<div class="mapper-empty">
      <strong>Live input needed for button mapping</strong>
      <p>GameRoom can see this controller at the OS level, but the button mapper needs live input. Press a button, reconnect by USB, or pair Bluetooth again.</p>
    </div>`;
    return;
  }

  if (mappingSession?.active && mappingSession.deviceId === selected.id) {
    controllerMapper.innerHTML = renderActiveMappingSession();
    return;
  }

  const saved = controllerState?.universalProfile;
  const savedForDevice = sameControllerIdentity(selected, saved?.controller);
  controllerMapper.innerHTML = `<div class="mapper-ready ${savedForDevice ? "saved" : ""}">
    <div>
      <strong>${savedForDevice ? "Universal mapping saved" : "Map this controller"}</strong>
      <p>${savedForDevice ? `${escapeHtml(saved.controller.name)} is ready. Remap anytime, or apply it to emulators.` : "Press each button once, like Dolphin or melonDS setup."}</p>
    </div>
    <button data-mapping-action="start" type="button">${savedForDevice ? "Remap" : "Start Mapping"}</button>
  </div>`;
}

function renderActiveMappingSession() {
  const step = mappingSteps[mappingSession.stepIndex];
  const complete = mappingSession.stepIndex >= mappingSteps.length;
  const percent = Math.round((mappingSession.stepIndex / mappingSteps.length) * 100);
  const stepList = mappingSteps.map((item, index) => {
    const binding = getPath(mappingSession.map, item.path);
    const status = index < mappingSession.stepIndex ? "done" : index === mappingSession.stepIndex ? "active" : "";
    return `<li class="${status}">
      <span>${escapeHtml(item.label)}</span>
      <small>${escapeHtml(bindingLabel(binding))}</small>
    </li>`;
  }).join("");

  if (complete) {
    return `<div class="mapper-session complete">
      <div class="mapper-head">
        <div>
          <strong>Mapping complete</strong>
          <p>Save this as the universal GameRoom controller profile.</p>
        </div>
        <span>${mappingSteps.length}/${mappingSteps.length}</span>
      </div>
      <div class="mapping-progress"><i style="width:100%"></i></div>
      <ol class="mapping-list">${stepList}</ol>
      <div class="mapper-actions">
        <button data-mapping-action="save" type="button">Save Mapping</button>
        <button data-mapping-action="restart" type="button">Start Over</button>
        <button data-mapping-action="cancel" type="button">Cancel</button>
      </div>
    </div>`;
  }

  return `<div class="mapper-session">
    <div class="mapper-head">
      <div>
        <strong>${escapeHtml(step.label)}</strong>
        <p>${escapeHtml(step.hint)}</p>
      </div>
      <span>${mappingSession.stepIndex + 1}/${mappingSteps.length}</span>
    </div>
    <div class="mapping-progress"><i style="width:${percent}%"></i></div>
    <div class="mapping-prompt">
      <span>${escapeHtml(step.type === "axis" ? "Move" : "Press")}</span>
      <strong>${escapeHtml(step.label)}</strong>
    </div>
    <ol class="mapping-list">${stepList}</ol>
    <div class="mapper-actions">
      <button data-mapping-action="skip" type="button">Skip</button>
      <button data-mapping-action="back" type="button" ${mappingSession.stepIndex === 0 ? "disabled" : ""}>Back</button>
      <button data-mapping-action="cancel" type="button">Cancel</button>
    </div>
  </div>`;
}

function bindingLabel(binding) {
  if (!binding) return "Not set";
  if (binding.type === "axis") return `Axis ${binding.index + 1}${binding.direction > 0 ? "+" : "-"}`;
  return `Button ${binding.index}`;
}

function controllerWaitingTitle(paired) {
  return paired.length ? "Controller paired but not connected" : "No controller detected yet";
}

function controllerSummaryText(devices, paired, savedName, hasLiveInput, isSupported) {
  const savedId = controllerState?.defaultController || "";
  if (!devices.length && paired.length) return `${paired[0].name} is paired. Turn it on, plug it in, or reconnect in Bluetooth settings.`;
  if (!devices.length && savedName) return `Default saved: ${savedName}`;
  if (!devices.length) return "Pair Bluetooth in the operating system first, or plug in by USB.";
  if (savedId && devices.some((device) => device.id === savedId)) return `Default active: ${savedName}`;
  if (hasLiveInput) return "Live input is available in GameRoom.";
  if (isSupported) return "macOS sees this controller. Chromium did not expose live input, but emulators should still see it.";
  return "The operating system sees this controller. Emulators should be able to use it.";
}

function defaultControllerName() {
  const id = controllerState?.defaultController || "";
  if (!id) return "";
  return controllerState?.profiles?.[id]?.name || cleanControllerName(id);
}

function renderControllerSetupList() {
  const rows = Array.isArray(controllerState?.emulatorSetup) ? controllerState.emulatorSetup : [];
  if (!rows.length) {
    controllerSetupList.innerHTML = `<div class="controller-empty compact">
      <strong>No emulator setup applied yet</strong>
      <p>Apply once after connecting your controller. Dolphin can be written automatically; other emulators open for final confirmation.</p>
    </div>`;
    return;
  }

  controllerSetupList.innerHTML = rows.map((row) => {
    const statusLabel = setupStatusLabel(row.status);
    const systemName = row.system === "GameCube / Wii" ? "GameCube" : row.system;
    return `<article class="controller-setup-card ${escapeAttribute(row.status || "needsReview")}">
      <span>${escapeHtml(statusLabel)}</span>
      <div>
        <strong>${escapeHtml(row.system || row.emulator || "Emulator")}</strong>
        <p>${escapeHtml(row.label || "")}</p>
        <small>${escapeHtml(displayPath(row.detail || ""))}</small>
      </div>
      ${row.canOpen ? `<button data-open-emulator="${escapeAttribute(systemName)}" type="button">Open</button>` : ""}
    </article>`;
  }).join("");
}

function setupStatusLabel(status) {
  if (status === "applied") return "Applied";
  if (status === "saved") return "Saved";
  if (status === "missing") return "Missing";
  return "Check";
}

function renderNoController(savedName, isSupported, paired = []) {
  if (paired.length) {
    return `<div class="controller-empty">
      <strong>${escapeHtml(cleanControllerName(paired[0].name))}</strong>
      <p>Paired over Bluetooth, but not connected. Press the controller power button or open Bluetooth settings.</p>
      <button data-open-bluetooth type="button">Open Bluetooth Settings</button>
      ${savedName ? `<small>Saved default: ${escapeHtml(cleanControllerName(savedName))}</small>` : ""}
    </div>`;
  }

  if (!isSupported) {
    return `<div class="controller-empty">
      <strong>Controller API unavailable</strong>
      <p>GameRoom cannot read gamepad input in this window.</p>
      <button data-open-bluetooth type="button">Open Bluetooth Settings</button>
    </div>`;
  }

  return `<div class="controller-empty">
    <strong>Connect a controller</strong>
    <p>USB: plug it in. Bluetooth: pair in system settings, return here, then press any button.</p>
    <button data-open-bluetooth type="button">Open Bluetooth Settings</button>
    ${savedName ? `<small>Saved default: ${escapeHtml(cleanControllerName(savedName))}</small>` : ""}
  </div>`;
}

function renderControllerCard(device, savedName) {
  const isDefault = device.id === savedName;
  const detail = device.live
    ? `${device.mapping === "standard" ? "Standard layout" : "Generic layout"} · ${device.buttons} buttons · ${device.axes} axes`
    : `${device.transport || "System"} · ${device.mapping} · emulator-ready`;
  return `<article class="controller-card ${isDefault ? "default" : ""}">
    <div>
      <strong>${escapeHtml(device.name)}</strong>
      <p>${escapeHtml(detail)}</p>
      <small>${escapeHtml(device.live ? "Live input available" : `${device.source} detected`)}</small>
    </div>
    <button data-controller-id="${escapeAttribute(device.id)}" type="button">${isDefault ? "Default" : "Set Default"}</button>
  </article>`;
}

function renderSystemInputFallback(device) {
  return `<div class="input-device">
    <strong>${escapeHtml(device.name)}</strong>
    <p>${escapeHtml(device.transport || "System")} · ${escapeHtml(device.mapping || "Controller")}</p>
  </div>
  <div class="input-empty ready">
    <strong>OS detected this controller</strong>
    <p>GameRoom can save it as your default. Chromium is not exposing live button data here, so final button mapping stays inside Dolphin, PCSX2, xemu, DuckStation, melonDS, or PPSSPP.</p>
  </div>`;
}

function startMappingSession() {
  const device = activeController();
  if (!device?.live) {
    showToast("Live controller input is needed for button mapping");
    return;
  }

  mappingSession = {
    active: true,
    deviceId: device.id,
    deviceName: device.name,
    stepIndex: 0,
    map: standardMapForDevice(device),
    baseline: inputSnapshot(device.gamepad),
    waitUntil: performance.now() + 450
  };
  startMappingPolling();
  renderControllerCenter();
}

function cancelMappingSession() {
  mappingSession = null;
  stopMappingPolling();
  renderControllerCenter();
}

function restartMappingSession() {
  mappingSession = null;
  startMappingSession();
}

function skipMappingStep() {
  if (!mappingSession?.active) return;
  mappingSession.stepIndex = Math.min(mappingSession.stepIndex + 1, mappingSteps.length);
  const device = controllerDevices().find((item) => item.id === mappingSession.deviceId);
  mappingSession.baseline = device?.gamepad ? inputSnapshot(device.gamepad) : { buttons: [], axes: [] };
  mappingSession.waitUntil = performance.now() + 350;
  if (mappingSession.stepIndex >= mappingSteps.length) stopMappingPolling();
  renderControllerCenter();
}

function previousMappingStep() {
  if (!mappingSession?.active) return;
  mappingSession.stepIndex = Math.max(mappingSession.stepIndex - 1, 0);
  const device = controllerDevices().find((item) => item.id === mappingSession.deviceId);
  mappingSession.baseline = device?.gamepad ? inputSnapshot(device.gamepad) : { buttons: [], axes: [] };
  mappingSession.waitUntil = performance.now() + 350;
  startMappingPolling();
  renderControllerCenter();
}

async function saveMappingSession(button = null) {
  if (!mappingSession?.active) return;
  const device = controllerDevices().find((item) => item.id === mappingSession.deviceId);
  if (!device) {
    showToast("Controller disconnected before mapping could be saved");
    return;
  }

  const controller = {
    ...summarizeControllerDevice(device),
    standardMap: normalizeStandardMap(mappingSession.map)
  };
  controllerState = await withLoading(button, {
    buttonLabel: "Saving",
    status: "Saving controller mapping"
  }, () => window.gameRoom.saveControllers({
    defaultController: controller.id,
    profiles: {
      ...(controllerState?.profiles || {}),
      [controller.id]: controller
    },
    universalProfile: {
      version: 1,
      appliedAt: new Date().toISOString(),
      controller,
      standardMap: controller.standardMap
    }
  }));
  mappingSession = null;
  stopMappingPolling();
  renderControllerCenter();
  showToast("Universal controller mapping saved");
}

function startMappingPolling() {
  if (mappingPollTimer) return;
  mappingPollTimer = window.setInterval(processMappingInput, 55);
}

function stopMappingPolling() {
  if (!mappingPollTimer) return;
  window.clearInterval(mappingPollTimer);
  mappingPollTimer = null;
}

function processMappingInput() {
  if (!mappingSession?.active || mappingSession.stepIndex >= mappingSteps.length) {
    stopMappingPolling();
    return;
  }

  const device = controllerDevices().find((item) => item.id === mappingSession.deviceId);
  if (!device?.gamepad) return;
  if (performance.now() < mappingSession.waitUntil) return;

  const step = mappingSteps[mappingSession.stepIndex];
  const detected = detectMappingInput(device.gamepad, step, mappingSession.baseline);
  if (!detected) return;

  setPath(mappingSession.map, step.path, detected);
  mappingSession.stepIndex += 1;
  mappingSession.baseline = inputSnapshot(device.gamepad);
  mappingSession.waitUntil = performance.now() + 420;
  if (mappingSession.stepIndex >= mappingSteps.length) stopMappingPolling();
  renderControllerCenter();
}

function inputSnapshot(gamepad) {
  return {
    buttons: gamepad.buttons.map((button) => Number(button.value || 0)),
    axes: gamepad.axes.map((axis) => Number(axis || 0))
  };
}

function detectMappingInput(gamepad, step, baseline) {
  if (step.type === "axis") return detectAxisInput(gamepad, baseline);
  return detectButtonInput(gamepad, baseline) || (step.allowAxis ? detectAxisInput(gamepad, baseline) : null);
}

function detectButtonInput(gamepad, baseline) {
  for (let index = 0; index < gamepad.buttons.length; index += 1) {
    const value = Number(gamepad.buttons[index]?.value || 0);
    const base = Number(baseline.buttons[index] || 0);
    if (value > 0.55 && value - base > 0.35) return buttonBinding(index);
  }
  return null;
}

function detectAxisInput(gamepad, baseline) {
  let best = null;
  for (let index = 0; index < gamepad.axes.length; index += 1) {
    const value = Number(gamepad.axes[index] || 0);
    const base = Number(baseline.axes[index] || 0);
    const delta = value - base;
    if (Math.abs(delta) > 0.55 && Math.abs(value) > 0.45) {
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { index, delta };
    }
  }

  return best ? axisBinding(best.index, best.delta >= 0 ? 1 : -1) : null;
}

async function refreshSystemControllers() {
  try {
    systemControllerState = await window.gameRoom.getSystemControllers();
  } catch {
    systemControllerState = { connected: [], paired: [] };
  }
}

async function rememberConnectedControllers(defaultDevice = null) {
  const devices = controllerDevices();
  const lastSeen = devices.map(summarizeControllerDevice);
  const profiles = Object.fromEntries(lastSeen.map((device) => [device.id, device]));
  controllerState = await window.gameRoom.saveControllers({
    defaultController: defaultDevice?.id || controllerState?.defaultController || "",
    lastSeen,
    profiles
  });
}

async function applyUniversalControllerSetup() {
  const device = activeController();
  if (!device) {
    showToast("Connect a controller first");
    return;
  }

  applyingControllerProfile = true;
  renderControllerCenter();
  const operationId = startOperation("Applying controller setup");
  try {
    await rememberConnectedControllers(device);
    const result = await window.gameRoom.applyControllerSetup(summarizeControllerDevice(device));
    controllerState = result.controllerState;
    state = result.state;
    render();
    renderControllerCenter();
    const applied = result.actions.filter((action) => action.status === "applied").length;
    showToast(applied ? `Applied controller setup to ${applied} emulator` : "Controller profile saved");
  } catch (error) {
    showToast(userErrorMessage(error));
  } finally {
    applyingControllerProfile = false;
    finishOperation(operationId);
    renderControllerCenter();
  }
}

async function openControllerCenter() {
  controllerOverlay.classList.add("show");
  controllerOverlay.setAttribute("aria-hidden", "false");
  await refreshSystemControllers();
  await rememberConnectedControllers();
  renderControllerCenter();
  startControllerPolling();
}

function closeControllerCenter() {
  controllerOverlay.classList.remove("show");
  controllerOverlay.setAttribute("aria-hidden", "true");
  stopControllerPolling();
  stopMappingPolling();
}

function startControllerPolling() {
  if (controllerPollTimer) return;
  controllerPollTimer = window.setInterval(renderControllerCenter, 100);
}

function stopControllerPolling() {
  if (!controllerPollTimer) return;
  window.clearInterval(controllerPollTimer);
  controllerPollTimer = null;
}

function standardButtonLabel(index) {
  const labels = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start", "LS", "RS", "Up", "Down", "Left", "Right", "Home", "Pad"];
  return labels[index] || String(index + 1);
}

function cleanControllerName(id) {
  return String(id || "Controller")
    .replace(/^system:[^:]*:[^:]*:/, "")
    .replace(/^gamepad:\d+:/, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "Controller";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function selectedGameRecord() {
  return state.library.find((item) => item.id === selectedGameId) || null;
}

function openArtworkCenter() {
  artworkResults = [];
  artworkUrlInput.value = "";
  artworkOverlay.classList.add("show");
  artworkOverlay.setAttribute("aria-hidden", "false");
  renderArtworkCenter();
}

function closeArtworkCenter() {
  artworkOverlay.classList.remove("show");
  artworkOverlay.setAttribute("aria-hidden", "true");
}

function renderArtworkCenter() {
  const game = selectedGameRecord();
  if (!game) {
    artworkSelected.innerHTML = `<div class="artwork-empty">
      <strong>No game selected</strong>
      <p>Add or select a game before searching for artwork.</p>
    </div>`;
    artworkResultsPanel.innerHTML = "";
    archiveSearchButton.disabled = true;
    googleImagesButton.disabled = true;
    artworkUrlSaveButton.disabled = true;
    return;
  }

  if (artworkSearching) {
    setButtonLoading(archiveSearchButton, true, "Searching");
  } else {
    setButtonLoading(archiveSearchButton, false);
  }
  archiveSearchButton.disabled = artworkSearching;
  googleImagesButton.disabled = false;
  artworkUrlSaveButton.disabled = false;
  const cover = coverUrl(game);
  artworkSelected.innerHTML = `<div class="artwork-current ${cover ? "has-art" : ""}">
    <div class="artwork-thumb"${coverStyle(game)}><span>${coverText(game)}</span></div>
    <div>
      <strong>${escapeHtml(game.title)}</strong>
      <p>${labelFor(game.system)} · ${escapeHtml(game.format)} · ${cover ? "Cover saved" : "No cover yet"}</p>
      ${cover ? `<small>${escapeHtml(displayPath(game.coverPath))}</small>` : "<small>Search Internet Archive or paste an image URL.</small>"}
    </div>
  </div>`;

  if (artworkSearching) {
    artworkResultsPanel.innerHTML = `<div class="artwork-empty">
      <strong>Searching Internet Archive</strong>
      <p>Looking for cover art and item thumbnails.</p>
    </div>`;
    return;
  }

  artworkResultsPanel.innerHTML = artworkResults.length
    ? artworkResults.map(renderArtworkResult).join("")
    : `<div class="artwork-empty">
      <strong>No search yet</strong>
      <p>Use Internet Archive for automatic results, or open Google Images and paste a direct image URL.</p>
    </div>`;
}

function renderArtworkResult(result, index) {
  const title = result.title || result.sourceId || "Artwork result";
  const description = result.description || result.mediaType || "Internet Archive item thumbnail";
  return `<article class="artwork-card">
    <div class="artwork-preview" style="background-image:url('${escapeAttribute(result.thumbnailUrl)}')"></div>
    <div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
      <small>${escapeHtml(result.provider)} · ${escapeHtml(result.mediaType || "item")}</small>
    </div>
    <button data-artwork-index="${index}" type="button">Use Cover</button>
  </article>`;
}

async function searchArchiveForArtwork() {
  const game = selectedGameRecord();
  if (!game) {
    showToast("Pick a game first");
    return;
  }

  artworkSearching = true;
  const operationId = startOperation("Searching artwork");
  renderArtworkCenter();
  try {
    artworkResults = await window.gameRoom.searchArchiveArtwork(game.id);
    showToast(`Found ${artworkResults.length} artwork result${artworkResults.length === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(userErrorMessage(error));
  } finally {
    artworkSearching = false;
    finishOperation(operationId);
    renderArtworkCenter();
  }
}

async function saveArtwork(imageUrl, source = {}, triggerButton = artworkUrlSaveButton) {
  const game = selectedGameRecord();
  if (!game) {
    showToast("Pick a game first");
    return;
  }

  const operationId = startOperation("Saving artwork");
  setButtonLoading(triggerButton, true, "Saving");
  try {
    const result = await window.gameRoom.saveArtworkUrl(game.id, imageUrl, source);
    coverCacheVersion = Date.now();
    state = result.state || await window.gameRoom.getState();
    selectedGameId = result.gameId || game.id;
    artworkUrlInput.value = "";
    render();
    renderArtworkCenter();
    showToast(`Saved cover for ${game.title}`);
  } catch (error) {
    showToast(userErrorMessage(error));
  } finally {
    setButtonLoading(triggerButton, false);
    finishOperation(operationId);
  }
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

async function refreshAfterImport(result) {
  state.library = result.library;
  if (!selectedGameId || !state.library.some((game) => game.id === selectedGameId)) {
    selectedGameId = state.library[0]?.id ?? null;
  }
  state = await window.gameRoom.getState();
  render();

  if (result.imported.length) {
    showToast(`Imported ${result.imported.length} game${result.imported.length === 1 ? "" : "s"}`);
    return;
  }

  showToast(result.skipped[0]?.reason || "No games imported");
}
function renderInputTest(gamepad) {
  const buttons = gamepad.buttons.slice(0, 18).map((button, index) => {
    const value = Number(button.value || 0);
    const active = button.pressed || value > 0.45;
    const label = standardButtonLabel(index);
    return `<span class="input-dot ${active ? "active" : ""}" title="Button ${index}: ${value.toFixed(2)}">${escapeHtml(label)}</span>`;
  }).join("");

  const axes = gamepad.axes.map((axis, index) => {
    const value = clamp(Number(axis || 0), -1, 1);
    const left = ((value + 1) / 2) * 100;
    return `<div class="axis-row">
      <span>Axis ${index + 1}</span>
      <div class="axis-track"><i style="left:${left.toFixed(1)}%"></i></div>
      <small>${value.toFixed(2)}</small>
    </div>`;
  }).join("");

  return `<div class="input-device">
    <strong>${escapeHtml(cleanControllerName(gamepad.id))}</strong>
    <p>${escapeHtml(gamepad.mapping || "generic")} mapping</p>
  </div>
  <div class="button-grid">${buttons}</div>
  <div class="axis-grid">${axes || "<p>No analog axes reported.</p>"}</div>`;
}

function currentImportSystem() {
  return selectedSystem === "All" ? "" : selectedSystem;
}

systemNav.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-system]");
  if (!button) return;
  selectedSystem = button.dataset.system;
  const games = visibleGames();
  selectedGameId = games[0]?.id ?? state.library[0]?.id ?? null;
  render();
});

gameList.addEventListener("click", (event) => {
  const emptyAdd = event.target.closest("#emptyAddButton");
  if (emptyAdd) {
    importButton.click();
    return;
  }

  const button = event.target.closest("button[data-game-id]");
  if (!button) return;
  selectedGameId = button.dataset.gameId;
  render();
});

shell.addEventListener("click", async (event) => {
  const focusAdd = event.target.closest("#focusAddButton");
  if (focusAdd) {
    importButton.click();
    return;
  }

  const heroAdd = event.target.closest("#heroAddButton");
  if (heroAdd) {
    importButton.click();
    return;
  }

  const playButton = event.target.closest("[data-play]");
  if (playButton) {
    const game = selectedGameRecord();
    const issue = game ? issueForSystem(game.system) : null;
    if (issue) {
      showToast(`${issue.label}: ${displayPath(issue.detail)}`);
      return;
    }

    try {
      const result = await withLoading(shell.querySelectorAll("[data-play]"), {
        buttonLabel: "Launching",
        status: `Launching ${game?.title || "game"}`
      }, () => window.gameRoom.launchGame(selectedGameId));
      showToast(`Launching ${result.game.title}`);
    } catch (error) {
      showToast(userErrorMessage(error));
    }
    return;
  }

  const controllerButton = event.target.closest("[data-controller-center]");
  if (controllerButton) {
    await openControllerCenter();
    return;
  }

  const artworkButton = event.target.closest("[data-artwork-center]");
  if (artworkButton) {
    openArtworkCenter();
    return;
  }

  const emulatorDownloadButton = event.target.closest("[data-download-emulator]");
  if (emulatorDownloadButton) {
    await openEmulatorDownload(emulatorDownloadButton.dataset.downloadEmulator, emulatorDownloadButton);
    return;
  }

  const folderButton = event.target.closest("[data-folder]");
  if (folderButton) {
    const target = state.config[folderButton.dataset.folder];
    try {
      await withLoading(folderButton, {
        buttonLabel: "Opening",
        status: "Opening folder"
      }, () => window.gameRoom.revealFolder(target));
    } catch (error) {
      showToast(userErrorMessage(error));
    }
  }
});

importButton.addEventListener("click", async () => {
  try {
    const result = await withLoading(importButton, {
      buttonLabel: "Choosing",
      status: "Opening game picker"
    }, () => window.gameRoom.pickImportGames(currentImportSystem()));
    await refreshAfterImport(result);
  } catch (error) {
    showToast(userErrorMessage(error));
  }
});

scanButton.addEventListener("click", async () => {
  if (scanningLibrary) return;
  scanningLibrary = true;
  renderScanButton();
  try {
    await withLoading(scanButton, {
      buttonLabel: "Scanning",
      status: "Scanning library"
    }, async () => {
      state.library = await window.gameRoom.scanLibrary();
      state = await window.gameRoom.getState();
      if (!state.library.some((game) => game.id === selectedGameId)) {
        selectedGameId = state.library[0]?.id ?? null;
      }
      render();
      showToast(`Scanned ${state.library.length} game${state.library.length === 1 ? "" : "s"}`);
    });
  } catch (error) {
    showToast(userErrorMessage(error));
  } finally {
    scanningLibrary = false;
    renderScanButton();
  }
});

snapshotButton.addEventListener("click", async () => {
  try {
    await withLoading(snapshotButton, {
      buttonLabel: "Backing Up",
      status: "Backing up saves"
    }, async () => {
      await window.gameRoom.snapshotSaves();
      state = await window.gameRoom.getState();
      render();
      showToast("Save backup created");
    });
  } catch (error) {
    showToast(userErrorMessage(error));
  }
});

guideButton.addEventListener("click", openGuide);

guideCloseButton.addEventListener("click", closeGuide);

guideOverlay.addEventListener("click", async (event) => {
  if (event.target === guideOverlay) {
    closeGuide();
    return;
  }

  const emulatorDownloadButton = event.target.closest("[data-download-emulator]");
  if (emulatorDownloadButton) {
    await openEmulatorDownload(emulatorDownloadButton.dataset.downloadEmulator, emulatorDownloadButton);
  }
});

controllerCloseButton.addEventListener("click", closeControllerCenter);

controllerMapButton.addEventListener("click", startMappingSession);

controllerApplyButton.addEventListener("click", applyUniversalControllerSetup);

controllerRefreshButton.addEventListener("click", async () => {
  try {
    await withLoading(controllerRefreshButton, {
      buttonLabel: "Refreshing",
      status: "Refreshing controllers"
    }, async () => {
      await refreshSystemControllers();
      await rememberConnectedControllers();
      renderControllerCenter();
      showToast("Controller list refreshed");
    });
  } catch (error) {
    showToast(userErrorMessage(error));
  }
});

controllerOverlay.addEventListener("click", async (event) => {
  if (event.target === controllerOverlay) {
    closeControllerCenter();
    return;
  }

  const bluetoothButton = event.target.closest("[data-open-bluetooth]");
  if (bluetoothButton) {
    try {
      await withLoading(bluetoothButton, {
        buttonLabel: "Opening",
        status: "Opening Bluetooth settings"
      }, async () => {
        await window.gameRoom.openBluetoothSettings();
        showToast("Opened Bluetooth settings");
      });
    } catch (error) {
      showToast(userErrorMessage(error));
    }
    return;
  }

  const openEmulatorButton = event.target.closest("[data-open-emulator]");
  if (openEmulatorButton) {
    try {
      const result = await withLoading(openEmulatorButton, {
        buttonLabel: "Opening",
        status: "Opening emulator"
      }, () => window.gameRoom.openEmulator(openEmulatorButton.dataset.openEmulator));
      showToast(`Opened ${result.emulator}`);
    } catch (error) {
      showToast(userErrorMessage(error));
    }
    return;
  }

  const mappingButton = event.target.closest("[data-mapping-action]");
  if (mappingButton) {
    const action = mappingButton.dataset.mappingAction;
    if (action === "start") startMappingSession();
    if (action === "restart") restartMappingSession();
    if (action === "skip") skipMappingStep();
    if (action === "back") previousMappingStep();
    if (action === "cancel") cancelMappingSession();
    if (action === "save") await saveMappingSession(mappingButton);
    return;
  }

  const defaultButton = event.target.closest("[data-controller-id]");
  if (!defaultButton) return;

  const device = controllerDevices().find((item) => item.id === defaultButton.dataset.controllerId);
  if (!device) {
    showToast("Controller is no longer connected");
    await refreshSystemControllers();
    renderControllerCenter();
    return;
  }

  await rememberConnectedControllers(device);
  renderControllerCenter();
  showToast(`Default controller set to ${device.name}`);
});

artworkCloseButton.addEventListener("click", closeArtworkCenter);

archiveSearchButton.addEventListener("click", searchArchiveForArtwork);

googleImagesButton.addEventListener("click", async () => {
  const game = selectedGameRecord();
  if (!game) {
    showToast("Pick a game first");
    return;
  }

  try {
    await withLoading(googleImagesButton, {
      buttonLabel: "Opening",
      status: "Opening Google Images"
    }, () => window.gameRoom.openGoogleImages(game.id));
    showToast("Opened Google Images");
  } catch (error) {
    showToast(userErrorMessage(error));
  }
});

artworkUrlSaveButton.addEventListener("click", async () => {
  const imageUrl = artworkUrlInput.value.trim();
  if (!imageUrl) {
    showToast("Paste an image URL first");
    return;
  }

  await saveArtwork(imageUrl, {
    provider: "Manual URL",
    imageUrl
  }, artworkUrlSaveButton);
});

artworkResultsPanel.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-artwork-index]");
  if (!button) return;

  const result = artworkResults[Number(button.dataset.artworkIndex)];
  if (!result) return;
  await saveArtwork(result.imageUrl, result, button);
});

artworkOverlay.addEventListener("click", (event) => {
  if (event.target === artworkOverlay) closeArtworkCenter();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeGuide();
    closeControllerCenter();
    closeArtworkCenter();
  }
});

window.addEventListener("gamepadconnected", async (event) => {
  await refreshSystemControllers();
  const device = controllerDevices().find((item) => item.live && item.gamepad.index === event.gamepad.index);
  await rememberConnectedControllers(device);
  renderControllerCenter();
  showToast(`Controller connected: ${cleanControllerName(event.gamepad.id)}`);
});

window.addEventListener("gamepaddisconnected", async (event) => {
  await refreshSystemControllers();
  if (mappingSession?.deviceId === `gamepad:${event.gamepad.index}:${event.gamepad.id}`) {
    mappingSession = null;
    stopMappingPolling();
    showToast("Controller disconnected. Mapping canceled.");
  }
  await rememberConnectedControllers();
  renderControllerCenter();
  showToast(`Controller disconnected: ${cleanControllerName(event.gamepad.id)}`);
});

importBiosButton.addEventListener("click", async () => {
  try {
    const result = await withLoading(importBiosButton, {
      buttonLabel: "Importing",
      status: "Importing BIOS files"
    }, () => window.gameRoom.importBatoceraBios());
    state = result.state;
    render();
    const copied = Object.values(result.report).reduce((sum, item) => sum + item.copied, 0);
    showToast(`Imported ${copied} BIOS file${copied === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(userErrorMessage(error));
  }
});

searchInput.addEventListener("input", () => {
  const games = visibleGames();
  if (!games.some((game) => game.id === selectedGameId)) selectedGameId = games[0]?.id ?? null;
  renderLibrary();
  renderSelected();
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const files = window.gameRoom.droppedFilePaths(event.dataTransfer.files);
  if (!files.length) {
    showToast("No local files found. Drop files from Finder, or use Add Games.");
    return;
  }

  try {
    dropZone.classList.add("busy");
    const result = await withLoading(null, {
      status: `Importing ${files.length} dropped file${files.length === 1 ? "" : "s"}`
    }, () => window.gameRoom.importGames(files, currentImportSystem()));
    await refreshAfterImport(result);
  } catch (error) {
    showToast(userErrorMessage(error));
  } finally {
    dropZone.classList.remove("busy");
  }
});

boot();

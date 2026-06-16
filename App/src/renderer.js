let state = null;
let controllerState = null;
let systemControllerState = { connected: [], paired: [] };
let selectedSystem = "All";
let selectedGameId = null;
let controllerPollTimer = null;
let artworkResults = [];
let artworkSearching = false;

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
const controllerOverlay = document.querySelector("#controllerOverlay");
const controllerCloseButton = document.querySelector("#controllerCloseButton");
const controllerRefreshButton = document.querySelector("#controllerRefreshButton");
const controllerSummary = document.querySelector("#controllerSummary");
const controllerList = document.querySelector("#controllerList");
const controllerTest = document.querySelector("#controllerTest");
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
  renderSetup();
  renderSystems();
  renderLibrary();
  renderHero();
  renderSelected();
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
    <div class="poster ${cover ? "has-art" : ""}" ${cover ? `style="background-image:url('${cover}')"` : ""}>
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
        <button class="hero-play" id="heroAddButton" type="button"><span>+</span>Add Games</button>
      </div>`;
    return;
  }

  const issue = issueForSystem(game.system);
  const cover = coverUrl(game);
  heroGame.innerHTML = `<div class="hero-backdrop ${cover ? "has-art" : ""}" ${cover ? `style="background-image:url('${cover}')"` : ""}>
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
    <div class="detail-art ${cover ? "has-art" : ""}" ${cover ? `style="background-image:url('${cover}')"` : ""}>
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
        <button data-folder="${item.label.includes("BIOS") ? "biosRoot" : "emulatorRoot"}" type="button">Open</button>
      </div>`).join("")
    : `<div class="setup-item ok">
        <span>✓</span>
        <div><strong>${state.library.length} game${state.library.length === 1 ? "" : "s"} indexed</strong><small>${escapeHtml(displayPath(state.config.rootDir))}</small></div>
      </div>`;
}

function renderSetupHint(issue) {
  return `<div class="inline-setup">
    <strong>${escapeHtml(issue.label)}</strong>
    <p>${escapeHtml(displayPath(issue.detail))}</p>
  </div>`;
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
  return `file://${encodeURI(absolutePath(game.coverPath))}`;
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

function userErrorMessage(error) {
  return String(error?.message || error || "Something went wrong").replace(
    /^Error invoking remote method '[^']+': Error: /,
    ""
  );
}

function openGuide() {
  guideOverlay.classList.add("show");
  guideOverlay.setAttribute("aria-hidden", "false");
}

function closeGuide() {
  guideOverlay.classList.remove("show");
  guideOverlay.setAttribute("aria-hidden", "true");
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
    updatedAt: new Date().toISOString()
  };
}

function activeController(devices = controllerDevices()) {
  if (!devices.length) return null;
  return devices.find((device) => device.id === controllerState?.defaultController) || devices[0];
}

function renderControllerCenter() {
  const devices = controllerDevices();
  const selected = activeController(devices);
  const paired = systemPairedControllers();
  const savedName = controllerState?.defaultController || "";
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
    ? devices.map((device) => renderControllerCard(device, savedName)).join("")
    : renderNoController(savedName, isSupported, paired);

  controllerTest.innerHTML = selected?.live ? renderInputTest(selected.gamepad) : selected ? renderSystemInputFallback(selected) : `<div class="input-empty">
    <strong>Nothing to test yet</strong>
    <p>Connect by USB or pair over Bluetooth, then press any controller button.</p>
  </div>`;
}

function controllerWaitingTitle(paired) {
  return paired.length ? "Controller paired but not connected" : "No controller detected yet";
}

function controllerSummaryText(devices, paired, savedName, hasLiveInput, isSupported) {
  if (!devices.length && paired.length) return `${paired[0].name} is paired. Turn it on, plug it in, or reconnect in Bluetooth settings.`;
  if (!devices.length && savedName) return `Default saved: ${savedName}`;
  if (!devices.length) return "Pair Bluetooth in the operating system first, or plug in by USB.";
  if (savedName && devices.some((device) => device.id === savedName)) return `Default active: ${cleanControllerName(savedName)}`;
  if (hasLiveInput) return "Live input is available in GameRoom.";
  if (isSupported) return "macOS sees this controller. Chromium did not expose live input, but emulators should still see it.";
  return "The operating system sees this controller. Emulators should be able to use it.";
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

  archiveSearchButton.disabled = artworkSearching;
  googleImagesButton.disabled = false;
  artworkUrlSaveButton.disabled = false;
  const cover = coverUrl(game);
  artworkSelected.innerHTML = `<div class="artwork-current ${cover ? "has-art" : ""}">
    <div class="artwork-thumb" ${cover ? `style="background-image:url('${cover}')"` : ""}><span>${coverText(game)}</span></div>
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
  renderArtworkCenter();
  try {
    artworkResults = await window.gameRoom.searchArchiveArtwork(game.id);
    showToast(`Found ${artworkResults.length} artwork result${artworkResults.length === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(userErrorMessage(error));
  } finally {
    artworkSearching = false;
    renderArtworkCenter();
  }
}

async function saveArtwork(imageUrl, source = {}) {
  const game = selectedGameRecord();
  if (!game) {
    showToast("Pick a game first");
    return;
  }

  try {
    const result = await window.gameRoom.saveArtworkUrl(game.id, imageUrl, source);
    state = result.state;
    selectedGameId = game.id;
    render();
    renderArtworkCenter();
    showToast(`Saved cover for ${game.title}`);
  } catch (error) {
    showToast(userErrorMessage(error));
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
    try {
      const result = await window.gameRoom.launchGame(selectedGameId);
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

  const folderButton = event.target.closest("[data-folder]");
  if (folderButton) {
    const target = state.config[folderButton.dataset.folder];
    await window.gameRoom.revealFolder(target);
  }
});

importButton.addEventListener("click", async () => {
  try {
    const result = await window.gameRoom.pickImportGames(currentImportSystem());
    await refreshAfterImport(result);
  } catch (error) {
    showToast(userErrorMessage(error));
  }
});

scanButton.addEventListener("click", async () => {
  state.library = await window.gameRoom.scanLibrary();
  state = await window.gameRoom.getState();
  if (!state.library.some((game) => game.id === selectedGameId)) {
    selectedGameId = state.library[0]?.id ?? null;
  }
  render();
  showToast(`Scanned ${state.library.length} game${state.library.length === 1 ? "" : "s"}`);
});

snapshotButton.addEventListener("click", async () => {
  await window.gameRoom.snapshotSaves();
  state = await window.gameRoom.getState();
  render();
  showToast("Save backup created");
});

guideButton.addEventListener("click", openGuide);

guideCloseButton.addEventListener("click", closeGuide);

guideOverlay.addEventListener("click", (event) => {
  if (event.target === guideOverlay) closeGuide();
});

controllerCloseButton.addEventListener("click", closeControllerCenter);

controllerRefreshButton.addEventListener("click", async () => {
  await refreshSystemControllers();
  await rememberConnectedControllers();
  renderControllerCenter();
  showToast("Controller list refreshed");
});

controllerOverlay.addEventListener("click", async (event) => {
  if (event.target === controllerOverlay) {
    closeControllerCenter();
    return;
  }

  const bluetoothButton = event.target.closest("[data-open-bluetooth]");
  if (bluetoothButton) {
    await window.gameRoom.openBluetoothSettings();
    showToast("Opened Bluetooth settings");
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
    await window.gameRoom.openGoogleImages(game.id);
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
  });
});

artworkResultsPanel.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-artwork-index]");
  if (!button) return;

  const result = artworkResults[Number(button.dataset.artworkIndex)];
  if (!result) return;
  await saveArtwork(result.imageUrl, result);
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
  await rememberConnectedControllers();
  renderControllerCenter();
  showToast(`Controller disconnected: ${cleanControllerName(event.gamepad.id)}`);
});

importBiosButton.addEventListener("click", async () => {
  try {
    const result = await window.gameRoom.importBatoceraBios();
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
  const files = Array.from(event.dataTransfer.files).map((file) => file.path).filter(Boolean);
  if (!files.length) {
    showToast("No files found in drop");
    return;
  }

  try {
    const result = await window.gameRoom.importGames(files, currentImportSystem());
    await refreshAfterImport(result);
  } catch (error) {
    showToast(userErrorMessage(error));
  }
});

boot();

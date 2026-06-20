const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const artworkStore = require("./modules/artwork");
const configStore = require("./modules/config");
const controllerStore = require("./modules/controllers");
const emulatorStore = require("./modules/emulators");
const libraryStore = require("./modules/library");
const saveStore = require("./modules/saves");
const {
  coverExtensions,
  labelForSystem,
  platformFolder,
  portableFolderDefaults,
  systems
} = require("./modules/systems");

const appDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(appDir, "..");
const configDir = path.join(rootDir, "Config");
const configPath = path.join(configDir, "app.json");
const libraryPath = path.join(configDir, "library.json");
const emulatorProfilesPath = path.join(configDir, "emulators.json");
const controllerProfilesPath = path.join(configDir, "controllers.json");
const backupsDir = path.join(rootDir, "Backups", "Saves");
const batoceraRoot = path.join(os.homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "Batocera");
const appIconPngPath = path.join(__dirname, "assets", "icon.png");
const appIconIcnsPath = path.join(__dirname, "assets", "icon.icns");
const appIconIcoPath = path.join(__dirname, "assets", "icon.ico");

app.setName("GameRoom");

process.on("uncaughtException", (error) => {
  console.error("Unhandled GameRoom main-process error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled GameRoom main-process rejection:", error);
});

function createWindow() {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(appIconPngPath);
  }
  setupApplicationMenu();

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "GameRoom",
    icon: platformAppIconPath(),
    backgroundColor: "#101214",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.webContents.session
    .clearCache()
    .catch((error) => console.error(`Could not clear UI cache: ${error.message}`))
    .finally(() => {
      win.loadFile(path.join(__dirname, "index.html"));
    });
}

async function ensureDefaults() {
  await fsp.mkdir(configDir, { recursive: true });

  const storedConfig = await readJson(configPath, createDefaultConfig());
  const config = normalizeConfig(storedConfig);
  await writeJson(configPath, serializeConfig(config));

  await ensureConfiguredFolders(config);
  await ensureArtworkSidecars(config);

  const storedProfiles = await readJson(emulatorProfilesPath, {});
  const profiles = normalizeProfiles(
    Object.keys(storedProfiles).length ? storedProfiles : createDefaultProfiles(config.emulatorRoot),
    storedConfig.rootDir,
    config.emulatorRoot
  );
  await writeJson(emulatorProfilesPath, serializeProfiles(profiles));

  if (!fs.existsSync(libraryPath)) {
    await writeJson(libraryPath, []);
  }

  if (!fs.existsSync(controllerProfilesPath)) {
    await writeJson(controllerProfilesPath, createDefaultControllerState());
  }
}

async function ensureConfiguredFolders(config) {
  const baseFolders = Object.keys(portableFolderDefaults).map((key) => config[key]);
  const systemFolders = Object.values(systems).flatMap((system) => [
    path.join(config.gameRoot, system.folder),
    path.join(config.biosRoot, system.folder),
    path.join(config.coverRoot, system.folder)
  ]);
  const emulatorFolders = [...new Set(Object.values(systems).map((system) => system.emulator))].flatMap((emulator) => [
    path.join(config.saveRoot, emulator),
    path.join(config.controlsRoot, emulator)
  ]);

  await Promise.all([
    ...baseFolders,
    ...systemFolders,
    ...emulatorFolders,
    path.join(config.emulatorRoot, "macOS"),
    path.join(config.emulatorRoot, "Windows"),
    path.join(config.emulatorRoot, "Linux"),
    path.join(config.downloadsRoot, "Emulators"),
    path.join(config.downloadsRoot, "Installers"),
    path.join(config.downloadsRoot, "Updates"),
    path.join(rootDir, "Cache", "temp"),
    path.join(rootDir, "Cache", "extracted")
  ].map((folder) => fsp.mkdir(folder, { recursive: true })));
}

async function ensureArtworkSidecars(config) {
  const artworkFolder = path.join(config.metadataRoot, "artwork");
  if (!fs.existsSync(artworkFolder)) return;

  let entries = [];
  try {
    entries = await fsp.readdir(artworkFolder, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map(async (entry) => {
      const record = await readJson(path.join(artworkFolder, entry.name), null);
      if (!record?.coverPath) return;

      const coverPath = resolveConfiguredPath(record.coverPath, rootDir, "");
      if (!coverPath || !fs.existsSync(coverPath)) return;

      const coverFolder = path.dirname(coverPath);
      const coverStem = path.basename(coverPath, path.extname(coverPath));
      const sourceUrl = record?.source?.imageUrl || record?.source?.originalUrl || "";
      const sidecarRecord = {
        ...record,
        coverPath: toPortablePath(coverPath),
        localFile: path.basename(coverPath)
      };

      await writeJson(path.join(coverFolder, `${coverStem}.source.json`), sidecarRecord);
      if (sourceUrl) {
        await fsp.writeFile(path.join(coverFolder, `${coverStem}.source.url`), `${sourceUrl}\n`);
      }
    }));
}

function createDefaultConfig() {
  return configStore.createDefaultConfig(portableFolderDefaults);
}

function normalizeConfig(rawConfig = {}) {
  return configStore.normalizeConfig(rawConfig, { rootDir, portableFolderDefaults });
}

function serializeConfig(config) {
  return configStore.serializeConfig(config, { rootDir, portableFolderDefaults });
}

function resolveConfiguredPath(value, sourceRoot = rootDir, fallback = "") {
  return configStore.resolveConfiguredPath(value, { rootDir, sourceRoot, fallback });
}

function toPortablePath(target) {
  return configStore.toPortablePath(target, rootDir);
}

function isInsideRootRelative(relativePath) {
  return configStore.isInsideRootRelative(relativePath);
}

function normalizeSlashes(value) {
  return configStore.normalizeSlashes(value);
}

function createDefaultProfiles(emulatorRoot = path.join(rootDir, "Emulators")) {
  return emulatorStore.createDefaultProfiles({ systems, emulatorRoot, rootDir, platformFolder });
}

function normalizeProfiles(rawProfiles = {}, sourceRoot = rootDir, emulatorRoot = path.join(rootDir, "Emulators")) {
  return emulatorStore.normalizeProfiles({
    ...rawProfiles
  }, {
    systems,
    sourceRoot,
    rootDir,
    emulatorRoot,
    platformFolder,
    resolveConfiguredPath
  });
}

function serializeProfiles(profiles) {
  return emulatorStore.serializeProfiles(profiles, { toPortablePath });
}

function createDefaultControllerState() {
  return controllerStore.createDefaultControllerState();
}

function normalizeControllerState(rawState = {}) {
  return controllerStore.normalizeControllerState(rawState);
}

async function getControllerState() {
  return normalizeControllerState(await readJson(controllerProfilesPath, createDefaultControllerState()));
}

async function saveControllerState(nextState = {}) {
  const current = await getControllerState();
  const merged = normalizeControllerState({
    ...current,
    ...nextState,
    profiles: {
      ...current.profiles,
      ...(nextState.profiles || {})
    },
    updatedAt: new Date().toISOString()
  });
  await writeJson(controllerProfilesPath, merged);
  return merged;
}

async function getSystemControllers() {
  const detected = process.platform === "darwin" ? detectMacSystemControllers() : { connected: [], paired: [] };
  return {
    platform: process.platform,
    connected: detected.connected,
    paired: detected.paired,
    checkedAt: new Date().toISOString()
  };
}

function detectMacSystemControllers() {
  const bluetooth = detectMacBluetoothControllers();
  return {
    connected: dedupeControllers([
      ...detectMacGameControllers(),
      ...detectMacUsbControllers(),
      ...bluetooth.filter((device) => device.status === "connected")
    ]),
    paired: dedupeControllers(bluetooth.filter((device) => device.status !== "connected"))
  };
}

function detectMacGameControllers() {
  const hid = commandOutput("ioreg", ["-r", "-c", "IOHIDDevice", "-l", "-w", "0"]);
  const hidDevices = parseIoregControllerDevices(hid, "macOS HID");
  if (hidDevices.length) return dedupeControllers(hidDevices);

  const synthetic = commandOutput("ioreg", ["-r", "-c", "AppleGCSyntheticDevice", "-l", "-w", "0"]);
  return dedupeControllers(parseIoregControllerDevices(synthetic, "macOS Game Controller"));
}

function detectMacBluetoothControllers() {
  const report = commandOutput("system_profiler", ["SPBluetoothDataType"]);
  const devices = [];
  const lines = report.split(/\r?\n/);
  let section = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "Connected:" || trimmed === "Not Connected:") {
      section = trimmed.replace(":", "");
      continue;
    }

    const match = trimmed.match(/^([^:]+):$/);
    if (!match) continue;
    const name = match[1].trim();
    if (!section || /^Bluetooth Controller$/i.test(name)) continue;
    if (!isLikelyControllerName(name)) continue;
    devices.push({
      id: `bluetooth:${name.toLowerCase()}`,
      name,
      manufacturer: "",
      product: name,
      transport: "Bluetooth",
      type: "Bluetooth gamepad",
      source: "macOS Bluetooth",
      status: section === "Connected" ? "connected" : "paired"
    });
  }

  return dedupeControllers(devices);
}

function detectMacUsbControllers() {
  const report = commandOutput("system_profiler", ["SPUSBDataType"]);
  const blocks = parseSystemProfilerBlocks(report);
  return dedupeControllers(blocks
    .filter((device) => isLikelyControllerName(`${device.name} ${device.manufacturer}`))
    .map((device) => ({
      id: `usb:${device.vendorId || "vendor"}:${device.productId || "product"}:${device.name.toLowerCase()}`,
      name: cleanDeviceName([device.manufacturer, device.name].filter(Boolean).join(" ")),
      manufacturer: device.manufacturer,
      product: device.name,
      transport: "USB",
      type: "USB gamepad",
      vendorId: device.vendorId,
      productId: device.productId,
      source: "macOS USB",
      status: "connected"
    })));
}

function parseSystemProfilerBlocks(report) {
  const devices = [];
  let current = null;

  for (const line of report.split(/\r?\n/)) {
    const heading = line.match(/^(\s{6,})([^:\n][^:\n]+):\s*$/);
    if (heading) {
      if (current) devices.push(current);
      current = {
        name: heading[2].trim(),
        manufacturer: "",
        vendorId: "",
        productId: ""
      };
      continue;
    }

    if (!current) continue;
    const property = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (!property) continue;
    const key = property[1].trim();
    const value = property[2].trim();
    if (key === "Manufacturer") current.manufacturer = value;
    if (key === "Vendor ID") current.vendorId = value.split(/\s+/)[0];
    if (key === "Product ID") current.productId = value.split(/\s+/)[0];
  }

  if (current) devices.push(current);
  return devices;
}

function parseIoregControllerDevices(output, source) {
  if (!output) return [];
  const blocks = output.split(/\n(?=\s*[|+\\-]*o\s|\+-o\s)/);
  const devices = [];

  for (const block of blocks) {
    const product = propertyValue(block, "Product");
    const manufacturer = propertyValue(block, "Manufacturer");
    const transport = propertyValue(block, "Transport") || (source.includes("Game Controller") ? "GameController" : "");
    const vendorId = propertyValue(block, "VendorID") || propertyValue(block, "idVendor");
    const productId = propertyValue(block, "ProductID") || propertyValue(block, "idProduct");
    const serial = propertyValue(block, "SerialNumber") || propertyValue(block, "_GCSyntheticDeviceIdentifier");
    const type = propertyValue(block, "_GCSyntheticDeviceType") || propertyValue(block, "IOUserClass") || "Game controller";
    const usageMatches = /"DeviceUsagePage"\s*=\s*1,\s*"DeviceUsage"\s*=\s*5/.test(block) || /"PrimaryUsage"\s*=\s*5/.test(block);
    const classMatches = /Gamepad|GamePad|GameController|Xbox|PlayStation|DualShock|DualSense|Joy-Con|Switch/i.test(block);
    const productMatches = isLikelyControllerName(`${manufacturer} ${product} ${type}`);
    if (!product || !usageMatches || (!classMatches && !productMatches)) continue;
    if (/Apple Internal Keyboard|Keyboard Backlight|Headset|Mouse|Trackpad/i.test(product)) continue;

    const name = cleanDeviceName([manufacturer, product].filter(Boolean).join(" "));
    devices.push({
      id: `system:${vendorId || "vendor"}:${productId || "product"}:${serial || name}`,
      name,
      manufacturer,
      product,
      transport,
      type,
      vendorId,
      productId,
      source,
      status: "connected"
    });
  }

  return devices;
}

function propertyValue(block, key) {
  const match = block.match(new RegExp(`"${key}"\\\\s*=\\\\s*(?:"([^"]*)"|([^\\n]+))`));
  return (match?.[1] || match?.[2] || "").replace(/[;,]$/g, "").trim();
}

function isLikelyControllerName(value) {
  return /controller|gamepad|xbox|playstation|dualshock|dualsense|8bitdo|joy-con|switch pro|nintendo/i.test(value || "");
}

function cleanDeviceName(name) {
  return String(name || "Controller").replace(/\s+/g, " ").trim();
}

function dedupeControllers(devices) {
  const seen = new Set();
  return devices.filter((device) => {
    const name = controllerDedupeName(device.name || device.product);
    const key = `${device.status}:${name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function setupApplicationMenu() {
  const template = process.platform === "darwin"
    ? [
        {
          label: "GameRoom",
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" }
          ]
        },
        {
          label: "File",
          submenu: [{ role: "close" }]
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" }
          ]
        },
        {
          label: "View",
          submenu: [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" }
          ]
        },
        {
          label: "Window",
          submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
        }
      ]
    : [
        {
          label: "File",
          submenu: [{ role: "quit" }]
        },
        {
          label: "View",
          submenu: [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" }
          ]
        }
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function platformAppIconPath() {
  if (process.platform === "win32") return appIconIcoPath;
  if (process.platform === "darwin") return appIconIcnsPath;
  return appIconPngPath;
}

function controllerDedupeName(name) {
  return cleanDeviceName(name)
    .replace(/^(microsoft|sony|nintendo|8bitdo)\s+/i, "")
    .toLowerCase();
}

function commandOutput(command, args) {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 4500,
      maxBuffer: 12 * 1024 * 1024
    });
    return result.status === 0 ? result.stdout : "";
  } catch {
    return "";
  }
}

async function openBluetoothSettings() {
  if (process.platform === "darwin") {
    await shell.openExternal("x-apple.systempreferences:com.apple.BluetoothSettings");
    return true;
  }

  return false;
}

async function applyUniversalControllerSetup(controller = {}) {
  const rawConfig = await readJson(configPath, createDefaultConfig());
  const config = normalizeConfig(rawConfig);
  const profiles = normalizeProfiles(await readJson(emulatorProfilesPath, {}), rawConfig.rootDir, config.emulatorRoot);
  const hasControllerIdentity = Boolean(
    (typeof controller.id === "string" && controller.id.trim()) ||
    (typeof controller.name === "string" && controller.name.trim())
  );
  if (!hasControllerIdentity) {
    throw new Error("Connect a controller first, then press any button before applying setup.");
  }

  const controllerProfile = createUniversalControllerProfile(controller);

  const universalFolder = path.join(config.controlsRoot, "Universal");
  await fsp.mkdir(universalFolder, { recursive: true });
  const universalPath = path.join(universalFolder, "profile.json");
  await writeJson(universalPath, controllerProfile);

  const actions = [];
  actions.push(await writeDolphinControllerSetup(config, controllerProfile));
  actions.push(await writePcsx2ControllerSetup(config, profiles, controllerProfile));
  actions.push(await writeXemuControllerSetup(config, profiles, controllerProfile));
  actions.push(await writeMelonDsControllerSetup(config, profiles, controllerProfile));
  actions.push(await writeDuckStationControllerSetup(config, profiles, controllerProfile));
  actions.push(await writePpssppControllerSetup(config, profiles, controllerProfile));

  const nextState = await saveControllerState({
    defaultController: controllerProfile.controller.id,
    universalProfile: {
      ...controllerProfile,
      path: toPortablePath(universalPath)
    },
    emulatorSetup: actions,
    profiles: {
      [controllerProfile.controller.id]: controllerProfile.controller
    }
  });

  return {
    controllerState: nextState,
    actions,
    profilePath: toPortablePath(universalPath),
    state: await getState()
  };
}

function createUniversalControllerProfile(controller = {}) {
  const name = cleanDeviceName(controller.name || controller.id || "Controller");
  return {
    version: 1,
    appliedAt: new Date().toISOString(),
    controller: {
      id: typeof controller.id === "string" ? controller.id : "",
      name,
      mapping: typeof controller.mapping === "string" ? controller.mapping : "standard",
      source: typeof controller.source === "string" ? controller.source : "",
      transport: typeof controller.transport === "string" ? controller.transport : "",
      buttons: Number.isInteger(controller.buttons) ? controller.buttons : 0,
      axes: Number.isInteger(controller.axes) ? controller.axes : 0,
      live: Boolean(controller.live)
    },
    standardMap: normalizeStandardMap(controller.standardMap)
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

function normalizeStandardMap(map = {}) {
  const defaults = defaultStandardMap();
  const next = cloneJson(defaults);
  const paths = [
    ["face.south", "button"],
    ["face.east", "button"],
    ["face.west", "button"],
    ["face.north", "button"],
    ["shoulders.left", "button"],
    ["shoulders.right", "button"],
    ["triggers.left", "button"],
    ["triggers.right", "button"],
    ["menu.back", "button"],
    ["menu.start", "button"],
    ["menu.home", "button"],
    ["sticks.leftPress", "button"],
    ["sticks.rightPress", "button"],
    ["dpad.up", "button"],
    ["dpad.down", "button"],
    ["dpad.left", "button"],
    ["dpad.right", "button"],
    ["axes.leftX", "axis"],
    ["axes.leftY", "axis"],
    ["axes.rightX", "axis"],
    ["axes.rightY", "axis"]
  ];

  for (const [pathName, type] of paths) {
    setPath(next, pathName, normalizeBinding(getPath(map, pathName), getPath(defaults, pathName), type));
  }
  return next;
}

function normalizeBinding(binding, fallback, type = "button") {
  if (Number.isInteger(binding)) return type === "axis" ? axisBinding(binding, fallback?.direction || 1) : buttonBinding(binding);
  if (!binding || typeof binding !== "object") return cloneJson(fallback);
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function writeDolphinControllerSetup(config, controllerProfile) {
  const emulator = "Dolphin";
  const systemName = "GameCube / Wii";
  const outputFolder = path.join(config.controlsRoot, emulator);
  await fsp.mkdir(outputFolder, { recursive: true });

  const gcPadText = dolphinGameCubePadIni(controllerProfile);
  const gcPadTemplate = path.join(outputFolder, "GCPadNew.ini");
  await fsp.writeFile(gcPadTemplate, gcPadText);

  const action = {
    system: systemName,
    emulator,
    status: "saved",
    label: "Saved Dolphin profile template",
    detail: toPortablePath(gcPadTemplate),
    canOpen: true
  };

  const dolphinConfig = dolphinConfigFolder();
  const gcPadTarget = dolphinConfig ? path.join(dolphinConfig, "GCPadNew.ini") : "";
  if (!gcPadTarget) {
    action.status = "needsReview";
    action.label = "Dolphin config folder not found";
    action.detail = toPortablePath(gcPadTemplate);
    return action;
  }

  try {
    await fsp.mkdir(dolphinConfig, { recursive: true });
    await backupExistingConfig(gcPadTarget, "Dolphin");
    await fsp.writeFile(gcPadTarget, gcPadText);
    action.status = "applied";
    action.label = "Applied GameCube pad profile";
    action.detail = gcPadTarget;
  } catch (error) {
    action.status = "needsReview";
    action.label = "Could not write Dolphin config";
    action.detail = error.message;
  }

  return action;
}

async function writePcsx2ControllerSetup(config, profiles, controllerProfile) {
  const systemName = "PS2";
  const emulator = "PCSX2";
  const templatePath = await writeControllerTemplate(config, emulator, "PCSX2.ini", pcsx2ControllerIni(controllerProfile));
  const targetPath = pcsx2ConfigPath();
  const configured = emulatorConfigured(profiles, systemName);

  if (!targetPath && !configured) {
    return controllerAction(systemName, emulator, "missing", "PCSX2 not configured", profiles[systemName]?.command || "Not configured", false);
  }

  if (!targetPath) {
    return controllerAction(systemName, emulator, "needsReview", "Open PCSX2 once, then apply again", toPortablePath(templatePath), configured);
  }

  try {
    const content = fs.existsSync(targetPath) ? await fsp.readFile(targetPath, "utf8") : "";
    let next = upsertIniEntries(content, "InputSources", {
      SDL: "true",
      SDLControllerEnhancedMode: process.platform === "win32" ? "false" : "true"
    });
    next = upsertIniEntries(next, "Pad", {
      MultitapPort1: "false",
      MultitapPort2: "false"
    });
    next = upsertIniEntries(next, "Pad1", pcsx2PadEntries());
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await backupExistingConfig(targetPath, emulator);
    await fsp.writeFile(targetPath, next);
    return controllerAction(systemName, emulator, "applied", "Applied PS2 SDL controls", targetPath, configured);
  } catch (error) {
    return controllerAction(systemName, emulator, "needsReview", "Could not write PCSX2 controls", error.message, configured);
  }
}

async function writeXemuControllerSetup(config, profiles, controllerProfile) {
  const systemName = "Xbox";
  const emulator = "xemu";
  const templatePath = await writeControllerTemplate(config, emulator, "xemu.toml", xemuControllerToml(controllerProfile));
  const targetPath = xemuConfigPath();
  const configured = emulatorConfigured(profiles, systemName);

  if (!targetPath && !configured) {
    return controllerAction(systemName, emulator, "missing", "xemu not configured", profiles[systemName]?.command || "Not configured", false);
  }

  if (!targetPath) {
    return controllerAction(systemName, emulator, "needsReview", "Open xemu once, then apply again", toPortablePath(templatePath), configured);
  }

  try {
    const content = fs.existsSync(targetPath) ? await fsp.readFile(targetPath, "utf8") : "";
    const next = upsertIniEntries(content, "input.bindings", {
      port1_driver: "'usb-xbox-gamepad'"
    });
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await backupExistingConfig(targetPath, emulator);
    await fsp.writeFile(targetPath, next);
    return controllerAction(systemName, emulator, "applied", "Enabled xemu player 1 gamepad", targetPath, configured);
  } catch (error) {
    return controllerAction(systemName, emulator, "needsReview", "Could not write xemu controls", error.message, configured);
  }
}

async function writeMelonDsControllerSetup(config, profiles, controllerProfile) {
  const systemName = "NintendoDS";
  const emulator = "melonDS";
  const templatePath = await writeControllerTemplate(config, emulator, "melonDS.toml", melonDsControllerToml(controllerProfile));
  const targetPath = melonDsConfigPath();
  const configured = emulatorConfigured(profiles, systemName);

  if (!targetPath && !configured) {
    return controllerAction(systemName, emulator, "missing", "melonDS not configured", profiles[systemName]?.command || "Not configured", false);
  }

  if (!targetPath) {
    return controllerAction(systemName, emulator, "needsReview", "Open melonDS once, then apply again", toPortablePath(templatePath), configured);
  }

  try {
    const content = fs.existsSync(targetPath) ? await fsp.readFile(targetPath, "utf8") : "";
    let next = upsertIniEntries(content, "Instance0", { JoystickID: "0" });
    next = upsertIniEntries(next, "Instance0.Joystick", melonDsJoystickEntries(controllerProfile));
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await backupExistingConfig(targetPath, emulator);
    await fsp.writeFile(targetPath, next);
    return controllerAction(systemName, emulator, "applied", "Applied Nintendo DS controls", targetPath, configured);
  } catch (error) {
    return controllerAction(systemName, emulator, "needsReview", "Could not write melonDS controls", error.message, configured);
  }
}

async function writeDuckStationControllerSetup(config, profiles, controllerProfile) {
  const systemName = "PS1";
  const emulator = "DuckStation";
  const templatePath = await writeControllerTemplate(config, emulator, "settings.ini", duckStationControllerIni(controllerProfile));
  const configured = emulatorConfigured(profiles, systemName);
  const targetPath = duckStationConfigPath() || (configured ? preferredDuckStationConfigPath() : "");

  if (!targetPath && !configured) {
    return controllerAction(systemName, emulator, "missing", "DuckStation not configured", profiles[systemName]?.command || "Not configured", false);
  }

  if (!targetPath) {
    return controllerAction(systemName, emulator, "needsReview", "Open DuckStation once, then apply again", toPortablePath(templatePath), configured);
  }

  try {
    const content = fs.existsSync(targetPath) ? await fsp.readFile(targetPath, "utf8") : "";
    let next = upsertIniEntries(content, "InputSources", {
      SDL: "true",
      SDLControllerEnhancedMode: "false"
    });
    next = upsertIniEntries(next, "ControllerPorts", {
      MultitapMode: "Disabled"
    });
    next = upsertIniEntries(next, "Pad1", duckStationPadEntries());
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await backupExistingConfig(targetPath, emulator);
    await fsp.writeFile(targetPath, next);
    return controllerAction(systemName, emulator, "applied", "Applied PS1 SDL controls", targetPath, configured);
  } catch (error) {
    return controllerAction(systemName, emulator, "needsReview", "Could not write DuckStation controls", error.message, configured);
  }
}

async function writePpssppControllerSetup(config, profiles, controllerProfile) {
  const systemName = "PSP";
  const emulator = "PPSSPP";
  const templatePath = await writeControllerTemplate(config, emulator, "controls.ini", ppssppControlsIni(controllerProfile));
  const configured = emulatorConfigured(profiles, systemName);
  const targetPath = ppssppControlsPath() || (configured ? preferredPpssppControlsPath() : "");

  if (!targetPath && !configured) {
    return controllerAction(systemName, emulator, "missing", "PPSSPP not configured", profiles[systemName]?.command || "Not configured", false);
  }

  if (!targetPath) {
    return controllerAction(systemName, emulator, "needsReview", "Open PPSSPP once, then apply again", toPortablePath(templatePath), configured);
  }

  try {
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await backupExistingConfig(targetPath, emulator);
    await fsp.writeFile(targetPath, ppssppControlsIni(controllerProfile));
    return controllerAction(systemName, emulator, "applied", "Applied PSP controls", targetPath, configured);
  } catch (error) {
    return controllerAction(systemName, emulator, "needsReview", "Could not write PPSSPP controls", error.message, configured);
  }
}

async function writeControllerTemplate(config, emulator, fileName, content) {
  const outputFolder = path.join(config.controlsRoot, emulator);
  await fsp.mkdir(outputFolder, { recursive: true });
  const templatePath = path.join(outputFolder, fileName);
  await fsp.writeFile(templatePath, content);
  return templatePath;
}

function controllerAction(system, emulator, status, label, detail, canOpen) {
  return { system, emulator, status, label, detail, canOpen };
}

function emulatorConfigured(profiles, systemName) {
  return Boolean(profiles[systemName]?.command && commandExists(profiles[systemName].command));
}

function pcsx2ControllerIni() {
  return [
    "[InputSources]",
    "SDL = true",
    `SDLControllerEnhancedMode = ${process.platform === "win32" ? "false" : "true"}`,
    "",
    "[Pad]",
    "MultitapPort1 = false",
    "MultitapPort2 = false",
    "",
    "[Pad1]",
    ...Object.entries(pcsx2PadEntries()).map(([key, value]) => `${key} = ${value}`),
    ""
  ].join("\n");
}

function pcsx2PadEntries() {
  return {
    Type: "DualShock2",
    InvertL: "0",
    InvertR: "0",
    Deadzone: "0",
    AxisScale: "1.33",
    LargeMotorScale: "1",
    SmallMotorScale: "1",
    ButtonDeadzone: "0",
    PressureModifier: "0.5",
    Up: "SDL-0/DPadUp",
    Right: "SDL-0/DPadRight",
    Down: "SDL-0/DPadDown",
    Left: "SDL-0/DPadLeft",
    Triangle: "SDL-0/FaceNorth",
    Circle: "SDL-0/FaceEast",
    Cross: "SDL-0/FaceSouth",
    Square: "SDL-0/FaceWest",
    Select: "SDL-0/Back",
    Start: "SDL-0/Start",
    L1: "SDL-0/LeftShoulder",
    L2: "SDL-0/+LeftTrigger",
    R1: "SDL-0/RightShoulder",
    R2: "SDL-0/+RightTrigger",
    L3: "SDL-0/LeftStick",
    R3: "SDL-0/RightStick",
    LUp: "SDL-0/-LeftY",
    LRight: "SDL-0/+LeftX",
    LDown: "SDL-0/+LeftY",
    LLeft: "SDL-0/-LeftX",
    RUp: "SDL-0/-RightY",
    RRight: "SDL-0/+RightX",
    RDown: "SDL-0/+RightY",
    RLeft: "SDL-0/-RightX",
    LargeMotor: "SDL-0/LargeMotor",
    SmallMotor: "SDL-0/SmallMotor"
  };
}

function xemuControllerToml() {
  return [
    "[input.bindings]",
    "port1_driver = 'usb-xbox-gamepad'",
    ""
  ].join("\n");
}

function melonDsControllerToml(controllerProfile) {
  return [
    "[Instance0]",
    "JoystickID = 0",
    "",
    "[Instance0.Joystick]",
    ...Object.entries(melonDsJoystickEntries(controllerProfile)).map(([key, value]) => `${key} = ${value}`),
    ""
  ].join("\n");
}

function melonDsJoystickEntries(controllerProfile) {
  const map = normalizeStandardMap(controllerProfile.standardMap);
  return {
    A: buttonIndex(map.face.east),
    B: buttonIndex(map.face.south),
    X: buttonIndex(map.face.north),
    Y: buttonIndex(map.face.west),
    L: buttonIndex(map.shoulders.left),
    R: buttonIndex(map.shoulders.right),
    Select: buttonIndex(map.menu.back),
    Start: buttonIndex(map.menu.start),
    Up: buttonIndex(map.dpad.up),
    Down: buttonIndex(map.dpad.down),
    Left: buttonIndex(map.dpad.left),
    Right: buttonIndex(map.dpad.right)
  };
}

function duckStationControllerIni() {
  return [
    "[InputSources]",
    "SDL = true",
    "SDLControllerEnhancedMode = false",
    "",
    "[ControllerPorts]",
    "MultitapMode = Disabled",
    "",
    "[Pad1]",
    ...Object.entries(duckStationPadEntries()).map(([key, value]) => `${key} = ${value}`),
    ""
  ].join("\n");
}

function duckStationPadEntries() {
  return {
    Type: "AnalogController",
    Up: "SDL-0/DPadUp",
    Right: "SDL-0/DPadRight",
    Down: "SDL-0/DPadDown",
    Left: "SDL-0/DPadLeft",
    Triangle: "SDL-0/Y",
    Circle: "SDL-0/B",
    Cross: "SDL-0/A",
    Square: "SDL-0/X",
    Select: "SDL-0/Back",
    Start: "SDL-0/Start",
    L1: "SDL-0/LeftShoulder",
    R1: "SDL-0/RightShoulder",
    L2: "SDL-0/+LeftTrigger",
    R2: "SDL-0/+RightTrigger",
    L3: "SDL-0/LeftStick",
    R3: "SDL-0/RightStick",
    LLeft: "SDL-0/-LeftX",
    LRight: "SDL-0/+LeftX",
    LDown: "SDL-0/+LeftY",
    LUp: "SDL-0/-LeftY",
    RLeft: "SDL-0/-RightX",
    RRight: "SDL-0/+RightX",
    RDown: "SDL-0/+RightY",
    RUp: "SDL-0/-RightY",
    SmallMotor: "SDL-0/SmallMotor",
    LargeMotor: "SDL-0/LargeMotor",
    AnalogDPadInDigitalMode: "false"
  };
}

function ppssppControlsIni() {
  return [
    "[ControlMapping]",
    "Up = 10-19",
    "Down = 10-20",
    "Left = 10-21",
    "Right = 10-22",
    "Circle = 10-190",
    "Cross = 10-189",
    "Square = 10-191",
    "Triangle = 10-188",
    "Start = 10-197",
    "Select = 10-196",
    "L = 10-194",
    "R = 10-195",
    "An.Up = 10-4003",
    "An.Down = 10-4002",
    "An.Left = 10-4001",
    "An.Right = 10-4000",
    ""
  ].join("\n");
}

function buttonIndex(binding) {
  return Number.isInteger(binding?.index) ? String(binding.index) : "-1";
}

function pcsx2ConfigPath() {
  return firstExistingPath([
    path.join(os.homedir(), "Library", "Application Support", "PCSX2", "inis", "PCSX2.ini"),
    path.join(os.homedir(), ".config", "PCSX2", "inis", "PCSX2.ini"),
    path.join(os.homedir(), "Documents", "PCSX2", "inis", "PCSX2.ini")
  ]);
}

function xemuConfigPath() {
  return firstExistingPath([
    path.join(os.homedir(), "Library", "Application Support", "xemu", "xemu", "xemu.toml"),
    path.join(os.homedir(), ".local", "share", "xemu", "xemu", "xemu.toml"),
    path.join(os.homedir(), "AppData", "Roaming", "xemu", "xemu", "xemu.toml")
  ]);
}

function melonDsConfigPath() {
  return firstExistingPath([
    path.join(os.homedir(), "Library", "Preferences", "melonDS", "melonDS.toml"),
    path.join(os.homedir(), ".config", "melonDS", "melonDS.toml"),
    path.join(os.homedir(), "AppData", "Roaming", "melonDS", "melonDS.toml")
  ]);
}

function duckStationConfigPath() {
  return firstExistingPath([
    preferredDuckStationConfigPath(),
    path.join(os.homedir(), "Library", "Application Support", "duckstation", "settings.ini"),
    path.join(os.homedir(), ".local", "share", "duckstation", "settings.ini"),
    path.join(os.homedir(), "Documents", "DuckStation", "settings.ini")
  ]);
}

function preferredDuckStationConfigPath() {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "DuckStation", "settings.ini");
  if (process.platform === "win32") return path.join(os.homedir(), "Documents", "DuckStation", "settings.ini");
  return path.join(os.homedir(), ".local", "share", "duckstation", "settings.ini");
}

function ppssppControlsPath() {
  return firstExistingPath([
    preferredPpssppControlsPath(),
    path.join(os.homedir(), ".config", "ppsspp", "PSP", "SYSTEM", "controls.ini"),
    path.join(os.homedir(), "Documents", "PPSSPP", "PSP", "SYSTEM", "controls.ini")
  ]);
}

function preferredPpssppControlsPath() {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "PPSSPP", "PSP", "SYSTEM", "controls.ini");
  if (process.platform === "win32") return path.join(os.homedir(), "Documents", "PPSSPP", "PSP", "SYSTEM", "controls.ini");
  return path.join(os.homedir(), ".config", "ppsspp", "PSP", "SYSTEM", "controls.ini");
}

function firstExistingPath(paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate)) || "";
}

function upsertIniEntries(content, section, entries) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 1 && lines[0] === "") lines.pop();

  const sectionHeader = `[${section}]`;
  let start = lines.findIndex((line) => line.trim() === sectionHeader);
  if (start === -1) {
    if (lines.length && lines[lines.length - 1].trim()) lines.push("");
    lines.push(sectionHeader);
    for (const [key, value] of Object.entries(entries)) lines.push(`${key} = ${value}`);
    lines.push("");
    return lines.join("\n");
  }

  let end = lines.findIndex((line, index) => index > start && /^\s*\[[^\]]+\]\s*$/.test(line));
  if (end === -1) end = lines.length;

  const pending = new Map(Object.entries(entries));
  for (let index = start + 1; index < end; index += 1) {
    const match = lines[index].match(/^(\s*([^=:#\s]+)\s*=\s*)(.*)$/);
    if (!match || !pending.has(match[2])) continue;
    lines[index] = `${match[1]}${pending.get(match[2])}`;
    pending.delete(match[2]);
  }

  const additions = Array.from(pending.entries()).map(([key, value]) => `${key} = ${value}`);
  lines.splice(end, 0, ...additions);
  return lines.join("\n");
}

function dolphinConfigFolder() {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Dolphin", "Config");
  if (process.platform === "win32") return path.join(os.homedir(), "Documents", "Dolphin Emulator", "Config");
  return path.join(os.homedir(), ".config", "dolphin-emu");
}

function dolphinGameCubePadIni(controllerProfile) {
  const device = `SDL/0/${dolphinSafeDeviceName(controllerProfile.controller.name)}`;
  const map = normalizeStandardMap(controllerProfile.standardMap);
  return [
    "[GCPad1]",
    `Device = ${device}`,
    `Buttons/A = ${dolphinBinding(map.face.south)}`,
    `Buttons/B = ${dolphinBinding(map.face.east)}`,
    `Buttons/X = ${dolphinBinding(map.face.west)}`,
    `Buttons/Y = ${dolphinBinding(map.face.north)}`,
    `Buttons/Z = ${dolphinBinding(map.shoulders.right)}`,
    `Buttons/Start = ${dolphinBinding(map.menu.start)}`,
    `Main Stick/Up = ${dolphinAxis(map.axes.leftY, 1)}`,
    `Main Stick/Down = ${dolphinAxis(map.axes.leftY, -1)}`,
    `Main Stick/Left = ${dolphinAxis(map.axes.leftX, -1)}`,
    `Main Stick/Right = ${dolphinAxis(map.axes.leftX, 1)}`,
    "Main Stick/Calibration = 100.00 141.42 100.00 141.42 100.00 141.42 100.00 141.42",
    `C-Stick/Up = ${dolphinAxis(map.axes.rightY, 1)}`,
    `C-Stick/Down = ${dolphinAxis(map.axes.rightY, -1)}`,
    `C-Stick/Left = ${dolphinAxis(map.axes.rightX, -1)}`,
    `C-Stick/Right = ${dolphinAxis(map.axes.rightX, 1)}`,
    "C-Stick/Calibration = 100.00 141.42 100.00 141.42 100.00 141.42 100.00 141.42",
    `Triggers/L = ${dolphinBinding(map.triggers.left)}`,
    `Triggers/R = ${dolphinBinding(map.triggers.right)}`,
    `D-Pad/Up = ${dolphinBinding(map.dpad.up)}`,
    `D-Pad/Down = ${dolphinBinding(map.dpad.down)}`,
    `D-Pad/Left = ${dolphinBinding(map.dpad.left)}`,
    `D-Pad/Right = ${dolphinBinding(map.dpad.right)}`,
    "[GCPad2]",
    "Device =",
    "[GCPad3]",
    "Device =",
    "[GCPad4]",
    "Device =",
    ""
  ].join("\n");
}

function dolphinBinding(binding) {
  if (binding?.type === "axis") return dolphinAxis(binding, 1);
  const index = Number.isInteger(binding?.index) ? binding.index : 0;
  return `\`Button ${index}\``;
}

function dolphinAxis(binding, multiplier = 1) {
  const index = Number.isInteger(binding?.index) ? binding.index : 0;
  const direction = (Number(binding?.direction) < 0 ? -1 : 1) * multiplier;
  return `\`Axis ${index}${direction > 0 ? "+" : "-"}\``;
}

function dolphinSafeDeviceName(name) {
  return cleanDeviceName(name).replace(/[`[\]\r\n]/g, "").slice(0, 120) || "Controller";
}

async function backupExistingConfig(filePath, emulatorName) {
  if (!fs.existsSync(filePath)) return "";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(rootDir, "Backups", "Config", stamp, emulatorName, path.basename(filePath));
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.copyFile(filePath, target);
  return target;
}

function resolveCommandPath(command, sourceRoot = rootDir) {
  return emulatorStore.resolveCommandPath(command, { rootDir, sourceRoot, resolveConfiguredPath });
}

function commandLooksLikePath(command) {
  return emulatorStore.commandLooksLikePath(command);
}

function detectCommand(commands, emulatorRoot = path.join(rootDir, "Emulators")) {
  return emulatorStore.detectCommand(commands, { emulatorRoot, rootDir, platformFolder });
}

function findPortableEmulator(binaryName, emulatorRoot = path.join(rootDir, "Emulators")) {
  return emulatorStore.findPortableEmulator(binaryName, { emulatorRoot, platformFolder });
}

function findInstalledEmulator(binaryName) {
  return emulatorStore.findInstalledEmulator(binaryName);
}

function walkSync(folder, depth = 0) {
  return emulatorStore.walkSync(folder, depth);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function scanLibrary() {
  const config = normalizeConfig(await readJson(configPath, createDefaultConfig()));
  const library = await libraryStore.scanLibraryEntries({ config, systems, rootDir, toPortablePath });
  await writeJson(libraryPath, library);
  return library;
}

async function getState() {
  const [rawConfig, rawProfiles, library] = await Promise.all([
    readJson(configPath, createDefaultConfig()),
    readJson(emulatorProfilesPath, {}),
    readJson(libraryPath, [])
  ]);
  const config = normalizeConfig(rawConfig);
  const profiles = normalizeProfiles(rawProfiles, rawConfig.rootDir, config.emulatorRoot);

  return {
    config,
    profiles,
    library,
    systems,
    health: await healthCheck(config, profiles),
    environment: {
      rootDir,
      platform: process.platform,
      platformFolder,
      portableRootName: path.basename(rootDir)
    }
  };
}

function archiveSearchTerms(game) {
  return artworkStore.archiveSearchTerms(game, systems[game.system] || {});
}

function escapeArchiveQuery(value) {
  return artworkStore.escapeArchiveQuery(value);
}

async function searchArchiveArtwork(gameId) {
  const library = await readJson(libraryPath, []);
  const game = library.find((item) => item.id === gameId);
  if (!game) throw new Error("Pick a game before searching for artwork.");

  const searchUrl = new URL("https://archive.org/advancedsearch.php");
  searchUrl.searchParams.set("q", archiveSearchTerms(game));
  searchUrl.searchParams.append("fl[]", "identifier");
  searchUrl.searchParams.append("fl[]", "title");
  searchUrl.searchParams.append("fl[]", "mediatype");
  searchUrl.searchParams.append("fl[]", "description");
  searchUrl.searchParams.set("rows", "10");
  searchUrl.searchParams.set("page", "1");
  searchUrl.searchParams.set("output", "json");

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "GameRoom/0.1 artwork search"
    }
  });
  if (!response.ok) throw new Error(`Internet Archive search failed: ${response.status}`);

  const payload = await response.json();
  const docs = payload?.response?.docs || [];
  return docs
    .filter((doc) => doc.identifier)
    .map((doc) => ({
      provider: "Internet Archive",
      sourceId: doc.identifier,
      title: doc.title || doc.identifier,
      mediaType: doc.mediatype || "",
      description: plainText(doc.description || ""),
      itemUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
      imageUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
      thumbnailUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`
    }));
}

async function saveArtworkFromUrl(gameId, imageUrl, source = {}) {
  const rawConfig = await readJson(configPath, createDefaultConfig());
  const config = normalizeConfig(rawConfig);
  const library = await readJson(libraryPath, []);
  const game = library.find((item) => item.id === gameId);
  if (!game) throw new Error("Pick a game before saving artwork.");
  if (!systems[game.system]) throw new Error(`Unsupported system: ${game.system}`);

  const download = await downloadArtworkImage(imageUrl);
  const extension = download.extension || "jpg";
  const coverFolder = path.join(config.coverRoot, systems[game.system].folder);
  await fsp.mkdir(coverFolder, { recursive: true });

  await removeExistingCoverVersions(coverFolder, game.id);
  const coverPath = path.join(coverFolder, `${game.id}.${extension}`);
  await fsp.writeFile(coverPath, download.bytes);

  const artworkRecord = {
    gameId: game.id,
    title: game.title,
    system: game.system,
    coverPath: toPortablePath(coverPath),
    localFile: path.basename(coverPath),
    source: {
      provider: source.provider || "Manual URL",
      sourceId: source.sourceId || "",
      title: source.title || "",
      itemUrl: source.itemUrl || "",
      imageUrl: download.finalUrl,
      originalUrl: imageUrl
    },
    savedAt: new Date().toISOString()
  };

  const metadataPath = path.join(config.metadataRoot, "artwork", `${game.id}.json`);
  await writeJson(metadataPath, artworkRecord);
  await writeJson(path.join(coverFolder, `${game.id}.source.json`), artworkRecord);
  await fsp.writeFile(path.join(coverFolder, `${game.id}.source.url`), `${download.finalUrl}\n`);

  const updatedLibrary = await scanLibrary();
  return {
    gameId: game.id,
    coverPath: toPortablePath(coverPath),
    library: updatedLibrary,
    state: await getState()
  };
}

async function downloadArtworkImage(imageUrl, depth = 0) {
  if (depth > 3) throw new Error("Could not resolve that artwork URL to an image.");

  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new Error("Paste a full image URL that starts with http or https.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Artwork URL must start with http or https.");
  }

  const wrappedImageUrl = extractWrappedImageUrl(parsedUrl);
  if (wrappedImageUrl && wrappedImageUrl !== imageUrl) {
    return downloadArtworkImage(wrappedImageUrl, depth + 1);
  }

  const response = await fetch(parsedUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "GameRoom/0.1 artwork downloader",
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*,*/*;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`Artwork download failed: ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);
  const maxImageBytes = 12 * 1024 * 1024;
  const maxPageBytes = 3 * 1024 * 1024;

  if (contentType.toLowerCase().startsWith("image/")) {
    if (contentType.toLowerCase().startsWith("image/svg")) {
      throw new Error("SVG artwork is not supported. Paste a jpg, png, webp, gif, or avif image URL.");
    }
    if (contentLength > maxImageBytes) throw new Error("Artwork image is larger than 12 MB.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxImageBytes) throw new Error("Artwork image is larger than 12 MB.");
    const finalUrl = response.url || parsedUrl.toString();
    return {
      bytes,
      finalUrl,
      extension: extensionForContentType(contentType) || extensionForBytes(bytes) || extensionForUrl(new URL(finalUrl)) || "jpg"
    };
  }

  const urlExtension = extensionForUrl(new URL(response.url || parsedUrl.toString()));
  if (urlExtension && (!contentType || contentType === "application/octet-stream")) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxImageBytes) throw new Error("Artwork image is larger than 12 MB.");
    return {
      bytes,
      finalUrl: response.url || parsedUrl.toString(),
      extension: extensionForBytes(bytes) || urlExtension
    };
  }

  if (contentLength > maxPageBytes) {
    throw new Error("That URL opened a web page, not a direct image URL.");
  }

  const html = await response.text();
  const pageImageUrl = extractImageUrlFromHtml(html, response.url || parsedUrl.toString());
  if (pageImageUrl) return downloadArtworkImage(pageImageUrl, depth + 1);

  throw new Error("That URL did not return an image. Open the image itself, copy its image address, then paste that URL.");
}

function extractWrappedImageUrl(parsedUrl) {
  return artworkStore.extractWrappedImageUrl(parsedUrl);
}

function extractImageUrlFromHtml(html, baseUrl) {
  return artworkStore.extractImageUrlFromHtml(html, baseUrl);
}

function decodeHtmlEntities(value) {
  return artworkStore.decodeHtmlEntities(value);
}

async function removeExistingCoverVersions(coverFolder, gameId) {
  await Promise.all(
    coverExtensions.map((extension) => fsp.rm(path.join(coverFolder, `${gameId}.${extension}`), { force: true }))
  );
}

async function openGoogleImagesForGame(gameId) {
  const library = await readJson(libraryPath, []);
  const game = library.find((item) => item.id === gameId);
  if (!game) throw new Error("Pick a game before opening Google Images.");

  const query = `${game.title} ${labelForSystem(game.system)} cover art box art`;
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("tbm", "isch");
  url.searchParams.set("q", query);
  await shell.openExternal(url.toString());
  return true;
}

function plainText(value) {
  return artworkStore.plainText(value);
}

function extensionForContentType(contentType) {
  return artworkStore.extensionForContentType(contentType);
}

function extensionForUrl(parsedUrl) {
  return artworkStore.extensionForUrl(parsedUrl, coverExtensions);
}

function extensionForBytes(bytes) {
  return artworkStore.extensionForBytes(bytes);
}

async function healthCheck(config, profiles) {
  const rows = [];
  rows.push(checkPath("Game root", config.gameRoot));
  rows.push(checkPath("Save root", config.saveRoot));
  rows.push(checkPath("BIOS root", config.biosRoot));
  rows.push(checkPath("Controls root", config.controlsRoot));
  rows.push(checkPath("Covers root", config.coverRoot));
  rows.push(checkPath("Downloads root", config.downloadsRoot));

  for (const [systemName, profile] of Object.entries(profiles)) {
    rows.push({
      label: `${systemName} emulator`,
      ok: Boolean(profile.command && commandExists(profile.command)),
      detail: profile.command || "Not configured"
    });

    if (profile.bios === "required") {
      const biosStatus = requiredFilesStatus(config, systemName);
      rows.push({
        label: `${systemName} BIOS/files`,
        ok: biosStatus.ok,
        detail: biosStatus.missing.length
          ? `${biosStatus.folder} - missing ${biosStatus.missing.join(", ")}`
          : biosStatus.folder
      });
    }
  }

  return rows;
}

function checkPath(label, target) {
  return {
    label,
    ok: Boolean(target && fs.existsSync(target)),
    detail: target || "Not configured"
  };
}

function commandExists(command) {
  return emulatorStore.commandExists(command, { rootDir });
}

function findCommandOnPath(command) {
  return emulatorStore.findCommandOnPath(command);
}

function isExecutableFile(target) {
  return emulatorStore.isExecutableFile(target);
}

function prepareLaunchCommand(command, emulatorName) {
  return emulatorStore.prepareLaunchCommand(command, emulatorName, { rootDir, toPortablePath });
}

function hasUserFiles(folder) {
  return fs.existsSync(folder) && fs.readdirSync(folder).some((name) => !name.startsWith("."));
}

function listUserFiles(folder) {
  if (!fs.existsSync(folder)) return [];
  return walkSync(folder).filter((filePath) => !path.basename(filePath).startsWith("."));
}

function requiredFilesStatus(config, systemName) {
  const folder = path.join(config.biosRoot, systems[systemName].folder);
  const files = listUserFiles(folder);
  const names = files.map((filePath) => path.basename(filePath));

  if (systemName === "Xbox") {
    const hasMcpx = names.some((name) => /mcpx/i.test(name));
    const hasBios = names.some((name) => /(?:complex|bios|flash|xbox).*\.bin$/i.test(name) && !/mcpx/i.test(name));
    const hasHdd = names.some((name) => /(?:hdd|hard.?disk|xbox_hdd).*\.(?:img|qcow2|raw)$/i.test(name) || /\.(?:qcow2)$/i.test(name));
    return {
      folder,
      ok: hasMcpx && hasBios && hasHdd,
      missing: [
        hasMcpx ? "" : "MCPX boot ROM",
        hasBios ? "" : "BIOS/flash image",
        hasHdd ? "" : "Xbox hard drive image"
      ].filter(Boolean)
    };
  }

  return {
    folder,
    ok: files.length > 0,
    missing: files.length ? [] : ["BIOS files"]
  };
}

async function launchGame(gameId) {
  const library = await readJson(libraryPath, []);
  const rawConfig = await readJson(configPath, createDefaultConfig());
  const config = normalizeConfig(rawConfig);
  const profiles = normalizeProfiles(await readJson(emulatorProfilesPath, {}), rawConfig.rootDir, config.emulatorRoot);
  const game = library.find((item) => item.id === gameId);
  if (!game) throw new Error("Game not found. Scan the library first.");

  const profile = profiles[game.system];
  if (!profile?.command) throw new Error(`No emulator configured for ${game.system}.`);
  if (profile.bios === "required") {
    const biosStatus = requiredFilesStatus(config, game.system);
    if (!biosStatus.ok) {
      throw new Error(`${game.system} needs ${biosStatus.missing.join(", ")} first. Add them to ${toPortablePath(biosStatus.folder)}.`);
    }
  }

  const gamePath = resolveConfiguredPath(game.path, rootDir, game.path);
  if (!fs.existsSync(gamePath)) throw new Error(`Game file is missing: ${game.path}`);
  const launchGameInfo = { ...game, path: gamePath };

  await snapshotSaves("before", launchGameInfo);

  const command = prepareLaunchCommand(profile.command, profile.emulator);
  const args = profile.args.map((arg) => arg.replace("{game}", gamePath));
  let launchId = "";
  try {
    const child = spawn(command, args, {
      cwd: rootDir,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", (error) => reject(new Error(`Could not launch ${profile.emulator}: ${error.message}`)));
    });
    launchId = `${game.id}:${child.pid || "process"}:${Date.now()}`;
    child.once("close", (exitCode, signal) => {
      notifyGameEnded({
        gameId: game.id,
        launchId,
        title: game.title,
        system: game.system,
        emulator: profile.emulator,
        exitCode,
        signal
      });
    });
    child.unref();
  } catch (error) {
    throw new Error(error.message || `Could not launch ${profile.emulator}.`);
  }

  return { game: launchGameInfo, command, args, launchId };
}

function notifyGameEnded(payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("game:ended", payload);
  }
}

async function openEmulator(systemName) {
  const rawConfig = await readJson(configPath, createDefaultConfig());
  const config = normalizeConfig(rawConfig);
  const profiles = normalizeProfiles(await readJson(emulatorProfilesPath, {}), rawConfig.rootDir, config.emulatorRoot);
  const profile = profiles[systemName];
  if (!profile) throw new Error(`Unknown system: ${systemName}`);

  const command = prepareLaunchCommand(profile.command, profile.emulator);
  const child = spawn(command, [], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", (error) => reject(new Error(`Could not open ${profile.emulator}: ${error.message}`)));
  });
  child.unref();
  return { system: systemName, emulator: profile.emulator, command };
}

async function openEmulatorDownload(systemName) {
  const system = systems[systemName];
  if (!system?.downloadUrl) throw new Error(`No download page configured for ${systemName}.`);
  await shell.openExternal(system.downloadUrl);
  return {
    system: systemName,
    emulator: system.emulator,
    url: system.downloadUrl
  };
}

async function chooseEmulator(systemName) {
  if (!systems[systemName]) throw new Error(`Unknown system: ${systemName}`);
  const rawConfig = await readJson(configPath, createDefaultConfig());
  const config = normalizeConfig(rawConfig);
  const profiles = normalizeProfiles(await readJson(emulatorProfilesPath, {}), rawConfig.rootDir, config.emulatorRoot);
  const profile = profiles[systemName];
  const defaultPath = emulatorPickerDefaultPath(config, profile);
  const properties = process.platform === "darwin" ? ["openFile", "openDirectory"] : ["openFile"];
  const result = await dialog.showOpenDialog({
    defaultPath,
    properties,
    filters: process.platform === "win32" ? [{ name: "Applications", extensions: ["exe"] }] : undefined
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true, state: await getState() };
  }

  const command = normalizeChosenEmulatorPath(result.filePaths[0], systemName);
  if (!commandExists(command)) {
    throw new Error(`${profile.emulator} executable is missing or cannot be opened: ${toPortablePath(command)}`);
  }

  const nextProfiles = { ...profiles };
  for (const [candidateSystem, candidateProfile] of Object.entries(nextProfiles)) {
    if (candidateProfile.emulator === profile.emulator) {
      nextProfiles[candidateSystem] = {
        ...candidateProfile,
        command
      };
    }
  }

  await writeJson(emulatorProfilesPath, serializeProfiles(nextProfiles));
  return {
    canceled: false,
    system: systemName,
    emulator: profile.emulator,
    command: toPortablePath(command),
    state: await getState()
  };
}

function emulatorPickerDefaultPath(config, profile = {}) {
  return emulatorStore.emulatorPickerDefaultPath(config, profile, { rootDir, resolveCommandPathForApp: resolveCommandPath });
}

function normalizeChosenEmulatorPath(selectedPath, systemName) {
  return emulatorStore.normalizeChosenEmulatorPath(selectedPath, systemName, { systems });
}

function macAppExecutablePath(appPath) {
  return emulatorStore.macAppExecutablePath(appPath);
}

function executableInFolder(folder, systemName) {
  return emulatorStore.executableInFolder(folder, systemName, { systems });
}

function isCandidateExecutablePath(filePath) {
  return emulatorStore.isCandidateExecutablePath(filePath);
}

async function scanEmulators() {
  const rawConfig = await readJson(configPath, createDefaultConfig());
  const config = normalizeConfig(rawConfig);
  const currentProfiles = normalizeProfiles(await readJson(emulatorProfilesPath, {}), rawConfig.rootDir, config.emulatorRoot);
  const detectedProfiles = createDefaultProfiles(config.emulatorRoot);
  const nextProfiles = {};
  let found = 0;
  let updated = 0;

  for (const [systemName, profile] of Object.entries(currentProfiles)) {
    const detected = detectedProfiles[systemName] || {};
    const currentOk = commandExists(profile.command);
    const detectedOk = commandExists(detected.command);
    const nextProfile = { ...profile };
    if (!currentOk && detectedOk) {
      nextProfile.command = detected.command;
      updated += 1;
    }
    if (commandExists(nextProfile.command)) found += 1;
    nextProfiles[systemName] = nextProfile;
  }

  await writeJson(emulatorProfilesPath, serializeProfiles(nextProfiles));
  return {
    found,
    updated,
    state: await getState()
  };
}

async function resetSetup() {
  const current = normalizeConfig(await readJson(configPath, createDefaultConfig()));
  const config = normalizeConfig({
    ...createDefaultConfig(),
    favoriteGameIds: current.favoriteGameIds
  });
  await writeJson(configPath, serializeConfig(config));
  await ensureConfiguredFolders(config);
  await writeJson(emulatorProfilesPath, serializeProfiles(createDefaultProfiles(config.emulatorRoot)));
  await scanLibrary();
  return { state: await getState() };
}

async function snapshotSaves(reason = "manual", game = null) {
  const config = normalizeConfig(await readJson(configPath, createDefaultConfig()));
  return saveStore.snapshotSaves({ config, game, reason, writeJson });
}

async function importBatoceraBios() {
  const config = normalizeConfig(await readJson(configPath, createDefaultConfig()));
  if (!fs.existsSync(batoceraRoot)) {
    throw new Error(`Batocera folder not found in iCloud Drive`);
  }

  const report = {};
  const targets = {
    PS2: {
      dest: path.join(config.biosRoot, "PS2"),
      folders: ["PS2_BIOS", "ps2 bios usa", "ps2 bios usa 2"],
      patterns: [/^ps2-.*\.bin$/i, /^scph.*\.bin$/i]
    },
    NintendoDS: {
      dest: path.join(config.biosRoot, "NintendoDS"),
      folders: ["Nintendo - DS (DeSmuME - melonDS)"],
      patterns: [/bios[79]\.bin$/i, /^firmware\.bin$/i, /^dsi_.*\.bin$/i]
    },
    PS1: {
      dest: path.join(config.biosRoot, "PS1"),
      folders: ["ps1", "PS1_BIOS"],
      patterns: [/^scph.*\.bin$/i, /^ps[-_].*\.bin$/i]
    },
    Xbox: {
      dest: path.join(config.biosRoot, "Xbox"),
      folders: ["xbox", "Xbox_BIOS"],
      patterns: [/mcpx/i, /xbox.*\.bin$/i, /complex.*\.bin$/i, /eeprom/i, /hdd.*\.img$/i]
    }
  };

  for (const [systemName, spec] of Object.entries(targets)) {
    await fsp.mkdir(spec.dest, { recursive: true });
    const files = [];
    for (const folder of spec.folders) {
      const source = path.join(batoceraRoot, folder);
      if (fs.existsSync(source)) files.push(...(await libraryStore.walk(source)));
    }
    files.push(...(await libraryStore.walk(batoceraRoot, 0, 2)));

    const matches = [...new Set(files.filter((filePath) => spec.patterns.some((pattern) => pattern.test(path.basename(filePath)))))];
    let copied = 0;
    for (const filePath of matches) {
      const target = path.join(spec.dest, path.basename(filePath));
      if (!fs.existsSync(target)) {
        await fsp.copyFile(filePath, target);
        copied += 1;
      }
    }
    report[systemName] = { found: matches.length, copied, destination: toPortablePath(spec.dest) };
  }

  await writeJson(path.join(configDir, "bios-import-report.json"), report);
  return { report, state: await getState() };
}

function sanitizeFileName(name) {
  return saveStore.sanitizeFileName(name);
}

async function importGameFiles(files, requestedSystem = "") {
  const config = normalizeConfig(await readJson(configPath, createDefaultConfig()));
  return libraryStore.importGameFiles({ files, requestedSystem, config, systems, scanLibrary });
}

ipcMain.handle("state:get", getState);
ipcMain.handle("controllers:get", getControllerState);
ipcMain.handle("controllers:save", (_event, nextState) => saveControllerState(nextState));
ipcMain.handle("controllers:system", getSystemControllers);
ipcMain.handle("controllers:open-bluetooth", openBluetoothSettings);
ipcMain.handle("controllers:apply-universal", (_event, controller) => applyUniversalControllerSetup(controller));
ipcMain.handle("artwork:search-archive", (_event, gameId) => searchArchiveArtwork(gameId));
ipcMain.handle("artwork:save-url", (_event, gameId, imageUrl, source) => saveArtworkFromUrl(gameId, imageUrl, source));
ipcMain.handle("artwork:open-google-images", (_event, gameId) => openGoogleImagesForGame(gameId));
ipcMain.handle("library:scan", scanLibrary);
ipcMain.handle("game:launch", (_event, gameId) => launchGame(gameId));
ipcMain.handle("emulator:open", (_event, systemName) => openEmulator(systemName));
ipcMain.handle("emulator:open-download", (_event, systemName) => openEmulatorDownload(systemName));
ipcMain.handle("emulator:choose", (_event, systemName) => chooseEmulator(systemName));
ipcMain.handle("emulators:scan", scanEmulators);
ipcMain.handle("setup:reset", resetSetup);
ipcMain.handle("saves:snapshot", () => snapshotSaves("manual"));
ipcMain.handle("bios:import-batocera", importBatoceraBios);
ipcMain.handle("games:import", (_event, files, systemName) => importGameFiles(files, systemName));
ipcMain.handle("games:pick-import", async (_event, systemName) => {
  const config = normalizeConfig(await readJson(configPath, createDefaultConfig()));
  const result = await dialog.showOpenDialog({
    defaultPath: config.downloadsRoot,
    properties: ["openFile", "multiSelections"]
  });
  if (result.canceled) return { imported: [], skipped: [], library: await readJson(libraryPath, []) };
  return importGameFiles(result.filePaths, systemName);
});
ipcMain.handle("folder:open", async (_event, target) => {
  const result = await dialog.showOpenDialog({ defaultPath: target || rootDir, properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("folder:reveal", async (_event, target) => {
  await shell.openPath(target || rootDir);
  return true;
});

ipcMain.handle("config:save", async (_event, nextConfig) => {
  const current = normalizeConfig(await readJson(configPath, createDefaultConfig()));
  const next = normalizeConfig({ ...current, ...nextConfig });
  await writeJson(configPath, serializeConfig(next));
  await ensureConfiguredFolders(next);
  await scanLibrary();
  return getState();
});

app.whenReady().then(async () => {
  await ensureDefaults();
  await scanLibrary();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

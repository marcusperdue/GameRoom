const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const appDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(appDir, "..");
const configDir = path.join(rootDir, "Config");
const configPath = path.join(configDir, "app.json");
const libraryPath = path.join(configDir, "library.json");
const emulatorProfilesPath = path.join(configDir, "emulators.json");
const controllerProfilesPath = path.join(configDir, "controllers.json");
const backupsDir = path.join(rootDir, "Backups", "Saves");
const batoceraRoot = path.join(os.homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "Batocera");
const platformFolder = process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux";
const coverExtensions = ["png", "jpg", "jpeg", "webp", "gif", "avif"];
const portableFolderDefaults = {
  gameRoot: "Games",
  saveRoot: "Saves",
  biosRoot: "BIOS",
  emulatorRoot: "Emulators",
  controlsRoot: "Controls",
  downloadsRoot: "Downloads",
  coverRoot: "Covers",
  metadataRoot: "Metadata",
  backupRoot: path.join("Backups", "Saves")
};

process.on("uncaughtException", (error) => {
  console.error("Unhandled GameRoom main-process error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled GameRoom main-process rejection:", error);
});

const systems = {
  GameCube: {
    folder: "GameCube",
    emulator: "Dolphin",
    downloadUrl: "https://dolphin-emu.org/download/",
    extensions: [".iso", ".rvz", ".gcm", ".gcz"],
    command: {
      darwin: "dolphin-emu",
      linux: "dolphin-emu",
      win32: "Dolphin.exe"
    },
    args: ["-b", "-e", "{game}"],
    bios: "not_required"
  },
  Wii: {
    folder: "Wii",
    emulator: "Dolphin",
    downloadUrl: "https://dolphin-emu.org/download/",
    extensions: [".iso", ".rvz", ".wbfs", ".wad"],
    command: {
      darwin: "dolphin-emu",
      linux: "dolphin-emu",
      win32: "Dolphin.exe"
    },
    args: ["-b", "-e", "{game}"],
    bios: "not_required"
  },
  PS2: {
    folder: "PS2",
    emulator: "PCSX2",
    downloadUrl: "https://pcsx2.net/downloads/",
    extensions: [".iso", ".chd", ".cso", ".bin", ".cue"],
    command: {
      darwin: "pcsx2",
      linux: "pcsx2",
      win32: "pcsx2-qt.exe"
    },
    args: ["-batch", "{game}"],
    bios: "required"
  },
  Xbox: {
    folder: "Xbox",
    emulator: "xemu",
    downloadUrl: "https://xemu.app/docs/download/",
    extensions: [".iso", ".xiso", ".xbe"],
    command: {
      darwin: "xemu",
      linux: "xemu",
      win32: "xemu.exe"
    },
    args: ["-dvd_path", "{game}"],
    bios: "required"
  },
  NintendoDS: {
    folder: "NintendoDS",
    emulator: "melonDS",
    downloadUrl: "https://melonds.kuribo64.net/downloads.php",
    extensions: [".nds"],
    command: {
      darwin: "melonDS",
      linux: "melonDS",
      win32: "melonDS.exe"
    },
    args: ["{game}"],
    bios: "optional"
  },
  PS1: {
    folder: "PS1",
    emulator: "DuckStation",
    downloadUrl: "https://duckstation.org/",
    extensions: [".cue", ".chd", ".pbp", ".bin", ".iso"],
    command: {
      darwin: "duckstation-qt",
      linux: "duckstation-qt",
      win32: "duckstation-qt-x64-ReleaseLTCG.exe"
    },
    args: ["-batch", "{game}"],
    bios: "required"
  },
  PSP: {
    folder: "PSP",
    emulator: "PPSSPP",
    downloadUrl: "https://www.ppsspp.org/download/",
    extensions: [".iso", ".cso", ".pbp"],
    command: {
      darwin: "PPSSPPSDL",
      linux: "PPSSPPSDL",
      win32: "PPSSPPWindows64.exe"
    },
    args: ["{game}"],
    bios: "not_required"
  }
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "GameRoom",
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

  const storedProfiles = await readJson(emulatorProfilesPath, {});
  const profiles = normalizeProfiles(Object.keys(storedProfiles).length ? storedProfiles : createDefaultProfiles(), storedConfig.rootDir);
  await writeJson(emulatorProfilesPath, serializeProfiles(profiles));

  if (!fs.existsSync(libraryPath)) {
    await writeJson(libraryPath, []);
  }

  if (!fs.existsSync(controllerProfilesPath)) {
    await writeJson(controllerProfilesPath, createDefaultControllerState());
  }
}

function createDefaultConfig() {
  return {
    rootMode: "portable",
    rootDir: ".",
    ...portableFolderDefaults,
    lastSystem: "GameCube"
  };
}

function normalizeConfig(rawConfig = {}) {
  const sourceRoot = rawConfig.rootDir && rawConfig.rootDir !== "." ? rawConfig.rootDir : rootDir;
  const config = {
    ...createDefaultConfig(),
    ...rawConfig,
    rootDir
  };

  for (const [key, defaultValue] of Object.entries(portableFolderDefaults)) {
    config[key] = resolveConfiguredPath(rawConfig[key] ?? defaultValue, sourceRoot, defaultValue);
  }

  return config;
}

function serializeConfig(config) {
  const portableConfig = {
    rootMode: "portable",
    rootDir: ".",
    lastSystem: config.lastSystem || "GameCube"
  };

  for (const key of Object.keys(portableFolderDefaults)) {
    portableConfig[key] = toPortablePath(config[key]);
  }

  return portableConfig;
}

function resolveConfiguredPath(value, sourceRoot = rootDir, fallback = "") {
  if (!value) return path.join(rootDir, fallback);
  if (!path.isAbsolute(value)) return path.resolve(rootDir, value);

  const relativeToSource = sourceRoot && path.isAbsolute(sourceRoot) ? path.relative(sourceRoot, value) : "";
  if (relativeToSource && isInsideRootRelative(relativeToSource)) {
    return path.resolve(rootDir, relativeToSource);
  }

  return value;
}

function toPortablePath(target) {
  if (!target) return "";
  const relative = path.relative(rootDir, target);
  return isInsideRootRelative(relative) ? normalizeSlashes(relative || ".") : target;
}

function isInsideRootRelative(relativePath) {
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function normalizeSlashes(value) {
  return value.split(path.sep).join("/");
}

function createDefaultProfiles() {
  const profiles = {};
  for (const [systemName, system] of Object.entries(systems)) {
    profiles[systemName] = {
      emulator: system.emulator,
      command: detectCommand(system.command),
      args: system.args,
      bios: system.bios,
      enabled: true
    };
  }
  return profiles;
}

function normalizeProfiles(rawProfiles = {}, sourceRoot = rootDir) {
  const defaults = createDefaultProfiles();
  const profiles = {};

  for (const [systemName, defaultsForSystem] of Object.entries(defaults)) {
    const rawProfile = rawProfiles[systemName] || {};
    const profile = { ...defaultsForSystem, ...rawProfile };
    const resolvedCommand = resolveCommandPath(profile.command, sourceRoot);
    const defaultCommand = defaultsForSystem.command;
    profile.command = commandExists(resolvedCommand)
      ? resolvedCommand
      : commandLooksLikePath(profile.command)
        ? resolvedCommand
        : defaultCommand;
    profiles[systemName] = profile;
  }

  return profiles;
}

function serializeProfiles(profiles) {
  return Object.fromEntries(
    Object.entries(profiles).map(([systemName, profile]) => [
      systemName,
      {
        ...profile,
        command: commandLooksLikePath(profile.command) ? toPortablePath(profile.command) : profile.command
      }
    ])
  );
}

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
  const connected = process.platform === "darwin" ? detectMacGameControllers() : [];
  const paired = process.platform === "darwin" ? detectMacPairedBluetoothControllers() : [];
  return {
    platform: process.platform,
    connected,
    paired,
    checkedAt: new Date().toISOString()
  };
}

function detectMacGameControllers() {
  const synthetic = commandOutput("ioreg", ["-r", "-c", "AppleGCSyntheticDevice", "-l", "-w", "0"]);
  const devices = parseIoregControllerDevices(synthetic, "macOS Game Controller");
  if (devices.length) return dedupeControllers(devices);

  const hid = commandOutput("ioreg", ["-r", "-c", "IOHIDDevice", "-l", "-w", "0"]);
  return dedupeControllers(parseIoregControllerDevices(hid, "macOS HID"));
}

function detectMacPairedBluetoothControllers() {
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
    const key = `${device.status}:${device.transport}:${device.manufacturer}:${device.product}:${device.type}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const profiles = normalizeProfiles(await readJson(emulatorProfilesPath, {}), rawConfig.rootDir);
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

  for (const [systemName, system] of Object.entries(systems)) {
    if (system.emulator === "Dolphin") continue;
    actions.push(await writeEmulatorControllerRecord(config, profiles, systemName, controllerProfile));
  }

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

async function writeEmulatorControllerRecord(config, profiles, systemName, controllerProfile) {
  const system = systems[systemName];
  const outputFolder = path.join(config.controlsRoot, system.emulator);
  await fsp.mkdir(outputFolder, { recursive: true });
  const setupPath = path.join(outputFolder, `${systemName}.json`);
  const configured = Boolean(profiles[systemName]?.command && commandExists(profiles[systemName].command));
  await writeJson(setupPath, {
    system: systemName,
    emulator: system.emulator,
    controller: controllerProfile.controller,
    standardMap: controllerProfile.standardMap,
    note: `${system.emulator} keeps final button binding in its own settings. Open the emulator once and select this controller for player 1.`,
    updatedAt: new Date().toISOString()
  });

  return {
    system: systemName,
    emulator: system.emulator,
    status: configured ? "needsReview" : "missing",
    label: configured ? "Profile saved, confirm in emulator" : "Emulator not configured",
    detail: configured ? toPortablePath(setupPath) : profiles[systemName]?.command || "Not configured",
    canOpen: configured
  };
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
  if (!command || !commandLooksLikePath(command)) return command || "";
  return resolveConfiguredPath(command, sourceRoot, command);
}

function commandLooksLikePath(command) {
  return command.includes("/") || command.includes("\\") || path.isAbsolute(command);
}

function detectCommand(commands) {
  const platform = process.platform;
  const portable = findPortableEmulator(commands[platform]);
  if (portable) return portable;

  if (platform === "darwin") {
    const macApps = {
      "dolphin-emu": "/Applications/Dolphin.app/Contents/MacOS/Dolphin",
      pcsx2: "/Applications/PCSX2.app/Contents/MacOS/pcsx2",
      xemu: "/Applications/xemu.app/Contents/MacOS/xemu",
      melonDS: "/Applications/melonDS.app/Contents/MacOS/melonDS",
      "duckstation-qt": "/Applications/DuckStation.app/Contents/MacOS/DuckStation",
      PPSSPPSDL: "/Applications/PPSSPP.app/Contents/MacOS/PPSSPPSDL"
    };
    const candidate = macApps[commands[platform]];
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  return commands[platform] || "";
}

function findPortableEmulator(binaryName) {
  if (!binaryName) return "";
  const emulatorDir = path.join(rootDir, "Emulators", platformFolder);
  if (!fs.existsSync(emulatorDir)) return "";

  const matches = walkSync(emulatorDir).filter((item) => path.basename(item).toLowerCase() === binaryName.toLowerCase());
  return matches[0] || "";
}

function walkSync(folder) {
  const found = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) found.push(...walkSync(fullPath));
    if (entry.isFile()) found.push(fullPath);
  }
  return found;
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
  const library = [];

  for (const [systemName, system] of Object.entries(systems)) {
    const folder = path.join(config.gameRoot, system.folder);
    const files = fs.existsSync(folder) ? await walk(folder) : [];
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (!system.extensions.includes(ext)) continue;
      const stats = await fsp.stat(filePath);
      const portableGamePath = toPortablePath(filePath);
      const coverPath = findCoverPath(config, systemName, cleanTitle(path.basename(filePath, ext)), stableId(portableGamePath));
      const coverStats = coverPath ? await safeStat(coverPath) : null;
      library.push({
        id: stableId(portableGamePath),
        title: cleanTitle(path.basename(filePath, ext)),
        system: systemName,
        emulator: system.emulator,
        path: portableGamePath,
        coverPath: toPortablePath(coverPath),
        coverUpdatedAt: coverStats?.mtime?.toISOString() || "",
        format: ext.slice(1).toUpperCase(),
        size: formatBytes(stats.size),
        modified: stats.mtime.toISOString()
      });
    }
  }

  library.sort((a, b) => `${a.system}:${a.title}`.localeCompare(`${b.system}:${b.title}`));
  await writeJson(libraryPath, library);
  return library;
}

function findCoverPath(config, systemName, title, id) {
  const coverFolder = path.join(config.coverRoot, systems[systemName].folder);
  if (!fs.existsSync(coverFolder)) return "";
  const safeTitle = sanitizeFileName(title);
  const baseNames = [...new Set([id, title, safeTitle].filter(Boolean))];
  const candidates = baseNames.flatMap((baseName) => coverExtensions.map((extension) => path.join(coverFolder, `${baseName}.${extension}`)));
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

async function safeStat(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
}

async function walk(folder, depth = 0) {
  if (depth > 8) return [];
  const entries = await fsp.readdir(folder, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".")) files.push(...(await walk(fullPath, depth + 1)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function stableId(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function cleanTitle(title) {
  return title.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

async function getState() {
  const [rawConfig, rawProfiles, library] = await Promise.all([
    readJson(configPath, createDefaultConfig()),
    readJson(emulatorProfilesPath, {}),
    readJson(libraryPath, [])
  ]);
  const config = normalizeConfig(rawConfig);
  const profiles = normalizeProfiles(rawProfiles, rawConfig.rootDir);

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
  const system = systems[game.system] || {};
  return [
    `"${escapeArchiveQuery(game.title)}"`,
    "AND",
    `(${escapeArchiveQuery(game.system)} OR ${escapeArchiveQuery(system.emulator || "")} OR cover OR box OR artwork OR manual)`
  ].join(" ");
}

function escapeArchiveQuery(value) {
  return String(value || "").replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
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

  const metadataPath = path.join(config.metadataRoot, "artwork", `${game.id}.json`);
  await writeJson(metadataPath, {
    gameId: game.id,
    title: game.title,
    system: game.system,
    coverPath: toPortablePath(coverPath),
    source: {
      provider: source.provider || "Manual URL",
      sourceId: source.sourceId || "",
      title: source.title || "",
      itemUrl: source.itemUrl || "",
      imageUrl: download.finalUrl,
      originalUrl: imageUrl
    },
    savedAt: new Date().toISOString()
  });

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
  const params = ["imgurl", "mediaurl", "image_url", "image", "url", "u"];
  for (const param of params) {
    const value = parsedUrl.searchParams.get(param);
    if (!value) continue;
    try {
      const nested = new URL(value);
      if (["http:", "https:"].includes(nested.protocol)) return nested.toString();
    } catch {
      // Keep checking other wrapper params.
    }
  }
  return "";
}

function extractImageUrlFromHtml(html, baseUrl) {
  const patterns = [
    /<meta\s+[^>]*(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta\s+[^>]*(?:property|name)=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<link\s+[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["'][^>]*>/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    try {
      const imageUrl = new URL(decodeHtmlEntities(match[1]), baseUrl);
      if (["http:", "https:"].includes(imageUrl.protocol)) return imageUrl.toString();
    } catch {
      // Try the next metadata format.
    }
  }

  return "";
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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

function labelForSystem(systemName) {
  const labels = {
    NintendoDS: "Nintendo DS",
    PS1: "PlayStation 1",
    PS2: "PlayStation 2",
    PSP: "PSP"
  };
  return labels[systemName] || systemName;
}

function plainText(value) {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
}

function extensionForContentType(contentType) {
  const type = contentType.toLowerCase().split(";")[0].trim();
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif"
  };
  return map[type] || "";
}

function extensionForUrl(parsedUrl) {
  const ext = path.extname(parsedUrl.pathname).toLowerCase().replace(".", "");
  return coverExtensions.includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "";
}

function extensionForBytes(bytes) {
  if (!bytes || bytes.length < 12) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.slice(0, 6).toString("ascii") === "GIF87a" || bytes.slice(0, 6).toString("ascii") === "GIF89a") return "gif";
  if (bytes.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (bytes.slice(4, 12).toString("ascii").includes("ftypavif")) return "avif";
  return "";
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
  command = resolveCommandPath(command);
  if (commandLooksLikePath(command)) return isExecutableFile(command);
  return Boolean(findCommandOnPath(command));
}

function findCommandOnPath(command) {
  if (!command) return "";
  const lookup = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(lookup, [command], { encoding: "utf8" });
  if (result.status !== 0) return "";
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function isExecutableFile(target) {
  try {
    const stats = fs.statSync(target);
    if (!stats.isFile()) return false;
    if (process.platform === "win32") return true;
    fs.accessSync(target, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function prepareLaunchCommand(command, emulatorName) {
  const resolved = resolveCommandPath(command);
  if (!resolved) throw new Error(`${emulatorName} is not configured.`);

  if (!commandLooksLikePath(resolved)) {
    const pathCommand = findCommandOnPath(resolved);
    if (!pathCommand) throw new Error(`${emulatorName} is not installed or not on PATH.`);
    return pathCommand;
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`${emulatorName} executable is missing: ${toPortablePath(resolved)}`);
  }

  if (!isExecutableFile(resolved)) {
    try {
      if (process.platform !== "win32") fs.chmodSync(resolved, 0o755);
    } catch {
      // The explicit error below gives the user the path that needs attention.
    }
  }

  if (!isExecutableFile(resolved)) {
    throw new Error(`${emulatorName} is not executable: ${toPortablePath(resolved)}`);
  }

  return resolved;
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
  const profiles = normalizeProfiles(await readJson(emulatorProfilesPath, {}), rawConfig.rootDir);
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
    child.unref();
  } catch (error) {
    throw new Error(error.message || `Could not launch ${profile.emulator}.`);
  }

  return { game: launchGameInfo, command, args };
}

async function openEmulator(systemName) {
  const rawConfig = await readJson(configPath, createDefaultConfig());
  const profiles = normalizeProfiles(await readJson(emulatorProfilesPath, {}), rawConfig.rootDir);
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

async function snapshotSaves(reason = "manual", game = null) {
  const config = normalizeConfig(await readJson(configPath, createDefaultConfig()));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const folderName = game ? `${stamp}-${game.system}-${game.title}` : `${stamp}-${reason}`;
  const target = path.join(config.backupRoot, sanitizeFileName(folderName));
  await fsp.mkdir(target, { recursive: true });

  const saveRoot = config.saveRoot;
  if (fs.existsSync(saveRoot)) {
    await fsp.cp(saveRoot, path.join(target, "Saves"), { recursive: true, force: true });
  }

  await writeJson(path.join(target, "snapshot.json"), {
    reason,
    game,
    createdAt: new Date().toISOString(),
    machine: os.hostname()
  });

  return target;
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
      if (fs.existsSync(source)) files.push(...(await walk(source)));
    }
    files.push(...(await walk(batoceraRoot, 0, 2)));

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
  return name.replace(/[<>:"/\\|?*]+/g, "-").slice(0, 160);
}

function matchingSystemsForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return Object.entries(systems)
    .filter(([, system]) => system.extensions.includes(ext))
    .map(([systemName]) => systemName);
}

function destinationForGame(config, filePath, requestedSystem = "") {
  const matches = matchingSystemsForFile(filePath);
  const systemName = requestedSystem || (matches.length === 1 ? matches[0] : "");
  if (!systemName || !systems[systemName]) {
    return { error: `Choose a console for ${path.basename(filePath)}`, matches };
  }

  return {
    systemName,
    targetFolder: path.join(config.gameRoot, systems[systemName].folder),
    targetPath: path.join(config.gameRoot, systems[systemName].folder, path.basename(filePath))
  };
}

async function importGameFiles(files, requestedSystem = "") {
  const config = normalizeConfig(await readJson(configPath, createDefaultConfig()));
  const imported = [];
  const skipped = [];

  for (const filePath of files) {
    if (!filePath || !fs.existsSync(filePath)) {
      skipped.push({ filePath, reason: "File does not exist" });
      continue;
    }

    const fileStat = await fsp.stat(filePath);
    if (!fileStat.isFile()) {
      skipped.push({ filePath, reason: "Only files can be imported" });
      continue;
    }

    const destination = destinationForGame(config, filePath, requestedSystem);
    if (destination.error) {
      skipped.push({ filePath, reason: destination.error, matches: destination.matches });
      continue;
    }

    await fsp.mkdir(destination.targetFolder, { recursive: true });
    if (path.resolve(filePath) !== path.resolve(destination.targetPath)) {
      await fsp.copyFile(filePath, destination.targetPath);
    }
    imported.push({
      source: filePath,
      target: destination.targetPath,
      system: destination.systemName
    });
  }

  const library = await scanLibrary();
  return { imported, skipped, library };
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

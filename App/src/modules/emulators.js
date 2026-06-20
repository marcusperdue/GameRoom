const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/**
 * @typedef {object} EmulatorProfile
 * @property {string} emulator
 * @property {string} command
 * @property {string[]} args
 * @property {string} bios
 * @property {boolean} enabled
 */

/**
 * Build default emulator profiles from system metadata and local detection.
 *
 * @returns {Record<string, EmulatorProfile>}
 */
function createDefaultProfiles({ systems, emulatorRoot, rootDir, platformFolder }) {
  const profiles = {};
  for (const [systemName, system] of Object.entries(systems)) {
    profiles[systemName] = {
      emulator: system.emulator,
      command: detectCommand(system.command, { emulatorRoot, rootDir, platformFolder }),
      args: system.args,
      bios: system.bios,
      enabled: true
    };
  }
  return profiles;
}

/**
 * Merge saved emulator profiles with current defaults while preserving portable paths.
 *
 * @returns {Record<string, EmulatorProfile>}
 */
function normalizeProfiles(rawProfiles = {}, { systems, sourceRoot, rootDir, emulatorRoot, platformFolder, resolveConfiguredPath }) {
  const defaults = createDefaultProfiles({ systems, emulatorRoot, rootDir, platformFolder });
  const profiles = {};

  for (const [systemName, defaultsForSystem] of Object.entries(defaults)) {
    const rawProfile = rawProfiles[systemName] || {};
    const profile = { ...defaultsForSystem, ...rawProfile };
    const resolvedCommand = resolveCommandPath(profile.command, { rootDir, sourceRoot, resolveConfiguredPath });
    const defaultCommand = defaultsForSystem.command;
    profile.command = commandExists(resolvedCommand, { rootDir })
      ? resolvedCommand
      : commandLooksLikePath(profile.command)
        ? resolvedCommand
        : defaultCommand;
    profiles[systemName] = profile;
  }

  return profiles;
}

/**
 * Convert absolute executable paths back to portable paths before writing config.
 */
function serializeProfiles(profiles, { toPortablePath }) {
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

function detectCommand(commands, { emulatorRoot, rootDir, platformFolder }) {
  const platform = process.platform;
  const portable = findPortableEmulator(commands[platform], { emulatorRoot, platformFolder });
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

  const installed = findInstalledEmulator(commands[platform]);
  if (installed) return installed;

  return commands[platform] || "";
}

function findPortableEmulator(binaryName, { emulatorRoot, platformFolder }) {
  if (!binaryName) return "";
  const searchRoots = [
    path.join(emulatorRoot, platformFolder),
    emulatorRoot
  ].filter((folder, index, folders) => folder && folders.indexOf(folder) === index && fs.existsSync(folder));

  for (const searchRoot of searchRoots) {
    const match = walkSync(searchRoot).find((item) => path.basename(item).toLowerCase() === binaryName.toLowerCase());
    if (match) return match;
  }
  return "";
}

function findInstalledEmulator(binaryName) {
  if (!binaryName || process.platform !== "win32") return "";
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA,
    process.env.APPDATA
  ].filter(Boolean);
  const candidatesByBinary = {
    "Dolphin.exe": ["Dolphin Emulator/Dolphin.exe", "Dolphin-x64/Dolphin.exe"],
    "pcsx2-qt.exe": ["PCSX2/pcsx2-qt.exe", "PCSX2 Nightly/pcsx2-qt.exe"],
    "xemu.exe": ["xemu/xemu.exe"],
    "melonDS.exe": ["melonDS/melonDS.exe"],
    "duckstation-qt-x64-ReleaseLTCG.exe": ["DuckStation/duckstation-qt-x64-ReleaseLTCG.exe", "DuckStation/duckstation-qt.exe"],
    "PPSSPPWindows64.exe": ["PPSSPP/PPSSPPWindows64.exe", "PPSSPP/PPSSPPWindows.exe"]
  };
  const relativeCandidates = candidatesByBinary[binaryName] || [];
  for (const root of roots) {
    for (const relativeCandidate of relativeCandidates) {
      const candidate = path.join(root, relativeCandidate);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "";
}

function commandExists(command, { rootDir } = {}) {
  command = resolveCommandPath(command, { rootDir });
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

function prepareLaunchCommand(command, emulatorName, { rootDir, toPortablePath }) {
  const resolved = resolveCommandPath(command, { rootDir });
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

function resolveCommandPath(command, { rootDir, sourceRoot = rootDir, resolveConfiguredPath } = {}) {
  if (!command || !commandLooksLikePath(command)) return command || "";
  if (resolveConfiguredPath) return resolveConfiguredPath(command, sourceRoot, command);
  if (!rootDir || path.isAbsolute(command)) return command;
  return path.resolve(rootDir, command);
}

function commandLooksLikePath(command = "") {
  return command.includes("/") || command.includes("\\") || path.isAbsolute(command);
}

function walkSync(folder, depth = 0) {
  if (depth > 8) return [];
  const found = [];
  let entries = [];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) found.push(...walkSync(fullPath, depth + 1));
    if (entry.isFile()) found.push(fullPath);
  }
  return found;
}

function emulatorPickerDefaultPath(config, profile = {}, { rootDir, resolveCommandPathForApp }) {
  const command = resolveCommandPathForApp ? resolveCommandPathForApp(profile.command || "") : resolveCommandPath(profile.command || "", { rootDir });
  if (commandLooksLikePath(command) && fs.existsSync(command)) {
    const stats = fs.statSync(command);
    return stats.isDirectory() ? command : path.dirname(command);
  }
  return config.emulatorRoot;
}

function normalizeChosenEmulatorPath(selectedPath, systemName, { systems }) {
  const stats = fs.existsSync(selectedPath) ? fs.statSync(selectedPath) : null;
  if (!stats?.isDirectory()) return selectedPath;

  if (process.platform === "darwin" && selectedPath.toLowerCase().endsWith(".app")) {
    return macAppExecutablePath(selectedPath) || selectedPath;
  }

  return executableInFolder(selectedPath, systemName, { systems }) || selectedPath;
}

function macAppExecutablePath(appPath) {
  const macosFolder = path.join(appPath, "Contents", "MacOS");
  if (!fs.existsSync(macosFolder)) return "";
  const appName = path.basename(appPath, ".app").toLowerCase();
  const files = walkSync(macosFolder, 0).filter(isCandidateExecutablePath);
  return files.find((filePath) => path.basename(filePath).toLowerCase() === appName) || files[0] || "";
}

function executableInFolder(folder, systemName, { systems }) {
  const expected = path.basename(systems[systemName]?.command?.[process.platform] || "").toLowerCase();
  const emulatorName = String(systems[systemName]?.emulator || "").toLowerCase();
  const files = walkSync(folder, 0).filter(isCandidateExecutablePath);
  return files.find((filePath) => {
    const baseName = path.basename(filePath).toLowerCase();
    return baseName === expected || baseName.includes(emulatorName);
  }) || files[0] || "";
}

function isCandidateExecutablePath(filePath) {
  if (process.platform === "win32") return path.extname(filePath).toLowerCase() === ".exe";
  return isExecutableFile(filePath);
}

module.exports = {
  commandExists,
  commandLooksLikePath,
  createDefaultProfiles,
  detectCommand,
  emulatorPickerDefaultPath,
  executableInFolder,
  findCommandOnPath,
  findInstalledEmulator,
  findPortableEmulator,
  isCandidateExecutablePath,
  isExecutableFile,
  macAppExecutablePath,
  normalizeChosenEmulatorPath,
  normalizeProfiles,
  prepareLaunchCommand,
  resolveCommandPath,
  serializeProfiles,
  walkSync
};

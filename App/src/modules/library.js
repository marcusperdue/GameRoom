const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { coverExtensions } = require("./systems");

/**
 * @typedef {object} SystemDefinition
 * @property {string} folder
 * @property {string} emulator
 * @property {string[]} extensions
 */

/**
 * @typedef {object} LibraryConfig
 * @property {string} gameRoot
 * @property {string} coverRoot
 */

/**
 * @typedef {object} GameLibraryEntry
 * @property {string} id
 * @property {string} title
 * @property {string} system
 * @property {string} emulator
 * @property {string} path
 * @property {string} coverPath
 * @property {string} coverUpdatedAt
 * @property {string} format
 * @property {string} size
 * @property {string} modified
 */

/**
 * Scan configured system folders and return normalized library entries.
 *
 * @param {object} options
 * @param {LibraryConfig} options.config
 * @param {Record<string, SystemDefinition>} options.systems
 * @param {string} options.rootDir
 * @param {(target: string, rootDir?: string) => string} options.toPortablePath
 * @returns {Promise<GameLibraryEntry[]>}
 */
async function scanLibraryEntries({ config, systems, rootDir, toPortablePath }) {
  const library = [];

  for (const [systemName, system] of Object.entries(systems)) {
    const folder = path.join(config.gameRoot, system.folder);
    const files = fs.existsSync(folder) ? await walk(folder) : [];
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (!system.extensions.includes(ext)) continue;

      const stats = await fsp.stat(filePath);
      const portableGamePath = toPortablePath(filePath, rootDir);
      const id = stableId(portableGamePath);
      const title = cleanTitle(path.basename(filePath, ext));
      const coverPath = findCoverPath(config, systems, systemName, title, id);
      const coverStats = coverPath ? await safeStat(coverPath) : null;
      library.push({
        id,
        title,
        system: systemName,
        emulator: system.emulator,
        path: portableGamePath,
        coverPath: toPortablePath(coverPath, rootDir),
        coverUpdatedAt: coverStats?.mtime?.toISOString() || "",
        format: ext.slice(1).toUpperCase(),
        size: formatBytes(stats.size),
        modified: stats.mtime.toISOString()
      });
    }
  }

  return library.sort((a, b) => `${a.system}:${a.title}`.localeCompare(`${b.system}:${b.title}`));
}

function findCoverPath(config, systems, systemName, title, id) {
  const coverFolder = path.join(config.coverRoot, systems[systemName].folder);
  if (!fs.existsSync(coverFolder)) return "";
  const safeTitle = sanitizeFileName(title);
  const baseNames = [...new Set([id, title, safeTitle].filter(Boolean))];
  const candidates = baseNames.flatMap((baseName) => coverExtensions.map((extension) => path.join(coverFolder, `${baseName}.${extension}`)));
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function matchingSystemsForFile(filePath, systems) {
  const ext = path.extname(filePath).toLowerCase();
  return Object.entries(systems)
    .filter(([, system]) => system.extensions.includes(ext))
    .map(([systemName]) => systemName);
}

/**
 * Resolve a dropped game file to its destination folder.
 *
 * @param {LibraryConfig} config
 * @param {string} filePath
 * @param {string} requestedSystem
 * @param {Record<string, SystemDefinition>} systems
 * @returns {{systemName: string, targetFolder: string, targetPath: string} | {error: string, matches: string[]}}
 */
function destinationForGame(config, filePath, requestedSystem, systems) {
  const matches = matchingSystemsForFile(filePath, systems);
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

/**
 * Import dropped/selected games and rescan the library afterward.
 *
 * @param {object} options
 * @param {string[]} options.files
 * @param {string} [options.requestedSystem]
 * @param {LibraryConfig} options.config
 * @param {Record<string, SystemDefinition>} options.systems
 * @param {() => Promise<GameLibraryEntry[]>} options.scanLibrary
 */
async function importGameFiles({ files, requestedSystem = "", config, systems, scanLibrary }) {
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

    const destination = destinationForGame(config, filePath, requestedSystem, systems);
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

async function walk(folder, depth = 0, maxDepth = 8) {
  if (depth > maxDepth) return [];
  const entries = await fsp.readdir(folder, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".")) files.push(...(await walk(fullPath, depth + 1, maxDepth)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function safeStat(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
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

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "-").slice(0, 160);
}

module.exports = {
  cleanTitle,
  destinationForGame,
  findCoverPath,
  formatBytes,
  importGameFiles,
  matchingSystemsForFile,
  scanLibraryEntries,
  stableId,
  walk
};

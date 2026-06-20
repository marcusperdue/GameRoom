const path = require("node:path");

/**
 * @typedef {Record<string, string>} PortableFolderDefaults
 */

/**
 * @typedef {object} ConfigOptions
 * @property {string} rootDir
 * @property {PortableFolderDefaults} portableFolderDefaults
 */

/**
 * @param {PortableFolderDefaults} portableFolderDefaults
 */
function createDefaultConfig(portableFolderDefaults) {
  return {
    rootMode: "portable",
    rootDir: ".",
    ...portableFolderDefaults,
    lastSystem: "GameCube",
    favoriteGameIds: [],
    setupWizardCompleted: false,
    setupCompletedAt: ""
  };
}

/**
 * @param {object} rawConfig
 * @param {ConfigOptions} options
 */
function normalizeConfig(rawConfig = {}, { rootDir, portableFolderDefaults }) {
  const sourceRoot = rawConfig.rootDir && rawConfig.rootDir !== "." ? rawConfig.rootDir : rootDir;
  const config = {
    ...createDefaultConfig(portableFolderDefaults),
    ...rawConfig,
    rootDir
  };

  for (const [key, defaultValue] of Object.entries(portableFolderDefaults)) {
    config[key] = resolveConfiguredPath(rawConfig[key] ?? defaultValue, { rootDir, sourceRoot, fallback: defaultValue });
  }

  config.favoriteGameIds = Array.isArray(rawConfig.favoriteGameIds)
    ? [...new Set(rawConfig.favoriteGameIds.filter((id) => typeof id === "string" && id.trim()))]
    : [];
  config.setupWizardCompleted = Boolean(rawConfig.setupWizardCompleted);
  config.setupCompletedAt = typeof rawConfig.setupCompletedAt === "string" ? rawConfig.setupCompletedAt : "";

  return config;
}

/**
 * @param {object} config
 * @param {ConfigOptions} options
 */
function serializeConfig(config, { rootDir, portableFolderDefaults }) {
  const portableConfig = {
    rootMode: "portable",
    rootDir: ".",
    lastSystem: config.lastSystem || "GameCube",
    favoriteGameIds: Array.isArray(config.favoriteGameIds) ? config.favoriteGameIds : [],
    setupWizardCompleted: Boolean(config.setupWizardCompleted),
    setupCompletedAt: config.setupCompletedAt || ""
  };

  for (const key of Object.keys(portableFolderDefaults)) {
    portableConfig[key] = toPortablePath(config[key], rootDir);
  }

  return portableConfig;
}

/**
 * @param {string} value
 * @param {{rootDir: string, sourceRoot?: string, fallback?: string}} options
 */
function resolveConfiguredPath(value, { rootDir, sourceRoot = rootDir, fallback = "" }) {
  if (!value) return path.join(rootDir, fallback);
  if (!path.isAbsolute(value)) return path.resolve(rootDir, value);

  const relativeToSource = sourceRoot && path.isAbsolute(sourceRoot) ? path.relative(sourceRoot, value) : "";
  if (relativeToSource && isInsideRootRelative(relativeToSource)) {
    return path.resolve(rootDir, relativeToSource);
  }

  return value;
}

/**
 * @param {string} target
 * @param {string} rootDir
 */
function toPortablePath(target, rootDir) {
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

module.exports = {
  createDefaultConfig,
  isInsideRootRelative,
  normalizeConfig,
  normalizeSlashes,
  resolveConfiguredPath,
  serializeConfig,
  toPortablePath
};

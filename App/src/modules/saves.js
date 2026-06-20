const fsp = require("node:fs/promises");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function snapshotSaves({ config, game = null, reason = "manual", writeJson }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const folderName = game ? `${stamp}-${game.system}-${game.title}` : `${stamp}-${reason}`;
  const target = path.join(config.backupRoot, sanitizeFileName(folderName));
  await fsp.mkdir(target, { recursive: true });

  if (fs.existsSync(config.saveRoot)) {
    await fsp.cp(config.saveRoot, path.join(target, "Saves"), { recursive: true, force: true });
  }

  await writeJson(path.join(target, "snapshot.json"), {
    reason,
    game,
    createdAt: new Date().toISOString(),
    machine: os.hostname()
  });

  return target;
}

function sanitizeFileName(name) {
  return String(name).replace(/[<>:"/\\|?*]+/g, "-").slice(0, 160);
}

module.exports = {
  sanitizeFileName,
  snapshotSaves
};

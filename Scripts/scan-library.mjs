import { readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const systems = {
  GameCube: [".iso", ".rvz", ".gcm", ".gcz"],
  Wii: [".iso", ".rvz", ".wbfs", ".wad"],
  PS2: [".iso", ".chd", ".cso", ".bin", ".cue"],
  Xbox: [".iso", ".xiso", ".xbe"],
  NintendoDS: [".nds"],
  PS1: [".cue", ".chd", ".pbp", ".bin", ".iso"],
  PSP: [".iso", ".cso", ".pbp"]
};

const library = [];

for (const [system, extensions] of Object.entries(systems)) {
  const folder = path.join(root, "Games", system);
  if (!existsSync(folder)) continue;
  const files = await walk(folder);
  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!extensions.includes(ext)) continue;
    const fileStat = await stat(filePath);
    const portablePath = toPortablePath(filePath);
    library.push({
      id: stableId(portablePath),
      title: path.basename(filePath, ext).replace(/[._-]+/g, " ").trim(),
      system,
      path: portablePath,
      format: ext.slice(1).toUpperCase(),
      size: fileStat.size
    });
  }
}

await writeFile(path.join(root, "Config", "library.json"), `${JSON.stringify(library, null, 2)}\n`);
console.log(`Scanned ${library.length} games`);

async function walk(folder) {
  const out = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(fullPath)));
    if (entry.isFile()) out.push(fullPath);
  }
  return out;
}

function stableId(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function toPortablePath(target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.split(path.sep).join("/")
    : target;
}

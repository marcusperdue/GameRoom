import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const defaultBatocera = path.join(homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "Batocera");
const batoceraRoot = process.argv[2] ? path.resolve(process.argv[2]) : defaultBatocera;

const targets = {
  PS2: {
    dest: path.join(root, "BIOS", "PS2"),
    folders: ["PS2_BIOS", "ps2 bios usa", "ps2 bios usa 2"],
    patterns: [/^ps2-.*\.bin$/i, /^scph.*\.bin$/i]
  },
  NintendoDS: {
    dest: path.join(root, "BIOS", "NintendoDS"),
    folders: ["Nintendo - DS (DeSmuME - melonDS)"],
    patterns: [/bios[79]\.bin$/i, /^firmware\.bin$/i, /^dsi_.*\.bin$/i]
  },
  PS1: {
    dest: path.join(root, "BIOS", "PS1"),
    folders: ["ps1", "PS1_BIOS"],
    patterns: [/^scph.*\.bin$/i, /^ps[-_].*\.bin$/i]
  },
  Xbox: {
    dest: path.join(root, "BIOS", "Xbox"),
    folders: ["xbox", "Xbox_BIOS"],
    patterns: [/mcpx/i, /xbox.*\.bin$/i, /complex.*\.bin$/i, /eeprom/i, /hdd.*\.img$/i]
  }
};

if (!existsSync(batoceraRoot)) {
  throw new Error(`Batocera folder not found: ${batoceraRoot}`);
}

const report = {};

for (const [system, spec] of Object.entries(targets)) {
  await mkdir(spec.dest, { recursive: true });
  const candidates = [];

  for (const folder of spec.folders) {
    const source = path.join(batoceraRoot, folder);
    if (existsSync(source)) {
      candidates.push(...(await walk(source)));
    }
  }

  candidates.push(...(await walk(batoceraRoot, 0, 2)));

  const matches = unique(
    candidates.filter((filePath) => spec.patterns.some((pattern) => pattern.test(path.basename(filePath))))
  );

  let copied = 0;
  for (const filePath of matches) {
    const target = path.join(spec.dest, path.basename(filePath));
    if (!existsSync(target)) {
      await copyFile(filePath, target);
      copied += 1;
    }
  }

  report[system] = {
    found: matches.length,
    copied,
    destination: toPortablePath(spec.dest)
  };
}

await writeFile(path.join(root, "Config", "bios-import-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

async function walk(folder, depth = 0, maxDepth = 6) {
  if (!existsSync(folder) || depth > maxDepth) return [];
  const out = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(fullPath, depth + 1, maxDepth)));
    } else if (entry.isFile()) {
      const fileStat = await stat(fullPath);
      if (fileStat.size > 0) out.push(fullPath);
    }
  }
  return out;
}

function unique(items) {
  return [...new Set(items)];
}

function toPortablePath(target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.split(path.sep).join("/")
    : target;
}

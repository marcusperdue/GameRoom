import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const downloadsDir = path.join(root, "Downloads", "Emulators", "macOS");
const extractRoot = path.join(root, "Emulators", "macOS");
const manifestPath = path.join(root, "Config", "emulator-downloads.json");
const profilesPath = path.join(root, "Config", "emulators.json");

await mkdir(downloadsDir, { recursive: true });
await mkdir(extractRoot, { recursive: true });

const manifest = JSON.parse(await readFile(manifestPath, "utf8")).macOS;
const profiles = JSON.parse(await readFile(profilesPath, "utf8"));
const report = {};

for (const [name, item] of Object.entries(manifest)) {
  if (!item.url) {
    report[name] = { status: item.status || "skipped", path: toPortablePath(item.installedPath || "") };
    continue;
  }

  const archive = path.join(downloadsDir, path.basename(new URL(item.url).pathname));
  const target = path.join(extractRoot, name);
  await mkdir(target, { recursive: true });

  if (!existsSync(archive)) {
    run("curl", ["-L", "--fail", "-o", archive, item.url]);
  }

  if (!(await hasContents(target))) {
    if (archive.endsWith(".zip")) {
      run("ditto", ["-x", "-k", archive, target]);
    } else if (archive.endsWith(".tar.xz")) {
      run("tar", ["-xf", archive, "-C", target]);
    }
  }

  const executable = await findExecutable(target, name);
  for (const system of item.systems) {
    if (profiles[system] && executable) {
      profiles[system].command = toPortablePath(executable);
      if (name === "melonDS") {
        profiles[system].emulator = "melonDS";
      }
    }
  }

  report[name] = {
    status: executable ? "ready" : "downloaded",
    archive: toPortablePath(archive),
    executable: toPortablePath(executable)
  };
}

await writeFile(profilesPath, `${JSON.stringify(profiles, null, 2)}\n`);
await writeFile(path.join(root, "Config", "emulator-download-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status}`);
  }
}

async function hasContents(folder) {
  return existsSync(folder) && (await readdir(folder)).some((name) => !name.startsWith("."));
}

async function findExecutable(folder, emulatorName) {
  const files = await walk(folder);
  const app = files.find((file) => file.endsWith(".app"));
  if (app) {
    const appName = path.basename(app, ".app");
    const candidates = [
      path.join(app, "Contents", "MacOS", appName),
      path.join(app, "Contents", "MacOS", "DuckStation"),
      path.join(app, "Contents", "MacOS", "PCSX2"),
      path.join(app, "Contents", "MacOS", "xemu"),
      path.join(app, "Contents", "MacOS", "melonDS"),
      path.join(app, "Contents", "MacOS", "PPSSPPSDL")
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found) return found;
  }

  const nameHints = {
    PCSX2: ["pcsx2", "PCSX2"],
    xemu: ["xemu"],
    melonDS: ["melonDS", "melonds"],
    DuckStation: ["DuckStation", "duckstation-qt"],
    PPSSPP: ["PPSSPPSDL", "PPSSPP"]
  }[emulatorName] || [emulatorName];

  return files.find((file) => nameHints.includes(path.basename(file))) || "";
}

async function walk(folder) {
  const out = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      out.push(fullPath);
      out.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

function toPortablePath(target) {
  if (!target) return "";
  const relative = path.relative(root, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.split(path.sep).join("/")
    : target;
}

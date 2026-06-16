import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const folders = [
  "Games/GameCube",
  "Games/Wii",
  "Games/PS2",
  "Games/Xbox",
  "Games/NintendoDS",
  "Games/PS1",
  "Games/PSP",
  "Saves/Dolphin",
  "Saves/PCSX2",
  "Saves/xemu",
  "Saves/melonDS",
  "Saves/DuckStation",
  "Saves/PPSSPP",
  "BIOS/PS2",
  "BIOS/PS1",
  "BIOS/Xbox",
  "BIOS/NintendoDS",
  "Emulators/Windows",
  "Emulators/macOS",
  "Emulators/Linux",
  "Covers/GameCube",
  "Covers/Wii",
  "Covers/PS2",
  "Covers/Xbox",
  "Covers/NintendoDS",
  "Covers/PS1",
  "Covers/PSP",
  "Downloads/Installers",
  "Downloads/Emulators",
  "Downloads/Updates",
  "Backups/Saves",
  "Cache/temp",
  "Cache/extracted",
  "Config"
];

for (const folder of folders) {
  await mkdir(path.join(root, folder), { recursive: true });
}

const readmePath = path.join(root, "Downloads", "README.md");
if (!existsSync(readmePath)) {
  await writeFile(
    readmePath,
    "# Downloads\n\nPut downloaded installers, DMGs, ZIPs, emulator packages, and update files here before moving them into the proper folder.\n"
  );
}

console.log(`Initialized GameRoom folders at ${root}`);

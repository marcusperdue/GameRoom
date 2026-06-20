const path = require("node:path");

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

function labelForSystem(systemName) {
  const labels = {
    NintendoDS: "Nintendo DS",
    PS1: "PlayStation 1",
    PS2: "PlayStation 2",
    PSP: "PSP"
  };
  return labels[systemName] || systemName;
}

module.exports = {
  coverExtensions,
  labelForSystem,
  platformFolder,
  portableFolderDefaults,
  systems
};

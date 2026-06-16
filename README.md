# GameRoom

GameRoom is an open-source desktop launcher for newer console emulation. The goal is simple: one clean folder for your app, games, covers, BIOS/system files, emulator settings, saves, backups, and downloads.

It is built for casual players who want something closer to a console shelf than a pile of emulator windows.

## Important Legal Note

GameRoom does not include games, ROMs, disc images, BIOS files, firmware files, keys, or emulator binaries.

You must provide your own legally dumped games and system files. Do not distribute copyrighted games or BIOS files with this project.

## Supported Systems

| System | Default emulator | Notes |
| --- | --- | --- |
| GameCube | Dolphin | Usually does not need BIOS files |
| Wii | Dolphin | Usually does not need BIOS files |
| PlayStation 2 | PCSX2 | Requires a PS2 BIOS dumped from your console |
| Original Xbox | xemu | Requires Xbox system files and a valid HDD image |
| Nintendo DS | melonDS | BIOS files are optional for many games |
| PlayStation 1 | DuckStation | Requires a PS1 BIOS for best compatibility |
| PSP | PPSSPP | Usually does not need BIOS files |

## Features

- Scans your library folders and groups games by console.
- Imports games by drag and drop or file picker.
- Launches games in the configured emulator.
- Keeps saves and backups in predictable folders.
- Creates save snapshots before launching games.
- Detects common emulator installs on macOS, Windows, and Linux.
- Provides a Controller Center for USB and Bluetooth gamepads.
- Stores per-console control notes and setup state.
- Searches Internet Archive for cover art and supports manually saved image URLs.
- Keeps user content out of git so the app can stay open source safely.

## Quick Start

Requirements:

- Node.js 20 or newer
- npm
- Your own emulator installs
- Your own legally dumped games and required BIOS/system files

Clone and run:

```bash
git clone https://github.com/marcusperdue/GameRoom.git
cd GameRoom/App
npm install
npm start
```

On macOS, after installing dependencies once, you can also run:

```text
Launch GameRoom.command
```

If macOS blocks the command file, right-click it, choose Open, then approve it once.

## Folder Layout

GameRoom creates and uses this structure:

```text
GameRoom/
  App/                  app source
  Scripts/              helper scripts
  Games/                your game files
  BIOS/                 your BIOS and system files
  Saves/                save data and save snapshots
  Covers/               local artwork
  Config/               app and emulator configuration
  Controls/             controller profiles and notes
  Emulators/            optional local emulator folder
  Downloads/            installers, builds, and downloaded files
  Backups/              save backups
  Metadata/             local metadata
  Cache/                temporary app data
```

Only `App/`, `Scripts/`, `LICENSE`, `README.md`, `.gitignore`, and the launch command are tracked by git. Your games, BIOS files, saves, covers, downloads, and configs stay local.

## Adding Games

Open GameRoom and use Add Games, or drag files into the app window.

Supported file types include:

```text
.iso .rvz .gcm .gcz .wbfs .wad .chd .cso .cue .bin .pbp .nds .xiso .xbe
```

Some file types are shared across consoles. For example, `.iso` can be GameCube, Wii, PS2, Xbox, or PSP. Select the console first when importing an ambiguous file.

Games are copied into folders like:

```text
Games/GameCube/
Games/Wii/
Games/PS2/
Games/Xbox/
Games/NintendoDS/
Games/PS1/
Games/PSP/
```

## Emulator Setup

Install the emulators you want to use, then open GameRoom and scan/configure them.

Common download pages:

- Dolphin: https://dolphin-emu.org/
- PCSX2: https://pcsx2.net/
- xemu: https://xemu.app/
- melonDS: https://melonds.kuribo64.net/
- DuckStation: https://www.duckstation.org/
- PPSSPP: https://www.ppsspp.org/

GameRoom can launch games, but the emulator itself still owns final compatibility, graphics settings, and detailed controller mapping.

## BIOS And System Files

Some systems need extra files before games work:

- PS2 needs a PS2 BIOS.
- PS1 works best with a PS1 BIOS.
- Original Xbox needs xemu system files, including MCPX, BIOS/flash files, and a hard disk image.
- Nintendo DS BIOS files are optional for many setups.

Put those files under:

```text
BIOS/PS2/
BIOS/PS1/
BIOS/Xbox/
BIOS/NintendoDS/
```

If you already have a Batocera setup, you can copy compatible BIOS files from your Batocera `bios` folder into GameRoom.

## Controllers

USB controllers should work after plugging them in. Bluetooth controllers must be paired in macOS, Windows, or Linux first.

GameRoom's Controller Center helps you:

- see connected controllers
- test live button and stick input
- keep per-console setup notes
- jump into emulator-specific mapping work

Each emulator still has its own final controller mapping screen. This is normal because Dolphin, PCSX2, xemu, DuckStation, melonDS, and PPSSPP all store controls differently.

## Artwork

GameRoom stores covers locally in:

```text
Covers/[Console]/
```

The Artwork Center can search Internet Archive and can open Google Images for manual searching. GameRoom does not scrape Google Images automatically.

You can also paste a direct image URL and save it as the selected game's cover.

## Saves And Backups

GameRoom keeps save-related files under:

```text
Saves/
Backups/
```

Before a game launches, GameRoom can create a save snapshot so casual players have an easy restore point.

Actual emulator save behavior still depends on each emulator. Some emulators store saves in their own folders unless configured otherwise.

## Helper Scripts

From the repo root:

```bash
node Scripts/init-folders.mjs
node Scripts/scan-library.mjs
node Scripts/import-batocera-bios.mjs
node Scripts/download-emulators-macos.mjs
```

From `App/`:

```bash
npm run check
npm run scan
npm run init
```

## Building

GameRoom uses Electron Builder.

From `App/`:

```bash
npm run dist:mac
npm run dist:linux
npm run dist:win
```

Build output goes to:

```text
Downloads/Updates/builds/
```

Platform builds usually need to be run on that platform. For example, build the Windows installer on Windows.

## Project Status

GameRoom is an early open-source app. The core goal is a polished, minimal launcher that makes emulator setup easier without hiding the fact that users still need their own games, BIOS files, and emulator installs.

## Contributing

Good contributions for this project:

- simpler first-run setup
- better emulator detection
- safer save handling
- controller setup improvements
- cleaner artwork matching
- packaging for macOS, Windows, and Linux
- accessibility and keyboard navigation improvements

Please do not add copyrighted games, BIOS files, firmware files, keys, or links to piracy sites.

## License

GameRoom is released under the MIT License.

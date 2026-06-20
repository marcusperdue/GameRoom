const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  destinationForGame,
  importGameFiles,
  scanLibraryEntries
} = require("../src/modules/library");
const { systems } = require("../src/modules/systems");

function toPortablePath(target, rootDir) {
  if (!target) return "";
  const relative = path.relative(rootDir, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.split(path.sep).join("/")
    : target;
}

async function withTempRoot(callback) {
  const rootDir = await fsp.mkdtemp(path.join(os.tmpdir(), "gameroom-test-"));
  try {
    return await callback(rootDir);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
}

test("scanLibraryEntries indexes supported games with local cover metadata", async () => {
  await withTempRoot(async (rootDir) => {
    const config = {
      gameRoot: path.join(rootDir, "Games"),
      coverRoot: path.join(rootDir, "Covers")
    };
    await fsp.mkdir(path.join(config.gameRoot, "GameCube"), { recursive: true });
    await fsp.mkdir(path.join(config.coverRoot, "GameCube"), { recursive: true });
    await fsp.writeFile(path.join(config.gameRoot, "GameCube", "Rune-II.iso"), Buffer.alloc(2048));
    await fsp.writeFile(path.join(config.gameRoot, "GameCube", "notes.txt"), "ignore me");
    await fsp.writeFile(path.join(config.coverRoot, "GameCube", "Rune II.jpg"), "cover");

    const library = await scanLibraryEntries({ config, systems, rootDir, toPortablePath });

    assert.equal(library.length, 1);
    assert.equal(library[0].title, "Rune II");
    assert.equal(library[0].system, "GameCube");
    assert.equal(library[0].format, "ISO");
    assert.equal(library[0].size, "2.00 KB");
    assert.equal(library[0].path, "Games/GameCube/Rune-II.iso");
    assert.equal(library[0].coverPath, "Covers/GameCube/Rune II.jpg");
  });
});

test("importGameFiles skips ambiguous files unless a console is chosen", async () => {
  await withTempRoot(async (rootDir) => {
    const config = {
      gameRoot: path.join(rootDir, "Games")
    };
    const isoPath = path.join(rootDir, "Downloads", "Lost Kingdoms II.iso");
    await fsp.mkdir(path.dirname(isoPath), { recursive: true });
    await fsp.writeFile(isoPath, "game");

    const ambiguous = destinationForGame(config, isoPath, "", systems);
    assert.match(ambiguous.error, /Choose a console/);
    assert.ok(ambiguous.matches.includes("GameCube"));
    assert.ok(ambiguous.matches.includes("PS2"));

    const result = await importGameFiles({
      files: [isoPath],
      requestedSystem: "GameCube",
      config,
      systems,
      scanLibrary: async () => [{ id: "rescanned" }]
    });

    assert.equal(result.skipped.length, 0);
    assert.equal(result.imported.length, 1);
    assert.equal(result.imported[0].system, "GameCube");
    assert.equal(result.library[0].id, "rescanned");
    assert.equal(
      await fsp.readFile(path.join(config.gameRoot, "GameCube", "Lost Kingdoms II.iso"), "utf8"),
      "game"
    );
  });
});

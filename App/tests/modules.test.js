const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const artwork = require("../src/modules/artwork");
const configStore = require("../src/modules/config");
const controllerStore = require("../src/modules/controllers");
const emulatorStore = require("../src/modules/emulators");
const saveStore = require("../src/modules/saves");
const { portableFolderDefaults, systems } = require("../src/modules/systems");

async function withTempRoot(callback) {
  const rootDir = await fsp.mkdtemp(path.join(os.tmpdir(), "gameroom-modules-"));
  try {
    return await callback(rootDir);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
}

test("config serializes local paths as portable and remembers setup completion", async () => {
  await withTempRoot(async (rootDir) => {
    const config = configStore.normalizeConfig({
      gameRoot: path.join(rootDir, "My Games"),
      favoriteGameIds: ["a", "a", "", "b"],
      setupWizardCompleted: true,
      setupCompletedAt: "2026-06-20T12:00:00.000Z"
    }, { rootDir, portableFolderDefaults });

    const serialized = configStore.serializeConfig(config, { rootDir, portableFolderDefaults });

    assert.equal(serialized.gameRoot, "My Games");
    assert.deepEqual(serialized.favoriteGameIds, ["a", "b"]);
    assert.equal(serialized.setupWizardCompleted, true);
    assert.equal(serialized.setupCompletedAt, "2026-06-20T12:00:00.000Z");
  });
});

test("emulator discovery finds portable executables in the platform folder", async () => {
  await withTempRoot(async (rootDir) => {
    const platformFolder = "TestOS";
    const emulatorRoot = path.join(rootDir, "Emulators");
    const binaryName = systems.GameCube.command[process.platform];
    const binary = path.join(emulatorRoot, platformFolder, "Nested", binaryName);
    await fsp.mkdir(path.dirname(binary), { recursive: true });
    await fsp.writeFile(binary, "fake executable");
    await fsp.chmod(binary, 0o755);

    assert.equal(
      emulatorStore.findPortableEmulator(binaryName, { emulatorRoot, platformFolder }),
      binary
    );

    const profiles = emulatorStore.createDefaultProfiles({ systems, emulatorRoot, rootDir, platformFolder });
    assert.equal(profiles.GameCube.emulator, "Dolphin");
    assert.equal(profiles.GameCube.command, binary);
  });
});

test("artwork helpers unwrap image URLs and detect image extensions", () => {
  const wrapped = new URL("https://www.google.com/imgres?imgurl=https%3A%2F%2Fexample.com%2Fcover.webp");
  assert.equal(artwork.extractWrappedImageUrl(wrapped), "https://example.com/cover.webp");

  const html = `<html><head><meta property="og:image" content="/images/cover.png"></head></html>`;
  assert.equal(artwork.extractImageUrlFromHtml(html, "https://example.com/game"), "https://example.com/images/cover.png");
  assert.equal(artwork.extensionForContentType("image/jpeg; charset=binary"), "jpg");
  assert.equal(artwork.extensionForUrl(new URL("https://example.com/box.JPEG"), ["jpg", "jpeg"]), "jpg");
});

test("controller and save helpers normalize user data safely", () => {
  const state = controllerStore.normalizeControllerState({
    defaultController: 42,
    lastSeen: [
      { id: "controller-a", name: "Pad", buttons: 12, axes: 4, live: true },
      { name: "missing id" }
    ],
    profiles: { "controller-a": { name: "Pad" } }
  });

  assert.equal(state.defaultController, "");
  assert.equal(state.lastSeen.length, 1);
  assert.equal(state.lastSeen[0].id, "controller-a");
  assert.equal(saveStore.sanitizeFileName("Bad:Name/For*Folder.iso"), "Bad-Name-For-Folder.iso");
});

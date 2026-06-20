const { contextBridge, ipcRenderer, webUtils } = require("electron");

function filePathFor(file) {
  try {
    return webUtils.getPathForFile(file);
  } catch {
    return "";
  }
}

contextBridge.exposeInMainWorld("gameRoom", {
  getState: () => ipcRenderer.invoke("state:get"),
  getControllers: () => ipcRenderer.invoke("controllers:get"),
  saveControllers: (state) => ipcRenderer.invoke("controllers:save", state),
  getSystemControllers: () => ipcRenderer.invoke("controllers:system"),
  openBluetoothSettings: () => ipcRenderer.invoke("controllers:open-bluetooth"),
  applyControllerSetup: (controller) => ipcRenderer.invoke("controllers:apply-universal", controller),
  searchArchiveArtwork: (gameId) => ipcRenderer.invoke("artwork:search-archive", gameId),
  saveArtworkUrl: (gameId, imageUrl, source) => ipcRenderer.invoke("artwork:save-url", gameId, imageUrl, source),
  openGoogleImages: (gameId) => ipcRenderer.invoke("artwork:open-google-images", gameId),
  scanLibrary: () => ipcRenderer.invoke("library:scan"),
  droppedFilePaths: (files) => Array.from(files || []).map(filePathFor).filter(Boolean),
  importGames: (files, systemName) => ipcRenderer.invoke("games:import", files, systemName),
  pickImportGames: (systemName) => ipcRenderer.invoke("games:pick-import", systemName),
  launchGame: (gameId) => ipcRenderer.invoke("game:launch", gameId),
  onGameEnded: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("game:ended", listener);
    return () => ipcRenderer.removeListener("game:ended", listener);
  },
  openEmulator: (systemName) => ipcRenderer.invoke("emulator:open", systemName),
  openEmulatorDownload: (systemName) => ipcRenderer.invoke("emulator:open-download", systemName),
  chooseEmulator: (systemName) => ipcRenderer.invoke("emulator:choose", systemName),
  scanEmulators: () => ipcRenderer.invoke("emulators:scan"),
  snapshotSaves: () => ipcRenderer.invoke("saves:snapshot"),
  importBatoceraBios: () => ipcRenderer.invoke("bios:import-batocera"),
  chooseFolder: (target) => ipcRenderer.invoke("folder:open", target),
  revealFolder: (target) => ipcRenderer.invoke("folder:reveal", target),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  resetSetup: () => ipcRenderer.invoke("setup:reset")
});

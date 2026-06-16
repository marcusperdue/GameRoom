const { contextBridge, ipcRenderer } = require("electron");

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
  importGames: (files, systemName) => ipcRenderer.invoke("games:import", files, systemName),
  pickImportGames: (systemName) => ipcRenderer.invoke("games:pick-import", systemName),
  launchGame: (gameId) => ipcRenderer.invoke("game:launch", gameId),
  openEmulator: (systemName) => ipcRenderer.invoke("emulator:open", systemName),
  openEmulatorDownload: (systemName) => ipcRenderer.invoke("emulator:open-download", systemName),
  snapshotSaves: () => ipcRenderer.invoke("saves:snapshot"),
  importBatoceraBios: () => ipcRenderer.invoke("bios:import-batocera"),
  chooseFolder: (target) => ipcRenderer.invoke("folder:open", target),
  revealFolder: (target) => ipcRenderer.invoke("folder:reveal", target),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config)
});

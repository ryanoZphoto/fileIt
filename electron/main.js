import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { contextIsolation: true }
  });

  // Resolve dist/index.html relative to this file (works in asar & unpacked)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const indexPath = path.join(__dirname, '../dist/index.html');
  win.loadFile(indexPath).catch((err) => {
    dialog.showErrorBox('Load error', `Failed to load UI at:\n${indexPath}\n\n${String(err)}`);
  });

  win.webContents.on('did-fail-load', (_e, code, desc, _url, _isMainFrame) => {
    dialog.showErrorBox('Load error', `Code: ${code}\n${desc}\nPath: ${indexPath}`);
  });

  // Optional: win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});



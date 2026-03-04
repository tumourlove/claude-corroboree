const { app, BrowserWindow, ipcMain } = require('electron');
const os = require('os');
const pty = require('node-pty');
const path = require('path');

let mainWindow;
let ptyProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const cwd = process.argv[2] || process.env.USERPROFILE || process.env.HOME;

  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd,
    env: process.env,
    useConpty: true,
  });

  ptyProcess.onData((data) => {
    mainWindow.webContents.send('terminal:data', data);
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.error(`PTY exited: ${exitCode}`);
  });
}

ipcMain.on('terminal:write', (_event, data) => {
  ptyProcess.write(data);
});

ipcMain.on('terminal:resize', (_event, { cols, rows }) => {
  try { ptyProcess.resize(cols, rows); } catch (e) { /* ignore resize errors */ }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (ptyProcess) ptyProcess.kill();
  app.quit();
});

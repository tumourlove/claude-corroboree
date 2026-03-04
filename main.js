const { app, BrowserWindow, ipcMain } = require('electron');
const os = require('os');
const pty = require('node-pty');
const path = require('path');

let mainWindow;
const sessions = new Map(); // id -> { pty, cwd }

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
}

function spawnSession(id, cwd) {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const resolvedCwd = cwd || process.argv[2] || process.env.USERPROFILE || process.env.HOME;

  const ptyProc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: resolvedCwd,
    env: process.env,
    useConpty: true,
  });

  ptyProc.onData((data) => {
    mainWindow.webContents.send(`terminal:data:${id}`, data);
  });

  ptyProc.onExit(({ exitCode }) => {
    mainWindow.webContents.send('session:exited', { id, exitCode });
    sessions.delete(id);
  });

  sessions.set(id, { pty: ptyProc, cwd: resolvedCwd });
}

ipcMain.on('session:create', (_event, { id, label, cwd }) => {
  spawnSession(id, cwd);
});

ipcMain.on('session:close', (_event, { id }) => {
  const session = sessions.get(id);
  if (session) {
    session.pty.kill();
    sessions.delete(id);
  }
});

ipcMain.on('terminal:write', (_event, { id, data }) => {
  const session = sessions.get(id);
  if (session) session.pty.write(data);
});

ipcMain.on('terminal:resize', (_event, { id, cols, rows }) => {
  const session = sessions.get(id);
  if (session) {
    try { session.pty.resize(cols, rows); } catch (e) { /* ignore */ }
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  for (const [, session] of sessions) session.pty.kill();
  app.quit();
});

const { Notification, nativeImage, app } = require('electron');
const path = require('path');

class NotificationManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.history = []; // last 20 notifications
    this.enabled = true; // system notifications enabled by default
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  getEnabled() {
    return this.enabled;
  }

  notify({ title, body, type = 'info', sessionId }) {
    // Track history
    const entry = { title, body, type, sessionId, timestamp: Date.now() };
    this.history.push(entry);
    if (this.history.length > 20) this.history.shift();

    // System tray notification (gated by enabled flag)
    if (this.enabled && Notification.isSupported()) {
      const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'assets', 'icon.ico')
        : path.join(__dirname, '..', 'assets', 'icon.ico');
      const notification = new Notification({ title, body, silent: false, icon: nativeImage.createFromPath(iconPath) });
      notification.show();
    }

    // In-app toast
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('notification:toast', {
        title, body, type, sessionId, timestamp: Date.now(),
      });
    }
  }

  getHistory() {
    return [...this.history];
  }
}

module.exports = { NotificationManager };

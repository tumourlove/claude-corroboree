const { Notification, nativeImage } = require('electron');
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
      const iconPath = path.join(__dirname, '..', 'assets', 'icon-256.png');
      const notification = new Notification({ title, body, silent: false, icon: nativeImage.createFromPath(iconPath) });
      notification.show();
    }

    // In-app toast
    this.mainWindow.webContents.send('notification:toast', {
      title, body, type, sessionId, timestamp: Date.now(),
    });
  }

  getHistory() {
    return [...this.history];
  }
}

module.exports = { NotificationManager };

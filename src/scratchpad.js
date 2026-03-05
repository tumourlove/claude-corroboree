const fs = require('fs');
const path = require('path');
const os = require('os');

class Scratchpad {
  constructor() {
    this.data = new Map();
    this.filePath = path.join(os.homedir(), '.claude-nexus', 'scratchpad.json');
    this._saveTimer = null;
    this._cleanupTimer = null;
    this._load();
    this._startPeriodicCleanup();
  }

  set(key, value, namespace = 'default') {
    this.data.set(`${namespace}:${key}`, { value, updatedAt: Date.now() });
    this._scheduleSave();
  }

  get(key, namespace = 'default') {
    const entry = this.data.get(`${namespace}:${key}`);
    return entry ? entry.value : null;
  }

  list(namespace) {
    const prefix = namespace ? `${namespace}:` : '';
    const keys = [];
    for (const [k, v] of this.data) {
      if (!namespace || k.startsWith(prefix)) {
        keys.push({ key: k.replace(prefix, ''), value: v.value, updatedAt: v.updatedAt });
      }
    }
    return keys;
  }

  listKeys(namespace) {
    const prefix = namespace ? `${namespace}:` : '';
    const keys = [];
    for (const [k, v] of this.data) {
      if (!namespace || k.startsWith(prefix)) {
        keys.push({ key: k.replace(prefix, ''), updatedAt: v.updatedAt });
      }
    }
    return keys;
  }

  delete(key, namespace = 'default') {
    this.data.delete(`${namespace}:${key}`);
    this._scheduleSave();
  }

  clearNamespace(namespace) {
    const prefix = `${namespace}:`;
    for (const key of [...this.data.keys()]) {
      if (key.startsWith(prefix)) {
        this.data.delete(key);
      }
    }
    this._scheduleSave();
  }

  _load() {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const [k, v] of Object.entries(raw)) {
          if (v.updatedAt > sevenDaysAgo) {
            this.data.set(k, v);
          }
        }
      }
    } catch (e) {
      // Start fresh if file is corrupt
    }
  }

  _startPeriodicCleanup() {
    // Clean _results entries older than 1 hour, every 10 minutes
    this._cleanupTimer = setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      let changed = false;
      for (const [k, v] of this.data) {
        if (k.startsWith('_results:') && v.updatedAt < oneHourAgo) {
          this.data.delete(k);
          changed = true;
        }
      }
      if (changed) this._scheduleSave();
    }, 10 * 60 * 1000);
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 1000);
  }

  _save() {
    try {
      const obj = {};
      for (const [k, v] of this.data) obj[k] = v;
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2));
    } catch (e) {
      // Ignore write errors
    }
  }

  destroy() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._save(); // flush pending writes
  }
}

module.exports = { Scratchpad };

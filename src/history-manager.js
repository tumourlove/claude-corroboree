const fs = require('fs');
const path = require('path');
const os = require('os');

class HistoryManager {
  constructor() {
    this.historyDir = path.join(os.homedir(), '.claude-nexus', 'history');
    fs.mkdirSync(this.historyDir, { recursive: true });
    this.buffers = new Map(); // sessionId -> string[]
  }

  appendOutput(sessionId, data) {
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, []);
    }
    this.buffers.get(sessionId).push(data);

    // Keep buffer bounded (last 10000 lines worth)
    const buf = this.buffers.get(sessionId);
    if (buf.length > 10000) {
      this.buffers.set(sessionId, buf.slice(-5000));
    }
  }

  getRecentOutput(sessionId, lastNLines = 100) {
    const buf = this.buffers.get(sessionId) || [];
    const text = buf.join('');
    const lines = text.split('\n');
    return lines.slice(-lastNLines).join('\n');
  }

  searchAcrossSessions(pattern, sessionIds) {
    const regex = new RegExp(pattern, 'gi');
    const results = {};

    const targets = sessionIds || [...this.buffers.keys()];
    for (const id of targets) {
      const buf = this.buffers.get(id) || [];
      const text = buf.join('');
      const matches = [];
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (regex.test(line)) {
          matches.push({ line: i + 1, text: line.trim() });
        }
        regex.lastIndex = 0;
      });
      if (matches.length > 0) {
        results[id] = matches.slice(-50); // last 50 matches per session
      }
    }
    return results;
  }

  saveToFile(sessionId, label = '') {
    const buf = this.buffers.get(sessionId) || [];
    const filename = `${sessionId}-${Date.now()}${label ? '-' + label : ''}.log`;
    const filepath = path.join(this.historyDir, filename);
    fs.writeFileSync(filepath, buf.join(''));
    return filepath;
  }
}

module.exports = { HistoryManager };

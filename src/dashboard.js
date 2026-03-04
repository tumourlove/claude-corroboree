export class Dashboard {
  constructor(containerEl) {
    this.container = containerEl;
    this.container.className = 'dashboard';
    this.pollInterval = null;
    this._render();
    this._startPolling();
  }

  _render() {
    this.container.innerHTML = `
      <div class="dashboard-header">
        <h2>Nexus Dashboard</h2>
        <span class="dashboard-subtitle">Session overview &amp; coordination</span>
      </div>
      <div class="dashboard-grid">
        <div class="dashboard-panel">
          <h3>Sessions</h3>
          <div class="dashboard-sessions" id="dash-sessions">
            <div class="dashboard-empty">No sessions yet</div>
          </div>
        </div>
        <div class="dashboard-panel">
          <h3>Activity Log</h3>
          <div class="dashboard-log" id="dash-log">
            <div class="dashboard-empty">No activity yet</div>
          </div>
        </div>
      </div>
    `;
  }

  _startPolling() {
    this._updateSessions();
    this.pollInterval = setInterval(() => this._updateSessions(), 2000);
  }

  async _updateSessions() {
    try {
      const sessions = await window.nexus.listSessions();
      const el = this.container.querySelector('#dash-sessions');
      if (!sessions || sessions.length === 0) {
        el.innerHTML = '<div class="dashboard-empty">No sessions yet</div>';
        return;
      }
      el.innerHTML = sessions.map(s => `
        <div class="dash-session">
          <span class="dash-session-status status-${s.status || 'idle'}"></span>
          <span class="dash-session-label">${s.label || s.id}</span>
          <span class="dash-session-template">${s.template || ''}</span>
          <span class="dash-session-meta">${s.isLead ? 'LEAD' : ''}</span>
          <span class="dash-session-cwd" title="${s.cwd || ''}">${this._shortenPath(s.cwd)}</span>
        </div>
      `).join('');
    } catch (e) {
      // listSessions may not be ready yet
    }
  }

  addLogEntry(message) {
    const el = this.container.querySelector('#dash-log');
    if (!el) return;
    // Remove empty placeholder
    const empty = el.querySelector('.dashboard-empty');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = 'dash-log-entry';
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="dash-log-time">${time}</span> ${message}`;
    el.appendChild(entry);

    // Keep last 100 entries
    while (el.children.length > 100) {
      el.removeChild(el.firstChild);
    }
    el.scrollTop = el.scrollHeight;
  }

  _shortenPath(p) {
    if (!p) return '';
    const parts = p.replace(/\\/g, '/').split('/');
    return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : p;
  }

  dispose() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.container.innerHTML = '';
  }
}

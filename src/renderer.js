import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const term = new Terminal({
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  theme: {
    background: '#1a1a2e',
    foreground: '#e0e0e0',
    cursor: '#e94560',
    selectionBackground: '#e9456040',
  },
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal-container'));
fitAddon.fit();

term.onData((data) => window.terminal.write(data));
window.terminal.onData((data) => term.write(data));

const ro = new ResizeObserver(() => {
  fitAddon.fit();
  window.terminal.resize(term.cols, term.rows);
});
ro.observe(document.getElementById('terminal-container'));

const { execSync } = require('child_process');
const path = require('path');

// Determine the exe path — works both in dev and packaged mode
let exePath;
if (process.resourcesPath) {
  exePath = path.join(process.resourcesPath, '..', 'Claude Nexus.exe');
} else {
  // Dev mode fallback — register with electron directly
  exePath = process.argv[0];
}

const escapedExe = exePath.replace(/\\/g, '\\\\');

const regCommands = [
  // Right-click on folder
  `reg add "HKCU\\Software\\Classes\\Directory\\shell\\ClaudeNexus" /ve /d "Open in Claude Nexus" /f`,
  `reg add "HKCU\\Software\\Classes\\Directory\\shell\\ClaudeNexus\\command" /ve /d "\\"${escapedExe}\\" \\"%V\\"" /f`,
  // Right-click on folder background
  `reg add "HKCU\\Software\\Classes\\Directory\\Background\\shell\\ClaudeNexus" /ve /d "Open in Claude Nexus" /f`,
  `reg add "HKCU\\Software\\Classes\\Directory\\Background\\shell\\ClaudeNexus\\command" /ve /d "\\"${escapedExe}\\" \\"%V\\"" /f`,
];

console.log('Registering Claude Nexus shell integration...');
for (const cmd of regCommands) {
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log('  OK:', cmd.split('"')[1]);
  } catch (e) {
    console.error('  FAIL:', e.message);
  }
}
console.log('Shell integration registered.');

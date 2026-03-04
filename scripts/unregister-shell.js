const { execSync } = require('child_process');

const regCommands = [
  `reg delete "HKCU\\Software\\Classes\\Directory\\shell\\ClaudeNexus" /f`,
  `reg delete "HKCU\\Software\\Classes\\Directory\\Background\\shell\\ClaudeNexus" /f`,
];

console.log('Removing Claude Nexus shell integration...');
for (const cmd of regCommands) {
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log('  OK');
  } catch (e) {
    console.error('  SKIP:', e.message);
  }
}
console.log('Shell integration removed.');

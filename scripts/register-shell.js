const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Determine the exe path — works both in dev and packaged mode
let exePath;
if (process.resourcesPath) {
  exePath = path.join(process.resourcesPath, '..', 'Claude Nexus.exe');
} else {
  // Dev mode — create a launcher batch file so "nexus" works from anywhere
  const projectDir = path.resolve(__dirname, '..');
  const binDir = path.join(os.homedir(), '.claude-nexus', 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  // Write nexus.cmd launcher
  const cmdContent = `@echo off\r\ncd /d "%~dp0"\r\ncd /d "${projectDir}"\r\nnpm start -- %*\r\n`;
  const cmdPath = path.join(binDir, 'nexus.cmd');
  fs.writeFileSync(cmdPath, cmdContent);

  // Also write a direct electron launcher for speed
  const electronPath = path.join(projectDir, 'node_modules', '.bin', 'electron.cmd');
  const fastContent = `@echo off\r\n"${electronPath}" "${projectDir}" %*\r\n`;
  const fastPath = path.join(binDir, 'nexus-fast.cmd');
  fs.writeFileSync(fastPath, fastContent);

  exePath = cmdPath;
  console.log(`Created launcher: ${cmdPath}`);
}

const escapedExe = exePath.replace(/\\/g, '\\\\');

const regCommands = [
  // Right-click on folder
  `reg add "HKCU\\Software\\Classes\\Directory\\shell\\ClaudeNexus" /ve /d "Open in Claude Nexus" /f`,
  `reg add "HKCU\\Software\\Classes\\Directory\\shell\\ClaudeNexus\\command" /ve /d "\\"${escapedExe}\\" \\"%V\\"" /f`,
  // Right-click on folder background
  `reg add "HKCU\\Software\\Classes\\Directory\\Background\\shell\\ClaudeNexus" /ve /d "Open in Claude Nexus" /f`,
  `reg add "HKCU\\Software\\Classes\\Directory\\Background\\shell\\ClaudeNexus\\command" /ve /d "\\"${escapedExe}\\" \\"%V\\"" /f`,
  // App Path — lets you type "nexus" in Win+R or Explorer address bar
  `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\nexus.cmd" /ve /d "${escapedExe}" /f`,
  `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\nexus.cmd" /v Path /d "${path.dirname(exePath).replace(/\\/g, '\\\\')}" /f`,
];

// Add bin dir to user PATH if not already there
const binDir = path.dirname(exePath);
try {
  const currentPath = execSync('reg query "HKCU\\Environment" /v Path', { encoding: 'utf8' });
  if (!currentPath.includes(binDir)) {
    const pathValue = currentPath.match(/REG_(?:EXPAND_)?SZ\s+(.*)/)?.[1]?.trim() || '';
    const newPath = pathValue ? `${pathValue};${binDir}` : binDir;
    regCommands.push(`reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${newPath}" /f`);
    console.log(`Adding ${binDir} to user PATH`);
  }
} catch (e) {
  // No user PATH exists yet, create it
  regCommands.push(`reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${binDir}" /f`);
  console.log(`Creating user PATH with ${binDir}`);
}

console.log('Registering Claude Nexus shell integration...');
for (const cmd of regCommands) {
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log('  OK:', cmd.split('"')[1]);
  } catch (e) {
    console.error('  FAIL:', e.message);
  }
}

// Broadcast environment change so Explorer picks it up without restart
try {
  execSync('setx CLAUDE_NEXUS_REGISTERED 1', { stdio: 'pipe' });
} catch (e) { /* ignore */ }

console.log('Shell integration registered.');
console.log('You can now type "nexus" in the Explorer address bar or Win+R to launch.');

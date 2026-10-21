const path = require('node:path');
const { spawn } = require('node:child_process');

async function applyFolderView(folderPath) {
  if (process.platform !== 'win32') return;
  // PowerShell needs a physical script when this app runs from app.asar.
  const script = path.join(__dirname, 'folder-view.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-FolderPath', folderPath], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const collect = (chunk) => { output = (output + chunk.toString()).slice(-4096); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(output.trim() || 'Could not apply folder view.')));
  });
}

module.exports = { applyFolderView };

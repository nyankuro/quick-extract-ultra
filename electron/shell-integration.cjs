const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { EXTRACT_EXTENSIONS } = require('./formats.cjs');

// Per-user keys only: no administrator rights and nothing outside this user's profile.
const DEFAULT_ROOT = 'HKEY_CURRENT_USER\\Software\\Classes';
const ARCHIVE_KEY = '*\\shell\\QuickExtractUltra.Archive';
const ADD_KEY = 'AllFilesystemObjects\\shell\\QuickExtractUltra.Add';

function regString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function launchCommand(launcher, action) {
  const parts = [launcher.executable, ...launcher.args].map((part) => `"${part}"`);
  return `${parts.join(' ')} --qe-action=${action} "%1"`;
}

function buildRegFile(root, launcher, labels) {
  const icon = `${launcher.executable},0`;
  const appliesTo = EXTRACT_EXTENSIONS.map((ext) => `System.FileExtension:=.${ext}`).join(' OR ');
  const lines = ['Windows Registry Editor Version 5.00', ''];
  const key = (name, values) => {
    lines.push(`[${root}\\${name}]`);
    for (const [valueName, value] of Object.entries(values)) {
      lines.push(`${valueName === '@' ? '@' : regString(valueName)}=${regString(value)}`);
    }
    lines.push('');
  };
  const cascade = (base, title, items, extra = {}) => {
    key(base, { MUIVerb: title, Icon: icon, SubCommands: '', ...extra });
    items.forEach(([id, label, action], index) => {
      key(`${base}\\shell\\${index + 1}${id}`, { MUIVerb: label, MultiSelectModel: 'Player' });
      key(`${base}\\shell\\${index + 1}${id}\\command`, { '@': launchCommand(launcher, action) });
    });
  };
  cascade(ARCHIVE_KEY, labels.archiveMenu, [
    ['open', labels.open, 'open'],
    ['extractto', labels.extractTo, 'extract-to'],
    ['extracthere', labels.extractHere, 'extract-here'],
    ['extractfolder', labels.extractFolder, 'extract-folder'],
    ['test', labels.test, 'test']
  ], { AppliesTo: appliesTo, MultiSelectModel: 'Player' });
  cascade(ADD_KEY, labels.addMenu, [
    ['compress', labels.addArchive, 'compress'],
    ['zip', labels.addZip, 'add-zip'],
    ['sevenzip', labels.add7z, 'add-7z'],
    ['hash', labels.hash, 'hash']
  ], { MultiSelectModel: 'Player' });
  return lines.join('\r\n');
}

function runReg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('reg.exe', args, { windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(Object.assign(new Error(output.trim() || `reg.exe exited with code ${code}`), { code })));
  });
}

async function unregisterContextMenu(root = DEFAULT_ROOT) {
  if (process.platform !== 'win32') return;
  for (const name of [ARCHIVE_KEY, ADD_KEY]) {
    await runReg(['delete', `${root}\\${name}`, '/f']).catch(() => {});
  }
}

async function registerContextMenu(launcher, labels, root = DEFAULT_ROOT) {
  if (process.platform !== 'win32') throw new Error('Explorer integration is only available on Windows.');
  await unregisterContextMenu(root);
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'quick-extract-reg-'));
  try {
    const file = path.join(folder, 'menu.reg');
    // reg import expects UTF-16LE with a byte order mark for non-ASCII labels.
    await fs.writeFile(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(buildRegFile(root, launcher, labels), 'utf16le')]));
    await runReg(['import', file]);
  } finally {
    await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
  }
}

async function isContextMenuRegistered(root = DEFAULT_ROOT) {
  if (process.platform !== 'win32') return false;
  try {
    await runReg(['query', `${root}\\${ARCHIVE_KEY}`]);
    return true;
  } catch {
    return false;
  }
}

module.exports = { registerContextMenu, unregisterContextMenu, isContextMenuRegistered, buildRegFile, launchCommand };

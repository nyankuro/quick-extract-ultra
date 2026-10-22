const fs = require('fs/promises'), path = require('path'), os = require('os');
const { spawn, spawnSync } = require('child_process');
const { downloadTool, detectTools } = require('../electron/password-tools.cjs');
const { extractInto } = require('../electron/extraction.cjs');
const { path7z } = require('7zip-bin-full');
const WS = String.raw`C:\Users\Admin\AppData\Local\Temp\qeu-gpu-test`;
const run = (exe, args, opts = {}) => new Promise((res) => { let o = '', e = ''; const c = spawn(exe, args, { windowsHide: true, ...opts }); c.stdout.on('data', d => o += d); c.stderr.on('data', d => e += d); c.on('close', code => res({ code, o, e })); });
(async () => {
  const ud = 'H:\\Quick Extract Ultra\\.gpu-probe';
  await fs.rm(ud, { recursive: true, force: true }).catch(() => {});
  console.log('downloading john...'); await downloadTool('john', { userDataDir: ud, sevenZipPath: path7z, extract: extractInto });
  console.log('downloading hashcat...'); await downloadTool('hashcat', { userDataDir: ud, sevenZipPath: path7z, extract: extractInto });
  const tools = (await detectTools(ud)).tools;
  const jt = tools.find(t => t.id === 'john'); const hc = tools.find(t => t.id === 'hashcat');
  console.log('john:', jt.installed, 'hashcat:', hc.installed, hc.exePath);
  const r2j = path.join(path.dirname(jt.exePath), 'rar2john.exe');
  // rar2john hash -> bare $rar5$ token
  const h = spawnSync(r2j, [path.join(WS, 'num7.rar')], { encoding: 'utf8', windowsHide: true });
  const line = (h.stdout || '').split(/\r?\n/).find(l => l.includes('$' + 'rar5' + '$')) || '';
  const token = line.slice(line.indexOf('$' + 'rar5' + '$')).trim();
  const hashFile = path.join(ud, 'r.hash'); await fs.writeFile(hashFile, token + '\n');
  console.log('hash token len:', token.length);
  // hashcat mode 13000, digits mask, increment 1..7
  const pot = path.join(ud, 'hc.pot'); const out = path.join(ud, 'hc.out');
  const args = ['-m', '13000', '-a', '3', hashFile, '?d?d?d?d?d?d?d', '--increment', '--increment-min', '1',
    '-o', out, '--outfile-format', '2', '--potfile-path', pot, '-w', '2', '--status', '--status-json', '--status-timer', '2', '-D', '1,2'];
  const t0 = Date.now();
  let lastSpeed = 0, dev = '';
  await new Promise((res) => {
    const c = spawn(hc.exePath, args, { cwd: path.dirname(hc.exePath), windowsHide: true });
    let buf = '';
    const feed = (chunk) => { buf += chunk; let i; while ((i = buf.search(/\r|\n/)) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(l); if (j.devices) { lastSpeed = j.devices.reduce((s, d) => s + (d.speed || 0), 0); dev = j.devices.map(d => d.device_name).join(','); } } catch {} } };
    c.stdout.on('data', feed); c.stderr.on('data', () => {});
    c.on('close', () => res());
    setTimeout(() => { try { c.kill(); } catch {} }, 180000);
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const found = await fs.readFile(out, 'utf8').catch(() => '');
  console.log('DEVICE:', dev || '(unknown)');
  console.log('SPEED (H/s):', lastSpeed);
  console.log('TIME:', secs + 's');
  console.log('FOUND:', JSON.stringify(found.trim()));
  await fs.rm(ud, { recursive: true, force: true }).catch(() => {});
})().catch(e => console.log('ERR', e.message));

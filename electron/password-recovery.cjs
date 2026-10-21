const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn: realSpawn } = require('node:child_process');

async function pathExists(candidate) {
  try { await fs.access(candidate); return true; } catch { return false; }
}

// --- Output parsers (pure, unit-tested) ---------------------------------------

function parseHashcatStatus(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  let data;
  try { data = JSON.parse(trimmed); } catch { return null; }
  if (!Array.isArray(data.progress)) return null;
  const [tried, total] = data.progress;
  const speed = Array.isArray(data.devices) ? data.devices.reduce((sum, device) => sum + (Number(device.speed) || 0), 0) : null;
  let eta = null;
  if (data.estimated_stop) eta = Math.max(0, Math.round(data.estimated_stop - Date.now() / 1000));
  else if (speed && total) eta = Math.max(0, Math.round((total - tried) / speed));
  return {
    percent: total ? Math.min(100, (tried / total) * 100) : null,
    speed: speed || null,
    eta,
    tried: tried ?? null,
    total: total ?? null,
    status: data.status ?? null
  };
}

const SUFFIX = { K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
function parseRate(text) {
  const match = /([\d.]+)\s*([KMGT]?)/.exec(text);
  if (!match) return null;
  return Math.round(Number(match[1]) * (SUFFIX[match[2]] || 1));
}

function parseJohnStatus(line) {
  // e.g. "0g 0:00:00:10 0.12% (ETA: 2030-01-02 03:04) 0g/s 512.0Kp/s 512.0Kc/s 512.0KC/s pass..."
  if (!/p\/s/.test(line)) return null;
  const percent = /(\d+(?:\.\d+)?)%/.exec(line);
  const rate = /([\d.]+[KMGT]?)p\/s/.exec(line);
  const eta = /ETA:?\s*([0-9:\- ]+)\)/.exec(line);
  return {
    percent: percent ? Number(percent[1]) : null,
    speed: rate ? parseRate(rate[1]) : null,
    etaText: eta ? eta[1].trim() : null
  };
}

function parseBkcrackLine(line) {
  const keys = /Keys:\s*([0-9a-fA-F]+)\s+([0-9a-fA-F]+)\s+([0-9a-fA-F]+)/.exec(line);
  if (keys) return { keys: [keys[1], keys[2], keys[3]] };
  const found = /found:\s*"(.*)"|Password:\s*(.+)$/.exec(line);
  if (found) return { password: (found[1] ?? found[2]).trim() };
  const percent = /(\d+(?:\.\d+)?)\s*%/.exec(line);
  if (percent) return { percent: Number(percent[1]) };
  return null;
}

// --- Mask / charset helpers ---------------------------------------------------

const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?'
};

function customCharset(charset) {
  const chars = Object.entries(CHARSETS).filter(([key]) => charset?.[key]).map(([, value]) => value).join('');
  return chars || CHARSETS.lower + CHARSETS.digits;
}

function clampLength(value, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(12, number));
}

// --- Recovery job -------------------------------------------------------------

class RecoveryJob {
  constructor(options, deps) {
    this.options = options;
    this.tools = deps.tools;                 // { bkcrack, hashcat, john: {exe, helpers} }
    this.workDir = deps.workDir;
    this.sevenZipPath = deps.sevenZipPath;
    this.listArchive = deps.listArchive;
    this.spawn = deps.spawn || realSpawn;
    this.emit = deps.emit;
    this.session = `qeu${Date.now()}`;
    this.child = null;
    this.cancelled = false;
    this.paused = false;
    this.restore = null;                     // () => childPromise to resume
    this.decryptedZipPath = '';
  }

  log(message) { this.emit({ type: 'info', message }); }

  run(exePath, args, { onLine, onStdout, onStderr, cwd } = {}) {
    return new Promise((resolve, reject) => {
      if (this.cancelled) { reject(Object.assign(new Error('cancelled'), { code: 'CANCELLED' })); return; }
      const child = this.spawn(exePath, args, { cwd: cwd || this.workDir, windowsHide: true });
      this.child = child;
      let tail = '';
      const feed = (chunk) => {
        tail += chunk;
        let newline;
        while ((newline = tail.search(/\r|\n/)) >= 0) {
          const line = tail.slice(0, newline);
          tail = tail.slice(newline + 1);
          if (line) onLine?.(line);
        }
      };
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => { onStdout?.(chunk); feed(chunk); });
      child.stderr?.on('data', (chunk) => { onStderr?.(chunk); feed(chunk); });
      child.on('error', reject);
      child.on('close', (code) => {
        this.child = null;
        if (tail) onLine?.(tail);
        if (this.cancelled) reject(Object.assign(new Error('cancelled'), { code: 'CANCELLED' }));
        else if (this.paused) reject(Object.assign(new Error('paused'), { code: 'PAUSED' }));
        else resolve(code);
      });
    });
  }

  async inspect() {
    this.emit({ type: 'stage', stage: 'inspect' });
    const listing = await this.listArchive(this.sevenZipPath, this.options.zipPath, '');
    const encrypted = listing.entries.filter((entry) => entry.encrypted && !entry.isDirectory);
    if (!encrypted.length) throw Object.assign(new Error('This ZIP is not password-protected.'), { code: 'NOT_ENCRYPTED' });
    const zipCrypto = encrypted.every((entry) => /ZipCrypto/i.test(entry.method));
    return { encrypted, zipCrypto };
  }

  // Legacy ZipCrypto + a known plaintext file -> recover keys, then password or a decrypted copy.
  async runBkcrack(encrypted) {
    const bkcrack = this.tools.bkcrack;
    const plain = this.options.knownPlaintextPath;
    const cipherEntry = this.options.entryName
      || encrypted.find((entry) => path.basename(entry.path).toLowerCase() === path.basename(plain).toLowerCase())?.path
      || encrypted.slice().sort((a, b) => a.size - b.size)[0].path;
    this.emit({ type: 'stage', stage: 'bkcrack', entry: cipherEntry });
    this.log(`bkcrack: ${cipherEntry}`);
    let keys = null;
    await this.run(bkcrack, ['-C', this.options.zipPath, '-c', cipherEntry, '-p', plain], {
      onLine: (line) => {
        const parsed = parseBkcrackLine(line);
        if (!parsed) return;
        if (parsed.keys) keys = parsed.keys;
        if (parsed.percent != null) this.emit({ type: 'progress', percent: parsed.percent, speed: null, eta: null });
      }
    });
    if (!keys) return { found: false };

    // Try to recover the literal password (short lengths) for display.
    const maxLen = clampLength(this.options.attack?.maxLen, 10);
    let password = null;
    await this.run(bkcrack, ['-k', ...keys, '-r', String(maxLen), '?b'], {
      onLine: (line) => { const parsed = parseBkcrackLine(line); if (parsed?.password) password = parsed.password; }
    }).catch(() => {});
    if (password) return { found: true, password, via: 'bkcrack' };

    // Keys found but password too long to recover: make a password-free copy to extract.
    this.decryptedZipPath = path.join(this.workDir, 'decrypted.zip');
    await this.run(bkcrack, ['-C', this.options.zipPath, '-k', ...keys, '-D', this.decryptedZipPath]);
    return { found: true, password: null, via: 'bkcrack-keys', decryptedZipPath: this.decryptedZipPath };
  }

  async writeHash() {
    const zip2john = this.tools.john?.helpers?.zip2john;
    if (!zip2john) throw Object.assign(new Error('zip2john (part of John the Ripper) is needed to read the ZIP hash.'), { code: 'NEED_JOHN' });
    const hashPath = path.join(this.workDir, 'hash.txt');
    let out = '';
    let err = '';
    // zip2john writes the hash to stdout and notes to stderr; keep both.
    await this.run(zip2john, [this.options.zipPath], { onLine: () => {}, onStdout: (chunk) => { out += chunk; }, onStderr: (chunk) => { err += chunk; } });
    // Pull out just the hash token ($zip2$...$/zip2$ or $pkzip2$...$/pkzip2$); both John and hashcat take it bare.
    const match = out.match(/\$(?:zip2|pkzip2?)\$[\s\S]*?\$\/(?:zip2|pkzip2?)\$/);
    if (!match) {
      const reason = (err.split('\n').map((line) => line.trim()).filter(Boolean).pop() || '').replace(/^ver [\d.]+ /, '');
      throw Object.assign(new Error(reason ? `Could not read a password hash from this ZIP: ${reason}` : 'Could not read a password hash from this ZIP.'), { code: 'NO_HASH' });
    }
    await fs.writeFile(hashPath, `${match[0]}\n`, 'utf8');
    return { hashPath, isAes: match[0].startsWith('$zip2$') };
  }

  emitHashcat(status) {
    if (!status) return;
    this.emit({ type: 'progress', percent: status.percent, speed: status.speed, eta: status.eta, tried: status.tried, total: status.total });
  }

  async runHashcat(hashPath, isAes) {
    const mode = isAes ? '13600' : '17225';
    const potfile = path.join(this.workDir, 'hashcat.pot');
    const outfile = path.join(this.workDir, 'found.txt');
    const restoreFile = path.join(this.workDir, `${this.session}.restore`);
    const base = ['-m', mode, '--status', '--status-json', '--status-timer', '1', '--potfile-path', potfile, '-o', outfile, '--outfile-format', '2', '--session', this.session, '--restore-file-path', restoreFile, '-w', '3'];
    const attack = this.options.attack || {};
    const stages = [];
    if (attack.mode === 'bruteforce') {
      // Advanced: exactly the charset/length the user picked.
      const set = customCharset(attack.charset);
      const min = clampLength(attack.minLen, 1);
      const max = clampLength(attack.maxLen, 8);
      stages.push(['-a', '3', '-1', set, hashPath, '?1'.repeat(max), '--increment', '--increment-min', String(min), '--increment-max', String(max)]);
    } else if (attack.mode === 'wordlist') {
      if (attack.wordlistPath) stages.push(['-a', '0', hashPath, attack.wordlistPath]);
    } else {
      // Auto (default): most effective real-world order — common passwords with
      // rules, then digits (PINs/dates), then a Markov-ordered mixed search.
      const rule = path.join(path.dirname(this.tools.hashcat), 'rules', 'best64.rule');
      if (attack.wordlistPath) stages.push(['-a', '0', hashPath, attack.wordlistPath, ...(await pathExists(rule) ? ['-r', rule] : [])]);
      stages.push(['-a', '3', hashPath, '?d'.repeat(10), '--increment', '--increment-min', '1']);
      stages.push(['-a', '3', '-1', '?l?u?d', hashPath, '?1'.repeat(8), '--increment', '--increment-min', '1']);
    }
    this.emit({ type: 'stage', stage: 'hashcat', device: 'gpu', mode });
    for (const stage of stages) {
      const code = await this.runHashcatStage([...base, ...stage], restoreFile);
      const password = await this.readHashcatResult(outfile);
      if (password != null) return { found: true, password, via: 'hashcat' };
      if (code !== 1 && code !== 0) throw Object.assign(new Error(`hashcat exited with code ${code}.`), { code: 'HASHCAT_FAILED' });
    }
    return { found: false };
  }

  async runHashcatStage(args, restoreFile) {
    this.restore = true;
    // Continue a paused run instead of starting the same mask over.
    const resumable = await pathExists(restoreFile);
    const finalArgs = resumable
      ? ['--session', this.session, '--restore-file-path', restoreFile, '--restore', '--status', '--status-json', '--status-timer', '1']
      : args;
    return this.run(this.tools.hashcat, finalArgs, { onLine: (line) => this.emitHashcat(parseHashcatStatus(line)) });
  }

  async readHashcatResult(outfile) {
    try {
      const text = (await fs.readFile(outfile, 'utf8')).trim();
      if (!text) return null;
      return text.split('\n')[0];
    } catch { return null; }
  }

  async runJohn(hashPath) {
    const john = this.tools.john.exe;
    const pot = path.join(this.workDir, 'john.pot');
    const attack = this.options.attack || {};
    const base = [`--pot=${pot}`, `--session=${this.session}`];
    const stages = [];
    if (attack.mode === 'bruteforce') {
      const set = customCharset(attack.charset);
      const min = clampLength(attack.minLen, 1);
      const max = clampLength(attack.maxLen, 8);
      stages.push([`--mask=${'?1'.repeat(max)}`, `-1=${set}`, `--min-length=${min}`, `--max-length=${max}`]);
    } else if (attack.mode === 'wordlist') {
      if (attack.wordlistPath) stages.push([`--wordlist=${attack.wordlistPath}`]);
    } else {
      // Auto (default): John's own common-password list with mangling rules, then
      // digits-only (Markov order), then its smart Markov search of mixed passwords.
      const builtin = path.join(path.dirname(john), 'password.lst');
      const wordlist = attack.wordlistPath || (await pathExists(builtin) ? builtin : '');
      if (wordlist) stages.push([`--wordlist=${wordlist}`, '--rules']);
      stages.push(['--incremental=Digits', '--max-length=12']);
      stages.push(['--incremental', '--max-length=10']);
    }
    this.emit({ type: 'stage', stage: 'john', device: 'cpu' });
    for (const stage of stages) {
      await this.runJohnStage([...base, ...stage, hashPath]);
      const password = await this.readJohnResult(john, pot, hashPath);
      if (password != null) return { found: true, password, via: 'john' };
    }
    return { found: false };
  }

  async runJohnStage(args) {
    this.restore = true;
    const resumable = await pathExists(path.join(this.workDir, `${this.session}.rec`));
    const finalArgs = resumable ? [`--restore=${this.session}`] : args;
    return this.run(this.tools.john.exe, finalArgs, { onLine: (line) => {
      const status = parseJohnStatus(line);
      if (status) this.emit({ type: 'progress', percent: status.percent, speed: status.speed, eta: null, etaText: status.etaText });
    } });
  }

  async readJohnResult(john, pot, hashPath) {
    let password = null;
    await this.run(john, [`--show`, `--pot=${pot}`, hashPath], { onLine: (line) => {
      const match = /^[^:]*:(.+?):?$/.exec(line);
      if (match && !/password hash(?:es)? cracked/.test(line) && !line.startsWith('$')) password = match[1];
    } }).catch(() => {});
    return password;
  }

  async start() {
    await fs.mkdir(this.workDir, { recursive: true });
    try {
      const { encrypted, zipCrypto } = await this.inspect();
      const device = this.options.device || 'auto';
      const canGpu = device !== 'cpu' && this.tools.hashcat;

      if (zipCrypto && this.options.knownPlaintextPath && this.tools.bkcrack) {
        const result = await this.runBkcrack(encrypted);
        if (result.found) { this.emit({ type: 'found', ...result }); return; }
        this.log('bkcrack did not find the keys; falling back to a password search.');
      }

      const { hashPath, isAes } = await this.writeHash();

      // AES ZIPs go to the GPU (hashcat); legacy ZipCrypto is most reliable on John.
      let result = { found: false };
      if (canGpu && isAes) {
        try { result = await this.runHashcat(hashPath, isAes); }
        catch (error) { if (error.code === 'CANCELLED' || error.code === 'PAUSED') throw error; this.log(`hashcat unavailable (${error.message}); using John instead.`); }
      }
      if (!result.found && this.tools.john?.exe) result = await this.runJohn(hashPath);
      else if (!result.found && !this.tools.john?.exe && !(canGpu && isAes)) {
        throw Object.assign(new Error('No usable tool for this ZIP. Install John the Ripper (CPU) or hashcat (GPU).'), { code: 'NO_TOOL' });
      }

      if (result.found) this.emit({ type: 'found', ...result });
      else this.emit({ type: 'exhausted' });
    } catch (error) {
      if (error.code === 'CANCELLED') this.emit({ type: 'cancelled' });
      else if (error.code === 'PAUSED') this.emit({ type: 'paused' });
      else this.emit({ type: 'error', message: error.message, code: error.code || '' });
    }
  }

  pause() {
    if (!this.restore || this.paused || this.cancelled) return;
    this.paused = true;
    this.killChild();
  }

  // Re-enters start(); hashcat/john pick up their saved session instead of restarting.
  resume() {
    if (!this.paused || this.cancelled) return;
    this.paused = false;
    this.emit({ type: 'resumed' });
    void this.start();
  }

  cancel() {
    this.cancelled = true;
    this.killChild();
  }

  killChild() {
    const child = this.child;
    if (!child || child.killed) return;
    // taskkill reaps the whole tool process tree on Windows; child.kill() makes sure
    // Node closes this handle (and ends the run) even if taskkill is slow or unavailable.
    if (process.platform === 'win32' && child.pid) {
      try { this.spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }); } catch {}
    }
    try { child.kill(); } catch {}
  }

  async cleanup() {
    await fs.rm(this.workDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { RecoveryJob, parseHashcatStatus, parseJohnStatus, parseBkcrackLine, customCharset, clampLength, CHARSETS };

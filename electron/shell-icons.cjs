const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');

const SIZES = [32, 64, 128, 256];
const MAX_CACHE = 600;

/**
 * Real Explorer icons and thumbnails, served from one PowerShell helper that stays
 * open for the session (starting it costs about a second; each icon then takes milliseconds).
 */
class ShellIcons {
  constructor(fallback) {
    this.fallback = fallback;
    this.cache = new Map();
    this.child = null;
    this.ready = null;
    this.pending = [];
    this.buffer = '';
    this.chain = Promise.resolve();
  }

  start() {
    if (this.ready) return this.ready;
    // PowerShell needs a physical script when this app runs from app.asar.
    const script = path.join(__dirname, 'shell-icons.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    this.ready = new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
      });
      this.child = child;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        this.buffer += chunk;
        let newline;
        while ((newline = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, newline).trim();
          this.buffer = this.buffer.slice(newline + 1);
          if (line === 'READY') resolve();
          else this.pending.shift()?.(line);
        }
      });
      const fail = (error) => {
        this.child = null;
        this.ready = null;
        reject(error);
        for (const answer of this.pending.splice(0)) answer('ERR|helper stopped');
      };
      child.on('error', fail);
      child.on('exit', () => fail(new Error('Icon helper exited.')));
    });
    return this.ready;
  }

  request(filePath, size) {
    // One request at a time keeps answers in order on the shared pipe.
    const run = this.chain.then(async () => {
      await this.start();
      return new Promise((resolve) => {
        this.pending.push(resolve);
        this.child.stdin.write(`${size}|${filePath}\n`, 'utf8');
      });
    });
    this.chain = run.catch(() => {});
    return run;
  }

  async get(filePath, requestedSize) {
    const size = SIZES.find((value) => value >= requestedSize) ?? 256;
    const stat = await fs.stat(filePath);
    const key = `${size}|${stat.mtimeMs}|${filePath}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let dataUrl = '';
    if (process.platform === 'win32') {
      try {
        const answer = await this.request(filePath, size);
        if (answer.startsWith('OK|')) dataUrl = `data:image/png;base64,${answer.slice(3)}`;
      } catch {}
    }
    if (!dataUrl && this.fallback) dataUrl = await this.fallback(filePath).catch(() => '');
    if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, dataUrl);
    return dataUrl;
  }

  stop() {
    this.child?.kill();
    this.child = null;
    this.ready = null;
  }
}

module.exports = { ShellIcons };

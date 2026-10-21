const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { path7z } = require('7zip-bin-full');
const { listArchive } = require('../electron/archive-ops.cjs');
const { detectTools, downloadTool } = require('../electron/password-tools.cjs');
const { RecoveryJob, parseHashcatStatus, parseJohnStatus, parseBkcrackLine, customCharset, clampLength } = require('../electron/password-recovery.cjs');

let workspace;
const password = 'secret';

before(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'qeu-recovery-'));
  await fs.writeFile(path.join(workspace, 'doc.txt'), 'the real document content');
  const zip = (name, flags) => assert.equal(spawnSync(path7z, ['a', '-tzip', ...flags, path.join(workspace, name), 'doc.txt'], { cwd: workspace, windowsHide: true }).status, 0);
  zip('legacy.zip', [`-p${password}`]);                 // ZipCrypto
  zip('aes.zip', ['-mem=AES256', `-p${password}`]);     // AES-256
  assert.equal(spawnSync(path7z, ['a', '-tzip', path.join(workspace, 'plain.zip'), 'doc.txt'], { cwd: workspace, windowsHide: true }).status, 0);
});

after(async () => { await fs.rm(workspace, { recursive: true, force: true }); });

test('hashcat status JSON parses progress, speed and eta', () => {
  const now = Math.floor(Date.now() / 1000);
  const line = JSON.stringify({ status: 3, progress: [250, 1000], devices: [{ speed: 500 }, { speed: 500 }], estimated_stop: now + 2 });
  const parsed = parseHashcatStatus(line);
  assert.equal(parsed.percent, 25);
  assert.equal(parsed.speed, 1000);
  assert.ok(parsed.eta >= 1 && parsed.eta <= 3);
  assert.equal(parseHashcatStatus('not json'), null);
});

test('john status line parses percent and rate', () => {
  const parsed = parseJohnStatus('0g 0:00:00:10 12.50% (ETA: 2030-01-02 03:04) 0g/s 512.0Kp/s 512.0Kc/s');
  assert.equal(parsed.percent, 12.5);
  assert.equal(parsed.speed, 512000);
  assert.equal(parsed.etaText, '2030-01-02 03:04');
  assert.equal(parseJohnStatus('nothing here'), null);
});

test('bkcrack lines parse keys, percent and password', () => {
  assert.deepEqual(parseBkcrackLine('Keys: 12345678 9abcdef0 deadbeef').keys, ['12345678', '9abcdef0', 'deadbeef']);
  assert.equal(parseBkcrackLine('[00:00:05] Attack on 42 values... 73.5 %').percent, 73.5);
  assert.equal(parseBkcrackLine('found: "hunter2"').password, 'hunter2');
});

test('charset and length helpers', () => {
  assert.equal(customCharset({ lower: true, digits: true }), 'abcdefghijklmnopqrstuvwxyz0123456789');
  assert.ok(customCharset({}).length > 0);
  assert.equal(clampLength(99, 8), 12);
  assert.equal(clampLength(0, 8), 1);
  assert.equal(clampLength('x', 8), 8);
});

test('scrape patterns resolve the official Windows binary URLs', () => {
  const sources = require('../electron/tool-sources.json');
  const hashcatPage = '<a href="/files/hashcat-7.1.2.7z">binaries</a>';
  const johnPage = '<a href="k/john-1.9.0-jumbo-1-win64.7z">win64</a> <a href="k/john-1.9.0-jumbo-1-win32.7z">win32</a>';
  const h = new RegExp(sources.hashcat.auto.linkPattern, 'i').exec(hashcatPage);
  assert.equal(new URL(h[0], sources.hashcat.auto.base).toString(), 'https://hashcat.net/files/hashcat-7.1.2.7z');
  const j = new RegExp(sources.john.auto.linkPattern, 'i').exec(johnPage);
  assert.equal(new URL(j[0], sources.john.auto.base).toString(), 'https://www.openwall.com/john/k/john-1.9.0-jumbo-1-win64.7z');
  // bkcrack has no auto scraping; it uses a GitHub release.
  assert.equal(sources.bkcrack.auto.provider, 'github');
});

test('tool detection finds exes placed under tools/<id>/', async () => {
  const toolsRoot = path.join(workspace, 'detect', 'tools');
  await fs.mkdir(path.join(toolsRoot, 'bkcrack'), { recursive: true });
  await fs.writeFile(path.join(toolsRoot, 'bkcrack', 'bkcrack.exe'), '');
  await fs.mkdir(path.join(toolsRoot, 'john', 'run'), { recursive: true });
  await fs.writeFile(path.join(toolsRoot, 'john', 'run', 'john.exe'), '');
  await fs.writeFile(path.join(toolsRoot, 'john', 'run', 'zip2john.exe'), '');
  const { tools } = await detectTools(path.join(workspace, 'detect'));
  const bk = tools.find((t) => t.id === 'bkcrack');
  const john = tools.find((t) => t.id === 'john');
  assert.equal(bk.installed, true);
  assert.equal(john.installed, true);
  assert.ok(john.helpers.zip2john.endsWith('zip2john.exe'));
  assert.equal(tools.find((t) => t.id === 'hashcat').installed, false);
});

// A scripted stand-in for the external tools, so the engine's logic is tested
// without the real cracking binaries.
function fakeSpawn(behaviours) {
  return (command, args = []) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};
    child.pid = 1234;
    child.killed = false;
    child.kill = () => { child.killed = true; setImmediate(() => child.emit('close', null)); };
    const name = path.basename(String(command)).toLowerCase();
    const key = Object.keys(behaviours).find((k) => name.includes(k));
    setImmediate(async () => {
      if (!key) { child.emit('close', 0); return; }
      try { await behaviours[key](child, args); } catch { /* ignore */ }
    });
    return child;
  };
}

const emitLines = (stream, text) => { for (const line of text.split('\n')) stream.emit('data', `${line}\n`); };

function engineDeps(tools, spawn, events) {
  return {
    tools,
    workDir: path.join(workspace, `work-${Math.random().toString(16).slice(2)}`),
    sevenZipPath: path7z,
    listArchive,
    spawn,
    emit: (event) => events.push(event)
  };
}

test('AES zip routes to hashcat (GPU) and reports the found password', async () => {
  const events = [];
  const spawn = fakeSpawn({
    zip2john: (child) => { emitLines(child.stdout, 'doc.zip:$zip2$*0*3*0*abc*def*...*$/zip2$'); child.emit('close', 0); },
    hashcat: async (child, args) => {
      emitLines(child.stdout, JSON.stringify({ status: 3, progress: [10, 100], devices: [{ speed: 9000 }] }));
      const outIndex = args.indexOf('-o');
      if (outIndex >= 0) await fs.writeFile(args[outIndex + 1], `${password}\n`);
      child.emit('close', 0);
    }
  });
  const job = new RecoveryJob({ zipPath: path.join(workspace, 'aes.zip'), device: 'auto', attack: { mode: 'wordlist', wordlistPath: path.join(workspace, 'doc.txt') } },
    engineDeps({ bkcrack: null, hashcat: 'C:/tools/hashcat.exe', john: { exe: 'C:/tools/john.exe', helpers: { zip2john: 'C:/tools/zip2john.exe' } } }, spawn, events));
  await job.start();
  await job.cleanup();
  assert.ok(events.some((e) => e.type === 'stage' && e.stage === 'hashcat'), JSON.stringify(events.map((e) => e.type + (e.stage || ''))));
  assert.ok(events.some((e) => e.type === 'progress' && e.speed === 9000));
  const found = events.find((e) => e.type === 'found');
  assert.equal(found.password, password);
  assert.equal(found.via, 'hashcat');
});

test('legacy ZipCrypto without a known file routes to John (CPU)', async () => {
  const events = [];
  const spawn = fakeSpawn({
    zip2john: (child) => { emitLines(child.stdout, 'doc.zip:$pkzip2$1*...*$/pkzip2$'); child.emit('close', 0); },
    john: (child, args) => {
      if (args.includes('--show')) emitLines(child.stdout, `doc.zip:${password}`);
      else emitLines(child.stderr, '0g 0:00:00:01 0.01% 0g/s 100.0Kp/s 100.0Kc/s');
      child.emit('close', 0);
    }
  });
  const job = new RecoveryJob({ zipPath: path.join(workspace, 'legacy.zip'), device: 'cpu', attack: { mode: 'wordlist', wordlistPath: path.join(workspace, 'doc.txt') } },
    engineDeps({ bkcrack: null, hashcat: null, john: { exe: 'C:/tools/john.exe', helpers: { zip2john: 'C:/tools/zip2john.exe' } } }, spawn, events));
  await job.start();
  await job.cleanup();
  assert.ok(events.some((e) => e.type === 'stage' && e.stage === 'john'));
  assert.equal(events.find((e) => e.type === 'found').password, password);
});

test('ZipCrypto with a known file uses bkcrack and recovers the password', async () => {
  const events = [];
  const spawn = fakeSpawn({
    bkcrack: (child, args) => {
      if (args.includes('-r')) emitLines(child.stdout, 'found: "secret"');
      else emitLines(child.stdout, '[00:00:01] Attack... 50.0 %\nKeys: 12345678 9abcdef0 deadbeef');
      child.emit('close', 0);
    }
  });
  const job = new RecoveryJob({ zipPath: path.join(workspace, 'legacy.zip'), knownPlaintextPath: path.join(workspace, 'doc.txt'), attack: { maxLen: 8 } },
    engineDeps({ bkcrack: 'C:/tools/bkcrack.exe', hashcat: null, john: null }, spawn, events));
  await job.start();
  await job.cleanup();
  assert.ok(events.some((e) => e.type === 'stage' && e.stage === 'bkcrack'));
  const found = events.find((e) => e.type === 'found');
  assert.equal(found.password, 'secret');
  assert.equal(found.via, 'bkcrack');
});

test('an unprotected zip is reported, not attacked', async () => {
  const events = [];
  const job = new RecoveryJob({ zipPath: path.join(workspace, 'plain.zip') },
    engineDeps({ bkcrack: null, hashcat: null, john: { exe: 'j', helpers: {} } }, fakeSpawn({}), events));
  await job.start();
  assert.equal(events.find((e) => e.type === 'error')?.code, 'NOT_ENCRYPTED');
});

test('cancel stops the run and emits cancelled', async () => {
  const events = [];
  let running;
  const spawn = fakeSpawn({
    zip2john: (child) => { emitLines(child.stdout, 'doc.zip:$pkzip2$1*...*$/pkzip2$'); child.emit('close', 0); },
    john: (child, args) => { if (args.includes('--show')) { child.emit('close', 0); return; } running = child; /* never closes until killed */ }
  });
  const job = new RecoveryJob({ zipPath: path.join(workspace, 'legacy.zip'), device: 'cpu', attack: { mode: 'wordlist', wordlistPath: path.join(workspace, 'doc.txt') } },
    engineDeps({ bkcrack: null, hashcat: null, john: { exe: 'john.exe', helpers: { zip2john: 'zip2john.exe' } } }, spawn, events));
  const done = job.start();
  await new Promise((resolve) => setTimeout(resolve, 60));
  job.cancel();
  await done;
  await job.cleanup();
  assert.ok(events.some((e) => e.type === 'cancelled'));
});

test('the built-in wordlist ships with the app', async () => {
  const wordlist = path.resolve(__dirname, '..', 'tools', 'wordlists', 'common-passwords.txt');
  const text = await fs.readFile(wordlist, 'utf8');
  assert.ok(text.split('\n').filter(Boolean).length > 50);
  assert.ok(text.includes('password'));
});

test('all five locales define exactly the same keys', async () => {
  const load = async (lang) => Object.keys(JSON.parse(await fs.readFile(path.resolve(__dirname, '..', 'locales', `${lang}.json`), 'utf8')));
  const en = await load('en');
  for (const lang of ['ja', 'vi', 'zh-Hans', 'zh-Hant']) {
    const keys = await load(lang);
    assert.deepEqual([...keys].sort(), [...en].sort(), `${lang} keys differ from en`);
    // Placeholders like {folder} must survive translation.
    const dict = JSON.parse(await fs.readFile(path.resolve(__dirname, '..', 'locales', `${lang}.json`), 'utf8'));
    const enDict = JSON.parse(await fs.readFile(path.resolve(__dirname, '..', 'locales', 'en.json'), 'utf8'));
    for (const key of en) {
      const want = (enDict[key].match(/\{(\w+)\}/g) || []).sort();
      const got = (dict[key].match(/\{(\w+)\}/g) || []).sort();
      assert.deepEqual(got, want, `${lang} ${key} placeholders`);
    }
  }
});

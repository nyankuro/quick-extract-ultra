const path = require('node:path');
const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { createHash } = require('node:crypto');
const https = require('node:https');
const { spawn } = require('node:child_process');

const REGISTRY = require('./tool-sources.json');

// Where downloaded tools live. Writable per user; nothing here is bundled or re-hosted.
function toolsDir(userDataDir) {
  return path.join(userDataDir, 'tools');
}

// Read-only locations that may already hold a tool (a bundled wordlist, or a dev checkout).
function searchRoots(userDataDir, extraRoots = []) {
  return [toolsDir(userDataDir), ...extraRoots].filter(Boolean);
}

async function pathExists(candidate) {
  try { await fs.access(candidate); return true; } catch { return false; }
}

// Finds <root>/<toolId>/<relative exe>, trying each candidate path and one glob level.
async function locateExe(toolId, relativePaths, roots) {
  for (const root of roots) {
    const base = path.join(root, toolId);
    for (const relative of relativePaths) {
      const full = path.join(base, relative);
      if (await pathExists(full)) return full;
    }
    // One level of nesting, e.g. bkcrack-1.7.1-win/bkcrack.exe
    let children = [];
    try { children = await fs.readdir(base, { withFileTypes: true }); } catch { continue; }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      for (const relative of relativePaths) {
        const full = path.join(base, child.name, relative);
        if (await pathExists(full)) return full;
      }
    }
  }
  return null;
}

function runVersion(exePath, args) {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(exePath, args, { windowsHide: true });
    const collect = (chunk) => { output = (output + chunk).slice(0, 2048); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', () => resolve(''));
    child.on('close', () => {
      const match = output.match(/v?\d+\.\d+(\.\d+)?/);
      resolve(match ? match[0] : '');
    });
    setTimeout(() => { child.kill(); resolve(''); }, 5000);
  });
}

async function detectTool(toolId, roots) {
  const spec = REGISTRY[toolId];
  const exePath = await locateExe(toolId, spec.exe, roots);
  let helpers = {};
  let helpersReady = true;
  if (spec.helperExe) {
    for (const [name, relatives] of Object.entries(spec.helperExe)) {
      const helperPath = await locateExe(toolId, relatives, roots);
      helpers[name] = helperPath || '';
      if (!helperPath) helpersReady = false;
    }
  }
  let version = '';
  if (exePath) {
    const flag = toolId === 'bkcrack' ? ['--version'] : toolId === 'hashcat' ? ['--version'] : ['--list=build-info'];
    version = await runVersion(exePath, flag).catch(() => '');
  }
  return {
    id: toolId,
    name: spec.name,
    license: spec.license,
    licenseUrl: spec.licenseUrl,
    approxSizeMb: spec.approxSizeMb,
    page: spec.page,
    purpose: spec.purpose,
    autoAvailable: Boolean(spec.auto),
    autoNote: spec.autoNote || '',
    installed: Boolean(exePath) && helpersReady,
    exePath: exePath || '',
    helpers,
    version
  };
}

async function detectTools(userDataDir, extraRoots = []) {
  const roots = searchRoots(userDataDir, extraRoots);
  const ids = Object.keys(REGISTRY);
  const tools = await Promise.all(ids.map((id) => detectTool(id, roots)));
  return { toolsDir: toolsDir(userDataDir), tools };
}

// --- Auto download (verified) --------------------------------------------------

function httpsGet(url, { headers = {}, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'QuickExtractUltra', Accept: 'application/vnd.github+json', ...headers } }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects <= 0) { reject(new Error('Too many redirects.')); return; }
        resolve(httpsGet(new URL(response.headers.location, url).toString(), { headers, redirects: redirects - 1 }));
        return;
      }
      if (status !== 200) { response.resume(); reject(Object.assign(new Error(`Download failed (HTTP ${status}).`), { code: 'HTTP_ERROR' })); return; }
      resolve(response);
    });
    request.on('error', reject);
    request.setTimeout(30000, () => request.destroy(new Error('Connection timed out.')));
  });
}

async function fetchText(url) {
  const response = await httpsGet(url, { headers: { Accept: 'text/html,*/*' } });
  let body = '';
  response.setEncoding('utf8');
  for await (const chunk of response) body += chunk;
  return body;
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

// Reads the official download page and builds the current Windows binary URL.
// These sources publish a PGP signature, not a machine-readable checksum, so the
// download is trusted to its official HTTPS host and its SHA-256 is recorded, not gated.
async function resolveScrapeAsset(spec) {
  const page = await fetchText(spec.page);
  const match = new RegExp(spec.linkPattern, 'i').exec(page);
  if (!match) throw Object.assign(new Error('Could not find the current Windows build on the official page.'), { code: 'NO_ASSET' });
  const url = new URL(match[0], spec.base.endsWith('/') || match[0].startsWith('/') ? spec.base : `${spec.base}/`).toString();
  const version = (/(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/.exec(match[0]) || [])[1] || '';
  return { name: url.split('/').pop(), url, size: 0, expectedSha256: '', version };
}

async function downloadToFile(url, destination, onProgress) {
  const response = await httpsGet(url, { headers: { Accept: 'application/octet-stream' } });
  const total = Number(response.headers['content-length']) || 0;
  const hash = createHash('sha256');
  let received = 0;
  await new Promise((resolve, reject) => {
    const file = createWriteStream(destination);
    response.on('data', (chunk) => {
      hash.update(chunk);
      received += chunk.length;
      if (total) onProgress?.(Math.round((received / total) * 100), received, total);
    });
    response.on('error', reject);
    file.on('error', reject);
    response.pipe(file);
    file.on('finish', () => file.close(() => resolve()));
  });
  return { sha256: hash.digest('hex'), bytes: received };
}

// Resolves the best-matching Windows asset on the latest GitHub release.
async function resolveGithubAsset(repo, assetPattern) {
  const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
  const pattern = new RegExp(assetPattern, 'i');
  const asset = (release.assets || []).find((item) => pattern.test(item.name))
    || (release.assets || []).find((item) => /win.*\.(zip|7z)$/i.test(item.name));
  if (!asset) throw Object.assign(new Error('No Windows build was found on the latest release.'), { code: 'NO_ASSET' });
  // GitHub returns a "sha256:..." digest on assets; use it to verify what we downloaded.
  const expected = typeof asset.digest === 'string' && asset.digest.startsWith('sha256:') ? asset.digest.slice(7) : '';
  return { name: asset.name, url: asset.browser_download_url, size: asset.size, expectedSha256: expected, version: release.tag_name || '' };
}

/**
 * Downloads a tool from its official source, verifies the SHA-256 the source
 * publishes, and extracts it into tools/<id>/. Throws CHECKSUM_MISMATCH without
 * keeping the file if verification fails. Never used unless the UI passed the
 * user's explicit, per-tool consent.
 */
async function downloadTool(toolId, { userDataDir, sevenZipPath, extract, onProgress }) {
  const spec = REGISTRY[toolId];
  if (!spec?.auto) throw Object.assign(new Error('This tool has no automatic download. Use the manual button.'), { code: 'NO_AUTO' });

  const asset = spec.auto.provider === 'github'
    ? await resolveGithubAsset(spec.auto.repo, spec.auto.assetPattern)
    : await resolveScrapeAsset(spec.auto);
  const dir = path.join(toolsDir(userDataDir), toolId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(dir, { recursive: true });
  const tempFile = path.join(dir, `.download-${Date.now()}-${asset.name}`);
  try {
    onProgress?.({ phase: 'download', percent: 0 });
    const { sha256 } = await downloadToFile(asset.url, tempFile, (percent) => onProgress?.({ phase: 'download', percent }));
    if (asset.expectedSha256 && sha256.toLowerCase() !== asset.expectedSha256.toLowerCase()) {
      throw Object.assign(new Error('The downloaded file did not match the checksum published by the source. It was discarded.'), { code: 'CHECKSUM_MISMATCH' });
    }
    onProgress?.({ phase: 'verify', percent: 100, verified: Boolean(asset.expectedSha256), sha256 });
    onProgress?.({ phase: 'extract', percent: 0 });
    await extract(sevenZipPath, tempFile, dir);
    return {
      verified: Boolean(asset.expectedSha256),
      sha256,
      checksumPublished: Boolean(asset.expectedSha256),
      version: asset.version,
      source: asset.url
    };
  } finally {
    await fs.rm(tempFile, { force: true }).catch(() => {});
  }
}

// Downloads every tool that is not installed yet, from each tool's official source.
async function setupAllTools(opts) {
  const roots = searchRoots(opts.userDataDir);
  const results = [];
  for (const id of Object.keys(REGISTRY)) {
    const existing = await detectTool(id, roots);
    if (existing.installed) { results.push({ toolId: id, ok: true, skipped: true }); continue; }
    try {
      const outcome = await downloadTool(id, { ...opts, onProgress: (p) => opts.onProgress?.({ toolId: id, ...p }) });
      results.push({ toolId: id, ok: true, ...outcome });
    } catch (error) {
      results.push({ toolId: id, ok: false, code: error.code || '', message: error.message });
    }
  }
  return results;
}

module.exports = { REGISTRY, toolsDir, detectTools, detectTool, downloadTool, setupAllTools, resolveScrapeAsset, locateExe };

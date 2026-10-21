// Receives { archivePath, password } as JSON on stdin; never stores the password.
const path = require('node:path');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { crc32 } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { path7z } = require('7zip-bin-full');
const { extractWithSevenZip } = require('../electron/extraction.cjs');

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { archivePath, password } = JSON.parse(input);
  const fileName = path.basename(archivePath);
  const baseName = path.basename(fileName, path.extname(fileName));
  const sourceHashBefore = await sha256(archivePath);
  const listing = spawnSync(path7z, ['l', '-slt', '-sccUTF-8', '--', archivePath], {
    input: password + '\n', encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024
  });
  if (listing.status !== 0) throw new Error(listing.stderr || 'Could not list archive.');
  const entries = listing.stdout.split('----------')[1].trim().split(/\r?\n\r?\n/).map((block) =>
    Object.fromEntries(block.split(/\r?\n/).filter((line) => line.includes(' = ')).map((line) => {
      const index = line.indexOf(' = ');
      return [line.slice(0, index), line.slice(index + 3)];
    }))
  ).filter((entry) => entry.Path);
  let index = 0;
  let targetPath;
  while (true) {
    targetPath = path.join(path.dirname(archivePath), index ? `${baseName} (${index})` : baseName);
    if (!await fs.access(targetPath).then(() => true, () => false)) break;
    index += 1;
  }
  const startedAt = performance.now();
  await extractWithSevenZip(path7z, { archivePath, fileName, targetPath }, { password });
  const extractionSeconds = (performance.now() - startedAt) / 1000;
  // Account for the app's matching-root flattening rule.
  const roots = new Set(entries.map((entry) => entry.Path.split(/[\\/]/)[0]));
  const flatten = roots.size === 1 && [...roots][0].toLowerCase() === baseName.toLowerCase() &&
    entries.some((entry) => /[\\/]/.test(entry.Path) || entry.Folder === '+');
  let files = 0;
  let bytes = 0;
  for (const entry of entries) {
    let name = entry.Path;
    if (flatten) name = name.split(/[\\/]/).slice(1).join(path.sep);
    const output = path.join(targetPath, name);
    const stat = await fs.stat(output);
    if (entry.Folder === '+') {
      if (!stat.isDirectory()) throw new Error(`Missing directory: ${entry.Path}`);
      continue;
    }
    if (!stat.isFile() || stat.size !== Number(entry.Size)) throw new Error(`Size mismatch: ${entry.Path}`);
    let crc = 0;
    for await (const chunk of createReadStream(output)) crc = crc32(chunk, crc);
    if (entry.CRC && crc.toString(16).padStart(8, '0').toUpperCase() !== entry.CRC.toUpperCase()) {
      throw new Error(`CRC mismatch: ${entry.Path}`);
    }
    files += 1;
    bytes += stat.size;
  }
  const sourceHashAfter = await sha256(archivePath);
  if (sourceHashBefore !== sourceHashAfter) throw new Error('Source archive was modified.');
  const report = { archivePath, targetPath, files, bytes, extractionSeconds: Number(extractionSeconds.toFixed(3)),
    allSizesAndCrcsMatch: true, sourceUnchanged: true, sourceSha256: sourceHashAfter };
  await fs.writeFile(path.resolve(__dirname, '../build/extraction-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

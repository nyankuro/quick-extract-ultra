const path = require('node:path');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const zlib = require('node:zlib');
const { runSevenZipCommand, availablePath, pathExists } = require('./extraction.cjs');
const { CREATE_FORMATS } = require('./formats.cjs');

function parseBlock(block) {
  const fields = {};
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(' = ');
    if (separator > 0) fields[line.slice(0, separator)] = line.slice(separator + 3);
  }
  return fields;
}

function parseListing(output) {
  const marker = output.indexOf('\n----------');
  if (marker < 0) throw new Error('Could not read the archive contents.');
  const headerPart = output.slice(0, marker);
  const header = parseBlock(headerPart.slice(headerPart.lastIndexOf('\n--') + 1));
  const entries = output.slice(marker + 11).split(/\r?\n\r?\n/).map(parseBlock).filter((fields) => fields.Path !== undefined)
    .map((fields) => ({
      path: fields.Path.replace(/\\/g, '/'),
      isDirectory: fields.Folder === '+' || /D/.test(fields.Attributes || ''),
      size: Number(fields.Size) || 0,
      packedSize: Number(fields['Packed Size']) || 0,
      modified: fields.Modified || '',
      encrypted: fields.Encrypted === '+',
      crc: fields.CRC || '',
      method: fields.Method || ''
    }));
  return {
    info: {
      type: header.Type || '',
      method: header.Method || '',
      solid: header.Solid === '+',
      physicalSize: Number(header['Physical Size']) || 0,
      encryptedHeaders: false
    },
    entries
  };
}

async function listArchive(sevenZipPath, archivePath, password = '') {
  const output = await runSevenZipCommand(sevenZipPath, ['l', '-slt', '-sccUTF-8', '--', archivePath], { password, collectOutput: true });
  const listing = parseListing(output);
  listing.info.encryptedHeaders = Boolean(password) && /7zAES/.test(listing.info.method);
  return listing;
}

async function testArchive(sevenZipPath, archivePath, { password = '', updateProgress } = {}) {
  await runSevenZipCommand(sevenZipPath, ['t', '-bb0', '-bsp1', '-sccUTF-8', '--', archivePath], { password, updateProgress });
}

/**
 * Builds the archive in a staging folder beside the destination, then renames the
 * finished file(s) into place so a failed run never leaves a half-written archive.
 */
async function createArchive(sevenZipPath, { sources, outputFolder, archiveName, format = '7z', level = 5, password = '', encryptNames = false, volumeSizeMb = 0 }, { updateProgress } = {}) {
  const spec = CREATE_FORMATS[format];
  if (!spec) throw new Error(`Unsupported archive format: ${format}`);
  if (!Array.isArray(sources) || sources.length === 0) throw new Error('Add at least one file or folder.');
  if (password && !spec.supportsPassword) throw new Error('This format does not support passwords. Choose 7Z or ZIP.');
  // 7-Zip refuses non-ASCII ZIP passwords; other tools could not open them reliably anyway.
  if (password && format === 'zip' && !/^[ -~]+$/.test(password)) {
    throw Object.assign(new Error('ZIP passwords can only use English letters, numbers and symbols. Choose 7Z for other characters.'), { code: 'ZIP_PASSWORD_ASCII' });
  }
  const safeName = String(archiveName || '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  if (!safeName) throw new Error('Enter an archive name.');
  for (const source of sources) {
    if (!(await pathExists(source))) throw new Error(`Not found: ${source}`);
  }

  const levelValue = Math.max(0, Math.min(9, Number(level) || 0));
  await fs.mkdir(outputFolder, { recursive: true });
  const finalPath = await availablePath(outputFolder, `${safeName}${spec.extension}`);
  const stagingFolder = await fs.mkdtemp(path.join(outputFolder, '.quick-extract-'));
  try {
    const listFile = path.join(stagingFolder, 'sources.list');
    await fs.writeFile(listFile, sources.join('\r\n'), 'utf8');
    const stagedName = path.basename(finalPath);
    // List files must come after the archive name and outside "--"; every path here is absolute.
    let inputArgs = ['-scsUTF-8', path.join(stagingFolder, stagedName), `@${listFile}`];

    if (spec.tarFirst) {
      const tarPath = path.join(stagingFolder, `${safeName}.tar`);
      await runSevenZipCommand(sevenZipPath, ['a', '-ttar', '-bb0', '-bsp1', '-sccUTF-8', '-scsUTF-8', tarPath, `@${listFile}`], {
        updateProgress: (value) => updateProgress?.(Math.round(value / 2))
      });
      inputArgs = ['--', path.join(stagingFolder, stagedName), tarPath];
    }

    const args = ['a', `-t${spec.type}`, `-mx=${levelValue}`, '-bb0', '-bsp1', '-sccUTF-8', '-y'];
    if (password) {
      args.push('-p');
      if (format === '7z' && encryptNames) args.push('-mhe=on');
      if (format === 'zip') args.push('-mem=AES256');
    }
    const volume = Number(volumeSizeMb);
    if (volume > 0) args.push(`-v${Math.round(volume * 1024 * 1024)}b`);
    await runSevenZipCommand(sevenZipPath, [...args, ...inputArgs], {
      password,
      confirmPassword: true,
      updateProgress: (value) => updateProgress?.(spec.tarFirst ? 50 + Math.round(value / 2) : value)
    });

    // Volumes come out as name.7z.001, name.7z.002, ...; publish all of them.
    const produced = (await fs.readdir(stagingFolder)).filter((name) => name === stagedName || name.startsWith(`${stagedName}.`));
    if (!produced.length) throw new Error('7-Zip did not produce an archive.');
    const published = [];
    for (const name of produced.sort()) {
      const destination = path.join(outputFolder, name);
      if (await pathExists(destination)) throw new Error(`File already exists: ${destination}`);
      await fs.rename(path.join(stagingFolder, name), destination);
      published.push(destination);
    }
    return { outputPath: published[0], files: published };
  } finally {
    await fs.rm(stagingFolder, { recursive: true, force: true }).catch(() => {});
  }
}

const HASH_ALGORITHMS = ['crc32', 'md5', 'sha1', 'sha256', 'sha512'];

async function hashFile(filePath, algorithms = HASH_ALGORITHMS, onProgress) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);
  const wanted = algorithms.filter((name) => HASH_ALGORITHMS.includes(name));
  const hashes = wanted.filter((name) => name !== 'crc32').map((name) => [name, createHash(name)]);
  let crc = 0;
  let read = 0;
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    stream.on('data', (chunk) => {
      for (const [, hash] of hashes) hash.update(chunk);
      if (wanted.includes('crc32')) crc = zlib.crc32(chunk, crc);
      read += chunk.length;
      onProgress?.(stat.size ? Math.round((read / stat.size) * 100) : 100);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  const result = { path: filePath, size: stat.size, hashes: {} };
  if (wanted.includes('crc32')) result.hashes.crc32 = (crc >>> 0).toString(16).toUpperCase().padStart(8, '0');
  for (const [name, hash] of hashes) result.hashes[name] = hash.digest('hex');
  return result;
}

module.exports = { listArchive, parseListing, testArchive, createArchive, hashFile, HASH_ALGORITHMS };

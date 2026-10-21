const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { archiveBaseName, isTarWrapper } = require('./formats.cjs');

const MAX_ERROR_OUTPUT_LENGTH = 16 * 1024;

function passwordError(message, code) {
  return Object.assign(new Error(message), { code });
}

function parseSevenZipProgress(output) {
  const matches = [...output.matchAll(/(\d{1,3})%/g)];
  return matches.length ? Math.min(99, Number(matches.at(-1)[1])) : null;
}

async function runSevenZipCommand(sevenZipPath, args, { password = '', updateProgress, collectOutput = false, confirmPassword = false } = {}) {
  if (typeof password !== 'string' || /[\r\n\0]/.test(password)) {
    throw new Error('Archive password must be a single line.');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(sevenZipPath, args, { windowsHide: true });
    let diagnosticOutput = '';
    let fullOutput = '';
    let progressBuffer = '';
    let passwordRequired = false;
    let lastProgress = -1;
    let lastProgressSentAt = 0;

    // Supply input through the pipe, keeping passwords out of process arguments.
    // Closing it also prevents an invisible console prompt from waiting forever.
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') {
        child.kill();
        reject(error);
      }
    });
    const input = password ? `${password}\n`.repeat(confirmPassword ? 2 : 1) : undefined;
    child.stdin.end(input, 'utf8');
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    const handleOutput = (text, isStdout) => {
      diagnosticOutput = (diagnosticOutput + text).slice(-MAX_ERROR_OUTPUT_LENGTH);
      progressBuffer = (progressBuffer + text).slice(-512);
      if (collectOutput && isStdout) fullOutput += text;

      if (!password && /Enter password(?: \(will not be echoed\))?:/i.test(diagnosticOutput) && !passwordRequired) {
        passwordRequired = true;
        child.kill();
      }

      const progress = parseSevenZipProgress(progressBuffer);
      const now = Date.now();
      if (updateProgress && progress !== null && progress > lastProgress &&
          (now - lastProgressSentAt >= 120 || progress === 99)) {
        lastProgress = progress;
        lastProgressSentAt = now;
        updateProgress(progress);
      }
    };

    child.stdout.on('data', (text) => handleOutput(text, true));
    child.stderr.on('data', (text) => handleOutput(text, false));
    child.on('error', reject);
    child.on('close', (code) => {
      if (passwordRequired) {
        reject(passwordError('Password required. Enter the archive password to continue.', 'PASSWORD_REQUIRED'));
      } else if (code === 0) {
        resolve(collectOutput ? fullOutput : diagnosticOutput);
      } else if (/Wrong password/i.test(diagnosticOutput)) {
        reject(passwordError('Incorrect archive password. Enter another password to continue.', 'PASSWORD_INCORRECT'));
      } else {
        reject(new Error(diagnosticOutput.trim() || `7-Zip exited with code ${code}`));
      }
    });
  });
}

async function resolveExtractedContentRoot(tempFolder, fileName) {
  const entries = await fs.readdir(tempFolder, { withFileTypes: true });
  const baseName = archiveBaseName(fileName).toLowerCase();
  if (entries.length === 1 && entries[0].isDirectory() && entries[0].name.toLowerCase() === baseName) {
    return path.join(tempFolder, entries[0].name);
  }
  return tempFolder;
}

async function pathExists(candidatePath) {
  try {
    await fs.lstat(candidatePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function availablePath(parentFolder, name) {
  const ext = path.extname(name);
  const stem = ext && ext !== name ? name.slice(0, -ext.length) : name;
  for (let index = 0; ; index += 1) {
    const candidate = path.join(parentFolder, index === 0 ? name : `${stem} (${index})${ext}`);
    if (!(await pathExists(candidate))) return candidate;
  }
}

function baseExtractArgs(tempFolder, propagateZone) {
  // x preserves paths; aou preserves duplicate file entries instead of overwriting.
  // snz copies the archive's Mark-of-the-Web to extracted files, like Explorer does.
  return ['x', `-o${tempFolder}`, '-y', '-aou', '-bb0', '-bsp1', '-sccUTF-8', ...(propagateZone ? ['-snz'] : [])];
}

// A .tar.gz first unpacks to one .tar file; unpack that too so users get the files.
async function unwrapInnerTar(sevenZipPath, tempFolder, fileName, propagateZone) {
  if (!isTarWrapper(fileName)) return tempFolder;
  const entries = await fs.readdir(tempFolder, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isFile() || !/\.tar$/i.test(entries[0].name)) return tempFolder;
  const innerTar = path.join(tempFolder, entries[0].name);
  const innerFolder = path.join(tempFolder, '.inner');
  await runSevenZipCommand(sevenZipPath, [...baseExtractArgs(innerFolder, propagateZone), '--', innerTar]);
  await fs.rm(innerTar, { force: true });
  return innerFolder;
}

/**
 * archive.targetPath is the folder-mode destination. With smart mode, a lone top-level
 * item is published beside it instead, so "Extract here" never nests a needless folder.
 * Returns the final published path.
 */
async function extractWithSevenZip(sevenZipPath, archive, { password = '', updateProgress, onFinalizing, smart = false, propagateZone = true, entries } = {}) {
  await fs.access(sevenZipPath);
  const parentFolder = path.dirname(archive.targetPath);
  await fs.mkdir(parentFolder, { recursive: true });
  const tempFolder = await fs.mkdtemp(path.join(parentFolder, '.quick-extract-'));
  let listFile = null;
  try {
    const args = [...baseExtractArgs(tempFolder, propagateZone)];
    if (entries?.length) {
      // A list file avoids command-line length limits for large selections.
      listFile = path.join(tempFolder, '..', `${path.basename(tempFolder)}.list`);
      await fs.writeFile(listFile, entries.join('\r\n'), 'utf8');
      if (!path.isAbsolute(archive.archivePath)) throw new Error('Archive path must be absolute.');
      // "--" would turn @list into a literal name, so rely on the absolute archive path instead.
      args.push('-scsUTF-8', archive.archivePath, `@${listFile}`);
    } else {
      args.push('--', archive.archivePath);
    }
    // A successful extraction includes 7-Zip's data/CRC checks; all other exits fail.
    await runSevenZipCommand(sevenZipPath, args, { password, updateProgress });
    onFinalizing?.();
    const unpackedFolder = await unwrapInnerTar(sevenZipPath, tempFolder, archive.fileName, propagateZone);

    if (smart) {
      const items = await fs.readdir(unpackedFolder);
      if (items.length === 1) {
        const finalPath = await availablePath(parentFolder, items[0]);
        await fs.rename(path.join(unpackedFolder, items[0]), finalPath);
        return finalPath;
      }
    }

    const contentRoot = await resolveExtractedContentRoot(unpackedFolder, archive.fileName);
    if (await pathExists(archive.targetPath)) {
      throw new Error('Target folder was created during extraction. Extract again to use a new folder.');
    }
    // Staging beside the destination allows one same-volume directory rename.
    await fs.rename(contentRoot, archive.targetPath);
    return archive.targetPath;
  } finally {
    // Only remove our own staging folder; never delete a target on failure.
    await fs.rm(tempFolder, { recursive: true, force: true }).catch(() => {});
    if (listFile) await fs.rm(listFile, { force: true }).catch(() => {});
  }
}

module.exports = { extractWithSevenZip, runSevenZipCommand, availablePath, pathExists };

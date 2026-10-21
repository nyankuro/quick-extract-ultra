const path = require('node:path');

// Formats 7-Zip can read that people commonly receive as archives.
const EXTRACT_EXTENSIONS = [
  'zip', 'zipx', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'tbz', 'xz', 'txz', 'zst', 'tzst',
  'lz', 'lzma', 'z', 'taz', 'cab', 'iso', 'wim', 'arj', 'lzh', 'lha', 'cpio', 'rpm', 'deb', 'dmg',
  'vhd', 'vhdx', 'xar', '001'
];
const EXTRACT_EXTENSION_SET = new Set(EXTRACT_EXTENSIONS.map((ext) => `.${ext}`));
// Single-file compressors: 7-Zip unwraps these to an inner .tar, which we unpack too.
const TAR_WRAPPERS = new Set(['.gz', '.tgz', '.bz2', '.tbz2', '.tbz', '.xz', '.txz', '.zst', '.tzst', '.lz', '.lzma', '.z', '.taz']);

const CREATE_FORMATS = {
  '7z': { extension: '.7z', type: '7z', supportsPassword: true, supportsEncryptNames: true },
  zip: { extension: '.zip', type: 'zip', supportsPassword: true, supportsEncryptNames: false },
  tar: { extension: '.tar', type: 'tar', supportsPassword: false, supportsEncryptNames: false },
  'tar.gz': { extension: '.tar.gz', type: 'gzip', tarFirst: true, supportsPassword: false, supportsEncryptNames: false },
  'tar.xz': { extension: '.tar.xz', type: 'xz', tarFirst: true, supportsPassword: false, supportsEncryptNames: false },
  'tar.bz2': { extension: '.tar.bz2', type: 'bzip2', tarFirst: true, supportsPassword: false, supportsEncryptNames: false }
};

function isArchiveFile(fileName) {
  const lower = fileName.toLowerCase();
  if (!EXTRACT_EXTENSION_SET.has(path.extname(lower))) return false;
  // Later volumes are opened through the first one, so hide them from scans.
  const part = /\.part(\d+)\.rar$/.exec(lower);
  if (part && Number(part[1]) !== 1) return false;
  return true;
}

function archiveBaseName(fileName) {
  let name = fileName;
  const strip = () => {
    const ext = path.extname(name).toLowerCase();
    if (EXTRACT_EXTENSION_SET.has(ext)) {
      name = name.slice(0, -ext.length);
      return true;
    }
    return false;
  };
  if (/\.\d{3}$/.test(name)) name = name.slice(0, -4);
  strip();
  name = name.replace(/\.part\d+$/i, '');
  if (/\.tar$/i.test(name)) name = name.slice(0, -4);
  return name || fileName;
}

function archiveFormatLabel(fileName) {
  const lower = fileName.toLowerCase();
  const compoundTar = /\.tar\.(gz|bz2|xz|zst|lz)$/.exec(lower);
  if (compoundTar) return `tar.${compoundTar[1]}`;
  if (/\.7z\.\d{3}$/.test(lower)) return '7z';
  if (/\.zip\.\d{3}$/.test(lower)) return 'zip';
  return path.extname(lower).slice(1);
}

function isTarWrapper(fileName) {
  return TAR_WRAPPERS.has(path.extname(fileName).toLowerCase());
}

module.exports = { EXTRACT_EXTENSIONS, CREATE_FORMATS, isArchiveFile, archiveBaseName, archiveFormatLabel, isTarWrapper };

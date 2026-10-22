'use strict';

// Checks GitHub Releases for a newer version of the app. It does NOT download or
// install anything on its own: it reports whether a newer release exists and hands
// back the release page URL so the UI can open it for the user to download. This
// keeps the flow safe and testable without code signing or an auto-install feed.
const https = require('node:https');

const REPO = 'nyankuro/quick-extract-ultra';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

// Pull the numeric x.y.z out of a tag like "v2.2.8" or "2.2.8-beta". null if none.
function parseVersion(value) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(value || ''));
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// -1 if a < b, 0 if equal, 1 if a > b. An unparseable version sorts lowest.
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

// Pure logic: compare the running version against a GitHub "latest release" object.
// Returns { status: 'available' | 'current' | 'none', current, latest, url }.
function interpretLatest(currentVersion, release) {
  const tag = (release && (release.tag_name || release.name)) || '';
  const parsed = parseVersion(tag);
  const latest = parsed ? parsed.join('.') : tag.replace(/^v/i, '');
  const url = (release && release.html_url) || RELEASES_PAGE;
  // A draft/prerelease or a missing tag is treated as "nothing to offer yet".
  if (!release || release.draft || !tag) {
    return { status: 'none', current: currentVersion, latest: '', url: RELEASES_PAGE };
  }
  const newer = compareVersions(currentVersion, tag) < 0;
  return { status: newer ? 'available' : 'current', current: currentVersion, latest, url };
}

function httpsGetJson(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { 'User-Agent': 'QuickExtractUltra', Accept: 'application/vnd.github+json' }
    }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects <= 0) { reject(Object.assign(new Error('Too many redirects.'), { code: 'NETWORK' })); return; }
        resolve(httpsGetJson(new URL(response.headers.location, url).toString(), redirects - 1));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status, body }));
    });
    request.on('error', (error) => reject(Object.assign(error, { code: 'NETWORK' })));
    request.setTimeout(15000, () => request.destroy(Object.assign(new Error('Connection timed out.'), { code: 'NETWORK' })));
  });
}

// Returns { ok: true, status, current, latest, url } or { ok: false, code, message }.
// A 404 means the repo has no public releases yet (e.g. not published), which is a
// normal "nothing found" result, not an error.
async function checkForUpdate(currentVersion) {
  try {
    const { status, body } = await httpsGetJson(RELEASES_API);
    if (status === 404) return { ok: true, status: 'none', current: currentVersion, latest: '', url: RELEASES_PAGE };
    if (status !== 200) return { ok: false, code: 'HTTP', message: `HTTP ${status}` };
    return { ok: true, ...interpretLatest(currentVersion, JSON.parse(body)) };
  } catch (error) {
    return { ok: false, code: error.code || 'NETWORK', message: error.message };
  }
}

module.exports = { checkForUpdate, compareVersions, interpretLatest, parseVersion, RELEASES_API, RELEASES_PAGE };

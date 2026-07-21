const fs = require('fs');
const path = require('path');

/**
 * Reads every file in `folder` (Baileys' multi-file auth state directory)
 * and packs them into one base64 string: { "creds.json": "...", "session-xxx.json": "..." }
 */
function packSessionFolder(folder) {
  if (!fs.existsSync(folder)) {
    throw new Error(`Session folder not found: ${folder}`);
  }
  const files = fs.readdirSync(folder).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    throw new Error(`No session files found in ${folder}. Did you finish pairing?`);
  }

  const bundle = {};
  for (const file of files) {
    bundle[file] = fs.readFileSync(path.join(folder, file), 'utf8');
  }
  return Buffer.from(JSON.stringify(bundle), 'utf8').toString('base64');
}

/**
 * Reverses packSessionFolder: writes the bundled files back out to `folder`.
 * Safe to call even if folder already has files (e.g. re-pairing overwrites them).
 */
function unpackSessionFolder(base64String, folder) {
  const bundle = JSON.parse(Buffer.from(base64String, 'base64').toString('utf8'));
  fs.mkdirSync(folder, { recursive: true });
  for (const [file, content] of Object.entries(bundle)) {
    fs.writeFileSync(path.join(folder, file), content, 'utf8');
  }
}

module.exports = { packSessionFolder, unpackSessionFolder };

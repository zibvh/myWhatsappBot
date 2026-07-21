const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'session', 'store.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

let data = load();

function get(key, fallback) {
  return key in data ? data[key] : fallback;
}

function set(key, value) {
  data[key] = value;
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[store] Failed to persist store.json:', err.message);
  }
}

module.exports = { get, set };

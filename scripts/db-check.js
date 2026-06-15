/* Quick diagnostics: node scripts/db-check.js */
const fs = require('node:fs');
const path = require('node:path');

function resolveDataPath() {
  const configured = process.env.DATA_FILE || process.env.DATABASE_URL;
  if (!configured) return path.join(process.cwd(), 'data', 'signal.json');
  const raw = configured.replace(/^file:/, '');
  const jsonPath = raw.endsWith('.db') ? raw.replace(/\.db$/, '.json') : raw;
  return path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
}

const filePath = resolveDataPath();
console.log('data file:', filePath);

if (!fs.existsSync(filePath)) {
  console.log('status: missing');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
for (const key of ['events', 'bundles', 'briefs', 'sources']) {
  console.log(`${key}:`, Array.isArray(data[key]) ? data[key].length : 0);
}
console.log('settings:', data.config ? 'present' : 'missing');

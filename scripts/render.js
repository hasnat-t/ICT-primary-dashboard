// Print a query from sql/ with {{COMMON}} expanded. With --summary, wrap it to return only sizes,
// so a packed result can be checked through the data service without pulling every row.
// Usage: node scripts/render.js <name> [--summary | <offset> [limit]]
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'sql');
const common = fs.readFileSync(path.join(dir, '_common.sql'), 'utf8').trim();
const name = process.argv[2];
let sql = fs.readFileSync(path.join(dir, `${name}.sql`), 'utf8').replace('{{COMMON}}', common);
if (process.argv.includes('--summary')) {
  sql = sql.replace(/\nLIMIT \{\{LIMIT\}\} OFFSET \{\{OFFSET\}\}\s*$/, '');
  sql = `SELECT COUNT(*) AS schools, SUM(n) AS records, MAX(LENGTH(t)) AS max_len, SUM(LENGTH(t)) AS total_len\nFROM (\n${sql.replace(/^--.*\n/gm, '')}\n)`;
} else {
  sql = sql.replace('{{OFFSET}}', process.argv[3] || '0').replace('{{LIMIT}}', process.argv[4] || '100');
}
process.stdout.write(sql);

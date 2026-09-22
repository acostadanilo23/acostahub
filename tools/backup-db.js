// Cópia consistente do banco, mesmo com o site no ar (VACUUM INTO).
// uso:  node tools/backup-db.js /caminho/destino.db
// no docker:  docker exec hbhub node tools/backup-db.js /tmp/hbhub-backup.db
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { PASTA_DADOS } = require('../src/config');

const destino = process.argv[2];
if (!destino) {
  console.error('uso: node tools/backup-db.js /caminho/destino.db');
  process.exit(1);
}
fs.rmSync(destino, { force: true });
const db = new DatabaseSync(path.join(PASTA_DADOS, 'blog.db'), { readOnly: true });
db.prepare('VACUUM INTO ?').run(destino);
db.close();
console.log(`backup: ${destino} (${Math.ceil(fs.statSync(destino).size / 1024)} KB)`);

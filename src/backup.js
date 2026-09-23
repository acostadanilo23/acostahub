// Backup diário do banco: VACUUM INTO (cópia consistente com o site no ar) em data/backups,
// guardando só os últimos DIAS. Os anexos (data/uploads) não entram: são arquivos que nunca mudam.
const fs = require('node:fs');
const path = require('node:path');
const { PASTA_DADOS } = require('./config');
const db = require('./db');
const { agoraLocal } = require('./util');

const PASTA = path.join(PASTA_DADOS, 'backups');
const DIAS = 7;
const RE_ARQUIVO = /^blog-\d{4}-\d{2}-\d{2}\.db$/;

function lista() {
  if (!fs.existsSync(PASTA)) return [];
  return fs.readdirSync(PASTA).filter((a) => RE_ARQUIVO.test(a)).sort().reverse()
    .map((arquivo) => ({ arquivo, tamanho: fs.statSync(path.join(PASTA, arquivo)).size }));
}

function fazer() {
  fs.mkdirSync(PASTA, { recursive: true });
  const arquivo = `blog-${agoraLocal().slice(0, 10)}.db`;
  const destino = path.join(PASTA, arquivo);
  const temp = `${destino}.tmp`;
  fs.rmSync(temp, { force: true });
  db.db.prepare('VACUUM INTO ?').run(temp);
  fs.renameSync(temp, destino); // só vira backup de verdade se terminou inteiro
  for (const velho of lista().slice(DIAS)) fs.rmSync(path.join(PASTA, velho.arquivo), { force: true });
  db.gravarAjuste('ultimo_backup', { arquivo, em: new Date().toISOString() });
  return arquivo;
}

// confere de hora em hora; faz o de hoje se ainda não existir
function conferir() {
  const hoje = `blog-${agoraLocal().slice(0, 10)}.db`;
  if (lista().some((b) => b.arquivo === hoje)) return;
  try {
    console.log(`backup: ${fazer()}`);
  } catch (e) {
    db.gravarAjuste('erro_backup', { erro: String(e.message || e), em: new Date().toISOString() });
    console.error('[backup] falhou:', e);
  }
}

function iniciar() {
  setTimeout(conferir, 30000).unref(); // espera o servidor subir
  setInterval(conferir, 60 * 60000).unref();
}

function situacao() {
  const ultimo = db.lerAjuste('ultimo_backup', null);
  const erro = db.lerAjuste('erro_backup', null);
  return { ultimo, erro: erro && (!ultimo || erro.em > ultimo.em) ? erro : null, lista: lista(), dias: DIAS };
}

module.exports = { iniciar, situacao };

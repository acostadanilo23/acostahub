// Contador de visitas de verdade, sem cookie e sem guardar IP.
// Um "visitante" é o hash de (segredo + dia + IP + navegador): muda todo dia e
// os hashes do dia anterior são apagados, então não dá pra seguir ninguém.
const crypto = require('node:crypto');
const { db, ajuste } = require('./db');
const { agoraLocal, ipDe } = require('./util');

const SEGREDO = ajuste('segredo_contador', () => crypto.randomBytes(32).toString('hex'));
const ROBO = /bot|crawl|spider|slurp|fetch|scan|monitor|preview|headless|lighthouse|curl|wget|python|java\/|go-http|axios|node|feed|rss|uptime/i;

const q = {
  visto: db.prepare('INSERT OR IGNORE INTO vistos_hoje (dia, hash) VALUES (?, ?)'),
  limparVistos: db.prepare('DELETE FROM vistos_hoje WHERE dia <> ?'),
  novoVisitante: db.prepare(`INSERT INTO visitas_dia (dia, visitantes) VALUES (?, 1)
                             ON CONFLICT (dia) DO UPDATE SET visitantes = visitantes + 1`),
  novaVisualizacao: db.prepare(`INSERT INTO visitas_dia (dia, visualizacoes) VALUES (?, 1)
                                ON CONFLICT (dia) DO UPDATE SET visualizacoes = visualizacoes + 1`),
  pagina: db.prepare(`INSERT INTO paginas_vistas (caminho, hits) VALUES (?, 1)
                      ON CONFLICT (caminho) DO UPDATE SET hits = hits + 1`),
  totais: db.prepare('SELECT COALESCE(SUM(visitantes), 0) AS visitantes, COALESCE(SUM(visualizacoes), 0) AS visualizacoes FROM visitas_dia'),
  dia: db.prepare('SELECT visitantes, visualizacoes FROM visitas_dia WHERE dia = ?'),
  ultimosDias: db.prepare('SELECT * FROM visitas_dia ORDER BY dia DESC LIMIT ?'),
  topPaginas: db.prepare('SELECT * FROM paginas_vistas ORDER BY hits DESC LIMIT ?'),
};

let diaAtual = '';
let cacheTotal = null;

function hoje() {
  const d = agoraLocal().slice(0, 10);
  if (d !== diaAtual) {
    diaAtual = d;
    q.limparVistos.run(d);
  }
  return d;
}

function contavel(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || ROBO.test(ua)) return false;
  const proposito = String(req.headers['sec-purpose'] || req.headers.purpose || '');
  return !/prefetch|prerender/i.test(proposito);
}

// chamado antes de montar a página (o número já sai atualizado pra quem chegou agora)
function registrarVisitante(req) {
  if (!contavel(req)) return;
  const dia = hoje();
  const hash = crypto.createHmac('sha256', SEGREDO)
    .update(`${dia}|${ipDe(req)}|${req.headers['user-agent']}`)
    .digest('base64url').slice(0, 22);
  if (q.visto.run(dia, hash).changes) {
    q.novoVisitante.run(dia);
    cacheTotal = null;
  }
}

// chamado depois que a resposta saiu com 200
function registrarPagina(req, caminho) {
  if (!contavel(req)) return;
  q.novaVisualizacao.run(hoje());
  q.pagina.run(caminho.slice(0, 200));
}

function total() {
  if (!cacheTotal) cacheTotal = q.totais.get();
  return cacheTotal.visitantes;
}

function hojeNumeros() {
  return q.dia.get(hoje()) || { visitantes: 0, visualizacoes: 0 };
}

function relatorio() {
  const t = q.totais.get();
  const dias = [];
  // últimos 14 dias, incluindo os zerados
  const porDia = new Map(q.ultimosDias.all(60).map((d) => [d.dia, d]));
  const base = new Date(`${hoje()}T12:00:00Z`);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 864e5).toISOString().slice(0, 10);
    dias.push(porDia.get(d) || { dia: d, visitantes: 0, visualizacoes: 0 });
  }
  return { totais: t, hoje: hojeNumeros(), dias, paginas: q.topPaginas.all(10) };
}

module.exports = { registrarVisitante, registrarPagina, total, hojeNumeros, relatorio };

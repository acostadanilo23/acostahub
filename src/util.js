const { FUSO, CONFIAR_PROXY } = require('./config');

// Atrás de proxy, o IP real é o ÚLTIMO do X-Forwarded-For (o que o nosso proxy adicionou).
// Os primeiros quem manda é o cliente, e dá pra forjar.
function ipDe(req) {
  if (CONFIAR_PROXY && req.headers['x-forwarded-for']) {
    const ips = String(req.headers['x-forwarded-for']).split(',').map((s) => s.trim()).filter(Boolean);
    if (ips.length) return ips[ips.length - 1];
  }
  return req.socket.remoteAddress || '?';
}

function decodificar(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

function slugify(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// "2026-09-22T17:44" no fuso do blog (é assim que as datas ficam no banco)
const fmtLocal = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function agoraLocal() {
  return fmtLocal.format(new Date()).replace(' ', 'T');
}

const RE_DATA_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function dataBR(local) {
  if (!local) return '';
  const [d] = local.split('T');
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}`;
}

// data local -> Date de verdade (pra RSS)
function paraDate(local) {
  const chute = new Date(local + ':00Z');
  const nome = new Intl.DateTimeFormat('en', { timeZone: FUSO, timeZoneName: 'longOffset' })
    .formatToParts(chute).find((p) => p.type === 'timeZoneName').value;
  const off = nome === 'GMT' ? '+00:00' : nome.slice(3);
  return new Date(`${local}:00${off}`);
}

function tagsDe(post) {
  return String(post.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
}

function minutosLeitura(texto) {
  return Math.max(1, Math.round(texto.split(/\s+/).filter(Boolean).length / 200));
}

// limitador simples em memória: no máximo `max` eventos por `janelaMs` por chave
function limitador(max, janelaMs) {
  const mapa = new Map();
  return (chave) => {
    const agora = Date.now();
    if (mapa.size > 5000) for (const [k, v] of mapa) if (agora - v.inicio > janelaMs) mapa.delete(k);
    const v = mapa.get(chave);
    if (!v || agora - v.inicio > janelaMs) { mapa.set(chave, { inicio: agora, n: 1 }); return true; }
    return ++v.n <= max;
  };
}

module.exports = { ipDe, decodificar, limitador, slugify, agoraLocal, RE_DATA_LOCAL, dataBR, paraDate, tagsDe, minutosLeitura };

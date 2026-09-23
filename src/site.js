// Livro de visitas, enquete, status, to-do, molduras, links, novidades e rádio:
// validação do que chega (do visitante ou do painel) e regras de cada um.
const crypto = require('node:crypto');
const fs = require('node:fs');
const db = require('./db');
const { PASTA_PUBLICA } = require('./config');
const { dentro } = require('./estaticos');
const { agoraLocal, ipDe } = require('./util');

class ErroSite extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const INVISIVEIS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

// texto de uma linha só
const linha = (s, max) => String(s ?? '').replace(INVISIVEIS, '').replace(/\s+/g, ' ').trim().slice(0, max);

// texto com quebras de linha (no máximo uma linha em branco seguida)
const paragrafos = (s, max) => String(s ?? '').replace(/\r\n?/g, '\n').replace(INVISIVEIS, '')
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

function urlExterna(s, { obrigatoria = false } = {}) {
  let u = linha(s, 300);
  if (!u) {
    if (obrigatoria) throw new ErroSite(400, 'Falta o endereço do site.');
    return '';
  }
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  let url;
  try { url = new URL(u); } catch { throw new ErroSite(400, 'Esse endereço de site não parece válido.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) {
    throw new ErroSite(400, 'Esse endereço de site não parece válido.');
  }
  return url.href;
}

const IMAGENS = ['gif', 'png', 'webp', 'jpg', 'jpeg'];

// arquivo do próprio site: anexo da biblioteca (/uploads/...) ou arquivo em public/img
function srcLocal(s, tipos) {
  const src = String(s || '').trim();
  const ext = (src.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  const m = src.match(/^\/uploads\/([^/?#]+)$/);
  if (m) {
    const a = db.anexoPorArquivo(m[1]);
    if (a && tipos.includes(a.tipo)) return src;
  } else if (/^\/img\/[a-z0-9/_.-]+$/i.test(src) && tipos.includes(ext)) {
    const arq = dentro(PASTA_PUBLICA, src);
    if (arq && fs.existsSync(arq)) return src;
  }
  throw new ErroSite(400, 'Escolhe um arquivo da biblioteca.');
}

// ------------------------------------------------------------ livro de visitas

function validarRecado(d) {
  const nome = linha(d.nome, 40);
  if (nome.length < 2) throw new ErroSite(400, 'Escreve seu nome (ou apelido).');
  const mensagem = paragrafos(d.mensagem, 1000);
  if (mensagem.length < 3) throw new ErroSite(400, 'Escreve um recado.');
  return { nome, mensagem, site: urlExterna(d.site) };
}

// ------------------------------------------------------------ enquete

const SEGREDO_VOTO = db.ajuste('segredo_enquete', () => crypto.randomBytes(32).toString('hex'));

// um voto por visitante: hash de IP + navegador com segredo, sem cookie e sem guardar o IP
const hashVoto = (req, enqueteId) => crypto.createHmac('sha256', SEGREDO_VOTO)
  .update(`${enqueteId}|${ipDe(req)}|${req.headers['user-agent'] || ''}`).digest('base64url').slice(0, 22);

function enqueteComOpcoes(e) {
  if (!e) return null;
  const opcoes = db.opcoesDe(e.id);
  const total = opcoes.reduce((s, o) => s + o.votos, 0);
  return { ...e, opcoes, total };
}

function votar(req, d) {
  const e = db.enquetePorId(Number(d.enquete));
  if (!e || !e.ativa) return 'encerrada';
  const opcao = db.opcoesDe(e.id).find((o) => o.id === Number(d.opcao));
  if (!opcao) return 'vazio';
  return db.votar(e.id, opcao.id, hashVoto(req, e.id));
}

function validarEnquete(d) {
  const pergunta = linha(d.pergunta, 120);
  if (!pergunta) throw new ErroSite(400, 'A enquete precisa de uma pergunta.');
  const opcoes = (Array.isArray(d.opcoes) ? d.opcoes : []).map((o) => linha(o, 40)).filter(Boolean);
  if (opcoes.length < 2 || opcoes.length > 8) throw new ErroSite(400, 'A enquete precisa de 2 a 8 opções.');
  if (new Set(opcoes.map((o) => o.toLowerCase())).size !== opcoes.length) throw new ErroSite(400, 'Tem opção repetida.');
  return { pergunta, opcoes };
}

// ------------------------------------------------------------ status, to-do e rádio

function validarStatus(d) {
  return (Array.isArray(d.linhas) ? d.linhas : []).slice(0, 8)
    .map((l) => ({ rotulo: linha(l?.rotulo, 20), texto: linha(l?.texto, 80) }))
    .filter((l) => l.rotulo && l.texto);
}

function validarTodo(d) {
  return (Array.isArray(d.itens) ? d.itens : []).slice(0, 20)
    .map((i) => ({ texto: linha(i?.texto, 60), feito: !!i?.feito }))
    .filter((i) => i.texto);
}

function validarMusica(d) {
  const src = String(d.src || '').trim();
  if (!src) return null;
  return { src: srcLocal(src, ['mp3']), titulo: linha(d.titulo, 60) || 'Rádio do HB' };
}

// ------------------------------------------------------------ molduras, links e novidades

const LUGARES = ['esquerda', 'direita', 'mural'];
const inteiro = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

function validarMoldura(d, { novo = true } = {}) {
  const lugar = LUGARES.includes(d.lugar) ? d.lugar : 'mural';
  const placa = linha(d.placa, 24);
  if (!novo) return { placa, lugar };
  return { src: srcLocal(d.src, IMAGENS), largura: inteiro(d.largura, 1, 2000), altura: inteiro(d.altura, 1, 2000), placa, lugar };
}

function validarLink(d) {
  const nome = linha(d.nome, 40);
  if (!nome) throw new ErroSite(400, 'O link precisa de um nome.');
  const botao = String(d.botao || '').trim() ? srcLocal(d.botao, IMAGENS) : '';
  return { nome, url: urlExterna(d.url, { obrigatoria: true }), botao };
}

function validarNovidade(d) {
  const texto = linha(d.texto, 200);
  if (!texto) throw new ErroSite(400, 'Escreve o que há de novo.');
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(d.dia || '')) ? d.dia : agoraLocal().slice(0, 10);
  return { dia, texto };
}

// onde um anexo da biblioteca está em uso (pra não apagar arquivo que o site mostra)
function usosDoAnexo(arquivo) {
  const url = `/uploads/${arquivo}`;
  const usos = [];
  for (const m of db.molduras()) if (m.src === url) usos.push(`moldura "${m.placa || m.lugar}"`);
  for (const l of db.links()) if (l.botao === url) usos.push(`botão do link "${l.nome}"`);
  if (db.lerAjuste('musica', null)?.src === url) usos.push('rádio do site');
  return usos;
}

// ------------------------------------------------------------ item do dia

const RE_IMG = /\.(webp|png|jpe?g|gif)$/i;

function itemDoDia() {
  const todos = db.itensPublicos();
  if (!todos.length) return null;
  const comFoto = todos.filter((i) => RE_IMG.test(i.foto));
  const lista = comFoto.length ? comFoto : todos;
  const n = crypto.createHash('sha256').update(agoraLocal().slice(0, 10)).digest().readUInt32BE(0);
  return lista[n % lista.length];
}

module.exports = {
  ErroSite, LUGARES, IMAGENS,
  validarRecado, votar, enqueteComOpcoes, validarEnquete,
  validarStatus, validarTodo, validarMusica,
  validarMoldura, validarLink, validarNovidade,
  usosDoAnexo, itemDoDia,
};

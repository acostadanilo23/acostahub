const crypto = require('node:crypto');
const cfg = require('./config');
const db = require('./db');
const { conferirSenha } = require('./senha');

const COOKIE = 'hb_sessao';
const DURACAO_MS = 7 * 24 * 60 * 60 * 1000;

function iguais(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

const hashId = (id) => crypto.createHash('sha256').update(id).digest('hex');

function lerCookies(req) {
  const out = {};
  for (const par of String(req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = par.slice(i + 1).trim(); // nossos valores são hex, não precisa decodificar
  }
  return out;
}

function cookie(valor, maxAgeSeg) {
  return [
    `${COOKIE}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeg}`,
    cfg.COOKIE_SEGURO ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function logado(req) {
  const id = lerCookies(req)[COOKIE];
  return !!id && /^[a-f0-9]{64}$/.test(id) && db.sessaoValida(hashId(id));
}

function abrirSessao(res) {
  db.limparSessoes();
  const id = crypto.randomBytes(32).toString('hex');
  db.criarSessao(hashId(id), Date.now() + DURACAO_MS);
  res.setHeader('Set-Cookie', cookie(id, DURACAO_MS / 1000));
}

function fecharSessao(req, res) {
  const id = lerCookies(req)[COOKIE];
  if (id) db.apagarSessao(hashId(id));
  res.setHeader('Set-Cookie', cookie('', 0));
}

// trava de força bruta: 5 erros em 15 min por IP.
// (sem trava global de propósito: ela deixaria qualquer um trancar o dono fora do painel)
const tentativas = new Map();
const JANELA = 15 * 60 * 1000;

function janelaDe(t) {
  return t && Date.now() - t.inicio <= JANELA ? t : null;
}
function bloqueado(ip) {
  const t = janelaDe(tentativas.get(ip));
  return !!t && t.erros >= 5;
}
function registrarErro(ip) {
  if (tentativas.size > 10000) for (const [k, v] of tentativas) if (!janelaDe(v)) tentativas.delete(k);
  const t = janelaDe(tentativas.get(ip));
  if (t) t.erros++;
  else tentativas.set(ip, { inicio: Date.now(), erros: 1 });
}

async function tentarLogin(ip, usuario, senha) {
  if (!cfg.ADMIN_SENHA_HASH) return { ok: false, erro: 'Login desativado: falta ADMIN_SENHA_HASH no .env.' };
  if (bloqueado(ip)) return { ok: false, erro: 'Muitas tentativas. Espera uns 15 minutos.' };
  const usuarioOk = iguais(usuario, cfg.ADMIN_USUARIO);
  const senhaOk = await conferirSenha(String(senha).slice(0, 1024), cfg.ADMIN_SENHA_HASH);
  if (usuarioOk && senhaOk) { tentativas.delete(ip); return { ok: true }; }
  registrarErro(ip);
  return { ok: false, erro: 'Usuário ou senha errados.' };
}

module.exports = { logado, abrirSessao, fecharSessao, tentarLogin };

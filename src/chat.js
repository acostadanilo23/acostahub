// Bate-papo simples: apelido + mensagem, em tempo real com Server-Sent Events.
// Tudo fica em memória: reiniciou o servidor, a sala zera. Nada de mensagem guardada em banco.
const crypto = require('node:crypto');
const { slugify } = require('./util');
const { FUSO } = require('./config');

const CORES = ['#ff5e5e', '#ffcf33', '#66ff66', '#5ab0ff', '#ff7ad9', '#6fe0da', '#ff9f40', '#c9a0ff'];
const RESERVADOS = ['hb', 'webmaster', 'admin', 'administrador', 'moderador', 'sistema', 'todos'];
const MAX_PESSOAS = 150;
const MAX_POR_IP = 4;
const HISTORICO = 60;

const pessoas = new Map(); // token -> pessoa
const historico = [];
const banidos = new Map(); // ipHash -> expira
let seq = 0;

class ErroChat extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const hashIp = (ip) => crypto.createHash('sha256').update('chat|' + ip).digest('base64url').slice(0, 16);
const chaveNome = (n) => slugify(n).replace(/-/g, '');
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
const hora = () => fmtHora.format(new Date());

function mandar(pessoa, evento) {
  const linha = `data: ${JSON.stringify(evento)}\n\n`;
  for (const res of pessoa.conexoes) res.write(linha);
}

function paraTodos(evento) {
  for (const p of pessoas.values()) if (p.anunciado) mandar(p, evento);
}

function listaOnline() {
  return [...pessoas.values()].filter((p) => p.anunciado)
    .map((p) => ({ apelido: p.apelido, cor: CORES[p.cor], adm: p.adm }))
    .sort((a, b) => b.adm - a.adm || a.apelido.localeCompare(b.apelido));
}

function avisarOnline() {
  paraTodos({ tipo: 'online', lista: listaOnline() });
}

function sistema(texto) {
  const msg = { tipo: 'sistema', id: ++seq, hora: hora(), texto };
  historico.push(msg);
  if (historico.length > HISTORICO) historico.shift();
  paraTodos(msg);
}

function porApelido(apelido) {
  const k = chaveNome(apelido);
  return [...pessoas.values()].find((p) => chaveNome(p.apelido) === k);
}

function remover(p, motivo) {
  if (!pessoas.has(p.token)) return;
  pessoas.delete(p.token);
  clearTimeout(p.timerSaida);
  for (const res of p.conexoes) res.end();
  if (p.anunciado) {
    sistema(motivo || `${p.apelido} saiu da sala.`);
    avisarOnline();
  }
}

function entrar({ apelido, cor }, ip, adm) {
  const ipH = hashIp(ip);
  const ban = banidos.get(ipH);
  if (ban && ban > Date.now()) throw new ErroChat(403, 'Você foi expulso da sala. Volte mais tarde.');

  apelido = String(apelido || '').replace(/\s+/g, ' ').trim();
  if (!/^[\p{L}\p{N} _.\-]{2,20}$/u.test(apelido)) throw new ErroChat(400, 'Apelido precisa ter de 2 a 20 letras, números, espaço, ponto, _ ou -.');
  const k = chaveNome(apelido);
  if (!k) throw new ErroChat(400, 'Esse apelido não dá. Tenta outro.');
  // "HB", "H.B", "hb_" e "webmaster123" ficam só pro dono (que ainda ganha o selo ADM, que ninguém imita)
  if (!adm && RESERVADOS.some((r) => k === r || (r.length > 3 && k.startsWith(r)))) {
    throw new ErroChat(400, 'Esse apelido é reservado. Escolhe outro.');
  }
  if (porApelido(apelido)) throw new ErroChat(409, 'Já tem alguém com esse apelido na sala.');
  if (pessoas.size >= MAX_PESSOAS) throw new ErroChat(503, 'A sala tá lotada! Tenta daqui a pouco.');
  if ([...pessoas.values()].filter((p) => p.ipH === ipH).length >= MAX_POR_IP) throw new ErroChat(429, 'Muitas abas abertas no bate-papo.');

  const p = {
    token: crypto.randomBytes(24).toString('base64url'),
    apelido,
    cor: CORES[Number(cor)] ? Number(cor) : Math.floor(Math.random() * CORES.length),
    adm: !!adm,
    ipH,
    conexoes: new Set(),
    anunciado: false,
    envios: [],
    timerSaida: null,
  };
  pessoas.set(p.token, p);
  // se não conectar em 30s, some
  p.timerSaida = setTimeout(() => { if (!p.conexoes.size) remover(p); }, 30000);
  return p;
}

function pessoa(token) {
  const p = pessoas.get(String(token || ''));
  if (!p) throw new ErroChat(401, 'Você não está na sala.');
  return p;
}

function conectar(token, req, res) {
  const p = pessoas.get(String(token || ''));
  if (!p || p.conexoes.size >= 3) {
    res.writeHead(p ? 429 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('fora da sala');
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no', // nginx: não segura os eventos no buffer
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');
  req.socket.setKeepAlive(true);
  clearTimeout(p.timerSaida);
  p.conexoes.add(res);

  res.write(`data: ${JSON.stringify({ tipo: 'historico', msgs: historico })}\n\n`);
  if (!p.anunciado) {
    p.anunciado = true;
    sistema(`${p.apelido} entrou na sala.`);
  }
  avisarOnline();

  req.on('close', () => {
    p.conexoes.delete(res);
    if (!p.conexoes.size && pessoas.has(p.token)) {
      // dá um tempinho pra recarregar a página sem "sair" da sala
      p.timerSaida = setTimeout(() => { if (!p.conexoes.size) remover(p); }, 20000);
    }
  });
}

function enviar(token, d) {
  const p = pessoa(token);
  const agora = Date.now();
  p.envios = p.envios.filter((t) => agora - t < 10000);
  if (p.envios.length >= 6 || agora - (p.envios[p.envios.length - 1] || 0) < 600) {
    throw new ErroChat(429, 'Calma! Você tá mandando mensagem rápido demais.');
  }

  const texto = String(d.texto || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!texto) throw new ErroChat(400, 'Mensagem vazia.');
  p.envios.push(agora);

  const msg = { tipo: 'msg', id: ++seq, hora: hora(), de: p.apelido, cor: CORES[p.cor], adm: p.adm, texto };
  historico.push(msg);
  if (historico.length > HISTORICO) historico.shift();
  paraTodos(msg);
}

function sair(token) {
  const p = pessoas.get(String(token || ''));
  if (p) remover(p);
}

// moderação (só o webmaster logado)
function apagar(id) {
  const i = historico.findIndex((m) => m.id === Number(id));
  if (i >= 0) historico.splice(i, 1);
  paraTodos({ tipo: 'apagar', id: Number(id) });
}

function expulsar(apelido, minutos = 60) {
  const p = porApelido(apelido);
  if (!p || p.adm) throw new ErroChat(404, 'Ninguém com esse apelido (ou é você mesmo).');
  banidos.set(p.ipH, Date.now() + minutos * 60000);
  mandar(p, { tipo: 'expulso' });
  remover(p, `${p.apelido} foi expulso da sala pelo webmaster.`);
}

// mantém a conexão viva atrás de proxy e limpa banimentos vencidos
setInterval(() => {
  for (const p of pessoas.values()) for (const res of p.conexoes) res.write(': ping\n\n');
  const agora = Date.now();
  for (const [k, v] of banidos) if (v <= agora) banidos.delete(k);
}, 25000).unref();

const quantos = () => listaOnline().length;

module.exports = { ErroChat, CORES, entrar, pessoa, conectar, enviar, sair, apagar, expulsar, quantos };

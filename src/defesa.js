// Defesas contra excesso de requisições, robôs de IA e raspadores. Tudo em memória
// (reiniciou, zera). Atrás do Caddy o IP vem do X-Forwarded-For (ver ipDe).
const { ipDe } = require('./util');

// robôs que coletam conteúdo pra IA (os nomes que eles mesmos publicam)
const ROBOS_IA = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'Claude-Web', 'anthropic-ai',
  'CCBot', 'Google-Extended', 'GoogleOther', 'PerplexityBot', 'Perplexity-User', 'Bytespider', 'Amazonbot',
  'Applebot-Extended', 'meta-externalagent', 'meta-externalfetcher', 'FacebookBot', 'Diffbot', 'cohere-ai',
  'cohere-training-data-crawler', 'YouBot', 'AI2Bot', 'Ai2Bot-Dolma', 'Timpibot', 'ImagesiftBot', 'Omgilibot',
  'omgili', 'img2dataset', 'MistralAI-User', 'DuckAssistBot', 'PanguBot', 'Kangaroo Bot', 'Webzio-Extended',
  'iaskspider', 'VelenPublicWebCrawler', 'SemrushBot-OCOB', 'Brightbot', 'QualifiedBot',
];
const RE_IA = new RegExp(ROBOS_IA.map((n) => n.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|'), 'i');

// bibliotecas e navegadores automatizados usados pra raspar site (curl e wget ficam liberados)
const RE_RASPADOR = /python-requests|python-urllib|python-httpx|aiohttp|httpx\/|scrapy|go-http-client|node-fetch|axios\/|undici|okhttp|java\/|apache-httpclient|libwww-perl|mechanize|colly|headlesschrome|phantomjs|puppeteer|playwright|selenium|nutch/i;

// caminhos que qualquer um pode pedir (robô precisa ler o robots.txt pra saber que foi proibido)
const LIVRES = new Set(['/robots.txt', '/ai.txt']);
// leitores de RSS e buscadores usam bibliotecas genéricas: aqui só barra robô de IA
const SO_IA = new Set(['/feed.xml', '/sitemap.xml']);

const ARMADILHA = '/armadilha';
const ESTATICO = /^\/(css\/|js\/|img\/|images\/|uploads\/|admin\/admin\.(css|js)$|chat\/chat\.js$|favicon\.ico$)/;

// IPv6: um /64 inteiro costuma ser de uma pessoa (ou de um robô trocando de IP dentro dele)
function chaveDe(ip) {
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (!ip.includes(':')) return ip;
  const [cab, cauda = ''] = ip.split('::');
  const a = cab ? cab.split(':') : [];
  const b = cauda ? cauda.split(':') : [];
  const grupos = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return `${grupos.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

// balde de fichas: começa cheio, cada requisição gasta 1, reenche `porSegundo`
function balde(capacidade, porSegundo) {
  const mapa = new Map();
  const cheioEm = (capacidade / porSegundo) * 1000;
  setInterval(() => {
    const agora = Date.now();
    for (const [k, b] of mapa) if (agora - b.em >= cheioEm) mapa.delete(k);
  }, 60000).unref();
  return (chave) => {
    const agora = Date.now();
    let b = mapa.get(chave);
    if (!b) {
      if (mapa.size >= 50000) mapa.delete(mapa.keys().next().value);
      b = { fichas: capacidade, em: agora };
      mapa.set(chave, b);
    }
    b.fichas = Math.min(capacidade, b.fichas + ((agora - b.em) / 1000) * porSegundo);
    b.em = agora;
    if (b.fichas < 1) return Math.ceil((1 - b.fichas) / porSegundo);
    b.fichas -= 1;
    return 0;
  };
}

const PAGINAS = { capacidade: 60, porSegundo: 1 };
const ARQUIVOS = { capacidade: 300, porSegundo: 10 };
const baldePaginas = balde(PAGINAS.capacidade, PAGINAS.porSegundo);
const baldeArquivos = balde(ARQUIVOS.capacidade, ARQUIVOS.porSegundo);

// quem estoura o limite sem parar é bloqueado por um tempo
const banidos = new Map(); // chave -> expira
const estouros = new Map(); // chave -> { n, desde }
const LIMITE_ESTOUROS = 30;
const BAN_ESTOURO = 10 * 60000;
const BAN_ARMADILHA = 60 * 60000;

function banir(chave, ms) {
  if (banidos.size >= 50000) banidos.delete(banidos.keys().next().value);
  banidos.set(chave, Date.now() + ms);
}

function contarEstouro(chave) {
  const agora = Date.now();
  const e = estouros.get(chave);
  if (!e || agora - e.desde > 60000) {
    if (estouros.size >= 50000) estouros.delete(estouros.keys().next().value);
    estouros.set(chave, { n: 1, desde: agora });
    return;
  }
  if (++e.n >= LIMITE_ESTOUROS) {
    banir(chave, BAN_ESTOURO);
    estouros.delete(chave);
  }
}

setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of banidos) if (v <= agora) banidos.delete(k);
  for (const [k, v] of estouros) if (agora - v.desde > 60000) estouros.delete(k);
}, 60000).unref();

// null = pode passar; senão { status, texto, espera? }
// `ehAdmin` só é chamado quando a pessoa ia ser barrada (evita consultar sessão à toa)
function checar(req, caminho, ehAdmin) {
  if (LIVRES.has(caminho)) return null;
  const ua = String(req.headers['user-agent'] || '');

  if (RE_IA.test(ua)) return { status: 403, texto: 'Robôs de IA não são bem-vindos aqui. Veja /robots.txt.' };
  if (!SO_IA.has(caminho) && (!ua.trim() || RE_RASPADOR.test(ua))) {
    return { status: 403, texto: 'Acesso automatizado bloqueado. Se você é gente, use um navegador.' };
  }

  const chave = chaveDe(ipDe(req));
  const ban = banidos.get(chave);
  if (ban && ban > Date.now() && !ehAdmin()) {
    return { status: 403, texto: 'Acesso bloqueado por um tempo (requisições demais ou robô fora das regras).', espera: Math.ceil((ban - Date.now()) / 1000) };
  }

  if (caminho === ARMADILHA || caminho.startsWith(`${ARMADILHA}/`)) {
    if (ehAdmin()) return null;
    banir(chave, BAN_ARMADILHA);
    return { status: 403, texto: 'Esse endereço é proibido no robots.txt. Robô bloqueado por 1 hora.' };
  }

  const espera = (ESTATICO.test(caminho) ? baldeArquivos : baldePaginas)(chave);
  if (espera && !ehAdmin()) {
    contarEstouro(chave);
    return { status: 429, texto: 'Calma! Muitas requisições seguidas. Espera uns segundos e tenta de novo.', espera };
  }
  return null;
}

const ROBOTS = (siteUrl) => `User-agent: *
Disallow: /admin
Disallow: /api
Disallow: /chat/
Disallow: ${ARMADILHA}/

# robôs de IA: nada aqui é pra treinar modelo nem pra resposta de IA
${ROBOS_IA.map((n) => `User-agent: ${n}`).join('\n')}
Disallow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

// ai.txt (spawning.ai): mesma recusa, no formato que algumas ferramentas de IA leem
const AI_TXT = `# HB Hub: nenhum conteúdo deste site pode ser usado pra treinar IA
User-Agent: *
Disallow: /
`;

module.exports = { checar, chaveDe, ROBOTS, AI_TXT, ARMADILHA, ROBOS_IA };

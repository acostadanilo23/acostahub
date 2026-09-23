const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const cfg = require('./src/config');
const db = require('./src/db');
const auth = require('./src/auth');
const md = require('./src/markdown');
const { slugify, agoraLocal, RE_DATA_LOCAL, paraDate, tagsDe, minutosLeitura, ipDe, decodificar, limitador } = require('./src/util');
const contador = require('./src/contador');
const chat = require('./src/chat');
const site = require('./src/site');
const defesa = require('./src/defesa');
const { servirPublico, mandarArquivo, dentro } = require('./src/estaticos');
const publico = require('./src/views/publico');
const admin = require('./src/views/admin');
const { urlPost, SECOES } = require('./src/views/layout');
require('./src/semente')();

// ------------------------------------------------------------ respostas

const CSP_BASE = "default-src 'self'; img-src 'self' https: data:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; "
  + "script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function cabecalhosSeguranca(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CSP_BASE);
  res.setHeader('X-Robots-Tag', 'noai, noimageai');
  if (cfg.COOKIE_SEGURO) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function enviar(req, res, status, corpo, tipo = 'text/html; charset=utf-8', extra = {}) {
  let buf = Buffer.from(corpo);
  res.statusCode = status;
  res.setHeader('Content-Type', tipo);
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-cache');
  if (buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = zlib.gzipSync(buf, { level: 6 });
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
  }
  res.setHeader('Content-Length', buf.length);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

const html = (req, res, corpo, status = 200) => enviar(req, res, status, corpo);
const json = (req, res, obj, status = 200) =>
  enviar(req, res, status, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });

function redirecionar(res, url, status = 302) {
  res.statusCode = status;
  res.setHeader('Location', url);
  res.end();
}

class ErroHttp extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

function lerCorpo(req, limite) {
  const erroGrande = () => new ErroHttp(413, `Grande demais (máximo ${Math.round(limite / 1048576) || 1} MB).`);
  if (Number(req.headers['content-length']) > limite) return Promise.reject(erroGrande());
  return new Promise((ok, falha) => {
    const partes = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limite) {
        falha(erroGrande());
        req.destroy();
      } else partes.push(c);
    });
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', falha);
  });
}

async function lerJson(req) {
  let d;
  try {
    d = JSON.parse((await lerCorpo(req, 2 * 1048576)).toString('utf8'));
  } catch (e) {
    if (e instanceof ErroHttp) throw e;
    throw new ErroHttp(400, 'Os dados enviados vieram corrompidos (JSON inválido).');
  }
  // só objeto: null, número ou lista quebrariam os handlers (d.titulo...)
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new ErroHttp(400, 'Os dados enviados estão num formato inesperado.');
  return d;
}

const lerForm = async (req) => new URLSearchParams((await lerCorpo(req, 64 * 1024)).toString('utf8'));

// bloqueia POST vindo de outro site (CSRF), além do cookie SameSite=Strict
function mesmaOrigem(req) {
  const origem = req.headers.origin;
  if (!origem) return req.headers['sec-fetch-site'] ? req.headers['sec-fetch-site'] === 'same-origin' : true;
  try {
    const host = new URL(origem).host;
    return host === req.headers.host || host === new URL(cfg.SITE_URL).host;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ posts

function publicadoPorSlug(slug) {
  const p = db.postPorSlug(slug);
  return p && p.status === 'publicado' && p.publicado_em <= agoraLocal() ? p : null;
}

function validarPost(d) {
  const titulo = String(d.titulo || '').trim().slice(0, 200);
  if (!titulo) throw new ErroHttp(400, 'O post precisa de um título.');
  const slug = slugify(d.slug || titulo);
  if (!slug) throw new ErroHttp(400, 'Não consegui gerar um endereço a partir desse título.');
  const secao = SECOES[d.secao] ? d.secao : 'blog';
  const status = d.status === 'publicado' ? 'publicado' : 'rascunho';
  let publicado_em = String(d.publicado_em || '');
  if (!RE_DATA_LOCAL.test(publicado_em)) publicado_em = status === 'publicado' ? agoraLocal() : '';
  const conteudo = String(d.conteudo || '');
  if (conteudo.length > 500000) throw new ErroHttp(413, 'Post grande demais (máximo 500 mil caracteres).');
  const tags = String(d.tags || '').split(',').map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12).join(', ');
  return {
    titulo, slug, secao, status, publicado_em, conteudo, tags,
    resumo: String(d.resumo || '').trim().slice(0, 300),
    tldr: String(d.tldr || '').trim().slice(0, 2000),
    html: md.renderizar(conteudo),
    minutos: minutosLeitura(md.textoPuro(conteudo)),
  };
}

function salvarPost(id, dados) {
  const p = validarPost(dados);
  const dono = db.postPorSlug(p.slug);
  if (dono && dono.id !== id) throw new ErroHttp(409, `Já existe um post com o endereço "${p.slug}". Muda o slug.`);
  if (id) {
    const atual = db.postPorId(id);
    if (!atual) throw new ErroHttp(404, 'Post não encontrado.');
    if (dados.atualizado_em && dados.atualizado_em !== atual.atualizado_em) {
      throw new ErroHttp(409, 'Esse post foi alterado em outra aba/aparelho. Recarrega a página antes de salvar (copia seu texto antes!).');
    }
    db.atualizarPost(id, p);
    // já esteve no ar com outro endereço? o antigo continua funcionando (redireciona)
    if (atual.slug !== p.slug && atual.status === 'publicado') db.guardarSlugAntigo(atual.slug, id);
  } else {
    id = db.inserirPost(p);
  }
  db.liberarSlug(p.slug);
  const salvo = db.postPorId(id);
  return { id, slug: salvo.slug, secao: salvo.secao, status: salvo.status, publicado_em: salvo.publicado_em, atualizado_em: salvo.atualizado_em, url: urlPost(salvo) };
}

// ------------------------------------------------------------ anexos

const EXTENSOES = {
  webp: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  png: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b.toString('ascii', 0, 4) === 'GIF8',
  pdf: (b) => b.toString('ascii', 0, 5) === '%PDF-',
  zip: (b) => b[0] === 0x50 && b[1] === 0x4b,
  mp3: (b) => b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  txt: (b) => !b.includes(0),
};
const IMAGEM = new Set(['webp', 'png', 'jpg', 'jpeg', 'gif']);

async function receberAnexo(req) {
  const nomeOriginal = (decodificar(String(req.headers['x-nome'] || 'arquivo')) || 'arquivo').slice(0, 200);
  const ext = path.extname(nomeOriginal).slice(1).toLowerCase();
  if (!EXTENSOES[ext]) throw new ErroHttp(415, `Tipo .${ext || '?'} não é aceito. Use imagem, PDF, ZIP, MP3 ou TXT.`);

  const corpo = await lerCorpo(req, cfg.UPLOAD_MAX_MB * 1048576);
  if (!corpo.length) throw new ErroHttp(400, 'Arquivo vazio.');
  if (!EXTENSOES[ext](corpo)) throw new ErroHttp(415, `O conteúdo não parece ser um .${ext} de verdade.`);

  let dims = '';
  const d = String(req.headers['x-dimensoes'] || '').match(/^(\d{1,5})x(\d{1,5})$/);
  if (d && IMAGEM.has(ext)) dims = `-${d[1]}x${d[2]}`;

  const base = slugify(path.basename(nomeOriginal, path.extname(nomeOriginal))).slice(0, 40) || 'arquivo';
  const arquivo = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}-${base}${dims}.${ext}`;
  fs.writeFileSync(path.join(db.PASTA_UPLOADS, arquivo), corpo, { flag: 'wx' });
  const id = db.inserirAnexo({ arquivo, nome_original: nomeOriginal, tipo: ext, tamanho: corpo.length });
  return { id, arquivo, nome_original: nomeOriginal, tipo: ext, tamanho: corpo.length, url: `/uploads/${arquivo}` };
}

// ------------------------------------------------------------ RSS

function feed() {
  const x = (s) => md.esc(s);
  const absoluto = (h) => h.replace(/(src|href)="\/(?!\/)/g, `$1="${cfg.SITE_URL}/`);
  const itens = db.publicados().slice(0, 20).map((p) => `
  <item>
    <title>${x(p.titulo)}</title>
    <link>${cfg.SITE_URL}${urlPost(p)}</link>
    <guid isPermaLink="false">hbhub-post-${p.id}</guid>
    <pubDate>${paraDate(p.publicado_em).toUTCString()}</pubDate>
${tagsDe(p).map((t) => `    <category>${x(t)}</category>`).join('\n')}
    <description>${x(p.resumo ? `<p><i>${md.esc(p.resumo)}</i></p>` : '')}${x(absoluto(p.html))}</description>
  </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>HB Hub</title>
  <link>${cfg.SITE_URL}/</link>
  <description>O cantinho do HB na internet</description>
  <language>pt-BR</language>${itens}
</channel>
</rss>
`;
}

// ------------------------------------------------------------ rotas

const rotas = [];
// contar: soma no contador de visitas (só páginas públicas)
const rota = (metodo, padrao, fn, { restrito = false, contar = false } = {}) =>
  rotas.push({ metodo, re: new RegExp(`^${padrao}$`), fn, restrito, contar });

// endereços antigos do site estático
const ANTIGOS = {
  '/index.html': '/',
  '/pages/blog/index.html': '/blog',
  '/pages/blog/post1.html': '/blog/minha-primeira-contribuicao-open-source',
  '/pages/colecoes/index.html': '/colecoes',
  '/pages/opinioes/index.html': '/opinioes',
  '/pages/projetos/index.html': '/projetos',
};

rota('GET', '/', (req, res) => html(req, res, publico.inicio(db.publicados())), { contar: true });

rota('GET', '/(blog|opinioes|projetos)', (req, res, [secao], url) => {
  const pag = Math.max(1, parseInt(url.searchParams.get('pagina'), 10) || 1);
  const posts = db.publicados();
  const daSecao = secao === 'blog' ? posts : posts.filter((p) => p.secao === secao);
  if (pag > 1 && (pag - 1) * publico.POR_PAGINA >= daSecao.length) return nao(req, res);
  html(req, res, publico.listaSecao(secao, posts, pag));
}, { contar: true });

rota('GET', '/(blog|opinioes|projetos)/([a-z0-9-]+)', (req, res, [secao, slug]) => {
  const p = publicadoPorSlug(slug);
  if (!p) {
    const novo = db.postPorId(db.postPorSlugAntigo(slug) ?? 0);
    if (novo && publicadoPorSlug(novo.slug)) return redirecionar(res, urlPost(novo), 301);
    return nao(req, res);
  }
  if (p.secao !== secao) return redirecionar(res, urlPost(p), 301);
  const lista = db.publicados().filter((x) => x.secao === p.secao);
  const i = lista.findIndex((x) => x.id === p.id);
  html(req, res, publico.post(p, { proximo: lista[i - 1], anterior: lista[i + 1] }));
}, { contar: true });

rota('GET', '/tag/([a-z0-9-]+)', (req, res, [tag]) => {
  const posts = db.publicados().filter((p) => tagsDe(p).some((t) => slugify(t) === tag));
  if (!posts.length) return nao(req, res);
  const nome = tagsDe(posts[0]).find((t) => slugify(t) === tag);
  html(req, res, publico.porTag(nome, posts));
}, { contar: true });

rota('GET', '/colecoes', (req, res) => html(req, res, publico.colecoes()), { contar: true });
rota('GET', '/colecoes/([a-z0-9-]+)', (req, res, [k]) => {
  const pag = publico.colecao(k);
  return pag ? html(req, res, pag) : nao(req, res);
}, { contar: true });
rota('GET', '/colecoes/([a-z0-9-]+)/(\\d+)', (req, res, [slug, id]) => {
  const pag = publico.itemColecao(slug, Number(id));
  return pag ? html(req, res, pag) : nao(req, res);
}, { contar: true });

// --- livro de visitas, enquete, links e novidades

const podeAssinar = limitador(3, 10 * 60000);
const podeVotar = limitador(20, 10 * 60000);

rota('GET', '/livro-de-visitas', (req, res, _, url) => {
  const pag = Math.max(1, parseInt(url.searchParams.get('pagina'), 10) || 1);
  if (pag > 1 && (pag - 1) * publico.POR_PAGINA >= db.contarAprovados()) return nao(req, res);
  const aviso = url.searchParams.has('enviado') ? 'Recado enviado! Ele aparece aqui assim que o webmaster aprovar.' : '';
  html(req, res, publico.livroVisitas({ pag, aviso }));
}, { contar: true });

rota('POST', '/livro-de-visitas', async (req, res) => {
  const f = await lerForm(req);
  const valores = { nome: f.get('nome') || '', site: f.get('site') || '', mensagem: f.get('mensagem') || '' };
  // campo escondido: gente não vê, robô preenche. Finge que deu certo.
  if (f.get('email')) return redirecionar(res, '/livro-de-visitas?enviado', 303);
  if (!podeAssinar(ipDe(req))) {
    return html(req, res, publico.livroVisitas({ erro: 'Calma! Muitos recados seguidos. Tenta de novo daqui a uns minutos.', valores }), 429);
  }
  let recado;
  try {
    recado = site.validarRecado(valores);
  } catch (e) {
    if (e instanceof site.ErroSite) return html(req, res, publico.livroVisitas({ erro: e.message, valores }), e.status);
    throw e;
  }
  db.inserirRecado(recado);
  redirecionar(res, '/livro-de-visitas?enviado', 303);
});

rota('GET', '/enquete', (req, res, _, url) => html(req, res, publico.enquete(url.searchParams.get('voto'))), { contar: true });
rota('POST', '/enquete/votar', async (req, res) => {
  const f = await lerForm(req);
  if (!podeVotar(ipDe(req))) return redirecionar(res, '/enquete?voto=repetido', 303);
  redirecionar(res, `/enquete?voto=${site.votar(req, { enquete: f.get('enquete'), opcao: f.get('opcao') })}`, 303);
});

rota('GET', '/links', (req, res) => html(req, res, publico.links()), { contar: true });
rota('GET', '/novidades', (req, res) => html(req, res, publico.novidades()), { contar: true });

// --- bate-papo

const podeEntrarNoChat = limitador(10, 60000);

rota('GET', '/chat', (req, res) => html(req, res, publico.salaChat()), { contar: true });

rota('POST', '/chat/entrar', async (req, res) => {
  if (!podeEntrarNoChat(ipDe(req))) throw new ErroHttp(429, 'Calma, muitas tentativas de entrar. Espera um minuto.');
  const p = chat.entrar(await lerJson(req), ipDe(req), auth.logado(req));
  json(req, res, { t: p.token, apelido: p.apelido, cor: p.cor, hex: chat.CORES[p.cor], adm: p.adm }, 201);
});

rota('POST', '/chat/retomar', async (req, res) => {
  const p = chat.pessoa((await lerJson(req)).t);
  json(req, res, { apelido: p.apelido, cor: p.cor, hex: chat.CORES[p.cor], adm: p.adm });
});

rota('GET', '/chat/eventos', (req, res, _, url) => {
  if (req.method === 'HEAD') return res.end();
  chat.conectar(url.searchParams.get('t'), req, res);
});

rota('POST', '/chat/enviar', async (req, res) => {
  const d = await lerJson(req);
  chat.enviar(d.t, d);
  json(req, res, { ok: true });
});

rota('POST', '/chat/sair', async (req, res) => {
  chat.sair((await lerJson(req)).t);
  json(req, res, { ok: true });
});

rota('POST', '/chat/moderar', async (req, res) => {
  const d = await lerJson(req);
  if (d.acao === 'apagar') chat.apagar(d.id);
  else if (d.acao === 'expulsar') chat.expulsar(String(d.apelido || ''));
  else throw new ErroHttp(400, 'Ação desconhecida.');
  json(req, res, { ok: true });
}, { restrito: true });

rota('GET', '/feed.xml', (req, res) => enviar(req, res, 200, feed(), 'application/rss+xml; charset=utf-8', { 'Cache-Control': 'public, max-age=600' }));
rota('GET', '/robots.txt', (req, res) => enviar(req, res, 200, defesa.ROBOTS(cfg.SITE_URL),
  'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' }));
rota('GET', '/ai.txt', (req, res) => enviar(req, res, 200, defesa.AI_TXT, 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' }));

// sitemap: só o que vale indexar (páginas "em construção" e tags ficam de fora, e têm noindex)
function sitemap() {
  const posts = db.publicados();
  const data = (iso) => (iso || new Date().toISOString()).slice(0, 10);
  const maisNovo = (lista) => lista.reduce((m, p) => (p.atualizado_em > m ? p.atualizado_em : m), '');
  const urls = [
    ['/', maisNovo(posts)],
    ['/blog', maisNovo(posts)],
    ...['opinioes', 'projetos']
      .map((s) => [s, posts.filter((p) => p.secao === s)])
      .filter(([, lista]) => lista.length)
      .map(([s, lista]) => [`/${s}`, maisNovo(lista)]),
    ['/colecoes', ''],
    // coleções visíveis com pelo menos um item (as vazias ficam de fora, têm noindex)
    ...db.colecoesComItens().map((c) => [`/colecoes/${c.slug}`, c.atualizado_em]),
    ...db.itensPublicos().map((i) => [`/colecoes/${i.colecao_slug}/${i.id}`, i.atualizado_em]),
    ...posts.map((p) => [urlPost(p), p.atualizado_em]),
    ['/livro-de-visitas', ''],
    ...(db.links().length ? [['/links', '']] : []),
    ...(db.novidades(1).length ? [['/novidades', `${db.novidades(1)[0].dia}T00:00:00.000Z`]] : []),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${md.esc(cfg.SITE_URL + u)}</loc><lastmod>${data(d)}</lastmod></url>`).join('\n')}
</urlset>
`;
}
rota('GET', '/sitemap.xml', (req, res) => enviar(req, res, 200, sitemap(), 'application/xml; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' }));

rota('GET', '/uploads/([^/]+)', (req, res, [arq]) => {
  const a = db.anexoPorArquivo(arq);
  const alvo = a && dentro(db.PASTA_UPLOADS, arq);
  if (!alvo) return nao(req, res);
  const baixar = ['zip', 'txt'].includes(a.tipo) ? a.nome_original : null;
  if (!mandarArquivo(req, res, alvo, { imutavel: true, anexo: baixar })) nao(req, res);
});

// --- admin

rota('GET', '/admin/entrar', (req, res) => (auth.logado(req) ? redirecionar(res, '/admin') : html(req, res, admin.login())));

rota('POST', '/admin/entrar', async (req, res) => {
  const f = await lerForm(req);
  const usuario = f.get('usuario') || '';
  const r = await auth.tentarLogin(ipDe(req), usuario, f.get('senha') || '');
  if (!r.ok) return html(req, res, admin.login(r.erro, usuario), 401);
  auth.abrirSessao(res);
  redirecionar(res, '/admin', 303);
});

rota('POST', '/admin/sair', (req, res) => {
  auth.fecharSessao(req, res);
  redirecionar(res, '/', 303);
});

rota('GET', '/admin', (req, res) => html(req, res, admin.painel(db.todosPosts(), db.anexos(), contador.relatorio(), chat.quantos())), { restrito: true });
rota('GET', '/admin/colecoes', (req, res) => html(req, res, admin.colecoes(db.todasColecoesAdmin())), { restrito: true });
rota('GET', '/admin/colecoes/(\\d+)', (req, res, [id]) => {
  const numId = Number(id);
  const c = db.colecaoPorId(numId);
  if (!c) return nao(req, res);
  const itens = db.itensDaColecao(numId);
  const anexos = db.anexos();
  return html(req, res, admin.colecaoItens(c, itens, anexos));
}, { restrito: true });
rota('GET', '/admin/recados', (req, res) => html(req, res, admin.recados(db.recadosAdmin())), { restrito: true });
rota('GET', '/admin/site', (req, res) => html(req, res, admin.site({
  status: db.lerAjuste('status', []),
  todo: db.lerAjuste('todo', []),
  musica: db.lerAjuste('musica', null),
  enquetes: db.enquetes().map(site.enqueteComOpcoes),
  novidades: db.novidades(),
  links: db.links(),
  anexos: db.anexos(),
})), { restrito: true });
rota('GET', '/admin/decoracao', (req, res) => html(req, res, admin.decoracao(db.molduras())), { restrito: true });
rota('GET', '/admin/novo', (req, res) => html(req, res, admin.editor(null)), { restrito: true });
rota('GET', '/admin/editar/(\\d+)', (req, res, [id]) => {
  const p = db.postPorId(Number(id));
  return p ? html(req, res, admin.editor(p)) : nao(req, res);
}, { restrito: true });
rota('GET', '/admin/ver/(\\d+)', (req, res, [id]) => {
  const p = db.postPorId(Number(id));
  return p ? html(req, res, publico.post(p, { previa: true })) : nao(req, res);
}, { restrito: true });

// --- API do editor

rota('POST', '/api/posts', async (req, res) => json(req, res, salvarPost(0, await lerJson(req)), 201), { restrito: true });
rota('PUT', '/api/posts/(\\d+)', async (req, res, [id]) => json(req, res, salvarPost(Number(id), await lerJson(req))), { restrito: true });
rota('DELETE', '/api/posts/(\\d+)', (req, res, [id]) => {
  if (!db.excluirPost(Number(id)).changes) throw new ErroHttp(404, 'Esse post não existe mais (já foi excluído?).');
  json(req, res, { ok: true });
}, { restrito: true });

rota('POST', '/api/previa', async (req, res) => {
  const d = await lerJson(req);
  const conteudo = String(d.conteudo || '');
  json(req, res, { html: md.renderizar(conteudo), minutos: minutosLeitura(md.textoPuro(conteudo)) });
}, { restrito: true });

rota('GET', '/api/anexos', (req, res) => json(req, res, db.anexos().map((a) => ({ ...a, url: `/uploads/${a.arquivo}` }))), { restrito: true });
rota('POST', '/api/anexos', async (req, res) => json(req, res, await receberAnexo(req), 201), { restrito: true });
rota('DELETE', '/api/anexos/(\\d+)', (req, res, [id]) => {
  const a = db.anexoPorId(Number(id));
  if (!a) throw new ErroHttp(404, 'Arquivo não encontrado.');
  const emUso = db.todosPosts().map((p) => db.postPorId(p.id)).filter((p) => p.conteudo.includes(a.arquivo));
  if (emUso.length) throw new ErroHttp(409, `Esse arquivo ainda é usado em: ${emUso.map((p) => p.titulo).join(', ')}.`);
  const usosDoSite = site.usosDoAnexo(a.arquivo);
  if (usosDoSite.length) throw new ErroHttp(409, `Esse arquivo ainda é usado em: ${usosDoSite.join(', ')}.`);
  const emUsoItens = db.itensComFoto(a.arquivo);
  if (emUsoItens.length) {
    const nomesItens = emUsoItens.slice(0, 3).map((i) => `"${i.titulo}" (${i.colecao_nome})`).join(', ');
    const mais = emUsoItens.length > 3 ? ` e mais ${emUsoItens.length - 3}` : '';
    throw new ErroHttp(409, `Esse arquivo ainda é usado no(s) item(ns): ${nomesItens}${mais}.`);
  }
  fs.rmSync(path.join(db.PASTA_UPLOADS, a.arquivo), { force: true });
  db.excluirAnexo(a.id);
  json(req, res, { ok: true });
}, { restrito: true });

// --- API de coleções

rota('POST', '/api/colecoes', async (req, res) => {
  const d = await lerJson(req);
  const nome = String(d.nome || '').trim().slice(0, 100);
  if (!nome) throw new ErroHttp(400, 'A coleção precisa de um nome.');
  const slug = slugify(d.slug || nome);
  if (!slug) throw new ErroHttp(400, 'Não consegui gerar um endereço a partir desse nome.');
  const existe = db.colecaoPorSlug(slug);
  if (existe) throw new ErroHttp(409, `Já existe uma coleção com o endereço "${slug}". Escolha outro nome.`);
  const grupo = d.grupo === 'outros' ? 'outros' : 'videogames';
  const estilo = String(d.estilo || '').trim().slice(0, 50) || 'p-ps1';
  const subtitulo = String(d.subtitulo || '').trim().slice(0, 150);
  const ordem = db.proximaOrdemColecao();
  const id = db.inserirColecao({ slug, nome, subtitulo, grupo, estilo, ordem });
  json(req, res, { ok: true, id, slug }, 201);
}, { restrito: true });

rota('PUT', '/api/colecoes/(\\d+)', async (req, res, [id]) => {
  const numId = Number(id);
  const c = db.colecaoPorId(numId);
  if (!c) throw new ErroHttp(404, 'Coleção não encontrada.');
  const d = await lerJson(req);
  const nome = String(d.nome || '').trim().slice(0, 100);
  if (!nome) throw new ErroHttp(400, 'A coleção precisa de um nome.');
  const subtitulo = String(d.subtitulo || '').trim().slice(0, 150);
  const grupo = d.grupo === 'outros' ? 'outros' : 'videogames';
  const estilo = String(d.estilo || '').trim().slice(0, 50) || c.estilo;
  db.atualizarColecao(numId, { nome, subtitulo, grupo, estilo });
  json(req, res, { ok: true });
}, { restrito: true });

rota('POST', '/api/colecoes/(\\d+)/ordem', async (req, res, [id]) => {
  const numId = Number(id);
  const d = await lerJson(req);
  const direcao = d.direcao === 'subir' ? 'subir' : (d.direcao === 'descer' ? 'descer' : null);
  if (!direcao) throw new ErroHttp(400, 'Direção inválida.');
  const ok = db.reordenarColecao(numId, direcao);
  if (!ok) throw new ErroHttp(400, 'Não é possível mover nessa direção.');
  json(req, res, { ok: true });
}, { restrito: true });

rota('POST', '/api/colecoes/(\\d+)/visibilidade', async (req, res, [id]) => {
  const numId = Number(id);
  const c = db.colecaoPorId(numId);
  if (!c) throw new ErroHttp(404, 'Coleção não encontrada.');
  const d = await lerJson(req);
  const visivel = d.visivel ? 1 : 0;
  db.atualizarVisibilidadeColecao(numId, visivel);
  json(req, res, { ok: true, visivel });
}, { restrito: true });

rota('DELETE', '/api/colecoes/(\\d+)', (req, res, [id]) => {
  const numId = Number(id);
  const c = db.colecaoPorId(numId);
  if (!c) throw new ErroHttp(404, 'Coleção não encontrada.');
  db.excluirColecao(numId);
  json(req, res, { ok: true });
}, { restrito: true });

// --- API de itens de coleção

rota('GET', '/api/colecoes/(\\d+)/itens', (req, res, [id]) => {
  const numId = Number(id);
  const c = db.colecaoPorId(numId);
  if (!c) throw new ErroHttp(404, 'Coleção não encontrada.');
  json(req, res, db.itensDaColecao(numId));
}, { restrito: true });

rota('POST', '/api/colecoes/(\\d+)/itens', async (req, res, [id]) => {
  const colecaoId = Number(id);
  const c = db.colecaoPorId(colecaoId);
  if (!c) throw new ErroHttp(404, 'Coleção não encontrada.');
  const d = await lerJson(req);
  const titulo = String(d.titulo || '').trim().slice(0, 200);
  if (!titulo) throw new ErroHttp(400, 'O item precisa de um título.');
  const ano = String(d.ano || '').trim().slice(0, 20);
  const regiao = String(d.regiao || '').trim().slice(0, 50);
  const estado = String(d.estado || '').trim().slice(0, 50);
  const observacoes = String(d.observacoes || '').trim().slice(0, 4000);
  const foto = String(d.foto || '').trim().slice(0, 500);
  const ordem = db.proximaOrdemItem(colecaoId);
  const itemId = db.inserirItem({ colecao_id: colecaoId, titulo, ano, regiao, estado, observacoes, foto, ordem });
  const item = db.itemPorId(itemId);
  json(req, res, { ok: true, item }, 201);
}, { restrito: true });

rota('PUT', '/api/itens/(\\d+)', async (req, res, [id]) => {
  const numId = Number(id);
  const item = db.itemPorId(numId);
  if (!item) throw new ErroHttp(404, 'Item não encontrado.');
  const d = await lerJson(req);
  const titulo = String(d.titulo || '').trim().slice(0, 200);
  if (!titulo) throw new ErroHttp(400, 'O item precisa de um título.');
  const ano = String(d.ano !== undefined ? d.ano : item.ano).trim().slice(0, 20);
  const regiao = String(d.regiao !== undefined ? d.regiao : item.regiao).trim().slice(0, 50);
  const estado = String(d.estado !== undefined ? d.estado : item.estado).trim().slice(0, 50);
  const observacoes = String(d.observacoes !== undefined ? d.observacoes : item.observacoes).trim().slice(0, 4000);
  const foto = String(d.foto !== undefined ? d.foto : item.foto).trim().slice(0, 500);
  db.atualizarItem(numId, { titulo, ano, regiao, estado, observacoes, foto });
  const atualizado = db.itemPorId(numId);
  json(req, res, { ok: true, item: atualizado });
}, { restrito: true });

rota('DELETE', '/api/itens/(\\d+)', (req, res, [id]) => {
  const numId = Number(id);
  const item = db.itemPorId(numId);
  if (!item) throw new ErroHttp(404, 'Item não encontrado.');
  db.excluirItem(numId);
  json(req, res, { ok: true });
}, { restrito: true });

rota('POST', '/api/itens/(\\d+)/ordem', async (req, res, [id]) => {
  const numId = Number(id);
  const d = await lerJson(req);
  const direcao = d.direcao === 'subir' ? 'subir' : (d.direcao === 'descer' ? 'descer' : null);
  if (!direcao) throw new ErroHttp(400, 'Direção inválida.');
  const ok = db.reordenarItem(numId, direcao);
  if (!ok) throw new ErroHttp(400, 'Não é possível mover nessa direção.');
  json(req, res, { ok: true });
}, { restrito: true });

rota('POST', '/api/colecoes/(\\d+)/reordenar-itens', async (req, res, [id]) => {
  const colecaoId = Number(id);
  const c = db.colecaoPorId(colecaoId);
  if (!c) throw new ErroHttp(404, 'Coleção não encontrada.');
  const d = await lerJson(req);
  const criterio = d.criterio;
  const direcao = d.direcao === 'desc' ? 'desc' : 'asc';
  if (!['titulo', 'ano'].includes(criterio)) throw new ErroHttp(400, 'Critério inválido.');
  db.ordenarColecaoItens(colecaoId, criterio, direcao);
  json(req, res, { ok: true, itens: db.itensDaColecao(colecaoId) });
}, { restrito: true });

// --- API do site: recados, status, to-do, rádio, enquetes, novidades, links e molduras

const idOu404 = (n, msg) => { if (!n) throw new ErroHttp(404, msg); };
const direcaoDe = (d) => {
  if (d.direcao !== 'subir' && d.direcao !== 'descer') throw new ErroHttp(400, 'Direção inválida.');
  return d.direcao;
};

rota('PUT', '/api/recados/(\\d+)', (req, res, [id]) => {
  idOu404(db.aprovarRecado(Number(id)), 'Esse recado não existe mais.');
  json(req, res, { ok: true });
}, { restrito: true });
rota('DELETE', '/api/recados/(\\d+)', (req, res, [id]) => {
  idOu404(db.excluirRecado(Number(id)), 'Esse recado não existe mais.');
  json(req, res, { ok: true });
}, { restrito: true });

rota('PUT', '/api/site/status', async (req, res) => {
  const status = site.validarStatus(await lerJson(req));
  db.gravarAjuste('status', status);
  json(req, res, { ok: true, status });
}, { restrito: true });
rota('PUT', '/api/site/todo', async (req, res) => {
  const todo = site.validarTodo(await lerJson(req));
  db.gravarAjuste('todo', todo);
  json(req, res, { ok: true, todo });
}, { restrito: true });
rota('PUT', '/api/site/musica', async (req, res) => {
  const musica = site.validarMusica(await lerJson(req));
  db.gravarAjuste('musica', musica);
  json(req, res, { ok: true, musica });
}, { restrito: true });

rota('POST', '/api/enquetes', async (req, res) => {
  const e = site.validarEnquete(await lerJson(req));
  json(req, res, { ok: true, id: db.criarEnquete(e.pergunta, e.opcoes) }, 201);
}, { restrito: true });
rota('PUT', '/api/enquetes/(\\d+)', async (req, res, [id]) => {
  const d = await lerJson(req);
  idOu404(db.ativarEnquete(Number(id), !!d.ativa), 'Essa enquete não existe mais.');
  json(req, res, { ok: true });
}, { restrito: true });
rota('DELETE', '/api/enquetes/(\\d+)', (req, res, [id]) => {
  idOu404(db.excluirEnquete(Number(id)), 'Essa enquete não existe mais.');
  json(req, res, { ok: true });
}, { restrito: true });

rota('POST', '/api/novidades', async (req, res) => {
  json(req, res, { ok: true, id: db.inserirNovidade(site.validarNovidade(await lerJson(req))) }, 201);
}, { restrito: true });
rota('DELETE', '/api/novidades/(\\d+)', (req, res, [id]) => {
  idOu404(db.excluirNovidade(Number(id)), 'Essa novidade não existe mais.');
  json(req, res, { ok: true });
}, { restrito: true });

rota('POST', '/api/links', async (req, res) => {
  json(req, res, { ok: true, id: db.inserirLink(site.validarLink(await lerJson(req))) }, 201);
}, { restrito: true });
rota('POST', '/api/links/(\\d+)/ordem', async (req, res, [id]) => {
  if (!db.moverLink(Number(id), direcaoDe(await lerJson(req)))) throw new ErroHttp(400, 'Não é possível mover nessa direção.');
  json(req, res, { ok: true });
}, { restrito: true });
rota('DELETE', '/api/links/(\\d+)', (req, res, [id]) => {
  idOu404(db.excluirLink(Number(id)), 'Esse link não existe mais.');
  json(req, res, { ok: true });
}, { restrito: true });

rota('POST', '/api/molduras', async (req, res) => {
  json(req, res, { ok: true, id: db.inserirMoldura(site.validarMoldura(await lerJson(req))) }, 201);
}, { restrito: true });
rota('PUT', '/api/molduras/(\\d+)', async (req, res, [id]) => {
  idOu404(db.molduraPorId(Number(id)), 'Essa moldura não existe mais.');
  db.atualizarMoldura(Number(id), site.validarMoldura(await lerJson(req), { novo: false }));
  json(req, res, { ok: true });
}, { restrito: true });
rota('POST', '/api/molduras/(\\d+)/ordem', async (req, res, [id]) => {
  if (!db.moverMoldura(Number(id), direcaoDe(await lerJson(req)))) throw new ErroHttp(400, 'Não é possível mover nessa direção.');
  json(req, res, { ok: true });
}, { restrito: true });
rota('DELETE', '/api/molduras/(\\d+)', (req, res, [id]) => {
  idOu404(db.excluirMoldura(Number(id)), 'Essa moldura não existe mais.');
  json(req, res, { ok: true });
}, { restrito: true });

// --- CSV de itens (exportar / importar)

const COLUNAS_CSV = ['título', 'ano', 'região', 'estado', 'observações'];
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ALIAS_CSV = {
  titulo: ['titulo', 'title', 'nome', 'name', 'item', 'jogo', 'game'],
  ano: ['ano', 'year', 'data', 'date', 'lancamento'],
  regiao: ['regiao', 'region'],
  estado: ['estado', 'state', 'condition', 'condicao', 'conservacao'],
  observacoes: ['observacoes', 'obs', 'notes', 'note', 'comentarios', 'comentario', 'descricao', 'description'],
};
const chaveItem = (titulo, ano) => `${semAcento(titulo)}||${semAcento(ano)}`;

function csvCampo(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function gerarCsv(itens) {
  const linhas = [COLUNAS_CSV];
  for (const i of itens) linhas.push([i.titulo, i.ano, i.regiao, i.estado, i.observacoes]);
  return `﻿${linhas.map((l) => l.map(csvCampo).join(',')).join('\r\n')}\r\n`;
}

function detectarDelim(primeiraLinha) {
  const conta = (c) => (primeiraLinha.split(c).length - 1);
  const ponto = conta(';');
  const tab = conta('\t');
  const virgula = conta(',');
  if (ponto > virgula && ponto >= tab) return ';';
  if (tab > virgula && tab > ponto) return '\t';
  return ',';
}

function parseCsv(texto, delim) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;
  const t = texto.replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === delim) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function importarCsv(colecaoId, texto, confirmar) {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const primeira = (texto.split('\n')[0] || '').replace(/\r$/, '');
  const linhas = parseCsv(texto, detectarDelim(primeira));
  if (!linhas.length) throw new ErroHttp(400, 'O arquivo CSV está vazio.');

  const col = {};
  linhas[0].forEach((h, i) => {
    const n = semAcento(h);
    for (const [campo, aliases] of Object.entries(ALIAS_CSV)) {
      if (col[campo] === undefined && aliases.includes(n)) col[campo] = i;
    }
  });
  if (col.titulo === undefined) {
    throw new ErroHttp(400, 'Não achei a coluna de título no CSV. A primeira linha precisa ser um cabeçalho com "título" (ou "nome"/"title").');
  }

  const existentes = new Set(db.itensDaColecao(colecaoId).map((i) => chaveItem(i.titulo, i.ano)));
  const vistos = new Set();
  const paraInserir = [];
  const erros = [];
  let duplicados = 0;
  for (let n = 1; n < linhas.length; n++) {
    const linha = linhas[n];
    if (linha.length === 1 && linha[0].trim() === '') continue; // linha em branco
    const pega = (campo, max) => (col[campo] !== undefined ? String(linha[col[campo]] ?? '').trim().slice(0, max) : '');
    const titulo = pega('titulo', 200);
    if (!titulo) { erros.push({ linha: n + 1 }); continue; }
    const chave = chaveItem(titulo, pega('ano', 20));
    if (existentes.has(chave) || vistos.has(chave)) { duplicados++; continue; }
    vistos.add(chave);
    paraInserir.push({
      titulo, ano: pega('ano', 20), regiao: pega('regiao', 50),
      estado: pega('estado', 50), observacoes: pega('observacoes', 4000),
    });
  }

  if (confirmar && paraInserir.length) {
    db.db.exec('BEGIN');
    try {
      let ordem = db.proximaOrdemItem(colecaoId);
      for (const it of paraInserir) db.inserirItem({ colecao_id: colecaoId, ...it, foto: '', ordem: ordem++ });
      db.db.exec('COMMIT');
    } catch (e) {
      db.db.exec('ROLLBACK');
      throw e;
    }
  }
  return { adicionar: paraInserir.length, duplicados, erros, confirmado: !!confirmar };
}

rota('GET', '/api/colecoes/(\\d+)/exportar\\.csv', (req, res, [id]) => {
  const c = db.colecaoPorId(Number(id));
  if (!c) return nao(req, res);
  enviar(req, res, 200, gerarCsv(db.itensDaColecao(c.id)), 'text/csv; charset=utf-8', {
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${c.slug}.csv"`,
  });
}, { restrito: true });

rota('POST', '/api/colecoes/(\\d+)/importar-csv', async (req, res, [id]) => {
  const numId = Number(id);
  const c = db.colecaoPorId(numId);
  if (!c) throw new ErroHttp(404, 'Coleção não encontrada.');
  const d = await lerJson(req);
  const csv = String(d.csv || '');
  if (!csv.trim()) throw new ErroHttp(400, 'Nenhum conteúdo CSV recebido.');
  if (csv.length > 1000000) throw new ErroHttp(413, 'CSV grande demais (máximo ~1 MB).');
  json(req, res, importarCsv(numId, csv, !!d.confirmar));
}, { restrito: true });

const ehJson = (caminho) => caminho.startsWith('/api/') || caminho.startsWith('/chat/');

function nao(req, res) {
  if (ehJson(req.url)) return json(req, res, { erro: 'Não encontrado.' }, 404);
  html(req, res, publico.erro(404), 404);
}

// ------------------------------------------------------------ servidor

const servidor = http.createServer(async (req, res) => {
  cabecalhosSeguranca(res);
  const url = new URL(req.url, 'http://x');
  const caminho = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
  const metodo = req.method === 'HEAD' ? 'GET' : req.method;

  try {
    const barrado = defesa.checar(req, caminho, () => auth.logado(req));
    if (barrado) {
      res.statusCode = barrado.status;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (barrado.espera) res.setHeader('Retry-After', String(barrado.espera));
      return res.end(req.method === 'HEAD' ? undefined : barrado.texto);
    }
    if (ANTIGOS[caminho]) return redirecionar(res, ANTIGOS[caminho], 301);
    const antigaColecao = caminho.match(/^\/pages\/colecoes\/([a-z0-9-]+)\.html$/i);
    if (antigaColecao) return redirecionar(res, `/colecoes/${antigaColecao[1].toLowerCase()}`, 301);

    let achouCaminho = false;
    for (const r of rotas) {
      const m = caminho.match(r.re);
      if (!m) continue;
      achouCaminho = true;
      if (r.metodo !== metodo) continue;

      if (r.restrito && !auth.logado(req)) {
        return ehJson(caminho) ? json(req, res, { erro: 'Sessão expirou. Entra de novo.' }, 401) : redirecionar(res, '/admin/entrar');
      }
      if (metodo !== 'GET' && !mesmaOrigem(req)) throw new ErroHttp(403, 'Origem não permitida.');
      if (caminho.startsWith('/admin') || caminho.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');

      const params = m.slice(1).map(decodificar);
      if (params.includes(null)) throw new ErroHttp(400, 'Endereço inválido.');

      if (r.contar && req.method === 'GET' && !auth.logado(req)) {
        contador.registrarVisitante(req);
        res.on('finish', () => { if (res.statusCode === 200) contador.registrarPagina(req, caminho); });
      }
      return await r.fn(req, res, params, url);
    }
    if (achouCaminho) throw new ErroHttp(405, 'Método não permitido nesse endereço.');

    if (metodo === 'GET' && servirPublico(req, res, url.pathname)) return;
    nao(req, res);
  } catch (e) {
    const status = e instanceof ErroHttp || e instanceof chat.ErroChat || e instanceof site.ErroSite ? e.status : 500;
    // erro inesperado ganha um código curto pra achar no log (docker compose logs | grep código)
    const codigo = status === 500 ? crypto.randomBytes(3).toString('hex') : undefined;
    if (status === 500) console.error(`[erro ${codigo}]`, new Date().toISOString(), req.method, req.url, e);
    if (res.headersSent) return res.destroy();
    const mensagem = status === 500 ? `Erro interno no servidor (código ${codigo}).` : e.message;
    // pro webmaster logado, o detalhe técnico vai junto (pro público, nunca)
    const detalhe = status === 500 && auth.logado(req) ? String(e.stack || e).split('\n').slice(0, 5).join('\n') : undefined;
    if (ehJson(caminho)) return json(req, res, { erro: mensagem, codigo, detalhe }, status);
    html(req, res, publico.erro(status, mensagem, codigo), status);
  }
});

servidor.requestTimeout = 5 * 60 * 1000; // uploads grandes em conexão lenta
servidor.headersTimeout = 15 * 1000; // quem manda os cabeçalhos a conta-gotas (slowloris) cai antes
servidor.listen(cfg.PORTA, cfg.HOST, () => {
  console.log(`HB Hub no ar em http://${cfg.HOST === '0.0.0.0' ? 'localhost' : cfg.HOST}:${cfg.PORTA}`);
  if (!cfg.ADMIN_SENHA_HASH) console.warn('AVISO: ADMIN_SENHA_HASH vazio no .env, o login fica desativado. Rode: npm run senha');
});

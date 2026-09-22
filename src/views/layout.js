const cfg = require('../config');
const { esc } = require('../markdown');
const { versao } = require('../estaticos');
const db = require('../db');
const contador = require('../contador');
const chat = require('../chat');
const { dataBR, agoraLocal } = require('../util');

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E"
  + "%3Crect width='16' height='16' fill='%23c00'/%3E%3Crect x='1' y='1' width='7' height='14' fill='%23000'/%3E"
  + "%3Ctext x='4.5' y='12' font-size='10' font-family='Arial Black,sans-serif' font-weight='900' text-anchor='middle' fill='%23fff'%3EH%3C/text%3E"
  + "%3Ctext x='12' y='12' font-size='10' font-family='Arial Black,sans-serif' font-weight='900' text-anchor='middle' fill='%23fff'%3EB%3C/text%3E%3C/svg%3E";

const SECOES = { blog: 'Blog', opinioes: 'Opiniões', projetos: 'Projetos' };

const PLATAFORMAS = [
  ['ps1', 'p-ps1', 'PS1', 'PlayStation'],
  ['ps2', 'p-ps2', 'PS2', 'PlayStation 2'],
  ['ps3', 'p-ps3', 'PS3', 'PlayStation 3'],
  ['ps4', 'p-ps4', 'PS4', 'PlayStation 4'],
  ['xbox', 'p-xbox', 'XBOX', 'Xbox'],
  ['n64', 'p-n64', 'N64', 'Nintendo 64'],
  ['wii', 'p-wii', 'Wii', 'Wii'],
  ['consoles', 'p-ps3', 'Consoles', 'os aparelhos em si'],
];
const OUTRAS = [
  ['livros', 'p-livros', 'Livros', 'a estante'],
  ['filmes', 'p-filmes', 'Filmes', 'DVDs e afins'],
  ['jogos-pc', 'p-pc', 'PC', 'jogos de PC'],
];

const urlPost = (p) => `/${p.secao}/${p.slug}`;

function navLateral(aqui, ultimo) {
  const caixas = [
    ['Navegação', [
      ['inicio', '/', 'Início'],
      ['blog', '/blog', 'Blog'],
      ['colecoes', '/colecoes', 'Coleções'],
      ['opinioes', '/opinioes', 'Opiniões'],
      ['projetos', '/projetos', 'Projetos'],
      ['chat', '/chat', 'Bate-papo'],
    ]],
    ['No blog', [
      ...(ultimo ? [[`post-${ultimo.id}`, urlPost(ultimo), 'Último post']] : []),
      ['blog-todos', '/blog', 'Todos os posts'],
      ['rss', '/feed.xml', 'Feed RSS'],
    ]],
    ['Por plataforma', PLATAFORMAS.map(([k, , , nome]) => [k, `/colecoes/${k}`, nome === 'os aparelhos em si' ? 'Consoles' : nome])],
    ['Outras coleções', OUTRAS.map(([k, , nome]) => [k, `/colecoes/${k}`, k === 'jogos-pc' ? 'Jogos de PC' : nome])],
  ];
  return caixas.map(([titulo, itens]) => `
                <section class="caixa">
                    <h3>${titulo}</h3>
                    <ul class="nav-lateral">
${itens.map(([k, href, txt]) => `                        <li><a${k === aqui ? ' class="aqui"' : ''} href="${href}">${txt}</a></li>`).join('\n')}
                    </ul>
                </section>`).join('');
}

const ENQUETE = `
                <section class="caixa enquete">
                    <h3>Enquete do HB</h3>
                    <p>Qual coleção eu devia catalogar primeiro?</p>
                    <label><input type="radio" name="enquete"> PS2</label>
                    <label><input type="radio" name="enquete"> Nintendo 64</label>
                    <label><input type="radio" name="enquete"> Livros</label>
                    <label><input type="radio" name="enquete"> Filmes</label>
                    <input type="checkbox" id="votei">
                    <label class="botao-votar" for="votei">VOTAR!</label>
                    <div class="resultado">
                        PS2 <span class="barra"><i style="width:61%"></i></span>
                        Nintendo 64 <span class="barra"><i style="width:22%"></i></span>
                        Livros <span class="barra"><i style="width:9%"></i></span>
                        Filmes <span class="barra"><i style="width:8%"></i></span>
                        <small>*resultados 100% inventados, que nem em 2003. Obrigado pelo voto!</small>
                    </div>
                </section>`;

const direitaHtml = () => `
            <aside id="dir">
                <section class="caixa">
                    <h3>Status</h3>
                    <ul class="status">
                        <li><b>Jogando</b>PS2 com RetroAchievements</li>
                        <li><b>Traduzindo</b>xerabora (PT-BR e ES)</li>
                        <li><b>Lendo</b>issues no GitHub</li>
                        <li><b>Ouvindo</b>o cooler do servidor</li>
                    </ul>
                </section>

                <section class="caixa sala-mini">
                    <h3>Bate-papo</h3>
                    <p><b>${chat.quantos()}</b> ${chat.quantos() === 1 ? 'pessoa' : 'pessoas'} na sala agora</p>
                    <a class="botao" href="/chat">Entrar &#8250;</a>
                </section>

                <section class="caixa">
                    <div class="bilhete">
                        <h4>to-do</h4>
                        <ul>
                            <li><s>fazer o site</s></li>
                            <li><s>primeiro post</s></li>
                            <li><s>contribuir com open source</s></li>
                            <li><s>painel pra escrever post</s></li>
                            <li><s>contador de visitas</s></li>
                            <li><s>sala de bate-papo</s></li>
                            <li>catalogar as coleções</li>
                            <li>escrever opiniões</li>
                            <li>arrumar um livro de visitas</li>
                        </ul>
                    </div>
                </section>

                <section class="caixa contador">
                    <h3>Contador</h3>
                    você é o visitante nº<br>
                    <span>${String(contador.total()).padStart(6, '0').split('').map((d) => `<i>${d}</i>`).join('')}</span><br>
                    ${contador.hojeNumeros().visitantes} hoje &middot; contador de verdade
                </section>

                <section class="caixa">
                    <h3>Botões</h3>
                    <div class="botoes">
                        <a class="b88 b-esp" href="/feed.xml">RSS feed</a>
                        <a class="b88 b-nojs" href="/chat">Bate-papo 24h</a>
                        <span class="b88 b-800">Melhor em 800x600</span>
                        <span class="b88 b-html">HTML + CSS</span>
                        <span class="b88 b-br">Feito no Brasil</span>
                    </div>
                </section>
            </aside>`;

// JSON dentro de <script>: escapa "<" pra ninguém fechar a tag por dentro do texto
const jsonSeguro = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

// SEO: canônica, Open Graph/Twitter (prévia de link) e dados estruturados (schema.org)
// seo = { caminho, tipo, imagem, publicado, modificado, tags, jsonld }
function cabecaSeo({ titulo, descricao, seo, noindex }) {
  if (!seo || !seo.caminho) return '';
  const url = cfg.SITE_URL + seo.caminho;
  const imagem = seo.imagem || `${cfg.SITE_URL}/img/og-hbhub.png`;
  const m = (prop, valor, attr = 'property') => (valor ? `\n    <meta ${attr}="${prop}" content="${esc(valor)}">` : '');
  let h = noindex ? '' : `\n    <link rel="canonical" href="${esc(url)}">`;
  h += m('og:site_name', 'HB Hub') + m('og:locale', 'pt_BR') + m('og:type', seo.tipo || 'website')
    + m('og:title', titulo) + m('og:description', descricao) + m('og:url', url) + m('og:image', imagem)
    + m('twitter:card', 'summary_large_image', 'name');
  if (seo.tipo === 'article') {
    h += m('article:published_time', seo.publicado) + m('article:modified_time', seo.modificado)
      + (seo.tags || []).map((t) => m('article:tag', t)).join('');
  }
  if (seo.jsonld) h += `\n    <script type="application/ld+json">${jsonSeguro(seo.jsonld)}</script>`;
  return h;
}

function pagina({ titulo, descricao = '', aba = '', aqui = '', miolo, direita = true, noindex = false, faixa = '', scripts = [], modal = '', seo = null }) {
  const posts = db.publicados();
  const ultimo = posts[0];
  const aAba = (k, href, txt) => `<a class="aba-${k}${k === aba ? ' ativa' : ''}" href="${href}">${txt}</a>`;
  const letreiro = [
    ultimo ? `NOVO NO BLOG: ${esc(ultimo.titulo)}` : 'O blog está no forno',
    'Coleções em construção: PS2, N64, Wii e mais',
    `Bate-papo aberto: ${chat.quantos()} na sala agora`,
    '0 cookies, 0 rastreadores',
    'Melhor visto em 800x600',
  ].join('<i>|</i>');

  return `<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(titulo)}</title>
    <meta name="description" content="${esc(descricao)}">
    <meta name="theme-color" content="#c00">${noindex ? '\n    <meta name="robots" content="noindex, follow">' : ''}${cabecaSeo({ titulo, descricao, seo, noindex })}
    <link rel="icon" href="/favicon.ico" sizes="48x48">
    <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
    <link rel="alternate" type="application/rss+xml" title="HB Hub" href="/feed.xml">
    <link rel="stylesheet" href="${versao('/css/styles.css')}">${scripts.map((js) => `
    <script src="${versao(js)}" defer></script>`).join('')}
</head>

<body>${faixa}
    <div id="tudo">

        <div id="faixa-topo">
            <span>o cantinho do HB na internet desde 2026</span>
            <span><a href="/#sobre">Sobre</a> | <a href="mailto:${cfg.EMAIL}">Contato</a></span>
        </div>

        <header id="topo">
            <a class="logo" href="/" title="Voltar pro início"><b>H</b><i>B</i><span>Hub<small>desde 2026</small></span></a>
            <nav class="abas">
                ${aAba('blog', '/blog', 'Blog')}
                ${aAba('colecoes', '/colecoes', 'Coleções')}
                ${aAba('opinioes', '/opinioes', 'Opiniões')}
                ${aAba('projetos', '/projetos', 'Projetos')}
                ${aAba('chat', '/chat', 'Bate-papo')}
            </nav>
        </header>

        <div id="letreiro">
            <b>Agora</b>
            <div class="rolagem"><span>${letreiro}</span></div>
            <a class="todos" href="/blog">Todos os posts</a>
        </div>

        <div id="colunas">

            <aside id="esq">${navLateral(aqui, ultimo)}${ENQUETE}
            </aside>

            <main id="meio">
${miolo}
            </main>
${direita ? direitaHtml() : ''}
        </div>

        <footer id="rodape">
            <nav>
                <a href="/">Início</a>
                <a href="/blog">Blog</a>
                <a href="/colecoes">Coleções</a>
                <a href="/opinioes">Opiniões</a>
                <a href="/projetos">Projetos</a>
                <a href="/chat">Bate-papo</a>
                <a href="/feed.xml">RSS</a>
                <a href="mailto:${cfg.EMAIL}">Contato</a>
                <a href="/admin">Webmaster</a>
            </nav>
            <p>&copy; 2026 HB Hub &middot; HTML, CSS e teimosia</p>
            <p>0 cookies de rastreio &middot; 0 rastreadores &middot; contador caseiro que não guarda seu IP</p>
        </footer>

    </div>${modal}
</body>

</html>
`;
}

function ranking(posts, { minimo = 0 } = {}) {
  const hoje = agoraLocal();
  const quatorzeDias = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const linhas = posts.map((p, i) => {
    const novo = p.publicado_em.slice(0, 10) >= quatorzeDias && p.publicado_em <= hoje ? '<span class="novo">NOVO!</span>' : '';
    const tags = String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    const sub = [SECOES[p.secao] !== 'Blog' ? SECOES[p.secao] : '', ...tags].filter(Boolean).map(esc).join(' &middot; ');
    return `                    <tr${i === 0 ? ' class="primeiro"' : ''}>
                        <td class="num">${i + 1}</td>
                        <td class="titulo"><a href="${urlPost(p)}">${esc(p.titulo)}</a>${novo}
                            <small>${sub || '&nbsp;'}</small></td>
                        <td class="quando"><b>${dataBR(p.publicado_em)}</b>~${p.minutos} min de leitura</td>
                    </tr>`;
  });
  for (let n = posts.length; n < minimo; n++) {
    linhas.push(`                    <tr class="breve">
                        <td class="num">${n + 1}</td>
                        <td class="titulo">Post ${n + 1}<small>em breve&hellip;</small></td>
                        <td class="quando"><b>??/??</b>no forno</td>
                    </tr>`);
  }
  return `                <table class="ranking">\n${linhas.join('\n')}\n                </table>`;
}

// Modal de erro que funciona sem JavaScript: fecha pelo × (âncora + :target) ou vai pro "OK".
// mensagem e codigo precisam chegar já seguros (texto escapado).
function modalErro({ titulo = 'Erro', mensagem, codigo = '', okHref = '/', okTexto = 'OK' }) {
  return `
    <span id="fechou-erro"></span>
    <div class="modal-fundo">
        <div class="modal-erro aberto" role="alertdialog" aria-modal="true" aria-labelledby="modal-erro-titulo" aria-describedby="modal-erro-texto">
            <div class="janela-titulo"><span id="modal-erro-titulo">${esc(titulo)}</span><a class="fechar" href="#fechou-erro" aria-label="Fechar">&times;</a></div>
            <div class="modal-corpo">
                <div class="modal-icone" aria-hidden="true">X</div>
                <div class="modal-textos">
                    <p id="modal-erro-texto">${mensagem}</p>${codigo ? `
                    <p class="modal-codigo">Código do erro: <code>${esc(codigo)}</code></p>` : ''}
                </div>
            </div>
            <div class="modal-botoes"><a class="btn98" href="#fechou-erro">Fechar</a><a class="btn98" href="${okHref}" autofocus>${okTexto}</a></div>
        </div>
    </div>`;
}

function emObras(chamada, texto) {
  return `                <div class="em-obras">
                    <div>
                        <strong>${chamada}</strong>
                        <p>${texto}</p>
                    </div>
                </div>`;
}

module.exports = { pagina, ranking, emObras, modalErro, urlPost, SECOES, PLATAFORMAS, OUTRAS, FAVICON };

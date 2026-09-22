const cfg = require('../config');
const { esc } = require('../markdown');
const { dataBR, tagsDe, slugify } = require('../util');
const { pagina, ranking, emObras, modalErro, urlPost, SECOES, PLATAFORMAS, OUTRAS } = require('./layout');
const { CORES, quantos } = require('../chat');

const AVATAR = '<b>H</b><i>B</i>'; // monograma, igual ao logo

const etiquetas = (tags) => tags.map((t, i) =>
  `<a class="etiqueta${['', ' azul', ' verde'][i % 3]}" href="/tag/${slugify(t)}">${esc(t)}</a>`).join('');

// título do banner: as duas últimas palavras ficam amarelas
function tituloBanner(t) {
  const p = t.split(' ');
  if (p.length < 4) return esc(t);
  return `${esc(p.slice(0, -2).join(' '))} <em>${esc(p.slice(-2).join(' '))}</em>`;
}

function inicio(posts) {
  const u = posts[0];
  const banner = u
    ? `                <a class="banner" href="${urlPost(u)}">
                    <span class="selo">NOVO<br>POST!</span>
                    <span class="chapeu">ÚLTIMO POST</span>
                    <strong>${tituloBanner(u.titulo)}</strong>
                    <span class="linha-fina">${tagsDe(u).map(esc).join(' &middot; ') || dataBR(u.publicado_em)}</span>
                    <span class="botao">Ler agora &#8250;</span>
                </a>`
    : `                <div class="banner"><span class="chapeu">EM BREVE</span><strong>O primeiro post tá <em>no forno</em></strong></div>`;

  return pagina({
    titulo: 'HB Hub',
    descricao: 'O cantinho do HB na internet: blog, coleções, opiniões e projetos.',
    aqui: 'inicio',
    miolo: `                <h1 class="bem-vindo">Bem-vindo!</h1>

${banner}

                <p>Aqui eu posto tudo que eu quiser, desde música até tecnologia. Adoro compartilhar minhas descobertas
                    e experiências no meu blog, minhas viagens e projetos.</p>

                <div class="ladrilhos">
                    <a class="l-blog" href="/blog">Blog</a>
                    <a class="l-colecoes" href="/colecoes">Coleções</a>
                    <a class="l-opinioes" href="/opinioes">Opiniões</a>
                    <a class="l-projetos" href="/projetos">Projetos</a>
                </div>

                <section class="painel">
                    <h2>Posts mais recentes <small><a href="/blog">ver todos &raquo;</a></small></h2>
${ranking(posts.slice(0, 5), { minimo: 3 })}
                </section>

                <section class="painel" id="sobre">
                    <h2>Sobre mim</h2>
                    <div class="dentro sobre">
                        <div class="avatar">${AVATAR}</div>
                        <div>
                            <p>Oi, eu sou o HB, tenho 26 anos e sou um profissional da área de dados. Já trabalhei como
                                Analista de Dados, Engenheiro de Dados, Analista de BI e atualmente sou diretor de uma
                                empresa em algum lugar do Brasil.</p>
                            <table class="ficha">
                                <tr><th>Nome</th><td>HB</td></tr>
                                <tr><th>Idade</th><td>26</td></tr>
                                <tr><th>Área</th><td>Dados</td></tr>
                                <tr><th>Curte</th><td>tecnologia, videogames, filmes e livros</td></tr>
                                <tr><th>Contato</th><td><a href="mailto:${cfg.EMAIL}">${cfg.EMAIL}</a></td></tr>
                            </table>
                        </div>
                    </div>
                </section>`,
  });
}

function nuvemTags(posts) {
  const cont = new Map();
  for (const p of posts) for (const t of tagsDe(p)) cont.set(t, (cont.get(t) || 0) + 1);
  if (!cont.size) return '';
  const tags = [...cont].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return `
                <section class="painel" id="tags">
                    <h2>Tags</h2>
                    <div class="dentro">${tags.map(([t, n], i) =>
    `<a class="etiqueta${['', ' azul', ' verde'][i % 3]}" href="/tag/${slugify(t)}">${esc(t)} (${n})</a>`).join('')}</div>
                </section>`;
}

const POR_PAGINA = 10;

function paginacao(base, atual, total) {
  const paginas = Math.ceil(total / POR_PAGINA);
  if (paginas <= 1) return '';
  const ant = atual > 1 ? `<a href="${base}?pagina=${atual - 1}">&laquo; mais novos</a>` : '<span class="desligado">&laquo; mais novos</span>';
  const prox = atual < paginas ? `<a href="${base}?pagina=${atual + 1}">mais velhos &raquo;</a>` : '<span class="desligado">mais velhos &raquo;</span>';
  return `\n                <div class="fim-post">${ant}<span>página ${atual} de ${paginas}</span>${prox}</div>`;
}

function listaSecao(secao, todos, numPagina) {
  const posts = secao === 'blog' ? todos : todos.filter((p) => p.secao === secao);
  const nome = SECOES[secao];
  const inicioPag = (numPagina - 1) * POR_PAGINA;
  const intro = {
    blog: `Bem-vindo ao meu blog! Aqui é o meu canto pra falar o que eu quiser, experiências e coisas que
                    aprendi e vivi, desde viagens até projetos ou qualquer tipo de bobagem. Este é o meu canto na internet.`,
    opinioes: 'Minhas opiniões sobre jogos, filmes, livros e o que mais der na telha.',
    projetos: 'As coisas que eu inventei de fazer. O primeiro projeto é esse próprio site.',
  }[secao];

  const corpo = posts.length
    ? `                <section class="painel">
                    <h2>${secao === 'blog' ? 'Ranking de posts' : nome} <small>do mais novo pro mais velho</small></h2>
${ranking(posts.slice(inicioPag, inicioPag + POR_PAGINA))}
                </section>${paginacao('/' + secao, numPagina, posts.length)}${secao === 'blog' ? nuvemTags(posts) : ''}`
    : emObras('Em construção', secao === 'opinioes'
      ? 'As opiniões já existem, só falta escrever. Volte mais tarde.'
      : 'Nada por aqui ainda. Volte mais tarde!');

  return pagina({
    titulo: secao === 'blog' ? 'HB Blog' : `${nome} :: HB Hub`,
    descricao: `${nome} do HB Hub.`,
    aba: secao,
    aqui: secao === 'blog' ? 'blog-todos' : secao,
    miolo: `                <h1 class="bem-vindo">${secao === 'blog' ? 'HB Blog' : nome}</h1>

                <p>${intro}</p>

${corpo}`,
  });
}

function porTag(tag, posts) {
  return pagina({
    titulo: `Tag: ${tag} :: HB Blog`,
    descricao: `Posts do HB Hub com a tag ${tag}.`,
    aba: 'blog',
    aqui: 'blog-todos',
    miolo: `                <div class="migalhas"><a href="/">Início</a> &raquo; <a href="/blog">Blog</a> &raquo; Tag</div>
                <h1 class="bem-vindo">Tag: ${esc(tag)}</h1>

                <section class="painel">
                    <h2>${posts.length} post${posts.length === 1 ? '' : 's'}</h2>
${ranking(posts)}
                </section>`,
  });
}

function post(p, { anterior, proximo, previa = false } = {}) {
  const tldr = p.tldr.split('\n').map((l) => l.trim()).filter(Boolean);
  const nomeSecao = SECOES[p.secao];
  const faixa = previa
    ? `\n    <div class="faixa-previa">PRÉ-VISUALIZAÇÃO &middot; ${p.status === 'publicado' ? 'publicado' : 'rascunho'} &middot; só você tá vendo &middot; <a href="/admin/editar/${p.id}">voltar pro editor</a></div>`
    : '';

  return pagina({
    titulo: `${p.titulo} :: HB ${p.secao === 'blog' ? 'Blog' : 'Hub'}`,
    descricao: p.resumo,
    aba: p.secao,
    aqui: `post-${p.id}`,
    direita: false,
    noindex: previa,
    faixa,
    miolo: `                <div class="migalhas"><a href="/">Início</a> &raquo; <a href="/${p.secao}">${nomeSecao}</a> &raquo; ${esc(p.titulo)}</div>

                <header class="post-cab">
                    ${etiquetas(tagsDe(p))}
                    <h1>${esc(p.titulo)}</h1>
                    <div class="meta">Por <b>HB</b> &middot; ${dataBR(p.publicado_em) || 'sem data'} &middot; ~${p.minutos} min de leitura</div>
                </header>

                <article class="post">${tldr.length ? `
                    <aside class="resumo">
                        <b>TL;DR</b>
                        <ol>${tldr.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
                    </aside>` : ''}
${p.html}
                </article>

                <div class="fim-post">
                    ${proximo ? `<a href="${urlPost(proximo)}">&laquo; ${esc(proximo.titulo)}</a>` : `<a href="/${p.secao}">&laquo; voltar pro ${nomeSecao.toLowerCase()}</a>`}
                    ${anterior ? `<a href="${urlPost(anterior)}">${esc(anterior.titulo)} &raquo;</a>` : '<span class="desligado">fim da linha &raquo;</span>'}
                </div>`,
  });
}

function grade(itens) {
  return itens.map(([k, cls, nome, sub]) =>
    `                    <a class="${cls}" href="/colecoes/${k}">${nome}<small>${sub}</small></a>`).join('\n');
}

function colecoes() {
  return pagina({
    titulo: 'Coleções :: HB Hub',
    descricao: 'As coleções do HB: videogames, livros, filmes e jogos de PC.',
    aba: 'colecoes',
    aqui: 'colecoes',
    miolo: `                <h1 class="bem-vindo">Coleções</h1>

                <p>Minha estante virtual: tudo que eu coleciono, organizado por plataforma. Escolha uma e divirta-se
                    (ou volte depois, algumas ainda tão sendo catalogadas).</p>

                <h2 class="subtitulo">Videogames</h2>
                <div class="plataformas">
${grade(PLATAFORMAS)}
                </div>

                <h2 class="subtitulo">Outros</h2>
                <div class="plataformas">
${grade(OUTRAS)}
                </div>`,
  });
}

function colecao(chave) {
  const item = [...PLATAFORMAS, ...OUTRAS].find(([k]) => k === chave);
  if (!item) return null;
  const nomes = { consoles: 'Consoles', livros: 'Livros', filmes: 'Filmes', 'jogos-pc': 'Jogos de PC' };
  const nome = nomes[chave] || item[3];
  return pagina({
    titulo: `Coleção: ${nome} :: HB Hub`,
    descricao: `Coleção de ${nome} do HB.`,
    aba: 'colecoes',
    aqui: chave,
    miolo: `                <h1 class="bem-vindo">Coleção: ${nome}</h1>

${emObras('Em construção', 'Tô catalogando essa coleção. Volte mais tarde que vai ter lista, foto e história de cada item.')}

                <p><a href="/colecoes">&laquo; voltar pras coleções</a></p>`,
  });
}

function salaChat() {
  const cores = CORES.map((c, i) =>
    `<label style="--cor:${c}"><input type="radio" name="cor" value="${i}"${i === 0 ? ' checked' : ''}><span></span></label>`).join('');
  return pagina({
    titulo: 'Bate-papo :: HB Hub',
    descricao: 'A sala de bate-papo do HB Hub, como nos velhos tempos.',
    aba: 'chat',
    aqui: 'chat',
    direita: false,
    scripts: ['/js/avisos.js', '/chat/chat.js'],
    miolo: `                <h1 class="bem-vindo">Bate-papo</h1>

                <div class="sala" id="sala">
                    <div class="sala-titulo"><span>Bate-Papo do HB &middot; Sala Anos 2000</span><b id="sala-online">${quantos()} na sala</b></div>

                    <form class="sala-entrada" id="entrada" hidden>
                        <p>Escolhe um apelido e uma cor e entra. Sem cadastro, sem senha. Seja legal: o webmaster (<b class="selo-adm">ADM</b>) pode expulsar quem apelar.</p>
                        <label class="sala-campo">Apelido <input id="apelido" maxlength="20" required autocomplete="nickname" placeholder="ex: gamer_2003"></label>
                        <div class="sala-cores" role="radiogroup" aria-label="Cor do apelido">${cores}</div>
                        <button class="botao">Entrar na sala &#8250;</button>
                        <p class="sala-erro" id="erro-entrada" hidden></p>
                    </form>

                    <div class="sala-dentro" id="dentro" hidden>
                        <div class="sala-msgs" id="msgs" aria-live="polite"></div>
                        <div class="sala-lado">
                            <b>Na sala</b>
                            <ul id="lista"></ul>
                        </div>
                        <form class="sala-falar" id="falar">
                            <div class="sala-linha">
                                <b id="eu"></b>
                                <input id="texto" maxlength="300" autocomplete="off" placeholder="digite sua mensagem e aperte Enter" aria-label="Mensagem">
                                <button class="botao">Enviar</button>
                            </div>
                            <div class="sala-linha pequena">
                                <span></span>
                                <button type="button" id="sair" class="link-sair">sair da sala</button>
                            </div>
                        </form>
                    </div>

                    <p class="sala-carregando" id="carregando">carregando a sala&hellip;</p>
                    <noscript><p class="sala-carregando">O bate-papo precisa de JavaScript (é o único lugar do site que usa).</p></noscript>
                </div>

                <p class="sala-regras"><b>Regras da casa:</b> nada de ofensa, spam ou link suspeito. As mensagens não ficam
                    guardadas: quando o servidor reinicia, a sala começa do zero. Clica num apelido da lista pra chamar a pessoa (@apelido).</p>`,
  });
}

function erro(codigo, mensagem, codigoErro) {
  const e = codigo === 404
    ? ['404', 'Página perdida no ciberespaço', 'Essa página não existe (ou fugiu). Tenta o menu aí do lado.']
    : codigo >= 500
      ? ['500', 'O servidor tropeçou no cabo', 'Deu um erro aqui do meu lado. Tenta de novo daqui a pouco.']
      : [String(codigo), 'Opa, não deu', esc(mensagem || 'Pedido inválido.')];
  return pagina({
    titulo: `${e[0]} :: HB Hub`,
    noindex: true,
    miolo: `                <h1 class="bem-vindo">Erro ${e[0]}</h1>

${emObras(e[1], e[2])}

                <p><a href="/">&laquo; voltar pro início</a></p>`,
    modal: modalErro({
      titulo: `Erro ${e[0]} · ${e[1]}`,
      mensagem: e[2],
      codigo: codigoErro,
      okTexto: 'Ir pro início',
    }),
  });
}

module.exports = { inicio, listaSecao, porTag, post, colecoes, colecao, salaChat, erro, POR_PAGINA };

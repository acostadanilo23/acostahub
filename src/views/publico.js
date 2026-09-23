const cfg = require('../config');
const { esc, textoPuro } = require('../markdown');
const { dataBR, tagsDe, slugify, paraDate } = require('../util');
const { pagina, ranking, emObras, modalErro, urlPost, SECOES, arquivoLocal } = require('./layout');
const db = require('../db');
const site = require('../site');
const { CORES, quantos } = require('../chat');
const { MAX_TERMO } = require('../busca');
const captcha = require('../captcha');

const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: cfg.FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
const diaDe = (iso) => fmtDia.format(new Date(iso));
const comQuebras = (s) => esc(s).replace(/\n/g, '<br>');
const RE_IMAGEM = /\.(webp|png|jpe?g|gif)$/i;

const AVATAR = '<b>H</b><i>B</i>'; // monograma, igual ao logo

const etiquetas = (tags) => tags.map((t, i) =>
  `<a class="etiqueta${['', ' azul', ' verde'][i % 3]}" href="/tag/${slugify(t)}">${esc(t)}</a>`).join('');

// título do banner: as duas últimas palavras ficam amarelas
function tituloBanner(t) {
  const p = t.split(' ');
  if (p.length < 4) return esc(t);
  return `${esc(p.slice(0, -2).join(' '))} <em>${esc(p.slice(-2).join(' '))}</em>`;
}

const fotoDoItem = (foto, classe = 'item-foto') => (foto && RE_IMAGEM.test(foto)
  ? `<span class="${classe}" style="background-image:url('${esc(foto)}')"></span>`
  : `<span class="${classe} sem-foto">sem foto</span>`);

function caixaItemDoDia() {
  const i = site.itemDoDia();
  if (!i) return '';
  const meta = [i.colecao_nome, i.ano, i.estado].filter(Boolean).map(esc).join(' &middot; ');
  return `
                <section class="painel">
                    <h2>Item do dia <small>da minha estante</small></h2>
                    <a class="dentro item-do-dia" href="/colecoes/${i.colecao_slug}/${i.id}">
                        ${fotoDoItem(i.foto)}
                        <span><strong>${esc(i.titulo)}</strong><small>${meta}</small><em>ver o item &#8250;</em></span>
                    </a>
                </section>
`;
}

function listaNovidades(lista) {
  return `<ul class="dentro novidades">
${lista.map((n) => `                        <li><b>${n.dia.slice(8, 10)}/${n.dia.slice(5, 7)}/${n.dia.slice(0, 4)}</b> ${esc(n.texto)}</li>`).join('\n')}
                    </ul>`;
}

function caixaNovidades() {
  const lista = db.novidades(5);
  if (!lista.length) return '';
  return `
                <section class="painel">
                    <h2>O que há de novo <small><a href="/novidades">ver tudo &raquo;</a></small></h2>
                    ${listaNovidades(lista)}
                </section>
`;
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
    titulo: 'HB Hub :: o cantinho do HB na internet',
    descricao: 'O cantinho do HB na internet: blog sobre games, tecnologia e open source, coleções de videogames, opiniões e projetos.',
    aqui: 'inicio',
    seo: {
      caminho: '/',
      jsonld: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'HB Hub',
        alternateName: 'O cantinho do HB na internet',
        url: cfg.SITE_URL + '/',
        inLanguage: 'pt-BR',
      },
    },
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
${caixaItemDoDia()}${caixaNovidades()}

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

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (ano, mes) => `${MESES[Number(mes) - 1]} de ${ano}`;

// arquivo: quantos posts em cada mês, agrupado por ano (mais novo primeiro)
function painelArquivo(posts) {
  const porAno = new Map();
  for (const p of posts) {
    const [ano, mes] = p.publicado_em.split('-');
    if (!porAno.has(ano)) porAno.set(ano, new Map());
    const meses = porAno.get(ano);
    meses.set(mes, (meses.get(mes) || 0) + 1);
  }
  if (!porAno.size) return '';
  return `
                <section class="painel" id="arquivo">
                    <h2>Arquivo</h2>
                    <div class="dentro arquivo">
${[...porAno].map(([ano, meses]) => `                        <p><b>${ano}</b> ${[...meses].map(([mes, n]) =>
    `<a href="/arquivo/${ano}/${mes}">${MESES[Number(mes) - 1]} (${n})</a>`).join(' &middot; ')}</p>`).join('\n')}
                    </div>
                </section>`;
}

function arquivoMes(ano, mes, posts) {
  return pagina({
    titulo: `Arquivo: ${nomeMes(ano, mes)} :: HB Blog`,
    descricao: `Posts do HB Hub publicados em ${nomeMes(ano, mes)}.`,
    aba: 'blog',
    aqui: 'blog-todos',
    noindex: true,
    seo: { caminho: `/arquivo/${ano}/${mes}` },
    miolo: `                <div class="migalhas"><a href="/">Início</a> &raquo; <a href="/blog">Blog</a> &raquo; <a href="/blog#arquivo">Arquivo</a> &raquo; ${nomeMes(ano, mes)}</div>
                <h1 class="bem-vindo">Arquivo: ${nomeMes(ano, mes)}</h1>

                <section class="painel">
                    <h2>${posts.length} post${posts.length === 1 ? '' : 's'}</h2>
${ranking(posts)}
                </section>`,
  });
}

const POR_PAGINA = 10;

function resumoAutomatico(conteudo) {
  const t = textoPuro(conteudo);
  if (t.length <= 155) return t;
  return t.slice(0, 155).replace(/\s+\S*$/, '') + '...';
}

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
                </section>${paginacao('/' + secao, numPagina, posts.length)}${secao === 'blog' ? nuvemTags(posts) + painelArquivo(posts) : ''}`
    : emObras('Em construção', secao === 'opinioes'
      ? 'As opiniões já existem, só falta escrever. Volte mais tarde.'
      : 'Nada por aqui ainda. Volte mais tarde!');

  return pagina({
    titulo: (secao === 'blog' ? 'Blog do HB' : `${nome} :: HB Hub`) + (numPagina > 1 ? ` (página ${numPagina})` : ''),
    descricao: {
      blog: 'Todos os posts do blog do HB: experiências, games, tecnologia, open source e o que mais der na telha.',
      opinioes: 'Opiniões do HB sobre jogos, filmes, livros e o que mais der na telha.',
      projetos: 'Os projetos do HB.',
    }[secao],
    aba: secao,
    aqui: secao === 'blog' ? 'blog-todos' : secao,
    noindex: !posts.length, // seção "em construção" é conteúdo raso: não indexa
    seo: { caminho: `/${secao}${numPagina > 1 ? `?pagina=${numPagina}` : ''}` },
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
    noindex: true,
    seo: { caminho: `/tag/${slugify(tag)}` },
    miolo: `                <div class="migalhas"><a href="/">Início</a> &raquo; <a href="/blog">Blog</a> &raquo; Tag</div>
                <h1 class="bem-vindo">Tag: ${esc(tag)}</h1>

                <section class="painel">
                    <h2>${posts.length} post${posts.length === 1 ? '' : 's'}</h2>
${ranking(posts)}
                </section>`,
  });
}

// comentários do post: a lista (só aprovados) e o formulário (fora da prévia do painel)
function comentariosHtml(p, { previa, aviso = '', erro = '', valores = {} }) {
  if (previa) return '';
  const lista = db.comentariosDoPost(p.id);
  return `

                <section class="painel" id="comentarios">
                    <h2>Comentários <small>${lista.length} ${lista.length === 1 ? 'comentário' : 'comentários'}</small></h2>
                    <div class="dentro">${lista.length ? `
                        <ol class="recados">
${lista.map((c) => `                            <li class="recado">
                                <div class="recado-cab"><b>${esc(c.nome)}</b><span>${diaDe(c.criado_em)}</span></div>
                                <p>${comQuebras(c.mensagem)}</p>
                            </li>`).join('\n')}
                        </ol>` : `
                        <p>Ninguém comentou ainda. Seja o primeiro!</p>`}
                    </div>
                </section>${aviso ? `

                <p class="aviso-ok">${esc(aviso)}</p>` : ''}${erro ? `

                <p class="aviso-erro">${esc(erro)}</p>` : ''}

                <section class="painel">
                    <h2>Deixe um comentário <small>aparece depois que o webmaster aprovar</small></h2>
                    <form class="dentro form-recado" method="post" action="${urlPost(p)}/comentar#comentarios">
                        <label>Nome ou apelido <input name="nome" maxlength="40" required value="${esc(valores.nome || '')}"></label>
                        <label class="armadilha" aria-hidden="true">Não preencha isto <input name="email" tabindex="-1" autocomplete="off"></label>
                        <label>Comentário <textarea name="mensagem" maxlength="1000" rows="4" required>${esc(valores.mensagem || '')}</textarea></label>
                        ${captcha.campo()}
                        <button class="botao">Comentar &#8250;</button>
                    </form>
                </section>`;
}

function post(p, { anterior, proximo, previa = false, comentar = {} } = {}) {
  const tldr = p.tldr.split('\n').map((l) => l.trim()).filter(Boolean);
  const nomeSecao = SECOES[p.secao];
  const faixa = previa
    ? `\n    <div class="faixa-previa">PRÉ-VISUALIZAÇÃO &middot; ${p.status === 'publicado' ? 'publicado' : 'rascunho'} &middot; só você tá vendo &middot; <a href="/admin/editar/${p.id}">voltar pro editor</a></div>`
    : '';

  const descricao = p.resumo || resumoAutomatico(p.conteudo);
  const img = ((p.html.match(/<img src="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&') || undefined;
  const url = cfg.SITE_URL + urlPost(p);
  const publicado = p.publicado_em ? paraDate(p.publicado_em).toISOString() : undefined;
  return pagina({
    titulo: `${p.titulo} :: HB ${p.secao === 'blog' ? 'Blog' : 'Hub'}`,
    descricao,
    aba: p.secao,
    seo: {
      caminho: urlPost(p),
      tipo: 'article',
      imagem: img && (img.startsWith('http') ? img : cfg.SITE_URL + img),
      publicado,
      modificado: p.atualizado_em,
      tags: tagsDe(p),
      jsonld: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: p.titulo,
        description: descricao,
        datePublished: publicado,
        dateModified: p.atualizado_em,
        author: { '@type': 'Person', name: 'HB', url: cfg.SITE_URL + '/#sobre' },
        publisher: { '@type': 'Person', name: 'HB', url: cfg.SITE_URL + '/' },
        mainEntityOfPage: url,
        url,
        image: img ? [img.startsWith('http') ? img : cfg.SITE_URL + img] : [cfg.SITE_URL + '/img/og-hbhub.png'],
        keywords: tagsDe(p).join(', ') || undefined,
        inLanguage: 'pt-BR',
      },
    },
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
                </div>${comentariosHtml(p, { previa, ...comentar })}`,
  });
}

function grade(colecoes) {
  return colecoes.map((c) =>
    `                    <a class="${esc(c.estilo)}" href="/colecoes/${c.slug}">${esc(c.nome)}</a>`).join('\n');
}

function gradeItens(slug, itens) {
  const cartoes = itens.map((i) => {
    const meta = [i.ano, i.estado].filter(Boolean).map(esc).join(' &middot; ');
    return `                        <li class="cat-item"><a href="/colecoes/${i.colecao_slug || slug}/${i.id}">
                            ${fotoDoItem(i.foto)}
                            <strong>${esc(i.titulo)}</strong>
                            ${meta ? `<small>${meta}</small>` : ''}
                        </a></li>`;
  }).join('\n');
  return `                <ul class="colecao-itens">
${cartoes}
                </ul>`;
}

function colecoes() {
  const videogames = db.colecoesPorGrupo('videogames');
  const outros = db.colecoesPorGrupo('outros');
  return pagina({
    titulo: 'Coleções :: HB Hub',
    descricao: 'As coleções do HB: videogames (PS1, PS2, PS3, PS4, Xbox, N64, Wii), livros, filmes e jogos de PC.',
    aba: 'colecoes',
    aqui: 'colecoes',
    seo: { caminho: '/colecoes' },
    miolo: `                <h1 class="bem-vindo">Coleções</h1>

                <p>Minha estante virtual: tudo que eu coleciono, organizado por plataforma. Escolha uma e divirta-se
                    (ou volte depois, algumas ainda tão sendo catalogadas).</p>

                <h2 class="subtitulo">Videogames</h2>
                <div class="plataformas">
${grade(videogames)}
                </div>

                <h2 class="subtitulo">Outros</h2>
                <div class="plataformas">
${grade(outros)}
                </div>`,
  });
}

const NOMES_COLECAO = { consoles: 'Consoles', livros: 'Livros', filmes: 'Filmes', 'jogos-pc': 'Jogos de PC' };
const nomeColecao = (c) => NOMES_COLECAO[c.slug] || c.subtitulo || c.nome;

function colecao(chave) {
  const item = db.colecaoPorSlug(chave);
  if (!item || !item.visivel) return null;
  const nome = nomeColecao(item);
  const itens = db.itensDaColecao(item.id);
  const temItens = itens.length > 0;
  const corpo = temItens
    ? gradeItens(item.slug, itens)
    : emObras('Em construção', 'Tô catalogando essa coleção. Volte mais tarde que vai ter lista, foto e história de cada item.');
  return pagina({
    titulo: `Coleção: ${nome} :: HB Hub`,
    descricao: temItens
      ? `Coleção de ${nome} do HB: ${itens.length} ${itens.length === 1 ? 'item catalogado' : 'itens catalogados'}.`
      : `Coleção de ${nome} do HB.`,
    aba: 'colecoes',
    aqui: chave,
    noindex: !temItens, // coleção vazia ainda é "em construção": não indexa
    seo: { caminho: `/colecoes/${chave}` },
    miolo: `                <h1 class="bem-vindo">Coleção: ${esc(nome)}</h1>

${corpo}

                <p><a href="/colecoes">&laquo; voltar pras coleções</a></p>`,
  });
}

function itemColecao(slug, id) {
  const c = db.colecaoPorSlug(slug);
  const i = db.itemPorId(id);
  if (!c || !c.visivel || !i || i.colecao_id !== c.id) return null;
  const itens = db.itensDaColecao(c.id);
  const pos = itens.findIndex((x) => x.id === i.id);
  const [ant, prox] = [itens[pos - 1], itens[pos + 1]];
  const nome = nomeColecao(c);
  const temFoto = i.foto && RE_IMAGEM.test(i.foto);
  const ficha = [['Coleção', `<a href="/colecoes/${c.slug}">${esc(nome)}</a>`], ['Ano', esc(i.ano)], ['Região', esc(i.regiao)], ['Estado', esc(i.estado)]]
    .filter(([, v]) => v).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  const descricao = [nome, i.ano, i.estado].filter(Boolean).join(', ');
  return pagina({
    titulo: `${i.titulo} :: Coleção ${nome} :: HB Hub`,
    descricao: `${i.titulo} (${descricao}) na coleção do HB.`,
    aba: 'colecoes',
    aqui: c.slug,
    seo: { caminho: `/colecoes/${c.slug}/${i.id}`, imagem: temFoto ? cfg.SITE_URL + i.foto : undefined },
    miolo: `                <div class="migalhas"><a href="/">Início</a> &raquo; <a href="/colecoes">Coleções</a> &raquo; <a href="/colecoes/${c.slug}">${esc(nome)}</a> &raquo; ${esc(i.titulo)}</div>
                <h1 class="bem-vindo">${esc(i.titulo)}</h1>

                <div class="item-pagina">
                    ${temFoto ? `<a class="item-grande" href="${esc(i.foto)}" target="_blank"><img src="${esc(i.foto)}" alt="${esc(i.titulo)}"></a>` : fotoDoItem('', 'item-grande')}
                    <table class="ficha">${ficha}</table>
                </div>
${i.observacoes ? `
                <section class="painel">
                    <h2>A história</h2>
                    <p class="dentro">${comQuebras(i.observacoes)}</p>
                </section>` : ''}

                <div class="fim-post">
                    ${ant ? `<a href="/colecoes/${c.slug}/${ant.id}">&laquo; ${esc(ant.titulo)}</a>` : `<a href="/colecoes/${c.slug}">&laquo; voltar pra coleção</a>`}
                    ${prox ? `<a href="/colecoes/${c.slug}/${prox.id}">${esc(prox.titulo)} &raquo;</a>` : '<span class="desligado">fim da estante &raquo;</span>'}
                </div>`,
  });
}

function busca(q, { termos, posts, itens }) {
  const form = `                <form class="form-busca" method="get" action="/busca" role="search">
                    <input type="search" name="q" value="${esc(q)}" maxlength="${MAX_TERMO}" placeholder="ex: gran turismo, open source" aria-label="Buscar no site" required>
                    <button class="botao">Buscar &#8250;</button>
                </form>`;
  let corpo = '';
  if (q && !termos.length) {
    corpo = '<p>Digita pelo menos uma palavra com 2 letras ou mais.</p>';
  } else if (q && !posts.length && !itens.length) {
    corpo = emObras('Nada encontrado', `Não achei nada com &ldquo;${esc(q)}&rdquo;. Tenta outra palavra (ou menos palavras).`);
  } else if (q) {
    corpo = `${posts.length ? `
                <section class="painel">
                    <h2>Posts <small>${posts.length} ${posts.length === 1 ? 'resultado' : 'resultados'}</small></h2>
${ranking(posts)}
                </section>` : ''}${itens.length ? `
                <section class="painel">
                    <h2>Itens das coleções <small>${itens.length} ${itens.length === 1 ? 'resultado' : 'resultados'}${itens.length === 60 ? ' (mostrando os 60 primeiros)' : ''}</small></h2>
${gradeItens('', itens)}
                </section>` : ''}`;
  }
  return pagina({
    titulo: q ? `Busca: ${q} :: HB Hub` : 'Busca :: HB Hub',
    descricao: 'Procure posts e itens das coleções do HB Hub.',
    aqui: 'busca',
    noindex: true,
    miolo: `                <h1 class="bem-vindo">Busca</h1>

${form}
${corpo}`,
  });
}

function livroVisitas({ pag = 1, aviso = '', erro = '', valores = {} } = {}) {
  const total = db.contarAprovados();
  const recados = db.recadosAprovados(POR_PAGINA, (pag - 1) * POR_PAGINA);
  const lista = recados.length
    ? `<ol class="recados">
${recados.map((r) => `                    <li class="recado">
                        <div class="recado-cab"><b>${esc(r.nome)}</b>${r.site ? ` &middot; <a href="${esc(r.site)}" rel="nofollow ugc noopener" target="_blank">site</a>` : ''}<span>${diaDe(r.criado_em)}</span></div>
                        <p>${comQuebras(r.mensagem)}</p>
                    </li>`).join('\n')}
                </ol>${paginacao('/livro-de-visitas', pag, total)}`
    : '<p>Ninguém assinou ainda. Seja o primeiro!</p>';
  return pagina({
    titulo: 'Livro de visitas :: HB Hub',
    descricao: 'Assine o livro de visitas do HB Hub e deixe um recado.',
    aqui: 'recados',
    seo: { caminho: '/livro-de-visitas' },
    miolo: `                <h1 class="bem-vindo">Livro de visitas</h1>

                <p>Passou por aqui? Deixa um recado! Ele aparece depois que o webmaster der uma olhada (contra spam).</p>
${aviso ? `
                <p class="aviso-ok">${esc(aviso)}</p>` : ''}${erro ? `
                <p class="aviso-erro">${esc(erro)}</p>` : ''}

                <section class="painel">
                    <h2>Assinar o livro</h2>
                    <form class="dentro form-recado" method="post" action="/livro-de-visitas">
                        <label>Nome ou apelido <input name="nome" maxlength="40" required value="${esc(valores.nome || '')}"></label>
                        <label>Seu site (opcional) <input name="site" maxlength="300" placeholder="https://..." value="${esc(valores.site || '')}"></label>
                        <label class="armadilha" aria-hidden="true">Não preencha isto <input name="email" tabindex="-1" autocomplete="off"></label>
                        <label>Recado <textarea name="mensagem" maxlength="1000" rows="5" required>${esc(valores.mensagem || '')}</textarea></label>
                        ${captcha.campo()}
                        <button class="botao">Assinar &#8250;</button>
                    </form>
                </section>

                <section class="painel">
                    <h2>Quem já passou por aqui <small>${total} ${total === 1 ? 'recado' : 'recados'}</small></h2>
                    <div class="dentro">
                ${lista}
                    </div>
                </section>`,
  });
}

const AVISOS_VOTO = {
  ok: 'Voto registrado! Valeu por participar.',
  repetido: 'Você já tinha votado nessa enquete. Um voto por pessoa!',
  vazio: 'Escolhe uma opção antes de votar.',
  encerrada: 'Essa enquete já foi encerrada.',
};

function resultadoEnquete(e) {
  return `                <section class="painel">
                    <h2>${esc(e.pergunta)} <small>${e.total} ${e.total === 1 ? 'voto' : 'votos'}${e.ativa ? '' : ' &middot; encerrada'}</small></h2>
                    <div class="dentro resultado-enquete">
${e.opcoes.map((o) => {
    const pct = e.total ? Math.round((o.votos / e.total) * 100) : 0;
    return `                        <div class="opcao"><span>${esc(o.texto)}</span><span class="barra"><i style="width:${pct}%"></i></span><b>${pct}% (${o.votos})</b></div>`;
  }).join('\n')}
                    </div>
                </section>`;
}

function enquete(voto) {
  const aviso = Object.hasOwn(AVISOS_VOTO, voto) ? AVISOS_VOTO[voto] : '';
  const todas = db.enquetes().map(site.enqueteComOpcoes);
  const e = todas.find((x) => x.ativa) || todas[0];
  const anteriores = todas.filter((x) => x !== e);
  const corpo = e
    ? resultadoEnquete(e) + (anteriores.length ? `

                <h2 class="subtitulo">Enquetes anteriores</h2>
${anteriores.map(resultadoEnquete).join('\n')}` : '')
    : emObras('Sem enquete', 'Nenhuma enquete no ar agora. Volte mais tarde!');
  return pagina({
    titulo: 'Enquete :: HB Hub',
    descricao: 'Resultado da enquete do HB Hub.',
    noindex: true,
    seo: { caminho: '/enquete' },
    miolo: `                <h1 class="bem-vindo">Enquete do HB</h1>
${aviso ? `
                <p class="${voto === 'ok' ? 'aviso-ok' : 'aviso-erro'}">${aviso}</p>` : ''}

${corpo}

                <p>Um voto por visitante, sem cookie: o site guarda só uma impressão digital embaralhada, não o seu IP.</p>`,
  });
}

function links() {
  const lista = db.links();
  const corpo = lista.length
    ? `                <div class="botoes-amigos">
${lista.map((l) => (l.botao
    ? `                    <a href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.nome)}"><img src="${esc(arquivoLocal(l.botao))}" width="88" height="31" alt="${esc(l.nome)}"></a>`
    : `                    <a class="b88 b-amigo" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.nome)}</a>`)).join('\n')}
                </div>`
    : emObras('Em construção', 'Ainda tô juntando os botões dos sites amigos. Volte mais tarde!');
  return pagina({
    titulo: 'Links :: HB Hub',
    descricao: 'Sites amigos e links legais, com botões 88x31 como nos velhos tempos.',
    aqui: 'links',
    noindex: !lista.length,
    seo: { caminho: '/links' },
    miolo: `                <h1 class="bem-vindo">Links</h1>

                <p>Sites amigos e lugares legais da internet. Clica num botão e vai lá!</p>

${corpo}`,
  });
}

function novidades() {
  const lista = db.novidades();
  return pagina({
    titulo: 'O que há de novo :: HB Hub',
    descricao: 'Tudo que mudou no HB Hub.',
    noindex: !lista.length,
    seo: { caminho: '/novidades' },
    miolo: `                <h1 class="bem-vindo">O que há de novo</h1>

${lista.length ? `                <section class="painel">
                    <h2>Diário de bordo do site</h2>
                    ${listaNovidades(lista)}
                </section>` : emObras('Nada ainda', 'Quando o site mudar, aparece aqui.')}`,
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
    seo: { caminho: '/chat' },
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

module.exports = { inicio, listaSecao, porTag, arquivoMes, busca, post, colecoes, colecao, itemColecao, livroVisitas, enquete, links, novidades, salaChat, erro, POR_PAGINA };

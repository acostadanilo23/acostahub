const cfg = require('../config');
const { esc } = require('../markdown');
const { versao } = require('../estaticos');
const { dataBR, agoraLocal } = require('../util');
const { FAVICON, SECOES, urlPost, modalErro } = require('./layout');

function casca(titulo, corpo, { js = false, classe = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${esc(titulo)} :: Painel do Webmaster</title>
    <link rel="icon" href="${FAVICON}">
    <link rel="stylesheet" href="${versao('/css/styles.css')}">
    <link rel="stylesheet" href="${versao('/admin/admin.css')}">${js ? `
    <script src="${versao('/js/avisos.js')}" defer></script>
    <script src="${versao('/admin/admin.js')}" defer></script>` : ''}
</head>

<body class="adm ${classe}">
${corpo}
</body>

</html>
`;
}

function barra(atual = '') {
  return `    <header class="adm-barra">
        <a class="adm-logo" href="/admin"><b>H</b><i>B</i> <span>Painel do Webmaster</span></a>
        <nav>
            <a href="/admin"${atual === 'posts' ? ' class="aqui"' : ''}>Posts</a>
            <a href="/admin/novo"${atual === 'novo' ? ' class="aqui"' : ''}>+ Escrever</a>
            <a href="/" target="_blank">Ver site &#8599;</a>
            <form method="post" action="/admin/sair"><button>Sair</button></form>
        </nav>
    </header>`;
}

function login(erro = '', usuario = '') {
  return casca('Entrar', `    <main class="janela-login">
        <div class="janela">
            <div class="janela-titulo"><span>&#128274; Área restrita</span><i>&times;</i></div>
            <form class="janela-corpo" method="post" action="/admin/entrar">
                <p><b>Só o webmaster passa daqui.</b><br>Se você não é o HB, volte pro <a href="/">site</a>. &#128064;</p>
                <label>Usuário <input name="usuario" value="${esc(usuario)}" autocomplete="username" required autofocus></label>
                <label>Senha <input name="senha" type="password" autocomplete="current-password" required></label>
                <button class="btn">Entrar &#8250;</button>
            </form>
        </div>
    </main>${erro ? modalErro({ titulo: 'Não deu pra entrar', mensagem: esc(erro), okHref: '#fechou-erro', okTexto: 'Tentar de novo' }) : ''}`, { classe: 'adm-login' });
}

function situacao(p) {
  if (p.status !== 'publicado') return '<span class="sit rascunho">rascunho</span>';
  if (p.publicado_em > agoraLocal()) return '<span class="sit agendado">agendado</span>';
  return '<span class="sit publicado">publicado</span>';
}

function visitas(rel, online) {
  const max = Math.max(1, ...rel.dias.map((d) => d.visualizacoes));
  const barras = rel.dias.map((d) => `
                <div class="barra-dia" title="${dataBR(d.dia + 'T00:00')}: ${d.visitantes} visitantes, ${d.visualizacoes} páginas">
                    <span class="pv" style="height:${Math.round((d.visualizacoes / max) * 100)}%"></span>
                    <span class="uv" style="height:${Math.round((d.visitantes / max) * 100)}%"></span>
                    <small>${d.dia.slice(8, 10)}</small>
                </div>`).join('');
  const paginas = rel.paginas.map((p) => `<tr><td><a href="${esc(p.caminho)}" target="_blank">${esc(p.caminho)}</a></td><td>${p.hits}</td></tr>`).join('');
  return `
        <section class="painel">
            <h2>Contador de visitas <small>sem cookie, robôs e você não contam</small></h2>
            <div class="dentro">
                <div class="adm-numeros">
                    <div><b>${rel.hoje.visitantes}</b>visitantes hoje</div>
                    <div><b>${rel.hoje.visualizacoes}</b>páginas hoje</div>
                    <div><b>${rel.totais.visitantes}</b>visitantes no total</div>
                    <div><b>${online}</b><a href="/chat" target="_blank">no bate-papo agora</a></div>
                </div>
                <div class="grafico" aria-label="Visitas dos últimos 14 dias">${barras}
                </div>
                <p class="legenda"><i class="pv"></i> páginas vistas <i class="uv"></i> visitantes &middot; últimos 14 dias</p>
                ${paginas ? `<table class="adm-tabela"><tr><th>Página mais vista</th><th>Visitas</th></tr>${paginas}</table>` : ''}
            </div>
        </section>`;
}

function painel(posts, anexos, rel, online) {
  const pub = posts.filter((p) => p.status === 'publicado').length;
  const bytes = anexos.reduce((s, a) => s + a.tamanho, 0);
  const linhas = posts.map((p) => `
                <tr>
                    <td><a class="tit" href="/admin/editar/${p.id}">${esc(p.titulo)}</a><small>${urlPost(p)}</small></td>
                    <td>${SECOES[p.secao]}</td>
                    <td>${situacao(p)}</td>
                    <td>${dataBR(p.publicado_em) || '&mdash;'}</td>
                    <td class="acoes">
                        <a href="/admin/editar/${p.id}">editar</a>
                        <a href="/admin/ver/${p.id}" target="_blank">ver</a>
                        <button class="link-perigo" data-excluir="${p.id}" data-titulo="${esc(p.titulo)}">excluir</button>
                    </td>
                </tr>`).join('');

  return casca('Posts', `${barra('posts')}
    <main class="adm-miolo">
        <div class="adm-numeros">
            <div><b>${pub}</b>publicados</div>
            <div><b>${posts.length - pub}</b>rascunhos</div>
            <div><b>${anexos.length}</b>arquivos</div>
            <div><b>${bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`}</b>em anexos</div>
        </div>

        <section class="painel">
            <h2>Todos os posts <small><a href="/admin/novo">+ escrever novo post</a></small></h2>
            ${posts.length ? `<table class="adm-tabela adm-posts">
                <tr><th>Título</th><th>Seção</th><th>Situação</th><th>Data</th><th></th></tr>${linhas}
            </table>` : '<p class="dentro">Nenhum post ainda. <a href="/admin/novo">Escreve o primeiro!</a></p>'}
        </section>
${visitas(rel, online)}
    </main>`, { js: true });
}

const AJUDA = [
  ['**negrito**', '<b>negrito</b>'],
  ['*itálico*', '<i>itálico</i>'],
  ['~~riscado~~', '<s>riscado</s>'],
  ['## Título', 'intertítulo'],
  ['[texto](https://...)', 'link'],
  ['![legenda](url "legenda")', 'imagem'],
  ['- item', 'lista'],
  ['> citação', 'citação'],
  ['`código`', 'código'],
  [':::fluxo ... :::', 'caixa verde de terminal'],
  [':::aviso ... :::', 'post-it amarelo'],
  ['---', 'linha'],
];

function editor(p) {
  const novo = !p;
  p = p || { id: '', titulo: '', slug: '', secao: 'blog', tags: '', resumo: '', tldr: '', conteudo: '', status: 'rascunho', publicado_em: '' };
  const dados = {
    id: p.id, atualizado_em: p.atualizado_em || '', status: p.status,
    publicado_em: p.publicado_em, url: p.id ? urlPost(p) : '',
  };
  const opcoes = Object.entries(SECOES).map(([k, n]) => `<option value="${k}"${p.secao === k ? ' selected' : ''}>${n}</option>`).join('');

  return casca(novo ? 'Novo post' : `Editando: ${p.titulo}`, `${barra(novo ? 'novo' : '')}
    <form id="editor" class="editor" data-post='${esc(JSON.stringify(dados))}' data-max-mb="${cfg.UPLOAD_MAX_MB}" autocomplete="off">
        <div class="ed-principal">
            <input id="titulo" name="titulo" class="ed-titulo" placeholder="Título do post" value="${esc(p.titulo)}" maxlength="200" required>
            <div class="ed-slug">endereço: <span id="slug-secao">/${p.secao}/</span><input id="slug" name="slug" value="${esc(p.slug)}" placeholder="gerado-pelo-titulo" maxlength="80"></div>

            <div class="ed-ferramentas" role="toolbar" aria-label="Formatação">
                <button type="button" data-f="negrito" title="Negrito (Ctrl+B)"><b>B</b></button>
                <button type="button" data-f="italico" title="Itálico (Ctrl+I)"><i>I</i></button>
                <button type="button" data-f="riscado" title="Riscado"><s>S</s></button>
                <span class="sep"></span>
                <button type="button" data-f="h2" title="Intertítulo">H2</button>
                <button type="button" data-f="h3" title="Subtítulo">H3</button>
                <span class="sep"></span>
                <button type="button" data-f="link" title="Link (Ctrl+K)">&#128279;</button>
                <button type="button" data-f="lista" title="Lista">&#8226; lista</button>
                <button type="button" data-f="numerada" title="Lista numerada">1. lista</button>
                <button type="button" data-f="citacao" title="Citação">&ldquo; &rdquo;</button>
                <button type="button" data-f="codigo" title="Código">&lt;/&gt;</button>
                <button type="button" data-f="bloco" title="Bloco de código">{ }</button>
                <button type="button" data-f="fluxo" title="Caixa verde de terminal">&gt;_</button>
                <button type="button" data-f="aviso" title="Post-it amarelo">&#128221;</button>
                <button type="button" data-f="linha" title="Linha horizontal">&mdash;</button>
                <span class="sep"></span>
                <button type="button" data-f="anexo" class="destacado" title="Enviar imagem ou arquivo">&#128206; Anexar</button>
                <span class="ed-modos">
                    <button type="button" data-modo="escrever">Escrever</button>
                    <button type="button" data-modo="dividido">Dividido</button>
                    <button type="button" data-modo="previa">Prévia</button>
                </span>
            </div>

            <div class="ed-area" id="area">
                <textarea id="conteudo" name="conteudo" spellcheck="true" placeholder="Escreve aqui... (dá pra arrastar ou colar imagens direto)">${esc(p.conteudo)}</textarea>
                <div class="ed-previa"><article id="previa" class="post"></article></div>
                <div class="ed-soltar">Solta o arquivo aqui &#128229;</div>
            </div>

            <div class="ed-status"><span id="contagem">0 palavras</span><span id="estado">${novo ? 'post novo, ainda não salvo' : 'tudo salvo'}</span></div>
        </div>

        <aside class="ed-lateral">
            <section class="caixa">
                <h3>Publicação</h3>
                <div class="ed-botoes">
                    <button type="button" class="btn cinza" data-acao="rascunho">${p.status === 'publicado' ? 'Despublicar' : 'Salvar rascunho'}</button>
                    <button type="button" class="btn" data-acao="publicar">${p.status === 'publicado' ? 'Atualizar' : 'Publicar'}</button>
                </div>
                <p class="ed-situacao">Situação: <b id="situacao">${p.status}</b><span id="links-post"></span></p>
                <label>Data de publicação <input type="datetime-local" id="publicado_em" name="publicado_em" value="${esc(p.publicado_em)}"></label>
                <small>vazio = agora. Data no futuro = agendado.</small>
                <label>Seção <select id="secao" name="secao">${opcoes}</select></label>
                <label>Tags <input id="tags" name="tags" value="${esc(p.tags)}" placeholder="PS2, Open Source"></label>
                <small>separadas por vírgula</small>
            </section>

            <section class="caixa">
                <h3>Resumo</h3>
                <label>Linha fina / descrição <textarea id="resumo" name="resumo" rows="3" maxlength="300" placeholder="aparece no Google e no RSS">${esc(p.resumo)}</textarea></label>
                <label>TL;DR (um por linha) <textarea id="tldr" name="tldr" rows="4" placeholder="vira o post-it amarelo do post">${esc(p.tldr)}</textarea></label>
            </section>

            <section class="caixa">
                <h3>Anexos</h3>
                <input type="file" id="arquivo" multiple hidden accept="image/webp,image/png,image/jpeg,image/gif,.pdf,.zip,.mp3,.txt">
                <button type="button" class="btn azul largo" data-f="anexo">&#128206; Enviar arquivos</button>
                <label class="ed-check"><input type="checkbox" id="otimizar" checked> otimizar imagens (WebP, até 1280px)</label>
                <small>imagens, PDF, ZIP, MP3, TXT &middot; até ${cfg.UPLOAD_MAX_MB} MB</small>
                <ul id="biblioteca" class="biblioteca"><li class="vazio">carregando&hellip;</li></ul>
            </section>

            <section class="caixa">
                <h3>Colinha de Markdown</h3>
                <table class="colinha">${AJUDA.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${b}</td></tr>`).join('')}</table>
                <small>Atalhos: Ctrl+S salva, Ctrl+B, Ctrl+I, Ctrl+K</small>
            </section>
            <button type="button" class="link-perigo" id="excluir-post" data-excluir="${p.id}" data-titulo="${esc(p.titulo)}"${novo ? ' hidden' : ''}>excluir este post</button>
        </aside>
    </form>`, { js: true, classe: 'adm-editor' });
}

module.exports = { login, painel, editor };

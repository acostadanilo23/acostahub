const cfg = require('../config');
const { esc } = require('../markdown');
const { versao } = require('../estaticos');
const { dataBR, agoraLocal } = require('../util');
const { FAVICON, SECOES, urlPost, modalErro, arquivoLocal } = require('./layout');
const db = require('../db');

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
  const pendentes = db.contarPendentes();
  return `    <header class="adm-barra">
        <a class="adm-logo" href="/admin"><b>H</b><i>B</i> <span>Painel do Webmaster</span></a>
        <nav>
            <a href="/admin"${atual === 'posts' ? ' class="aqui"' : ''}>Posts</a>
            <a href="/admin/colecoes"${atual === 'colecoes' ? ' class="aqui"' : ''}>Coleções</a>
            <a href="/admin/recados"${atual === 'recados' ? ' class="aqui"' : ''}>Recados${pendentes ? ` <b class="pendentes">${pendentes}</b>` : ''}</a>
            <a href="/admin/site"${atual === 'site' ? ' class="aqui"' : ''}>Site</a>
            <a href="/admin/decoracao"${atual === 'decoracao' ? ' class="aqui"' : ''}>Decoração</a>
            <a href="/admin/novo"${atual === 'novo' ? ' class="aqui"' : ''}>+ Escrever</a>
            <a href="/" target="_blank">Ver site</a>
            <form method="post" action="/admin/sair"><button>Sair</button></form>
        </nav>
    </header>`;
}

function login(erro = '', usuario = '') {
  return casca('Entrar', `    <main class="janela-login">
        <div class="janela">
            <div class="janela-titulo"><span>Área restrita</span><i>&times;</i></div>
            <form class="janela-corpo" method="post" action="/admin/entrar">
                <p><b>Só o webmaster passa daqui.</b><br>Se você não é o HB, volte pro <a href="/">site</a>.</p>
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
                <button type="button" data-f="link" title="Link (Ctrl+K)">link</button>
                <button type="button" data-f="lista" title="Lista">&#8226; lista</button>
                <button type="button" data-f="numerada" title="Lista numerada">1. lista</button>
                <button type="button" data-f="citacao" title="Citação">&ldquo; &rdquo;</button>
                <button type="button" data-f="codigo" title="Código">&lt;/&gt;</button>
                <button type="button" data-f="bloco" title="Bloco de código">{ }</button>
                <button type="button" data-f="fluxo" title="Caixa verde de terminal">&gt;_</button>
                <button type="button" data-f="aviso" title="Post-it amarelo">post-it</button>
                <button type="button" data-f="linha" title="Linha horizontal">&mdash;</button>
                <span class="sep"></span>
                <button type="button" data-f="anexo" class="destacado" title="Enviar imagem ou arquivo">Anexar</button>
                <span class="ed-modos">
                    <button type="button" data-modo="escrever">Escrever</button>
                    <button type="button" data-modo="dividido">Dividido</button>
                    <button type="button" data-modo="previa">Prévia</button>
                </span>
            </div>

            <div class="ed-area" id="area">
                <textarea id="conteudo" name="conteudo" spellcheck="true" placeholder="Escreve aqui... (dá pra arrastar ou colar imagens direto)">${esc(p.conteudo)}</textarea>
                <div class="ed-previa"><article id="previa" class="post"></article></div>
                <div class="ed-soltar">Solta o arquivo aqui</div>
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
                <button type="button" class="btn azul largo" data-f="anexo">Enviar arquivos</button>
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

const ESTILOS_CARTUCHO = [
  { id: 'p-ps1', nome: 'Cinza (PlayStation 1)' },
  { id: 'p-ps2', nome: 'Azul escuro + logo PlayStation girando (PS2)' },
  { id: 'p-ps3', nome: 'Preto fumê + logo PS3 animado (PS3)' },
  { id: 'p-consoles', nome: 'Preto fumê + consoles animados (Consoles)' },
  { id: 'p-ps4', nome: 'Azul royal + logo PS4 animado (PS4)' },
  { id: 'p-xbox', nome: 'Preto e verde + logo Xbox animado (Xbox)' },
  { id: 'p-n64', nome: 'Logo N64 girando (Nintendo 64)' },
  { id: 'p-wii', nome: 'Branco / Azul + logo Wii animado (Wii)' },
  { id: 'p-livros', nome: 'Madeira + leitor animado (Livros)' },
  { id: 'p-filmes', nome: 'Película + DVD girando (Filmes)' },
  { id: 'p-pc', nome: 'Bege retrô + computador girando (PC)' },
];

function opcoesEstilo(selecionado = 'p-ps1') {
  return ESTILOS_CARTUCHO.map((e) => `<option value="${e.id}"${e.id === selecionado ? ' selected' : ''}>${esc(e.nome)}</option>`).join('');
}

function colecoes(lista) {
  const visiveis = lista.filter((c) => c.visivel).length;
  const totalItens = lista.reduce((s, c) => s + (c.total_itens || 0), 0);

  const linhas = lista.map((c, i) => `
                <tr data-col-id="${c.id}">
                    <td class="col-estilo"><span class="amostra-cartucho ${esc(c.estilo)}" title="${esc(c.estilo)}"></span></td>
                    <td>
                        <a class="tit" href="/admin/colecoes/${c.id}">${esc(c.nome)}</a>
                        ${c.subtitulo ? `<small>${esc(c.subtitulo)}</small>` : ''}
                        <small class="slug-info"><a href="/colecoes/${esc(c.slug)}" target="_blank">/colecoes/${esc(c.slug)}</a></small>
                    </td>
                    <td>${c.grupo === 'videogames' ? 'Videogames' : 'Outros'}</td>
                    <td>${c.total_itens || 0} ${c.total_itens === 1 ? 'item' : 'itens'}</td>
                    <td><span class="sit ${c.visivel ? 'publicado' : 'rascunho'}">${c.visivel ? 'visível' : 'oculto'}</span></td>
                    <td class="col-ordem">
                        <button type="button" class="btn-ordem" data-mover-colecao="${c.id}" data-dir="subir"${i === 0 ? ' disabled' : ''} title="Subir">&#9650;</button>
                        <button type="button" class="btn-ordem" data-mover-colecao="${c.id}" data-dir="descer"${i === lista.length - 1 ? ' disabled' : ''} title="Descer">&#9660;</button>
                    </td>
                    <td class="acoes">
                        <a class="link-acao" href="/admin/colecoes/${c.id}">itens</a>
                        <button type="button" class="link-acao" data-visibilidade-colecao="${c.id}" data-visivel="${c.visivel ? '0' : '1'}">${c.visivel ? 'esconder' : 'mostrar'}</button>
                        <button type="button" class="link-acao" data-editar-colecao='${esc(JSON.stringify(c))}'>editar</button>
                        <button type="button" class="link-perigo" data-excluir-colecao="${c.id}" data-nome="${esc(c.nome)}" data-itens="${c.total_itens || 0}">excluir</button>
                    </td>
                </tr>`).join('');

  return casca('Coleções', `${barra('colecoes')}
    <main class="adm-miolo">
        <div class="adm-numeros">
            <div><b>${lista.length}</b>coleções</div>
            <div><b>${visiveis}</b>visíveis</div>
            <div><b>${lista.length - visiveis}</b>ocultas</div>
            <div><b>${totalItens}</b>itens catalogados</div>
        </div>

        <section class="painel">
            <h2>Todas as coleções <small>organize e gerencie sua estante</small></h2>
            ${lista.length ? `<table class="adm-tabela adm-colecoes">
                <tr><th>Cor</th><th>Coleção</th><th>Grupo</th><th>Itens</th><th>Situação</th><th>Ordem</th><th></th></tr>
                ${linhas}
            </table>` : '<p class="dentro">Nenhuma coleção cadastrada.</p>'}
        </section>

        <section class="painel" style="margin-top: 16px;">
            <h2>+ Nova coleção</h2>
            <form id="form-nova-colecao" class="form-colecao dentro" autocomplete="off">
                <div class="campo">
                    <label for="novo-nome">Nome da coleção</label>
                    <input id="novo-nome" name="nome" placeholder="Ex: Game Boy Advance" maxlength="100" required>
                    <small>O endereço (slug) será gerado automaticamente a partir do nome.</small>
                </div>
                <div class="campo">
                    <label for="novo-subtitulo">Subtítulo (opcional)</label>
                    <input id="novo-subtitulo" name="subtitulo" placeholder="Ex: Portáteis da Nintendo" maxlength="150">
                </div>
                <div class="campo-duplo">
                    <div class="campo">
                        <label for="novo-grupo">Grupo</label>
                        <select id="novo-grupo" name="grupo">
                            <option value="videogames">Videogames</option>
                            <option value="outros">Outros</option>
                        </select>
                    </div>
                    <div class="campo">
                        <label for="novo-estilo">Cor do cartucho</label>
                        <select id="novo-estilo" name="estilo">
                            ${opcoesEstilo()}
                        </select>
                    </div>
                </div>
                <div class="form-acoes">
                    <button type="submit" class="btn">Criar coleção &#8250;</button>
                </div>
            </form>
        </section>
    </main>

    <dialog id="modal-editar-colecao" class="janela modal-colecao" aria-labelledby="modal-ed-titulo">
        <div class="janela-titulo"><span id="modal-ed-titulo">Editar Coleção</span><button type="button" class="fechar" aria-label="Fechar">&times;</button></div>
        <form id="form-editar-colecao" class="janela-corpo" autocomplete="off">
            <input type="hidden" id="ed-id" name="id">
            <label>Nome <input id="ed-nome" name="nome" maxlength="100" required></label>
            <label>Subtítulo <input id="ed-subtitulo" name="subtitulo" maxlength="150"></label>
            <div class="campo-duplo">
                <label>Grupo
                    <select id="ed-grupo" name="grupo">
                        <option value="videogames">Videogames</option>
                        <option value="outros">Outros</option>
                    </select>
                </label>
                <label>Cor do cartucho
                    <select id="ed-estilo" name="estilo">
                        ${opcoesEstilo()}
                    </select>
                </label>
            </div>
            <p class="aviso-slug"><small>O endereço original (<code id="ed-slug-preview"></code>) é mantido para não quebrar links.</small></p>
            <div class="modal-botoes-form">
                <button type="button" class="btn cinza fechar-modal">Cancelar</button>
                <button type="submit" class="btn">Salvar alterações</button>
            </div>
        </form>
    </dialog>`, { js: true });
}

const ESTADOS_COMUNS = ['completo', 'na caixa', 'só mídia', 'só disco', 'lacrado', 'sem caixa', 'com manual', 'incompleto'];
const REGIOES_COMUNS = ['NTSC-U', 'NTSC-J', 'PAL', 'BR', 'Americano', 'Japonês', 'Europeu'];

function colecaoItens(c, itens, anexos) {
  const dados = itens.map((i) => ({
    id: i.id, titulo: i.titulo, ano: i.ano, regiao: i.regiao,
    estado: i.estado, observacoes: i.observacoes, foto: i.foto,
  }));
  const total = itens.length;
  const opcoesLista = (id, valores) => `<datalist id="${id}">${valores.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;

  const campoFoto = (prefixo) => `
                <div class="campo campo-foto">
                    <label>Foto</label>
                    <div class="foto-escolha">
                        <span class="foto-preview" id="${prefixo}-foto-preview">sem foto</span>
                        <span class="foto-botoes">
                            <button type="button" class="btn cinza" data-escolher-foto="${prefixo}">Escolher / enviar foto</button>
                            <button type="button" class="link-perigo" data-limpar-foto="${prefixo}" hidden>remover foto</button>
                        </span>
                        <input type="hidden" id="${prefixo}-foto" name="foto" value="">
                    </div>
                </div>`;

  return casca(`Itens: ${c.nome}`, `${barra('colecoes')}
    <main class="adm-miolo">
        <p class="voltar-itens"><a href="/admin/colecoes">&laquo; todas as coleções</a></p>
        <div class="adm-numeros">
            <div><b>${total}</b>${total === 1 ? 'item' : 'itens'}</div>
            <div><span class="amostra-cartucho ${esc(c.estilo)}" style="width:40px;height:20px"></span><span style="display:block;margin-top:4px">cor</span></div>
            <div><b>${c.grupo === 'videogames' ? 'VG' : 'Outros'}</b>grupo</div>
            <div><b>${c.visivel ? 'sim' : 'não'}</b><a href="/colecoes/${esc(c.slug)}" target="_blank">ver no site</a></div>
        </div>

        <section class="painel" id="pagina-itens" data-colecao-id="${c.id}" data-max-mb="${cfg.UPLOAD_MAX_MB}" data-itens='${esc(JSON.stringify(dados))}'>
            <h2>Itens de ${esc(c.nome)} <small>catalogue os itens desta coleção</small></h2>
            <div class="itens-controles dentro">
                <input type="search" id="busca-itens" placeholder="Filtrar por título&hellip;" autocomplete="off">
                <span class="itens-ordenar">
                    ordenar:
                    <button type="button" class="link-acao" data-ordenar="titulo" data-dir="asc">título A&ndash;Z</button>
                    <button type="button" class="link-acao" data-ordenar="titulo" data-dir="desc">título Z&ndash;A</button>
                    <button type="button" class="link-acao" data-ordenar="ano" data-dir="asc">ano &#9650;</button>
                    <button type="button" class="link-acao" data-ordenar="ano" data-dir="desc">ano &#9660;</button>
                </span>
            </div>
            <div class="itens-csv dentro">
                <a class="link-acao" href="/api/colecoes/${c.id}/exportar.csv">Exportar CSV</a>
                <button type="button" class="link-acao" id="btn-importar-csv">Importar CSV</button>
                <input type="file" id="csv-arquivo" accept=".csv,text/csv" hidden>
                <small>colunas: título, ano, região, estado, observações</small>
            </div>
            <table class="adm-tabela adm-itens">
                <thead><tr><th>Foto</th><th>Título</th><th>Ano</th><th>Estado</th><th>Ordem</th><th></th></tr></thead>
                <tbody id="lista-itens"></tbody>
            </table>
            <p class="itens-vazio dentro" hidden>Nenhum item ainda. Cadastre o primeiro no formulário abaixo.</p>
            <p class="itens-nada-encontrado dentro" hidden>Nenhum item bate com a busca.</p>
        </section>

        <section class="painel" style="margin-top:16px">
            <h2>+ Adicionar item</h2>
            <form id="form-novo-item" class="form-colecao form-item dentro" autocomplete="off">
                <div class="campo">
                    <label for="novo-item-titulo">Título</label>
                    <input id="novo-item-titulo" name="titulo" placeholder="Ex: Gran Turismo 4" maxlength="200" required>
                    <small>Só o título é obrigatório. Depois de salvar, o formulário já fica pronto pro próximo.</small>
                </div>
                <div class="campo-triplo">
                    <div class="campo">
                        <label for="novo-item-ano">Ano</label>
                        <input id="novo-item-ano" name="ano" placeholder="Ex: 2004" maxlength="20">
                    </div>
                    <div class="campo">
                        <label for="novo-item-regiao">Região</label>
                        <input id="novo-item-regiao" name="regiao" list="regioes-comuns" maxlength="50">
                    </div>
                    <div class="campo">
                        <label for="novo-item-estado">Estado</label>
                        <input id="novo-item-estado" name="estado" list="estados-comuns" maxlength="50">
                    </div>
                </div>
                <div class="campo">
                    <label for="novo-item-observacoes">Observações</label>
                    <textarea id="novo-item-observacoes" name="observacoes" rows="3" maxlength="4000" placeholder="detalhes, história, defeitos&hellip; (aparece na página do item)"></textarea>
                </div>
                ${campoFoto('novo-item')}
                <div class="form-acoes">
                    <button type="submit" class="btn">Adicionar item &#8250;</button>
                    <span class="item-salvo" hidden>item adicionado!</span>
                </div>
            </form>
        </section>
    </main>

    ${opcoesLista('estados-comuns', ESTADOS_COMUNS)}
    ${opcoesLista('regioes-comuns', REGIOES_COMUNS)}

    <dialog id="modal-editar-item" class="janela modal-colecao" aria-labelledby="modal-item-titulo">
        <div class="janela-titulo"><span id="modal-item-titulo">Editar item</span><button type="button" class="fechar" aria-label="Fechar">&times;</button></div>
        <form id="form-editar-item" class="janela-corpo form-colecao" autocomplete="off">
            <input type="hidden" id="ed-item-id" name="id">
            <div class="campo"><label>Título <input id="ed-item-titulo" name="titulo" maxlength="200" required></label></div>
            <div class="campo-triplo">
                <div class="campo"><label>Ano <input id="ed-item-ano" name="ano" maxlength="20"></label></div>
                <div class="campo"><label>Região <input id="ed-item-regiao" name="regiao" list="regioes-comuns" maxlength="50"></label></div>
                <div class="campo"><label>Estado <input id="ed-item-estado" name="estado" list="estados-comuns" maxlength="50"></label></div>
            </div>
            <div class="campo"><label>Observações / história <textarea id="ed-item-observacoes" name="observacoes" rows="6" maxlength="4000"></textarea></label></div>
            ${campoFoto('ed-item')}
            <div class="modal-botoes-form">
                <button type="button" class="btn cinza fechar-modal">Cancelar</button>
                <button type="submit" class="btn">Salvar alterações</button>
            </div>
        </form>
    </dialog>

    <dialog id="modal-foto" class="janela modal-colecao modal-foto" aria-labelledby="modal-foto-titulo">
        <div class="janela-titulo"><span id="modal-foto-titulo">Escolher foto</span><button type="button" class="fechar" aria-label="Fechar">&times;</button></div>
        <div class="janela-corpo">
            <div class="foto-enviar">
                <input type="file" id="foto-arquivo" hidden accept="image/webp,image/png,image/jpeg,image/gif">
                <button type="button" class="btn azul" id="btn-enviar-foto">Enviar nova imagem</button>
                <label class="ed-check"><input type="checkbox" id="foto-otimizar" checked> otimizar (WebP, até 1280px)</label>
                <span class="foto-status"></span>
            </div>
            <ul id="foto-biblioteca" class="foto-biblioteca"><li class="vazio">carregando&hellip;</li></ul>
        </div>
    </dialog>`, { js: true });
}

const fmtQuando = new Intl.DateTimeFormat('pt-BR', { timeZone: cfg.FUSO, dateStyle: 'short', timeStyle: 'short' });

function recados(lista) {
  const pendentes = lista.filter((r) => !r.aprovado).length;
  const linhas = lista.map((r) => `
                <tr>
                    <td>${r.aprovado ? '<span class="sit publicado">no ar</span>' : '<span class="sit agendado">pendente</span>'}</td>
                    <td>
                        <span class="tit">${esc(r.nome)}</span>${r.site ? `<small><a href="${esc(r.site)}" target="_blank" rel="noopener nofollow">${esc(r.site)}</a></small>` : ''}
                        <div class="recado-texto">${esc(r.mensagem)}</div>
                    </td>
                    <td>${fmtQuando.format(new Date(r.criado_em))}</td>
                    <td class="acoes">
                        ${r.aprovado ? '' : `<button type="button" class="link-acao" data-aprovar-recado="${r.id}">aprovar</button>`}
                        <button type="button" class="link-perigo" data-apagar-recado="${r.id}" data-nome="${esc(r.nome)}">apagar</button>
                    </td>
                </tr>`).join('');

  return casca('Recados', `${barra('recados')}
    <main class="adm-miolo">
        <div class="adm-numeros">
            <div><b>${pendentes}</b>esperando aprovação</div>
            <div><b>${lista.length - pendentes}</b>no livro</div>
            <div><b>${lista.length}</b>no total</div>
            <div><b>&nbsp;</b><a href="/livro-de-visitas" target="_blank">ver no site</a></div>
        </div>
        <section class="painel">
            <h2>Livro de visitas <small>recado só aparece no site depois de aprovado</small></h2>
            ${lista.length ? `<table class="adm-tabela adm-recados">
                <tr><th>Situação</th><th>Recado</th><th>Quando</th><th></th></tr>${linhas}
            </table>` : '<p class="dentro">Ninguém assinou ainda.</p>'}
        </section>
    </main>`, { js: true });
}

function opcoesAnexos(anexos, tipos, atual) {
  return anexos.filter((a) => tipos.includes(a.tipo)).map((a) => {
    const url = `/uploads/${a.arquivo}`;
    return `<option value="${esc(url)}"${url === atual ? ' selected' : ''}>${esc(a.nome_original)}</option>`;
  }).join('');
}

function site({ status, todo, musica, enquetes, novidades, links, anexos }) {
  const hoje = agoraLocal().slice(0, 10);
  const listaEnquetes = enquetes.map((e) => `
                <tr>
                    <td>${e.ativa ? '<span class="sit publicado">no ar</span>' : '<span class="sit rascunho">encerrada</span>'}</td>
                    <td><span class="tit">${esc(e.pergunta)}</span>
                        <small>${e.opcoes.map((o) => `${esc(o.texto)}: <b>${o.votos}</b>`).join(' &middot; ')} &middot; total ${e.total}</small></td>
                    <td class="acoes">
                        <button type="button" class="link-acao" data-ativar-enquete="${e.id}" data-ativa="${e.ativa ? 0 : 1}">${e.ativa ? 'encerrar' : 'pôr no ar'}</button>
                        <button type="button" class="link-perigo" data-apagar="/api/enquetes/${e.id}" data-confirmar="Apagar a enquete &quot;${esc(e.pergunta)}&quot; e os votos dela?">apagar</button>
                    </td>
                </tr>`).join('');
  const listaNovidades = novidades.map((n) => `
                <tr><td>${n.dia.split('-').reverse().join('/')}</td><td>${esc(n.texto)}</td>
                    <td class="acoes"><button type="button" class="link-perigo" data-apagar="/api/novidades/${n.id}" data-confirmar="Apagar essa novidade?">apagar</button></td></tr>`).join('');
  const listaLinks = links.map((l, i) => `
                <tr>
                    <td>${l.botao ? `<img src="${esc(arquivoLocal(l.botao))}" width="88" height="31" alt="">` : '<span class="b88-vazio">sem botão</span>'}</td>
                    <td><span class="tit">${esc(l.nome)}</span><small><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></small></td>
                    <td class="col-ordem">
                        <button type="button" class="btn-ordem" data-mover="/api/links/${l.id}/ordem" data-dir="subir"${i === 0 ? ' disabled' : ''} title="Subir">&#9650;</button>
                        <button type="button" class="btn-ordem" data-mover="/api/links/${l.id}/ordem" data-dir="descer"${i === links.length - 1 ? ' disabled' : ''} title="Descer">&#9660;</button>
                    </td>
                    <td class="acoes"><button type="button" class="link-perigo" data-apagar="/api/links/${l.id}" data-confirmar="Apagar o link &quot;${esc(l.nome)}&quot;?">apagar</button></td>
                </tr>`).join('');

  return casca('Site', `${barra('site')}
    <main class="adm-miolo pagina-site" data-max-mb="${cfg.UPLOAD_MAX_MB}">
        <div class="adm-duas">
            <section class="painel">
                <h2>Status <small>caixa da direita</small></h2>
                <form class="dentro form-colecao" data-form="status">
                    <label for="status-texto">Uma linha por item, no formato <code>Rótulo: texto</code></label>
                    <textarea id="status-texto" rows="6" placeholder="Jogando: Gran Turismo 4">${esc(status.map((l) => `${l.rotulo}: ${l.texto}`).join('\n'))}</textarea>
                    <small>até 8 linhas</small>
                    <div class="form-acoes"><button class="btn">Salvar status</button></div>
                </form>
            </section>
            <section class="painel">
                <h2>To-do <small>o post-it amarelo</small></h2>
                <form class="dentro form-colecao" data-form="todo">
                    <label for="todo-texto">Uma tarefa por linha. Comece com <code>x </code> pra riscar (feito).</label>
                    <textarea id="todo-texto" rows="6" placeholder="x fazer o site">${esc(todo.map((i) => `${i.feito ? 'x ' : ''}${i.texto}`).join('\n'))}</textarea>
                    <small>até 20 tarefas</small>
                    <div class="form-acoes"><button class="btn">Salvar to-do</button></div>
                </form>
            </section>
        </div>

        <section class="painel">
            <h2>Enquete <small>a caixa da esquerda; só uma fica no ar por vez</small></h2>
            <form class="dentro form-colecao" data-form="enquete">
                <div class="campo"><label for="enquete-pergunta">Pergunta</label><input id="enquete-pergunta" maxlength="120" placeholder="Qual coleção eu devia catalogar primeiro?"></div>
                <div class="campo"><label for="enquete-opcoes">Opções (uma por linha, de 2 a 8)</label><textarea id="enquete-opcoes" rows="4" placeholder="PS2&#10;Nintendo 64"></textarea></div>
                <div class="form-acoes"><button class="btn">Criar e pôr no ar &#8250;</button> <small>a enquete que estiver no ar é encerrada (os votos dela ficam guardados)</small></div>
            </form>
            ${enquetes.length ? `<table class="adm-tabela">${listaEnquetes}</table>` : ''}
        </section>

        <section class="painel">
            <h2>O que há de novo <small>caixa na página inicial e <a href="/novidades" target="_blank">/novidades</a></small></h2>
            <form class="dentro form-colecao form-linha" data-form="novidade">
                <input type="date" id="novidade-dia" value="${hoje}">
                <input id="novidade-texto" maxlength="200" placeholder="Ex: agora tem livro de visitas!">
                <button class="btn">Adicionar</button>
            </form>
            ${novidades.length ? `<table class="adm-tabela">${listaNovidades}</table>` : ''}
        </section>

        <section class="painel">
            <h2>Links <small>sites amigos em <a href="/links" target="_blank">/links</a>; botão 88x31 é opcional</small></h2>
            <form class="dentro form-colecao" data-form="link">
                <div class="campo-triplo">
                    <div class="campo"><label for="link-nome">Nome</label><input id="link-nome" maxlength="40"></div>
                    <div class="campo"><label for="link-url">Endereço</label><input id="link-url" maxlength="300" placeholder="https://..."></div>
                    <div class="campo"><label for="link-botao">Botão 88x31</label>
                        <select id="link-botao" data-tipos="gif,png,webp,jpg,jpeg"><option value="">(só texto)</option>${opcoesAnexos(anexos, ['gif', 'png', 'webp', 'jpg', 'jpeg'])}</select>
                        <button type="button" class="link-acao" data-enviar-para="link-botao" data-aceita="image/gif,image/png,image/webp,image/jpeg">enviar imagem nova</button></div>
                </div>
                <div class="form-acoes"><button class="btn">Adicionar link</button></div>
            </form>
            ${links.length ? `<table class="adm-tabela">${listaLinks}</table>` : ''}
        </section>

        <section class="painel">
            <h2>Rádio do HB <small>player na coluna da direita; só toca se o visitante apertar o play</small></h2>
            <form class="dentro form-colecao" data-form="musica">
                <div class="campo-duplo">
                    <div class="campo"><label for="musica-src">Música (MP3 da biblioteca)</label>
                        <select id="musica-src" data-tipos="mp3"><option value="">(desligada)</option>${opcoesAnexos(anexos, ['mp3'], musica?.src)}</select>
                        <button type="button" class="link-acao" data-enviar-para="musica-src" data-aceita="audio/mpeg,.mp3">enviar MP3 novo</button></div>
                    <div class="campo"><label for="musica-titulo">Nome que aparece</label><input id="musica-titulo" maxlength="60" value="${esc(musica?.titulo || '')}" placeholder="Rádio do HB"></div>
                </div>
                <small>Navegador não toca MIDI: converta pra MP3 antes (qualquer conversor de MIDI serve).</small>
                <div class="form-acoes"><button class="btn">Salvar rádio</button> <span class="envio-status"></span></div>
            </form>
        </section>
        <input type="file" id="arquivo-site" hidden>
    </main>`, { js: true });
}

const NOMES_LUGAR = { esquerda: 'Coluna da esquerda', direita: 'Coluna da direita', mural: 'Galeria de gifs (antes do rodapé)' };

function decoracao(lista) {
  const blocos = Object.entries(NOMES_LUGAR).map(([lugar, nome]) => {
    const doLugar = lista.filter((m) => m.lugar === lugar);
    const linhas = doLugar.map((m, i) => `
                <tr data-moldura="${m.id}">
                    <td class="deco-previa"><img src="${esc(arquivoLocal(m.src))}" alt="" loading="lazy"></td>
                    <td>
                        <input class="deco-placa" value="${esc(m.placa)}" maxlength="24" placeholder="placa (opcional)">
                        <select class="deco-lugar">${Object.entries(NOMES_LUGAR).map(([k, n]) => `<option value="${k}"${k === lugar ? ' selected' : ''}>${n}</option>`).join('')}</select>
                        <small>${esc(m.src)} &middot; ${m.largura}x${m.altura}</small>
                    </td>
                    <td class="col-ordem">
                        <button type="button" class="btn-ordem" data-mover="/api/molduras/${m.id}/ordem" data-dir="subir"${i === 0 ? ' disabled' : ''} title="Subir">&#9650;</button>
                        <button type="button" class="btn-ordem" data-mover="/api/molduras/${m.id}/ordem" data-dir="descer"${i === doLugar.length - 1 ? ' disabled' : ''} title="Descer">&#9660;</button>
                    </td>
                    <td class="acoes">
                        <button type="button" class="link-acao" data-salvar-moldura="${m.id}">salvar</button>
                        <button type="button" class="link-perigo" data-apagar="/api/molduras/${m.id}" data-confirmar="Tirar essa moldura do site? (o arquivo continua na biblioteca)">remover</button>
                    </td>
                </tr>`).join('');
    return `
        <section class="painel">
            <h2>${nome} <small>${doLugar.length} ${doLugar.length === 1 ? 'moldura' : 'molduras'}</small></h2>
            ${doLugar.length ? `<table class="adm-tabela adm-deco">${linhas}</table>` : '<p class="dentro">Nenhuma moldura aqui.</p>'}
        </section>`;
  }).join('');

  return casca('Decoração', `${barra('decoracao')}
    <main class="adm-miolo pagina-deco" data-max-mb="${cfg.UPLOAD_MAX_MB}">
        <section class="painel">
            <h2>+ Nova moldura <small>gif animado (ou imagem) com moldura dourada e plaquinha</small></h2>
            <form class="dentro form-colecao" id="form-moldura">
                <div class="deco-escolha">
                    <span class="foto-preview" id="deco-previa">nenhum gif</span>
                    <span class="foto-botoes">
                        <button type="button" class="btn azul" id="deco-enviar">Enviar gif novo</button>
                        <small>ou escolha um da biblioteca abaixo</small>
                    </span>
                </div>
                <ul class="foto-biblioteca deco-biblioteca" id="deco-biblioteca"><li class="vazio">carregando&hellip;</li></ul>
                <div class="campo-duplo">
                    <div class="campo"><label for="deco-placa">Plaquinha</label><input id="deco-placa" maxlength="24" placeholder="Ex: Pikachu"></div>
                    <div class="campo"><label for="deco-lugar">Onde</label><select id="deco-lugar">${Object.entries(NOMES_LUGAR).map(([k, n]) => `<option value="${k}"${k === 'mural' ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
                </div>
                <div class="form-acoes"><button class="btn">Pôr no site &#8250;</button> <span class="envio-status"></span></div>
                <input type="file" id="deco-arquivo" hidden accept="image/gif,image/png,image/webp,image/jpeg">
            </form>
        </section>
${blocos}
    </main>`, { js: true });
}

module.exports = { login, painel, editor, colecoes, colecaoItens, recados, site, decoracao, ESTILOS_CARTUCHO };


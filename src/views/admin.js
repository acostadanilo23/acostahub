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
            <a href="/admin/colecoes"${atual === 'colecoes' ? ' class="aqui"' : ''}>Coleções</a>
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
  { id: 'p-ps2', nome: 'Azul escuro (PlayStation 2)' },
  { id: 'p-ps3', nome: 'Preto fumê (PlayStation 3)' },
  { id: 'p-ps4', nome: 'Azul royal (PlayStation 4)' },
  { id: 'p-xbox', nome: 'Verde (Xbox)' },
  { id: 'p-n64', nome: 'Colorido 4 cores (Nintendo 64)' },
  { id: 'p-wii', nome: 'Branco / Azul (Wii)' },
  { id: 'p-livros', nome: 'Madeira / Estante (Livros)' },
  { id: 'p-filmes', nome: 'Película cinematográfica (Filmes)' },
  { id: 'p-pc', nome: 'Bege retrô (PC)' },
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
                    <textarea id="novo-item-observacoes" name="observacoes" rows="2" maxlength="500" placeholder="detalhes, história, defeitos&hellip;"></textarea>
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
            <div class="campo"><label>Observações <textarea id="ed-item-observacoes" name="observacoes" rows="2" maxlength="500"></textarea></label></div>
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

module.exports = { login, painel, editor, colecoes, colecaoItens, ESTILOS_CARTUCHO };


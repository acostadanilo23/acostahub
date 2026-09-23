// Painel do Webmaster: editor de posts, anexos e exclusões.
// JS só existe aqui no painel; o site público continua sem JavaScript.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const SESSAO_EXPIROU = 'Sua sessão expirou. Abre o painel em outra aba, entra de novo e depois salva aqui outra vez. '
  + 'O que você escreveu continua nesta tela.';

// monta um Error com status e detalhe técnico, venha a resposta em JSON ou não (ex.: proxy fora do ar)
async function erroDaResposta(metodo, url, r) {
  const texto = await r.text().catch(() => '');
  let dados = {};
  try { dados = JSON.parse(texto); } catch { /* não era JSON */ }
  const msg = r.status === 401 ? SESSAO_EXPIROU
    : dados.erro || (r.status >= 500 ? `O servidor respondeu com erro ${r.status}. Ele pode estar reiniciando.` : `Erro ${r.status}.`);
  const e = new Error(msg);
  e.status = r.status;
  e.detalhe = [
    `${metodo} ${url} → HTTP ${r.status}`,
    dados.codigo && `código: ${dados.codigo}`,
    dados.detalhe,
    !dados.erro && texto && texto.slice(0, 300),
  ].filter(Boolean).join('\n');
  return e;
}

function erroDeRede(metodo, url, causa) {
  const e = new Error('Não consegui falar com o servidor. Confere se ele está no ar e se a sua internet não caiu.');
  e.status = 0;
  e.detalhe = `${metodo} ${url}\n${causa?.message || causa}`;
  return e;
}

async function api(metodo, url, corpo) {
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch (causa) {
    throw erroDeRede(metodo, url, causa);
  }
  if (!r.ok) throw await erroDaResposta(metodo, url, r);
  try {
    return await r.json();
  } catch (causa) {
    const e = new Error('O servidor mandou uma resposta que eu não entendi.');
    e.detalhe = `${metodo} ${url} → HTTP ${r.status}\n${causa.message}`;
    throw e;
  }
}

// mostra o modal de erro. Erro de validação (e.detalhe === '') não mostra stack, só erro inesperado.
function avisar(e, titulo = 'Erro') {
  window.hbErro(e.message, { titulo, detalhe: e.detalhe ?? e.stack ?? '' });
}

// erro "esperado" (validação): mensagem clara e sem detalhe técnico
function erroSimples(msg) {
  const e = new Error(msg);
  e.detalhe = '';
  return e;
}

// ---------------------------------------------------------------- upload de imagens (editor e itens)
// converte pra WebP e redimensiona no navegador quando "otimizar" está ligado
async function prepararImagem(arquivo, otimizar) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) return { arquivo, dims: '' };
  let bmp;
  try { bmp = await createImageBitmap(arquivo); } catch { return { arquivo, dims: '' }; }
  const original = { arquivo, dims: `${bmp.width}x${bmp.height}` };
  if (!otimizar || arquivo.type === 'image/gif') return original;

  const escala = Math.min(1, 1280 / bmp.width);
  const w = Math.round(bmp.width * escala);
  const h = Math.round(bmp.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/webp', 0.82));
  if (!blob || blob.type !== 'image/webp' || (escala === 1 && blob.size >= arquivo.size)) return original;
  const nome = arquivo.name.replace(/\.[^.]+$/, '') + '.webp';
  return { arquivo: new File([blob], nome, { type: 'image/webp' }), dims: `${w}x${h}` };
}

function subir(arquivo, dims, progresso) {
  return new Promise((ok, falha) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/anexos');
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.setRequestHeader('X-Nome', encodeURIComponent(arquivo.name));
    if (dims) x.setRequestHeader('X-Dimensoes', dims);
    x.upload.onprogress = (e) => e.lengthComputable && progresso && progresso(e.loaded / e.total);
    x.onload = () => {
      let r = {};
      try { r = JSON.parse(x.responseText); } catch { /* sem json */ }
      if (x.status < 300 && r.url) return ok(r);
      const e = new Error(x.status === 401 ? SESSAO_EXPIROU
        : `"${arquivo.name}": ${r.erro || (x.status === 413 ? 'arquivo grande demais pro servidor.' : `o servidor respondeu com erro ${x.status}.`)}`);
      e.status = x.status;
      e.detalhe = [`POST /api/anexos (${arquivo.name}, ${Math.ceil(arquivo.size / 1024)} KB) → HTTP ${x.status}`,
        r.codigo && `código: ${r.codigo}`, r.detalhe, !r.erro && x.responseText.slice(0, 300)].filter(Boolean).join('\n');
      falha(e);
    };
    x.onerror = () => falha(erroDeRede('POST', `/api/anexos (${arquivo.name})`, 'a conexão caiu no meio do envio'));
    x.send(arquivo);
  });
}

// ---------------------------------------------------------------- excluir post (painel e editor)
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-excluir]');
  if (!b) return;
  if (!confirm(`Excluir "${b.dataset.titulo}" pra sempre?\n\nOs anexos continuam na biblioteca.`)) return;
  try {
    await api('DELETE', `/api/posts/${b.dataset.excluir}`);
    window.onbeforeunload = null;
    if ($('#editor')) location.href = '/admin';
    else b.closest('tr').remove();
  } catch (e) {
    avisar(e, 'Não deu pra excluir');
  }
});

const form = $('#editor');
if (form) iniciarEditor(form);

function iniciarEditor(form) {
  const post = JSON.parse(form.dataset.post);
  const maxBytes = Number(form.dataset.maxMb) * 1048576;
  const ta = $('#conteudo');
  const area = $('#area');
  const previa = $('#previa');
  const estado = $('#estado');
  const campos = ['titulo', 'slug', 'secao', 'tags', 'publicado_em', 'resumo', 'tldr', 'conteudo'];
  const chaveBackup = () => `hb-backup-${post.id || 'novo'}`;
  let sujo = false;
  let salvando = false;
  let slugManual = !!$('#slug').value;

  const valores = () => Object.fromEntries(campos.map((c) => [c, $('#' + c).value]));

  function mostrarEstado(txt, classe = '') {
    estado.textContent = txt;
    estado.className = classe;
  }

  function marcarSujo() {
    sujo = true;
    mostrarEstado('alterações não salvas', 'sujo');
    agendarBackup();
  }

  // ------------------------------------------------------------ slug e seção
  const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

  $('#titulo').addEventListener('input', () => {
    if (!slugManual && post.status !== 'publicado') $('#slug').value = slugify($('#titulo').value);
  });
  $('#slug').addEventListener('input', () => { slugManual = true; });
  $('#slug').addEventListener('change', () => { $('#slug').value = slugify($('#slug').value); });
  $('#secao').addEventListener('change', () => { $('#slug-secao').textContent = `/${$('#secao').value}/`; });

  form.addEventListener('input', marcarSujo);
  form.addEventListener('submit', (e) => e.preventDefault());
  window.onbeforeunload = (e) => { if (sujo) { e.preventDefault(); return ''; } };

  // ------------------------------------------------------------ prévia
  let timerPrevia;
  let pedidoPrevia = 0;
  let erroPrevia = ''; // o mesmo erro de prévia só aparece uma vez (senão pula modal a cada tecla)
  async function atualizarPrevia() {
    const n = ++pedidoPrevia;
    const texto = ta.value;
    const palavras = (texto.match(/\S+/g) || []).length;
    try {
      const r = await api('POST', '/api/previa', { conteudo: texto });
      if (n !== pedidoPrevia) return;
      erroPrevia = '';
      previa.innerHTML = r.html || '<p style="color:#666">a prévia aparece aqui&hellip;</p>';
      $('#contagem').textContent = `${palavras} palavra${palavras === 1 ? '' : 's'} · ~${r.minutos} min de leitura`;
    } catch (e) {
      if (n !== pedidoPrevia || e.message === erroPrevia) return;
      erroPrevia = e.message;
      mostrarEstado(e.status === 401 ? 'sessão expirou!' : 'a prévia falhou', 'erro');
      avisar(e, 'A prévia não carregou');
    }
  }
  ta.addEventListener('input', () => {
    clearTimeout(timerPrevia);
    timerPrevia = setTimeout(atualizarPrevia, 300);
  });
  atualizarPrevia();

  // ------------------------------------------------------------ modos de visualização
  function modo(m) {
    area.classList.remove('escrever', 'previa');
    if (m !== 'dividido') area.classList.add(m);
    $$('[data-modo]').forEach((b) => b.classList.toggle('ativo', b.dataset.modo === m));
    try { localStorage.setItem('hb-modo', m); } catch { /* sem storage */ }
  }
  $$('[data-modo]').forEach((b) => b.addEventListener('click', () => modo(b.dataset.modo)));
  let modoSalvo = 'dividido';
  try { modoSalvo = localStorage.getItem('hb-modo') || 'dividido'; } catch { /* sem storage */ }
  modo(modoSalvo);

  // ------------------------------------------------------------ formatação
  function inserir(texto, selIni, selFim) {
    ta.focus();
    const ini = ta.selectionStart;
    // execCommand mantém o Ctrl+Z funcionando
    if (!document.execCommand('insertText', false, texto)) {
      ta.setRangeText(texto, ini, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (selIni != null) ta.setSelectionRange(ini + selIni, ini + (selFim ?? selIni));
  }

  function envolver(antes, depois, exemplo) {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd) || exemplo;
    inserir(antes + sel + depois, antes.length, antes.length + sel.length);
  }

  function prefixarLinhas(prefixo) {
    const v = ta.value;
    const ini = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let fim = v.indexOf('\n', ta.selectionEnd);
    if (fim === -1) fim = v.length;
    ta.setSelectionRange(ini, fim);
    const linhas = v.slice(ini, fim).split('\n');
    const novo = linhas.map((l, i) => (typeof prefixo === 'function' ? prefixo(i) : prefixo) + l).join('\n');
    inserir(novo, novo.length);
  }

  function bloco(texto, selIni, selFim) {
    const antes = ta.value.slice(0, ta.selectionStart);
    const pre = !antes || antes.endsWith('\n\n') ? '' : antes.endsWith('\n') ? '\n' : '\n\n';
    inserir(pre + texto + '\n', pre.length + selIni, pre.length + (selFim ?? selIni));
  }

  const FORMATOS = {
    negrito: () => envolver('**', '**', 'negrito'),
    italico: () => envolver('*', '*', 'itálico'),
    riscado: () => envolver('~~', '~~', 'riscado'),
    codigo: () => envolver('`', '`', 'código'),
    h2: () => prefixarLinhas('## '),
    h3: () => prefixarLinhas('### '),
    lista: () => prefixarLinhas('- '),
    numerada: () => prefixarLinhas((i) => `${i + 1}. `),
    citacao: () => prefixarLinhas('> '),
    link: () => {
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd) || 'texto do link';
      const url = prompt('Endereço do link:', 'https://');
      if (!url) return;
      inserir(`[${sel}](${url})`, 1, 1 + sel.length);
    },
    bloco: () => bloco('```\ncódigo aqui\n```', 4, 15),
    fluxo: () => bloco(':::fluxo\nFork → Branch → Commit\n:::', 9, 31),
    aviso: () => bloco(':::aviso\n**Atenção:** texto do post-it\n:::', 9, 38),
    linha: () => bloco('---', 3),
    anexo: () => $('#arquivo').click(),
  };
  $$('[data-f]').forEach((b) => b.addEventListener('click', () => FORMATOS[b.dataset.f]()));

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); salvar(post.status === 'publicado' ? 'publicado' : 'rascunho'); }
    if (document.activeElement !== ta) return;
    if (k === 'b') { e.preventDefault(); FORMATOS.negrito(); }
    if (k === 'i') { e.preventDefault(); FORMATOS.italico(); }
    if (k === 'k') { e.preventDefault(); FORMATOS.link(); }
  });

  // Tab indenta em vez de sair do campo
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); inserir('  '); }
  });

  // ------------------------------------------------------------ salvar
  // links "prévia" e "no site" + botão de excluir, conforme a situação do post
  function atualizarSituacao() {
    const links = $('#links-post');
    links.replaceChildren();
    const link = (href, txt) => {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.textContent = txt;
      links.append(' · ', a);
    };
    if (post.id) link(`/admin/ver/${post.id}`, 'prévia');
    const agendado = post.status === 'publicado' && post.publicado_em && new Date(post.publicado_em) > new Date();
    if (post.status === 'publicado' && post.url && !agendado) link(post.url, 'ver no site');
    if (agendado) links.append(` · agendado pra ${new Date(post.publicado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`);
    const excluir = $('#excluir-post');
    excluir.hidden = !post.id;
    excluir.dataset.excluir = post.id;
    excluir.dataset.titulo = $('#titulo').value;
  }
  atualizarSituacao();

  async function salvar(status) {
    if (salvando) return;
    if (!$('#titulo').value.trim()) {
      mostrarEstado('falta o título!', 'erro');
      window.hbErro('O post precisa de um título antes de salvar.', { titulo: 'Falta o título' });
      $('#titulo').focus();
      return;
    }
    if (status === 'publicado' && post.status !== 'publicado' && !confirm('Publicar esse post agora? (ou na data escolhida)')) return;
    if (status === 'rascunho' && post.status === 'publicado' && !confirm('Tirar esse post do ar e voltar pra rascunho?')) return;

    salvando = true;
    $$('[data-acao]').forEach((b) => { b.disabled = true; });
    mostrarEstado('salvando…');
    try {
      const enviados = valores();
      const corpo = { ...enviados, status, atualizado_em: post.atualizado_em };
      const r = post.id ? await api('PUT', `/api/posts/${post.id}`, corpo) : await api('POST', '/api/posts', corpo);
      const eraNovo = !post.id;
      Object.assign(post, r);
      form.dataset.post = JSON.stringify(post);
      $('#slug').value = r.slug;
      slugManual = true;
      $('#publicado_em').value = r.publicado_em;
      $('#situacao').textContent = r.status;
      $('[data-acao="publicar"]').textContent = r.status === 'publicado' ? 'Atualizar' : 'Publicar';
      $('[data-acao="rascunho"]').textContent = r.status === 'publicado' ? 'Despublicar' : 'Salvar rascunho';
      // se a pessoa continuou escrevendo enquanto salvava, isso ainda NÃO está salvo
      const mudouDurante = campos.some((c) => c !== 'slug' && c !== 'publicado_em' && $('#' + c).value !== enviados[c]);
      try { if (eraNovo) localStorage.removeItem('hb-backup-novo'); } catch { /* sem storage */ }
      if (mudouDurante) {
        agendarBackup();
      } else {
        sujo = false;
        clearTimeout(timerBackup);
        try { localStorage.removeItem(chaveBackup()); } catch { /* sem storage */ }
      }
      if (eraNovo) history.replaceState(null, '', `/admin/editar/${r.id}`);
      atualizarSituacao();
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (mudouDurante) mostrarEstado(`salvo às ${hora}, mas você mudou coisas depois disso`, 'sujo');
      else mostrarEstado(r.status === 'publicado' ? `publicado! salvo às ${hora}` : `rascunho salvo às ${hora}`);
    } catch (e) {
      mostrarEstado(e.status === 401 ? 'sessão expirou! (seu texto continua aqui)' : 'não salvou!', 'erro');
      agendarBackup();
      avisar(e, 'Não deu pra salvar');
    } finally {
      salvando = false;
      $$('[data-acao]').forEach((b) => { b.disabled = false; });
    }
  }
  $('[data-acao="rascunho"]').addEventListener('click', () => salvar('rascunho'));
  $('[data-acao="publicar"]').addEventListener('click', () => salvar('publicado'));

  // ------------------------------------------------------------ backup local (se a aba fechar sem salvar)
  let timerBackup;
  function agendarBackup() {
    clearTimeout(timerBackup);
    timerBackup = setTimeout(() => {
      try { localStorage.setItem(chaveBackup(), JSON.stringify({ quando: Date.now(), ...valores() })); } catch { /* cheio */ }
    }, 800);
  }

  (function oferecerBackup() {
    let b;
    try { b = JSON.parse(localStorage.getItem(chaveBackup()) || 'null'); } catch { return; }
    if (!b) return;
    const atual = valores();
    if (campos.every((c) => (b[c] ?? '') === atual[c])) {
      try { localStorage.removeItem(chaveBackup()); } catch { /* ok */ }
      return;
    }
    const aviso = document.createElement('div');
    aviso.className = 'aviso-backup';
    aviso.innerHTML = `Atenção: tem uma versão não salva desse post de ${new Date(b.quando).toLocaleString('pt-BR')}.
      <button type="button" class="btn azul">Restaurar</button><button type="button" class="btn cinza">Descartar</button>`;
    form.prepend(aviso);
    const [restaurar, descartar] = $$('button', aviso);
    restaurar.onclick = () => {
      campos.forEach((c) => { if (b[c] != null) $('#' + c).value = b[c]; });
      aviso.remove();
      marcarSujo();
      atualizarPrevia();
    };
    descartar.onclick = () => {
      try { localStorage.removeItem(chaveBackup()); } catch { /* ok */ }
      aviso.remove();
    };
  })();

  // ------------------------------------------------------------ anexos
  const lista = $('#biblioteca');
  const IMG = /\.(webp|png|jpe?g|gif)$/i;
  const ACEITOS = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'pdf', 'zip', 'mp3', 'txt'];

  function markdownDe(a) {
    const base = a.nome_original.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
    if (IMG.test(a.arquivo) || /\.mp3$/i.test(a.arquivo)) return `![${base}](${a.url})`;
    return `[${a.nome_original.replace(/[[\]]/g, '')}](${a.url})`;
  }

  function itemBiblioteca(a) {
    const li = document.createElement('li');
    const mini = document.createElement('span');
    mini.className = 'mini';
    if (IMG.test(a.arquivo)) mini.style.backgroundImage = `url("${a.url}")`;
    else mini.textContent = a.tipo;
    const nome = document.createElement('span');
    nome.className = 'nome';
    nome.textContent = a.nome_original;
    nome.title = `${a.nome_original} (${Math.ceil(a.tamanho / 1024)} KB)`;
    const acoes = document.createElement('span');
    acoes.className = 'acoes';
    acoes.innerHTML = '<button type="button">inserir</button><button type="button">copiar link</button><button type="button" class="link-perigo">apagar</button>';
    const [bInserir, bCopiar, bApagar] = $$('button', acoes);
    bInserir.onclick = () => bloco(markdownDe(a), markdownDe(a).length);
    bCopiar.onclick = async () => {
      try { await navigator.clipboard.writeText(location.origin + a.url); bCopiar.textContent = 'copiado!'; } catch { prompt('Link:', location.origin + a.url); }
    };
    bApagar.onclick = async () => {
      if (!confirm(`Apagar "${a.nome_original}" do servidor?`)) return;
      try { await api('DELETE', `/api/anexos/${a.id}`); li.remove(); } catch (e) { avisar(e, 'Não deu pra apagar o arquivo'); }
    };
    li.append(mini, nome, acoes);
    return li;
  }

  async function carregarBiblioteca() {
    try {
      const anexos = await api('GET', '/api/anexos');
      lista.replaceChildren(...anexos.map(itemBiblioteca));
      if (!anexos.length) lista.innerHTML = '<li class="vazio">nenhum arquivo ainda</li>';
    } catch (e) {
      lista.innerHTML = '<li class="vazio">não consegui carregar os arquivos</li>';
      avisar(e, 'A biblioteca de arquivos não carregou');
    }
  }
  carregarBiblioteca();

  let contadorEnvio = 0;
  async function enviarArquivos(arquivos) {
    for (const bruto of arquivos) {
      const marca = `(enviando ${bruto.name}... envio ${++contadorEnvio})`;
      // imagem sozinha no parágrafo (vira figura) e cursor dois "enter" abaixo, pronto pra continuar
      bloco(marca + '\n', marca.length + 2);

      const li = document.createElement('li');
      li.className = 'enviando';
      li.innerHTML = '<span class="mini">…</span><span class="nome"></span><span class="progresso"><i></i></span>';
      $('.nome', li).textContent = `enviando ${bruto.name}`;
      $('.vazio', lista)?.remove();
      lista.prepend(li);

      // troca o "(enviando...)" pelo resultado sem mexer no que a pessoa está fazendo.
      // (não dá pra confiar no modo 'preserve' do setRangeText: com o cursor no fim do marcador
      // ele deixa o texto novo SELECIONADO, e a próxima tecla apagaria a imagem do post)
      const trocarMarca = (novo) => {
        const i = ta.value.indexOf(marca);
        if (i === -1) return;
        const fim = i + marca.length;
        const delta = novo.length - marca.length;
        const ajusta = (p) => (p <= i ? p : p >= fim ? p + delta : i + novo.length);
        const [ini, fimSel] = [ajusta(ta.selectionStart), ajusta(ta.selectionEnd)];
        ta.setRangeText(novo, i, fim);
        ta.setSelectionRange(ini, fimSel);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      };

      try {
        const ext = (bruto.name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
        if (!ACEITOS.includes(ext)) {
          throw erroSimples(`"${bruto.name}": esse tipo de arquivo não é aceito. Pode mandar imagem (${ACEITOS.slice(0, 5).join(', ')}), PDF, ZIP, MP3 ou TXT.`);
        }
        const { arquivo, dims } = await prepararImagem(bruto, $('#otimizar').checked);
        if (arquivo.size > maxBytes) throw erroSimples(`"${bruto.name}" tem ${(arquivo.size / 1048576).toFixed(1)} MB e o limite é ${form.dataset.maxMb} MB.`);
        const a = await subir(arquivo, dims, (p) => { $('.progresso i', li).style.width = `${Math.round(p * 100)}%`; });
        trocarMarca(markdownDe(a));
        li.replaceWith(itemBiblioteca(a));
      } catch (e) {
        trocarMarca('');
        li.remove();
        if (!lista.children.length) lista.innerHTML = '<li class="vazio">nenhum arquivo ainda</li>';
        avisar(e, 'O envio falhou');
      }
    }
  }

  $('#arquivo').addEventListener('change', (e) => {
    enviarArquivos([...e.target.files]);
    e.target.value = '';
  });

  ta.addEventListener('paste', (e) => {
    const arquivos = [...(e.clipboardData?.files || [])];
    if (!arquivos.length) return;
    e.preventDefault();
    enviarArquivos(arquivos);
  });

  let profundidade = 0;
  area.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    profundidade++;
    area.classList.add('arrastando');
  });
  area.addEventListener('dragleave', () => { if (--profundidade <= 0) { profundidade = 0; area.classList.remove('arrastando'); } });
  area.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  area.addEventListener('drop', (e) => {
    profundidade = 0;
    area.classList.remove('arrastando');
    const arquivos = [...(e.dataTransfer?.files || [])];
    if (!arquivos.length) return;
    e.preventDefault();
    ta.focus();
    enviarArquivos(arquivos);
  });
}

// ---------------------------------------------------------------- coleções (painel)

// excluir coleção com confirmação informando quantos itens vão junto
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-excluir-colecao]');
  if (!b) return;
  const nome = b.dataset.nome;
  const itens = Number(b.dataset.itens || 0);
  const textoItens = itens === 1 ? 'e o 1 item dela' : `e os ${itens} itens dela`;
  const msg = itens > 0 ? `Excluir ${nome} ${textoItens}?` : `Excluir ${nome}?`;
  if (!confirm(msg)) return;
  try {
    await api('DELETE', `/api/colecoes/${b.dataset.excluirColecao}`);
    location.reload();
  } catch (e) {
    avisar(e, 'Não deu pra excluir');
  }
});

// mover ordem (subir / descer)
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-mover-colecao]');
  if (!b || b.disabled) return;
  const id = b.dataset.moverColecao;
  const direcao = b.dataset.dir;
  try {
    await api('POST', `/api/colecoes/${id}/ordem`, { direcao });
    location.reload();
  } catch (e) {
    avisar(e, 'Não deu pra mudar a ordem');
  }
});

// alternar visibilidade (esconder / mostrar)
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-visibilidade-colecao]');
  if (!b) return;
  const id = b.dataset.visibilidadeColecao;
  const visivel = Number(b.dataset.visivel);
  try {
    await api('POST', `/api/colecoes/${id}/visibilidade`, { visivel });
    location.reload();
  } catch (e) {
    avisar(e, 'Não deu pra alterar a visibilidade');
  }
});

// criar nova coleção
const formNovaColecao = $('#form-nova-colecao');
if (formNovaColecao) {
  formNovaColecao.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#novo-nome').value.trim();
    if (!nome) {
      avisar(erroSimples('A coleção precisa de um nome.'));
      return;
    }
    const subtitulo = $('#novo-subtitulo').value.trim();
    const grupo = $('#novo-grupo').value;
    const estilo = $('#novo-estilo').value;
    try {
      await api('POST', '/api/colecoes', { nome, subtitulo, grupo, estilo });
      location.reload();
    } catch (err) {
      avisar(err, 'Não deu pra criar a coleção');
    }
  });
}

// modal de edição de coleção
const modalEditarColecao = $('#modal-editar-colecao');
const formEditarColecao = $('#form-editar-colecao');
if (modalEditarColecao && formEditarColecao) {
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-editar-colecao]');
    if (!b) return;
    const c = JSON.parse(b.dataset.editarColecao);
    $('#ed-id').value = c.id;
    $('#ed-nome').value = c.nome;
    $('#ed-subtitulo').value = c.subtitulo || '';
    $('#ed-grupo').value = c.grupo;
    $('#ed-estilo').value = c.estilo;
    $('#ed-slug-preview').textContent = `/colecoes/${c.slug}`;
    try {
      modalEditarColecao.showModal();
    } catch {
      modalEditarColecao.setAttribute('open', '');
    }
  });

  const fecharModalEdicao = () => {
    try {
      modalEditarColecao.close();
    } catch {
      modalEditarColecao.removeAttribute('open');
    }
  };
  modalEditarColecao.querySelector('.fechar')?.addEventListener('click', fecharModalEdicao);
  modalEditarColecao.querySelector('.fechar-modal')?.addEventListener('click', fecharModalEdicao);

  formEditarColecao.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#ed-id').value;
    const nome = $('#ed-nome').value.trim();
    if (!nome) {
      avisar(erroSimples('A coleção precisa de um nome.'));
      return;
    }
    const subtitulo = $('#ed-subtitulo').value.trim();
    const grupo = $('#ed-grupo').value;
    const estilo = $('#ed-estilo').value;
    try {
      await api('PUT', `/api/colecoes/${id}`, { nome, subtitulo, grupo, estilo });
      location.reload();
    } catch (err) {
      avisar(err, 'Não deu pra salvar a coleção');
    }
  });
}

// ---------------------------------------------------------------- itens de uma coleção
const paginaItens = $('#pagina-itens');
if (paginaItens) iniciarItens(paginaItens);

function iniciarItens(pagina) {
  const colecaoId = pagina.dataset.colecaoId;
  const maxBytes = Number(pagina.dataset.maxMb) * 1048576;
  let itens = JSON.parse(pagina.dataset.itens);

  const corpo = $('#lista-itens');
  const busca = $('#busca-itens');
  const avisoVazio = $('.itens-vazio', pagina);
  const avisoNada = $('.itens-nada-encontrado', pagina);
  const contador = $('.adm-numeros div:first-child');

  const IMG = /\.(webp|png|jpe?g|gif)$/i;

  // ------------------------------------------------------------ foto (input escondido + prévia)
  function setFoto(prefixo, url) {
    const input = $(`#${prefixo}-foto`);
    const prev = $(`#${prefixo}-foto-preview`);
    const limpar = $(`[data-limpar-foto="${prefixo}"]`);
    input.value = url || '';
    if (url) {
      prev.textContent = '';
      prev.style.backgroundImage = `url("${url}")`;
      prev.classList.add('tem-foto');
      limpar.hidden = false;
    } else {
      prev.textContent = 'sem foto';
      prev.style.backgroundImage = '';
      prev.classList.remove('tem-foto');
      limpar.hidden = true;
    }
  }

  // ------------------------------------------------------------ tabela de itens
  function celulaFoto(item) {
    const td = document.createElement('td');
    td.className = 'item-foto';
    if (item.foto && IMG.test(item.foto)) {
      const mini = document.createElement('span');
      mini.className = 'mini';
      mini.style.backgroundImage = `url("${item.foto}")`;
      td.append(mini);
    } else {
      td.textContent = '—';
    }
    return td;
  }

  function linha(item, i, total, filtrando) {
    const tr = document.createElement('tr');
    tr.dataset.itemId = item.id;

    tr.append(celulaFoto(item));

    const tdTitulo = document.createElement('td');
    const tit = document.createElement('span');
    tit.className = 'tit';
    tit.textContent = item.titulo;
    tdTitulo.append(tit);
    if (item.regiao || item.observacoes) {
      const s = document.createElement('small');
      s.textContent = [item.regiao, item.observacoes].filter(Boolean).join(' · ');
      tdTitulo.append(s);
    }
    tr.append(tdTitulo);

    const tdAno = document.createElement('td');
    tdAno.textContent = item.ano || '—';
    tr.append(tdAno);

    const tdEstado = document.createElement('td');
    tdEstado.textContent = item.estado || '—';
    tr.append(tdEstado);

    const tdOrdem = document.createElement('td');
    tdOrdem.className = 'col-ordem';
    // as setas só valem na ordem real (sem filtro de busca)
    const subir = document.createElement('button');
    subir.type = 'button';
    subir.className = 'btn-ordem';
    subir.innerHTML = '&#9650;';
    subir.title = 'Subir';
    subir.disabled = filtrando || i === 0;
    subir.onclick = () => moverItem(item.id, 'subir');
    const descer = document.createElement('button');
    descer.type = 'button';
    descer.className = 'btn-ordem';
    descer.innerHTML = '&#9660;';
    descer.title = 'Descer';
    descer.disabled = filtrando || i === total - 1;
    descer.onclick = () => moverItem(item.id, 'descer');
    tdOrdem.append(subir, descer);
    tr.append(tdOrdem);

    const tdAcoes = document.createElement('td');
    tdAcoes.className = 'acoes';
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'link-acao';
    editar.textContent = 'editar';
    editar.onclick = () => abrirEdicao(item);
    const remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'link-perigo';
    remover.textContent = 'remover';
    remover.onclick = () => removerItem(item);
    tdAcoes.append(editar, remover);
    tr.append(tdAcoes);

    return tr;
  }

  function render() {
    const termo = busca.value.trim().toLowerCase();
    const filtrando = !!termo;
    const visiveis = filtrando ? itens.filter((it) => it.titulo.toLowerCase().includes(termo)) : itens;
    corpo.replaceChildren(...visiveis.map((it, i) => linha(it, i, visiveis.length, filtrando)));
    avisoVazio.hidden = itens.length > 0;
    avisoNada.hidden = !(filtrando && visiveis.length === 0);
    if (contador) contador.innerHTML = `<b>${itens.length}</b>${itens.length === 1 ? 'item' : 'itens'}`;
  }
  render();

  busca.addEventListener('input', render);

  // ------------------------------------------------------------ mover / ordenar
  async function moverItem(id, direcao) {
    try {
      await api('POST', `/api/itens/${id}/ordem`, { direcao });
      const idx = itens.findIndex((it) => it.id === id);
      const outro = direcao === 'subir' ? idx - 1 : idx + 1;
      if (idx !== -1 && outro >= 0 && outro < itens.length) {
        [itens[idx], itens[outro]] = [itens[outro], itens[idx]];
      }
      render();
    } catch (e) {
      avisar(e, 'Não deu pra mudar a ordem');
    }
  }

  $$('[data-ordenar]', pagina).forEach((b) => b.addEventListener('click', async () => {
    try {
      const r = await api('POST', `/api/colecoes/${colecaoId}/reordenar-itens`, { criterio: b.dataset.ordenar, direcao: b.dataset.dir });
      itens = r.itens.map((i) => ({ id: i.id, titulo: i.titulo, ano: i.ano, regiao: i.regiao, estado: i.estado, observacoes: i.observacoes, foto: i.foto }));
      busca.value = '';
      render();
    } catch (e) {
      avisar(e, 'Não deu pra ordenar');
    }
  }));

  // ------------------------------------------------------------ adicionar item
  const formNovo = $('#form-novo-item');
  const dados = (prefixo) => ({
    titulo: $(`#${prefixo}-titulo`).value.trim(),
    ano: $(`#${prefixo}-ano`).value.trim(),
    regiao: $(`#${prefixo}-regiao`).value.trim(),
    estado: $(`#${prefixo}-estado`).value.trim(),
    observacoes: $(`#${prefixo}-observacoes`).value.trim(),
    foto: $(`#${prefixo}-foto`).value.trim(),
  });

  formNovo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = dados('novo-item');
    if (!d.titulo) { avisar(erroSimples('O item precisa de um título.')); return; }
    const botao = $('button[type="submit"]', formNovo);
    botao.disabled = true;
    try {
      const r = await api('POST', `/api/colecoes/${colecaoId}/itens`, d);
      itens.push({ id: r.item.id, titulo: r.item.titulo, ano: r.item.ano, regiao: r.item.regiao, estado: r.item.estado, observacoes: r.item.observacoes, foto: r.item.foto });
      busca.value = '';
      render();
      // deixa o formulário pronto pro próximo: mantém região/estado (costumam se repetir num lote)
      $('#novo-item-titulo').value = '';
      $('#novo-item-ano').value = '';
      $('#novo-item-observacoes').value = '';
      setFoto('novo-item', '');
      const salvo = $('.item-salvo', formNovo);
      salvo.hidden = false;
      clearTimeout(salvo._t);
      salvo._t = setTimeout(() => { salvo.hidden = true; }, 2000);
      $('#novo-item-titulo').focus();
    } catch (err) {
      avisar(err, 'Não deu pra adicionar o item');
    } finally {
      botao.disabled = false;
    }
  });

  // ------------------------------------------------------------ editar item
  const modalItem = $('#modal-editar-item');
  const formItem = $('#form-editar-item');
  const abrirModal = (m) => { try { m.showModal(); } catch { m.setAttribute('open', ''); } };
  const fecharModal = (m) => { try { m.close(); } catch { m.removeAttribute('open'); } };

  function abrirEdicao(item) {
    $('#ed-item-id').value = item.id;
    $('#ed-item-titulo').value = item.titulo;
    $('#ed-item-ano').value = item.ano || '';
    $('#ed-item-regiao').value = item.regiao || '';
    $('#ed-item-estado').value = item.estado || '';
    $('#ed-item-observacoes').value = item.observacoes || '';
    setFoto('ed-item', item.foto || '');
    abrirModal(modalItem);
    $('#ed-item-titulo').focus();
  }
  modalItem.querySelector('.fechar')?.addEventListener('click', () => fecharModal(modalItem));
  modalItem.querySelector('.fechar-modal')?.addEventListener('click', () => fecharModal(modalItem));

  formItem.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number($('#ed-item-id').value);
    const d = dados('ed-item');
    if (!d.titulo) { avisar(erroSimples('O item precisa de um título.')); return; }
    try {
      const r = await api('PUT', `/api/itens/${id}`, d);
      const idx = itens.findIndex((it) => it.id === id);
      if (idx !== -1) itens[idx] = { id: r.item.id, titulo: r.item.titulo, ano: r.item.ano, regiao: r.item.regiao, estado: r.item.estado, observacoes: r.item.observacoes, foto: r.item.foto };
      render();
      fecharModal(modalItem);
    } catch (err) {
      avisar(err, 'Não deu pra salvar o item');
    }
  });

  // ------------------------------------------------------------ remover item
  async function removerItem(item) {
    if (!confirm(`Remover "${item.titulo}" desta coleção?`)) return;
    try {
      await api('DELETE', `/api/itens/${item.id}`);
      itens = itens.filter((it) => it.id !== item.id);
      render();
    } catch (e) {
      avisar(e, 'Não deu pra remover o item');
    }
  }

  // ------------------------------------------------------------ escolher / enviar foto
  const modalFoto = $('#modal-foto');
  const bibFoto = $('#foto-biblioteca');
  const statusFoto = $('.foto-status', modalFoto);
  let alvoFoto = null; // prefixo do formulário que vai receber a foto

  function escolher(url) {
    if (alvoFoto) setFoto(alvoFoto, url);
    fecharModal(modalFoto);
  }

  function itemFoto(a) {
    const li = document.createElement('li');
    li.className = 'foto-item';
    li.style.backgroundImage = `url("${a.url}")`;
    li.title = a.nome_original;
    li.onclick = () => escolher(a.url);
    return li;
  }

  async function carregarBibFoto() {
    bibFoto.innerHTML = '<li class="vazio">carregando…</li>';
    try {
      const anexos = await api('GET', '/api/anexos');
      const imagens = anexos.filter((a) => IMG.test(a.arquivo));
      bibFoto.replaceChildren(...imagens.map(itemFoto));
      if (!imagens.length) bibFoto.innerHTML = '<li class="vazio">nenhuma imagem na biblioteca ainda. Envie uma acima.</li>';
    } catch (e) {
      bibFoto.innerHTML = '<li class="vazio">não consegui carregar as imagens</li>';
      avisar(e, 'A biblioteca não carregou');
    }
  }

  $$('[data-escolher-foto]', pagina.ownerDocument).forEach((b) => b.addEventListener('click', () => {
    alvoFoto = b.dataset.escolherFoto;
    statusFoto.textContent = '';
    abrirModal(modalFoto);
    carregarBibFoto();
  }));
  $$('[data-limpar-foto]', pagina.ownerDocument).forEach((b) => b.addEventListener('click', () => setFoto(b.dataset.limparFoto, '')));

  modalFoto.querySelector('.fechar')?.addEventListener('click', () => fecharModal(modalFoto));

  // ------------------------------------------------------------ importar CSV
  const inputCsv = $('#csv-arquivo');
  $('#btn-importar-csv')?.addEventListener('click', () => inputCsv.click());
  inputCsv?.addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    let texto;
    try { texto = await arquivo.text(); } catch { avisar(erroSimples('Não consegui ler o arquivo.')); return; }
    try {
      const prev = await api('POST', `/api/colecoes/${colecaoId}/importar-csv`, { csv: texto });
      const linhasErro = prev.erros.map((x) => x.linha);
      const parteErro = linhasErro.length
        ? ` ${linhasErro.length} ${linhasErro.length === 1 ? 'linha com erro' : 'linhas com erro'} (${linhasErro.slice(0, 8).join(', ')}${linhasErro.length > 8 ? '…' : ''}).`
        : '';
      const parteDup = prev.duplicados ? ` ${prev.duplicados} já ${prev.duplicados === 1 ? 'existe e será ignorado' : 'existem e serão ignorados'}.` : '';
      if (prev.adicionar === 0) {
        avisar(erroSimples(`Nada pra importar desse arquivo.${parteDup}${parteErro}`), 'Importar CSV');
        return;
      }
      const msg = `Vai adicionar ${prev.adicionar} ${prev.adicionar === 1 ? 'item' : 'itens'}.${parteDup}${parteErro}\n\nConfirmar importação?`;
      if (!confirm(msg)) return;
      await api('POST', `/api/colecoes/${colecaoId}/importar-csv`, { csv: texto, confirmar: true });
      location.reload();
    } catch (err) {
      avisar(err, 'Não deu pra importar o CSV');
    }
  });

  $('#btn-enviar-foto').addEventListener('click', () => $('#foto-arquivo').click());
  $('#foto-arquivo').addEventListener('change', async (e) => {
    const bruto = e.target.files[0];
    e.target.value = '';
    if (!bruto) return;
    if (!/^image\//.test(bruto.type)) { avisar(erroSimples('Escolha um arquivo de imagem.')); return; }
    statusFoto.textContent = 'enviando…';
    try {
      const { arquivo, dims } = await prepararImagem(bruto, $('#foto-otimizar').checked);
      if (arquivo.size > maxBytes) throw erroSimples(`"${bruto.name}" tem ${(arquivo.size / 1048576).toFixed(1)} MB e o limite é ${pagina.dataset.maxMb} MB.`);
      const a = await subir(arquivo, dims, (p) => { statusFoto.textContent = `enviando… ${Math.round(p * 100)}%`; });
      statusFoto.textContent = '';
      escolher(a.url);
    } catch (err) {
      statusFoto.textContent = '';
      avisar(err, 'O envio falhou');
    }
  });
}

// ---------------------------------------------------------------- ações genéricas (recados, site, decoração)

document.addEventListener('click', async (ev) => {
  const apagar = ev.target.closest('[data-apagar]');
  const mover = ev.target.closest('[data-mover]');
  const aprovar = ev.target.closest('[data-aprovar-recado]');
  const aprovarComentario = ev.target.closest('[data-aprovar-comentario]');
  const apagarRecado = ev.target.closest('[data-apagar-recado]');
  const ativar = ev.target.closest('[data-ativar-enquete]');
  try {
    if (apagar) {
      if (!confirm(apagar.dataset.confirmar || 'Apagar?')) return;
      await api('DELETE', apagar.dataset.apagar);
    } else if (mover && !mover.disabled) {
      await api('POST', mover.dataset.mover, { direcao: mover.dataset.dir });
    } else if (aprovar) {
      await api('PUT', `/api/recados/${aprovar.dataset.aprovarRecado}`);
    } else if (aprovarComentario) {
      await api('PUT', `/api/comentarios/${aprovarComentario.dataset.aprovarComentario}`);
    } else if (apagarRecado) {
      if (!confirm(`Apagar o recado de ${apagarRecado.dataset.nome}?`)) return;
      await api('DELETE', `/api/recados/${apagarRecado.dataset.apagarRecado}`);
    } else if (ativar) {
      await api('PUT', `/api/enquetes/${ativar.dataset.ativarEnquete}`, { ativa: ativar.dataset.ativa === '1' });
    } else {
      return;
    }
    location.reload();
  } catch (e) {
    avisar(e, 'Não deu certo');
  }
});

// mostra "salvo!" no botão por um instante
function avisarSalvo(form) {
  const b = $('button:not([type="button"])', form);
  const antes = b.textContent;
  b.textContent = 'Salvo!';
  setTimeout(() => { b.textContent = antes; }, 1500);
}

// dimensões de uma imagem (primeiro quadro, no caso do gif)
async function dimensoes(url) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  return { largura: bmp.width, altura: bmp.height };
}

// envia um arquivo sem converter (gif continua animado, mp3 continua mp3)
async function enviarOriginal(arquivo, maxMb, status) {
  if (arquivo.size > maxMb * 1048576) throw erroSimples(`"${arquivo.name}" tem ${(arquivo.size / 1048576).toFixed(1)} MB e o limite é ${maxMb} MB.`);
  let dims = '';
  if (/^image\//.test(arquivo.type)) {
    try { const bmp = await createImageBitmap(arquivo); dims = `${bmp.width}x${bmp.height}`; } catch { /* sem dimensões */ }
  }
  try {
    return await subir(arquivo, dims, (p) => { if (status) status.textContent = `enviando… ${Math.round(p * 100)}%`; });
  } finally {
    if (status) status.textContent = '';
  }
}

// ---------------------------------------------------------------- painel "Site"

const paginaSite = $('.pagina-site');
if (paginaSite) iniciarSite(paginaSite);

function iniciarSite(pagina) {
  const maxMb = Number(pagina.dataset.maxMb);
  const enviar = (form, fn, titulo) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await fn(form); } catch (err) { avisar(err, titulo); }
  });
  const form = (nome) => $(`[data-form="${nome}"]`, pagina);
  const linhas = (id) => $(id).value.split('\n').map((l) => l.trim()).filter(Boolean);

  enviar(form('status'), async (f) => {
    const itens = linhas('#status-texto').map((l) => {
      const i = l.indexOf(':');
      if (i < 1) throw erroSimples(`A linha "${l}" precisa de dois-pontos: Rótulo: texto`);
      return { rotulo: l.slice(0, i).trim(), texto: l.slice(i + 1).trim() };
    });
    await api('PUT', '/api/site/status', { linhas: itens });
    avisarSalvo(f);
  }, 'Não deu pra salvar o status');

  enviar(form('todo'), async (f) => {
    const itens = linhas('#todo-texto').map((l) => (/^x\s+/i.test(l) ? { texto: l.replace(/^x\s+/i, ''), feito: true } : { texto: l, feito: false }));
    await api('PUT', '/api/site/todo', { itens });
    avisarSalvo(f);
  }, 'Não deu pra salvar o to-do');

  enviar(form('enquete'), async () => {
    const d = { pergunta: $('#enquete-pergunta').value, opcoes: linhas('#enquete-opcoes') };
    if (!d.pergunta.trim()) throw erroSimples('A enquete precisa de uma pergunta.');
    if (pagina.querySelector('[data-ativa="0"]') && !confirm('Isso encerra a enquete que está no ar agora. Continuar?')) return;
    await api('POST', '/api/enquetes', d);
    location.reload();
  }, 'Não deu pra criar a enquete');

  enviar(form('novidade'), async () => {
    await api('POST', '/api/novidades', { dia: $('#novidade-dia').value, texto: $('#novidade-texto').value });
    location.reload();
  }, 'Não deu pra adicionar a novidade');

  enviar(form('link'), async () => {
    await api('POST', '/api/links', { nome: $('#link-nome').value, url: $('#link-url').value, botao: $('#link-botao').value });
    location.reload();
  }, 'Não deu pra adicionar o link');

  enviar(form('musica'), async (f) => {
    await api('PUT', '/api/site/musica', { src: $('#musica-src').value, titulo: $('#musica-titulo').value });
    avisarSalvo(f);
  }, 'Não deu pra salvar a rádio');

  // "enviar arquivo novo" direto pra um <select> (botão do link, música)
  const input = $('#arquivo-site');
  let alvo = null;
  $$('[data-enviar-para]', pagina).forEach((b) => b.addEventListener('click', () => {
    alvo = $(`#${b.dataset.enviarPara}`);
    input.accept = b.dataset.aceita;
    input.click();
  }));
  input.addEventListener('change', async () => {
    const arquivo = input.files[0];
    input.value = '';
    if (!arquivo || !alvo) return;
    const status = $('.envio-status', alvo.closest('form'));
    try {
      const a = await enviarOriginal(arquivo, maxMb, status);
      if (!alvo.dataset.tipos.split(',').includes(a.tipo)) throw erroSimples(`"${a.nome_original}" foi pra biblioteca, mas esse tipo não serve aqui.`);
      alvo.append(new Option(a.nome_original, a.url, true, true));
    } catch (err) {
      avisar(err, 'O envio falhou');
    }
  });
}

// ---------------------------------------------------------------- painel "Decoração"

const paginaDeco = $('.pagina-deco');
if (paginaDeco) iniciarDecoracao(paginaDeco);

function iniciarDecoracao(pagina) {
  const maxMb = Number(pagina.dataset.maxMb);
  const bib = $('#deco-biblioteca');
  const previa = $('#deco-previa');
  const status = $('.envio-status', pagina);
  const IMG = /\.(gif|png|webp|jpe?g)$/i;
  let escolhido = null;

  async function escolher(url) {
    try {
      escolhido = { src: url, ...(await dimensoes(url)) };
    } catch (e) {
      avisar(e, 'Não consegui ler essa imagem');
      return;
    }
    previa.textContent = '';
    previa.style.backgroundImage = `url("${url}")`;
    previa.classList.add('tem-foto');
    $$('.foto-item', bib).forEach((li) => li.classList.toggle('escolhido', li.dataset.url === url));
  }

  function itemBib(a) {
    const li = document.createElement('li');
    li.className = 'foto-item';
    li.dataset.url = a.url;
    li.style.backgroundImage = `url("${a.url}")`;
    li.title = a.nome_original;
    li.onclick = () => escolher(a.url);
    return li;
  }

  (async () => {
    try {
      const imagens = (await api('GET', '/api/anexos')).filter((a) => IMG.test(a.arquivo));
      bib.replaceChildren(...imagens.map(itemBib));
      if (!imagens.length) bib.innerHTML = '<li class="vazio">nenhuma imagem na biblioteca ainda. Envie um gif acima.</li>';
    } catch (e) {
      bib.innerHTML = '<li class="vazio">não consegui carregar a biblioteca</li>';
      avisar(e, 'A biblioteca não carregou');
    }
  })();

  $('#deco-enviar').addEventListener('click', () => $('#deco-arquivo').click());
  $('#deco-arquivo').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    try {
      const a = await enviarOriginal(arquivo, maxMb, status);
      $('.vazio', bib)?.remove();
      bib.prepend(itemBib(a));
      await escolher(a.url);
    } catch (err) {
      avisar(err, 'O envio falhou');
    }
  });

  $('#form-moldura').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!escolhido) { avisar(erroSimples('Escolhe um gif da biblioteca (ou envia um novo).')); return; }
    try {
      await api('POST', '/api/molduras', { ...escolhido, placa: $('#deco-placa').value, lugar: $('#deco-lugar').value });
      location.reload();
    } catch (err) {
      avisar(err, 'Não deu pra pôr a moldura');
    }
  });

  $$('[data-salvar-moldura]', pagina).forEach((b) => b.addEventListener('click', async () => {
    const tr = b.closest('tr');
    try {
      await api('PUT', `/api/molduras/${b.dataset.salvarMoldura}`, { placa: $('.deco-placa', tr).value, lugar: $('.deco-lugar', tr).value });
      location.reload();
    } catch (err) {
      avisar(err, 'Não deu pra salvar a moldura');
    }
  }));
}

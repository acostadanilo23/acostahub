const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { PASTA_DADOS } = require('./config');
const { agoraLocal } = require('./util');

const PASTA_UPLOADS = path.join(PASTA_DADOS, 'uploads');
fs.mkdirSync(PASTA_UPLOADS, { recursive: true });

const db = new DatabaseSync(path.join(PASTA_DADOS, 'blog.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS posts (
    id            INTEGER PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    titulo        TEXT NOT NULL,
    resumo        TEXT NOT NULL DEFAULT '',
    tldr          TEXT NOT NULL DEFAULT '',
    conteudo      TEXT NOT NULL DEFAULT '',
    html          TEXT NOT NULL DEFAULT '',
    minutos       INTEGER NOT NULL DEFAULT 1,
    secao         TEXT NOT NULL DEFAULT 'blog',
    tags          TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'rascunho',
    publicado_em  TEXT NOT NULL DEFAULT '',
    criado_em     TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS posts_publicacao ON posts (status, publicado_em);

  -- endereços antigos de posts que mudaram de slug (pra não quebrar links)
  CREATE TABLE IF NOT EXISTS slugs_antigos (
    slug    TEXT PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS anexos (
    id            INTEGER PRIMARY KEY,
    arquivo       TEXT NOT NULL UNIQUE,
    nome_original TEXT NOT NULL,
    tipo          TEXT NOT NULL,
    tamanho       INTEGER NOT NULL,
    criado_em     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    id_hash  TEXT PRIMARY KEY,
    expira   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ajustes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  -- coleções e itens (catálogo de videogames, livros etc.)
  CREATE TABLE IF NOT EXISTS colecoes (
    id        INTEGER PRIMARY KEY,
    slug      TEXT NOT NULL UNIQUE,
    nome      TEXT NOT NULL,
    subtitulo TEXT NOT NULL DEFAULT '',
    grupo     TEXT NOT NULL DEFAULT 'videogames',
    estilo    TEXT NOT NULL DEFAULT '',
    ordem     INTEGER NOT NULL DEFAULT 0,
    visivel   INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS itens (
    id            INTEGER PRIMARY KEY,
    colecao_id    INTEGER NOT NULL REFERENCES colecoes (id) ON DELETE CASCADE,
    titulo        TEXT NOT NULL,
    ano           TEXT NOT NULL DEFAULT '',
    regiao        TEXT NOT NULL DEFAULT '',
    estado        TEXT NOT NULL DEFAULT '',
    observacoes   TEXT NOT NULL DEFAULT '',
    foto          TEXT NOT NULL DEFAULT '',
    ordem         INTEGER NOT NULL DEFAULT 0,
    criado_em     TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );

  -- livro de visitas: recado só aparece depois de aprovado no painel
  CREATE TABLE IF NOT EXISTS recados (
    id        INTEGER PRIMARY KEY,
    nome      TEXT NOT NULL,
    site      TEXT NOT NULL DEFAULT '',
    mensagem  TEXT NOT NULL,
    aprovado  INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
  );

  -- enquete: um voto por visitante (hash com segredo, sem cookie)
  CREATE TABLE IF NOT EXISTS enquetes (
    id        INTEGER PRIMARY KEY,
    pergunta  TEXT NOT NULL,
    ativa     INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS enquete_opcoes (
    id         INTEGER PRIMARY KEY,
    enquete_id INTEGER NOT NULL REFERENCES enquetes (id) ON DELETE CASCADE,
    texto      TEXT NOT NULL,
    votos      INTEGER NOT NULL DEFAULT 0,
    ordem      INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS enquete_votos (
    enquete_id INTEGER NOT NULL REFERENCES enquetes (id) ON DELETE CASCADE,
    hash       TEXT NOT NULL,
    PRIMARY KEY (enquete_id, hash)
  ) WITHOUT ROWID;

  -- gifs de decoração com moldura (lugar: esquerda, direita ou mural)
  CREATE TABLE IF NOT EXISTS molduras (
    id      INTEGER PRIMARY KEY,
    src     TEXT NOT NULL,
    largura INTEGER NOT NULL,
    altura  INTEGER NOT NULL,
    placa   TEXT NOT NULL DEFAULT '',
    lugar   TEXT NOT NULL DEFAULT 'mural',
    ordem   INTEGER NOT NULL DEFAULT 0
  );

  -- botões 88x31 de sites amigos
  CREATE TABLE IF NOT EXISTS links (
    id    INTEGER PRIMARY KEY,
    nome  TEXT NOT NULL,
    url   TEXT NOT NULL,
    botao TEXT NOT NULL DEFAULT '',
    ordem INTEGER NOT NULL DEFAULT 0
  );

  -- "o que há de novo" no site
  CREATE TABLE IF NOT EXISTS novidades (
    id    INTEGER PRIMARY KEY,
    dia   TEXT NOT NULL,
    texto TEXT NOT NULL
  );

  -- contador de visitas: totais por dia, páginas mais vistas e quem já foi contado hoje
  CREATE TABLE IF NOT EXISTS visitas_dia (
    dia            TEXT PRIMARY KEY,
    visitantes     INTEGER NOT NULL DEFAULT 0,
    visualizacoes  INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS paginas_vistas (
    caminho TEXT PRIMARY KEY,
    hits    INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS vistos_hoje (
    dia  TEXT NOT NULL,
    hash TEXT NOT NULL,
    PRIMARY KEY (dia, hash)
  ) WITHOUT ROWID;
`);

function ajuste(chave, gerar) {
  const r = db.prepare('SELECT valor FROM ajustes WHERE chave = ?').get(chave);
  if (r) return r.valor;
  const valor = gerar();
  db.prepare('INSERT INTO ajustes (chave, valor) VALUES (?, ?)').run(chave, valor);
  return valor;
}

// ajustes em JSON (status, to-do, música...)
function lerAjuste(chave, padrao) {
  const r = db.prepare('SELECT valor FROM ajustes WHERE chave = ?').get(chave);
  if (!r) return padrao;
  try { return JSON.parse(r.valor); } catch { return padrao; }
}
function gravarAjuste(chave, valor) {
  db.prepare('INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor')
    .run(chave, JSON.stringify(valor));
}

function transacao(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// troca de lugar com o vizinho e renumera a ordem (1, 2, 3...)
function mover(lista, id, direcao, gravarOrdem) {
  const idx = lista.findIndex((x) => x.id === id);
  const outro = direcao === 'subir' ? idx - 1 : idx + 1;
  if (idx === -1 || outro < 0 || outro >= lista.length) return false;
  [lista[idx], lista[outro]] = [lista[outro], lista[idx]];
  lista.forEach((x, i) => gravarOrdem(i + 1, x.id));
  return true;
}

const q = {
  publicados: db.prepare(`SELECT * FROM posts WHERE status = 'publicado' AND publicado_em <= ? ORDER BY publicado_em DESC, id DESC`),
  porSlug: db.prepare(`SELECT * FROM posts WHERE slug = ?`),
  porId: db.prepare(`SELECT * FROM posts WHERE id = ?`),
  todos: db.prepare(`SELECT id, slug, titulo, secao, status, publicado_em, atualizado_em FROM posts ORDER BY (status = 'rascunho') DESC, publicado_em DESC, id DESC`),
  inserir: db.prepare(`INSERT INTO posts (slug, titulo, resumo, tldr, conteudo, html, minutos, secao, tags, status, publicado_em, criado_em, atualizado_em)
                       VALUES (:slug, :titulo, :resumo, :tldr, :conteudo, :html, :minutos, :secao, :tags, :status, :publicado_em, :agora, :agora)`),
  atualizar: db.prepare(`UPDATE posts SET slug = :slug, titulo = :titulo, resumo = :resumo, tldr = :tldr, conteudo = :conteudo, html = :html,
                         minutos = :minutos, secao = :secao, tags = :tags, status = :status, publicado_em = :publicado_em, atualizado_em = :agora
                         WHERE id = :id`),
  excluir: db.prepare(`DELETE FROM posts WHERE id = ?`),
  conteudos: db.prepare(`SELECT id, conteudo, html, minutos FROM posts`),
  slugAntigo: db.prepare(`SELECT post_id FROM slugs_antigos WHERE slug = ?`),
  guardarSlug: db.prepare(`INSERT OR REPLACE INTO slugs_antigos (slug, post_id) VALUES (?, ?)`),
  liberarSlug: db.prepare(`DELETE FROM slugs_antigos WHERE slug = ?`),
  trocarHtml: db.prepare(`UPDATE posts SET html = ?, minutos = ? WHERE id = ?`),
  contar: db.prepare(`SELECT COUNT(*) AS n FROM posts`),

  anexoInserir: db.prepare(`INSERT INTO anexos (arquivo, nome_original, tipo, tamanho, criado_em) VALUES (?, ?, ?, ?, ?)`),
  anexos: db.prepare(`SELECT * FROM anexos ORDER BY id DESC`),
  anexoPorId: db.prepare(`SELECT * FROM anexos WHERE id = ?`),
  anexoPorArquivo: db.prepare(`SELECT * FROM anexos WHERE arquivo = ?`),
  anexoExcluir: db.prepare(`DELETE FROM anexos WHERE id = ?`),

  sessaoCriar: db.prepare(`INSERT INTO sessoes (id_hash, expira) VALUES (?, ?)`),
  sessaoValida: db.prepare(`SELECT 1 AS ok FROM sessoes WHERE id_hash = ? AND expira > ?`),
  sessaoApagar: db.prepare(`DELETE FROM sessoes WHERE id_hash = ?`),
  sessoesVelhas: db.prepare(`DELETE FROM sessoes WHERE expira <= ?`),

  colecoesPorGrupo: db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM itens WHERE colecao_id = c.id) AS total_itens FROM colecoes c WHERE c.visivel = 1 AND c.grupo = ? ORDER BY c.ordem`),
  colecoesComItens: db.prepare(`SELECT c.slug, MAX(i.atualizado_em) AS atualizado_em FROM colecoes c JOIN itens i ON i.colecao_id = c.id WHERE c.visivel = 1 GROUP BY c.id ORDER BY c.ordem`),
  todasColecoes: db.prepare(`SELECT * FROM colecoes WHERE visivel = 1 ORDER BY ordem`),
  todasColecoesAdmin: db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM itens WHERE colecao_id = c.id) AS total_itens FROM colecoes c ORDER BY c.ordem`),
  colecaoPorSlug: db.prepare(`SELECT * FROM colecoes WHERE slug = ?`),
  colecaoPorId: db.prepare(`SELECT * FROM colecoes WHERE id = ?`),
  contarColecoes: db.prepare(`SELECT COUNT(*) AS n FROM colecoes`),
  proximaOrdemColecao: db.prepare(`SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM colecoes`),
  inserirColecao: db.prepare(`INSERT INTO colecoes (slug, nome, subtitulo, grupo, estilo, ordem, visivel) VALUES (?, ?, ?, ?, ?, ?, 1)`),
  atualizarColecao: db.prepare(`UPDATE colecoes SET nome = ?, subtitulo = ?, grupo = ?, estilo = ? WHERE id = ?`),
  atualizarVisibilidadeColecao: db.prepare(`UPDATE colecoes SET visivel = ? WHERE id = ?`),
  atualizarOrdemColecao: db.prepare(`UPDATE colecoes SET ordem = ? WHERE id = ?`),
  excluirColecao: db.prepare(`DELETE FROM colecoes WHERE id = ?`),
  itensDaColecao: db.prepare(`SELECT * FROM itens WHERE colecao_id = ? ORDER BY ordem, id`),
  itemPorId: db.prepare(`SELECT * FROM itens WHERE id = ?`),
  proximaOrdemItem: db.prepare(`SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM itens WHERE colecao_id = ?`),
  inserirItem: db.prepare(`INSERT INTO itens (colecao_id, titulo, ano, regiao, estado, observacoes, foto, ordem, criado_em, atualizado_em)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  atualizarItem: db.prepare(`UPDATE itens SET titulo = ?, ano = ?, regiao = ?, estado = ?, observacoes = ?, foto = ?, atualizado_em = ?
                            WHERE id = ?`),
  excluirItem: db.prepare(`DELETE FROM itens WHERE id = ?`),
  atualizarOrdemItem: db.prepare(`UPDATE itens SET ordem = ? WHERE id = ?`),
  itensComFoto: db.prepare(`SELECT i.id, i.titulo, c.nome AS colecao_nome FROM itens i JOIN colecoes c ON i.colecao_id = c.id WHERE i.foto LIKE ?`),
  itensPublicos: db.prepare(`SELECT i.id, i.titulo, i.ano, i.estado, i.foto, i.atualizado_em, c.slug AS colecao_slug, c.nome AS colecao_nome
                             FROM itens i JOIN colecoes c ON c.id = i.colecao_id WHERE c.visivel = 1 ORDER BY c.ordem, i.ordem, i.id`),

  recadosAprovados: db.prepare(`SELECT * FROM recados WHERE aprovado = 1 ORDER BY id DESC LIMIT ? OFFSET ?`),
  contarAprovados: db.prepare(`SELECT COUNT(*) AS n FROM recados WHERE aprovado = 1`),
  contarPendentes: db.prepare(`SELECT COUNT(*) AS n FROM recados WHERE aprovado = 0`),
  recadosAdmin: db.prepare(`SELECT * FROM recados ORDER BY aprovado, id DESC LIMIT 500`),
  inserirRecado: db.prepare(`INSERT INTO recados (nome, site, mensagem, criado_em) VALUES (?, ?, ?, ?)`),
  aprovarRecado: db.prepare(`UPDATE recados SET aprovado = 1 WHERE id = ?`),
  excluirRecado: db.prepare(`DELETE FROM recados WHERE id = ?`),

  enqueteAtiva: db.prepare(`SELECT * FROM enquetes WHERE ativa = 1 ORDER BY id DESC LIMIT 1`),
  enquetePorId: db.prepare(`SELECT * FROM enquetes WHERE id = ?`),
  enquetes: db.prepare(`SELECT * FROM enquetes ORDER BY id DESC`),
  opcoesDe: db.prepare(`SELECT * FROM enquete_opcoes WHERE enquete_id = ? ORDER BY ordem, id`),
  inserirEnquete: db.prepare(`INSERT INTO enquetes (pergunta, ativa, criado_em) VALUES (?, 1, ?)`),
  inserirOpcao: db.prepare(`INSERT INTO enquete_opcoes (enquete_id, texto, ordem) VALUES (?, ?, ?)`),
  desativarEnquetes: db.prepare(`UPDATE enquetes SET ativa = 0`),
  ativarEnquete: db.prepare(`UPDATE enquetes SET ativa = ? WHERE id = ?`),
  excluirEnquete: db.prepare(`DELETE FROM enquetes WHERE id = ?`),
  guardarVoto: db.prepare(`INSERT OR IGNORE INTO enquete_votos (enquete_id, hash) VALUES (?, ?)`),
  somarVoto: db.prepare(`UPDATE enquete_opcoes SET votos = votos + 1 WHERE id = ? AND enquete_id = ?`),
  jaVotou: db.prepare(`SELECT 1 AS ok FROM enquete_votos WHERE enquete_id = ? AND hash = ?`),

  molduras: db.prepare(`SELECT * FROM molduras ORDER BY lugar, ordem, id`),
  moldurasDe: db.prepare(`SELECT * FROM molduras WHERE lugar = ? ORDER BY ordem, id`),
  molduraPorId: db.prepare(`SELECT * FROM molduras WHERE id = ?`),
  contarMolduras: db.prepare(`SELECT COUNT(*) AS n FROM molduras`),
  proximaOrdemMoldura: db.prepare(`SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM molduras WHERE lugar = ?`),
  inserirMoldura: db.prepare(`INSERT INTO molduras (src, largura, altura, placa, lugar, ordem) VALUES (?, ?, ?, ?, ?, ?)`),
  atualizarMoldura: db.prepare(`UPDATE molduras SET placa = ?, lugar = ?, ordem = ? WHERE id = ?`),
  ordemMoldura: db.prepare(`UPDATE molduras SET ordem = ? WHERE id = ?`),
  excluirMoldura: db.prepare(`DELETE FROM molduras WHERE id = ?`),

  links: db.prepare(`SELECT * FROM links ORDER BY ordem, id`),
  linkPorId: db.prepare(`SELECT * FROM links WHERE id = ?`),
  proximaOrdemLink: db.prepare(`SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM links`),
  inserirLink: db.prepare(`INSERT INTO links (nome, url, botao, ordem) VALUES (?, ?, ?, ?)`),
  ordemLink: db.prepare(`UPDATE links SET ordem = ? WHERE id = ?`),
  excluirLink: db.prepare(`DELETE FROM links WHERE id = ?`),

  novidades: db.prepare(`SELECT * FROM novidades ORDER BY dia DESC, id DESC LIMIT ?`),
  inserirNovidade: db.prepare(`INSERT INTO novidades (dia, texto) VALUES (?, ?)`),
  excluirNovidade: db.prepare(`DELETE FROM novidades WHERE id = ?`),
};

function votar(enqueteId, opcaoId, hash) {
  return transacao(() => {
    if (!q.guardarVoto.run(enqueteId, hash).changes) return 'repetido';
    if (!q.somarVoto.run(opcaoId, enqueteId).changes) throw new Error('opção de outra enquete');
    return 'ok';
  });
}

function criarEnquete(pergunta, opcoes) {
  return transacao(() => {
    q.desativarEnquetes.run();
    const id = Number(q.inserirEnquete.run(pergunta, new Date().toISOString()).lastInsertRowid);
    opcoes.forEach((t, i) => q.inserirOpcao.run(id, t, i + 1));
    return id;
  });
}

function ativarEnquete(id, ativa) {
  return transacao(() => {
    if (ativa) q.desativarEnquetes.run();
    return q.ativarEnquete.run(ativa ? 1 : 0, id).changes;
  });
}

function reordenarColecao(id, direcao) {
  const todas = q.todasColecoesAdmin.all();
  const idx = todas.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  const outroIdx = direcao === 'subir' ? idx - 1 : idx + 1;
  if (outroIdx < 0 || outroIdx >= todas.length) return false;
  const [removido] = todas.splice(idx, 1);
  todas.splice(outroIdx, 0, removido);
  for (let i = 0; i < todas.length; i++) {
    q.atualizarOrdemColecao.run(i + 1, todas[i].id);
  }
  return true;
}

function reordenarItem(id, direcao) {
  const item = q.itemPorId.get(id);
  if (!item) return false;
  const itens = q.itensDaColecao.all(item.colecao_id);
  const idx = itens.findIndex((it) => it.id === id);
  if (idx === -1) return false;
  const outroIdx = direcao === 'subir' ? idx - 1 : idx + 1;
  if (outroIdx < 0 || outroIdx >= itens.length) return false;
  const [removido] = itens.splice(idx, 1);
  itens.splice(outroIdx, 0, removido);
  for (let i = 0; i < itens.length; i++) {
    q.atualizarOrdemItem.run(i + 1, itens[i].id);
  }
  return true;
}

function ordenarColecaoItens(colecaoId, criterio, direcao = 'asc') {
  const itens = q.itensDaColecao.all(colecaoId);
  itens.sort((a, b) => {
    let comp = 0;
    if (criterio === 'ano') {
      const anoA = String(a.ano || '').trim();
      const anoB = String(b.ano || '').trim();
      if (!anoA && anoB) comp = 1;
      else if (anoA && !anoB) comp = -1;
      else comp = anoA.localeCompare(anoB, undefined, { numeric: true });
    }
    if (comp === 0) {
      comp = String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR', { sensitivity: 'base' });
    }
    return direcao === 'desc' ? -comp : comp;
  });
  for (let i = 0; i < itens.length; i++) {
    q.atualizarOrdemItem.run(i + 1, itens[i].id);
  }
  return true;
}

module.exports = {
  db,
  PASTA_UPLOADS,
  ajuste,
  lerAjuste,
  gravarAjuste,
  transacao,

  itensPublicos: () => q.itensPublicos.all(),

  recadosAprovados: (limite, pular) => q.recadosAprovados.all(limite, pular),
  contarAprovados: () => q.contarAprovados.get().n,
  contarPendentes: () => q.contarPendentes.get().n,
  recadosAdmin: () => q.recadosAdmin.all(),
  inserirRecado: (r) => Number(q.inserirRecado.run(r.nome, r.site, r.mensagem, new Date().toISOString()).lastInsertRowid),
  aprovarRecado: (id) => q.aprovarRecado.run(id).changes,
  excluirRecado: (id) => q.excluirRecado.run(id).changes,

  enqueteAtiva: () => q.enqueteAtiva.get(),
  enquetePorId: (id) => q.enquetePorId.get(id),
  enquetes: () => q.enquetes.all(),
  opcoesDe: (id) => q.opcoesDe.all(id),
  criarEnquete,
  ativarEnquete,
  excluirEnquete: (id) => q.excluirEnquete.run(id).changes,
  votar,
  jaVotou: (id, hash) => !!q.jaVotou.get(id, hash),

  molduras: () => q.molduras.all(),
  moldurasDe: (lugar) => q.moldurasDe.all(lugar),
  molduraPorId: (id) => q.molduraPorId.get(id),
  contarMolduras: () => q.contarMolduras.get().n,
  inserirMoldura: (m) => Number(q.inserirMoldura.run(m.src, m.largura, m.altura, m.placa, m.lugar, q.proximaOrdemMoldura.get(m.lugar).proxima).lastInsertRowid),
  atualizarMoldura: (id, m) => {
    const atual = q.molduraPorId.get(id);
    const ordem = atual.lugar === m.lugar ? atual.ordem : q.proximaOrdemMoldura.get(m.lugar).proxima;
    return q.atualizarMoldura.run(m.placa, m.lugar, ordem, id).changes;
  },
  moverMoldura: (id, direcao) => {
    const m = q.molduraPorId.get(id);
    return !!m && mover(q.moldurasDe.all(m.lugar), id, direcao, (o, i) => q.ordemMoldura.run(o, i));
  },
  excluirMoldura: (id) => q.excluirMoldura.run(id).changes,

  links: () => q.links.all(),
  linkPorId: (id) => q.linkPorId.get(id),
  inserirLink: (l) => Number(q.inserirLink.run(l.nome, l.url, l.botao, q.proximaOrdemLink.get().proxima).lastInsertRowid),
  moverLink: (id, direcao) => mover(q.links.all(), id, direcao, (o, i) => q.ordemLink.run(o, i)),
  excluirLink: (id) => q.excluirLink.run(id).changes,

  novidades: (limite = 500) => q.novidades.all(limite),
  inserirNovidade: (n) => Number(q.inserirNovidade.run(n.dia, n.texto).lastInsertRowid),
  excluirNovidade: (id) => q.excluirNovidade.run(id).changes,

  publicados: () => q.publicados.all(agoraLocal()),
  postPorSlug: (slug) => q.porSlug.get(slug),
  postPorId: (id) => q.porId.get(id),
  todosPosts: () => q.todos.all(),
  inserirPost: (p) => Number(q.inserir.run({ ...p, agora: new Date().toISOString() }).lastInsertRowid),
  atualizarPost: (id, p) => q.atualizar.run({ ...p, id, agora: new Date().toISOString() }),
  excluirPost: (id) => q.excluir.run(id),
  contarPosts: () => q.contar.get().n,
  conteudos: () => q.conteudos.all(),
  postPorSlugAntigo: (slug) => q.slugAntigo.get(slug)?.post_id,
  guardarSlugAntigo: (slug, id) => q.guardarSlug.run(slug, id),
  liberarSlug: (slug) => q.liberarSlug.run(slug),
  trocarHtml: (id, html, minutos) => q.trocarHtml.run(html, minutos, id),

  inserirAnexo: (a) => Number(q.anexoInserir.run(a.arquivo, a.nome_original, a.tipo, a.tamanho, new Date().toISOString()).lastInsertRowid),
  anexos: () => q.anexos.all(),
  anexoPorId: (id) => q.anexoPorId.get(id),
  anexoPorArquivo: (arq) => q.anexoPorArquivo.get(arq),
  excluirAnexo: (id) => q.anexoExcluir.run(id),

  criarSessao: (idHash, expira) => q.sessaoCriar.run(idHash, expira),
  sessaoValida: (idHash) => !!q.sessaoValida.get(idHash, Date.now()),
  apagarSessao: (idHash) => q.sessaoApagar.run(idHash),
  limparSessoes: () => q.sessoesVelhas.run(Date.now()),

  colecoesPorGrupo: (grupo) => q.colecoesPorGrupo.all(grupo),
  colecoesComItens: () => q.colecoesComItens.all(),
  todasColecoes: () => q.todasColecoes.all(),
  todasColecoesAdmin: () => q.todasColecoesAdmin.all(),
  colecaoPorSlug: (slug) => q.colecaoPorSlug.get(slug),
  colecaoPorId: (id) => q.colecaoPorId.get(id),
  contarColecoes: () => q.contarColecoes.get().n,
  proximaOrdemColecao: () => q.proximaOrdemColecao.get().proxima,
  inserirColecao: (c) => Number(q.inserirColecao.run(c.slug, c.nome, c.subtitulo, c.grupo, c.estilo, c.ordem).lastInsertRowid),
  atualizarColecao: (id, c) => q.atualizarColecao.run(c.nome, c.subtitulo, c.grupo, c.estilo, id),
  atualizarVisibilidadeColecao: (id, visivel) => q.atualizarVisibilidadeColecao.run(visivel, id),
  reordenarColecao,
  excluirColecao: (id) => q.excluirColecao.run(id),
  itensDaColecao: (colecaoId) => q.itensDaColecao.all(colecaoId),
  itemPorId: (id) => q.itemPorId.get(id),
  proximaOrdemItem: (colecaoId) => q.proximaOrdemItem.get(colecaoId).proxima,
  inserirItem: (item) => {
    const agora = new Date().toISOString();
    return Number(q.inserirItem.run(
      item.colecao_id,
      item.titulo,
      item.ano || '',
      item.regiao || '',
      item.estado || '',
      item.observacoes || '',
      item.foto || '',
      item.ordem || 0,
      agora,
      agora
    ).lastInsertRowid);
  },
  atualizarItem: (id, item) => {
    const agora = new Date().toISOString();
    return q.atualizarItem.run(
      item.titulo,
      item.ano || '',
      item.regiao || '',
      item.estado || '',
      item.observacoes || '',
      item.foto || '',
      agora,
      id
    );
  },
  excluirItem: (id) => q.excluirItem.run(id),
  reordenarItem,
  ordenarColecaoItens,
  itensComFoto: (arquivo) => q.itensComFoto.all(`%${arquivo}%`),
};

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
};

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

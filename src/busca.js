// Busca do site: posts publicados e itens das coleções visíveis.
// O site é pequeno, então filtra em memória mesmo: sem acento, sem maiúscula, todas as palavras têm que aparecer.
const db = require('./db');
const { textoPuro } = require('./markdown');

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const MAX_TERMO = 60;

function termosDe(q) {
  return [...new Set(normalizar(q).slice(0, MAX_TERMO).split(/[^a-z0-9]+/).filter((t) => t.length >= 2))].slice(0, 6);
}

const bate = (texto, termos) => termos.every((t) => texto.includes(t));

// trechinho do texto em volta da primeira palavra achada
function trecho(texto, termos) {
  const n = normalizar(texto);
  const i = Math.min(...termos.map((t) => n.indexOf(t)).filter((x) => x >= 0));
  if (!Number.isFinite(i)) return texto.slice(0, 160);
  const ini = Math.max(0, i - 60);
  return (ini > 0 ? '...' : '') + texto.slice(ini, ini + 160).trim() + (ini + 160 < texto.length ? '...' : '');
}

function buscar(q) {
  const termos = termosDe(q);
  if (!termos.length) return { termos, posts: [], itens: [] };

  const posts = db.publicados()
    .map((p) => {
      const corpo = textoPuro(p.conteudo);
      const titulo = normalizar(`${p.titulo} ${p.tags}`);
      const tudo = `${titulo} ${normalizar(p.resumo)} ${normalizar(corpo)}`;
      return bate(tudo, termos) ? { ...p, noTitulo: bate(titulo, termos), trecho: trecho(p.resumo || corpo, termos) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.noTitulo - a.noTitulo); // quem tem no título vem antes; o resto segue do mais novo pro mais velho

  const itens = db.itensPublicos()
    .filter((i) => bate(normalizar([i.titulo, i.ano, i.regiao, i.estado, i.observacoes, i.colecao_nome].join(' ')), termos))
    .slice(0, 60);

  return { termos, posts, itens };
}

module.exports = { buscar, MAX_TERMO };

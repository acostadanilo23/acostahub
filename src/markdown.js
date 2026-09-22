// Markdown -> HTML, feito em casa e seguro:
// todo HTML digitado é escapado, links só aceitam http(s), mailto, # e caminhos relativos.
//
// Suporta: # títulos, **negrito**, *itálico*, ~~riscado~~, `código`, [link](url),
// ![imagem](url "legenda"), listas, > citação, ``` blocos de código ```, ---,
// e blocos especiais  :::fluxo ... :::  e  :::aviso ... :::

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

// recebe a url JÁ escapada
function urlSegura(u) {
  u = u.trim();
  return /^(https?:\/\/|mailto:|#|\/(?!\/)|\.{1,2}\/)/i.test(u) ? u : null;
}

const RE_DIM = /-(\d{1,5})x(\d{1,5})\.(?:webp|png|jpe?g|gif)(?:[?#].*)?$/i;
const RE_AUDIO = /\.(?:mp3|ogg)(?:[?#].*)?$/i;

function midia(alt, src) {
  const url = urlSegura(src);
  if (!url) return alt;
  if (RE_AUDIO.test(url)) return `<audio controls preload="none" src="${url}"></audio>`;
  const dim = url.match(RE_DIM);
  const tam = dim ? ` width="${dim[1]}" height="${dim[2]}"` : '';
  return `<img src="${url}" alt="${alt}"${tam} loading="lazy" decoding="async">`;
}

function enfase(s) {
  return s
    .replace(/\*\*(?=\S)(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*(?=\S)(.+?)\*(?![*\w])/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_(?=\S)(.+?)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~(?=\S)(.+?)~~/g, '<s>$1</s>');
}

function inline(texto) {
  const guardados = [];
  const guarda = (html) => `\u0001${guardados.push(html) - 1}\u0002`;

  let s = texto.replace(/[\u0001\u0002]/g, '');
  s = s.replace(/`([^`]+)`/g, (_, c) => guarda(`<code>${esc(c)}</code>`));
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, (_, alt, src) => guarda(midia(alt, src)));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, (_, txt, href, titulo) => {
    const url = urlSegura(href);
    if (!url) return txt;
    const fora = /^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : '';
    const t = titulo ? ` title="${titulo}"` : '';
    return guarda(`<a href="${url}"${t}${fora}>${enfase(txt)}</a>`);
  });
  s = s.replace(/&lt;(https?:\/\/\S+?)&gt;/g, (_, u) => guarda(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`));
  s = enfase(s);

  // restaura (em loop porque texto de link pode conter código guardado)
  while (/\u0001\d+\u0002/.test(s)) s = s.replace(/\u0001(\d+)\u0002/g, (_, i) => guardados[i]);
  return s;
}

const RE_IMG_SOZINHA = /^\s*!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)\s*$/;
const RE_LISTA = /^\s*([-*+]|\d+[.)])\s+/;
const RE_INICIO_BLOCO = /^(#{1,3}\s|```|:::|>|\s*([-*+]|\d+[.)])\s+|(-{3,}|\*{3,})\s*$)/;

function renderizar(md) {
  const linhas = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < linhas.length) {
    const l = linhas[i];

    if (!l.trim()) { i++; continue; }

    // bloco de código
    let m = l.match(/^```\s*([\w-]*)/);
    if (m) {
      const cod = [];
      i++;
      while (i < linhas.length && !/^```\s*$/.test(linhas[i])) cod.push(linhas[i++]);
      i++;
      const cls = m[1] ? ` class="lang-${esc(m[1])}"` : '';
      out.push(`<pre><code${cls}>${esc(cod.join('\n'))}</code></pre>`);
      continue;
    }

    // :::fluxo / :::aviso
    m = l.match(/^:::\s*(fluxo|aviso)\s*$/);
    if (m) {
      const dentro = [];
      i++;
      while (i < linhas.length && !/^:::\s*$/.test(linhas[i])) dentro.push(linhas[i++]);
      i++;
      out.push(m[1] === 'fluxo'
        ? `<div class="fluxo">${dentro.map(inline).join('<br>')}</div>`
        : `<div class="aviso">${renderizar(dentro.join('\n'))}</div>`);
      continue;
    }

    m = l.match(/^(#{1,3})\s+(.*)$/);
    if (m) {
      const n = m[1].length === 3 ? 3 : 2;
      out.push(`<h${n}>${inline(m[2].replace(/\s+#+\s*$/, ''))}</h${n}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }

    if (/^>/.test(l)) {
      const cit = [];
      while (i < linhas.length && /^>/.test(linhas[i])) cit.push(linhas[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderizar(cit.join('\n'))}</blockquote>`);
      continue;
    }

    if (RE_LISTA.test(l)) {
      const ordenada = /^\s*\d/.test(l);
      const itens = [];
      while (i < linhas.length && linhas[i].trim()) {
        if (RE_LISTA.test(linhas[i])) {
          if (/^\s*\d/.test(linhas[i]) !== ordenada) break;
          itens.push(linhas[i].replace(RE_LISTA, ''));
        }
        else if (/^\s+\S/.test(linhas[i]) && itens.length) itens[itens.length - 1] += ' ' + linhas[i].trim();
        else break;
        i++;
      }
      const tag = ordenada ? 'ol' : 'ul';
      out.push(`<${tag}>${itens.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    // parágrafo (ou figura, se só tiver imagens)
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !(par.length && RE_INICIO_BLOCO.test(linhas[i]))) par.push(linhas[i++]);

    if (par.every((p) => RE_IMG_SOZINHA.test(p))) {
      const legendas = [];
      const imgs = par.map((p) => {
        const leg = p.match(/"([^"]*)"\)\s*$/);
        if (leg && leg[1]) legendas.push(leg[1]);
        return inline(p.trim());
      });
      const cap = legendas.length ? `<figcaption>${esc(legendas.join(' · '))}</figcaption>` : '';
      out.push(`<figure>${imgs.join('')}${cap}</figure>`);
    } else {
      out.push(`<p>${par.map((p) => inline(p.trim())).join('<br>\n')}</p>`);
    }
  }
  return out.join('\n');
}

// texto puro pra resumo automático e tempo de leitura
function textoPuro(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^:::.*$/gm, ' ')
    .replace(/[#>*_~`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { renderizar, textoPuro, esc };

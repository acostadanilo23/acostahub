const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { PASTA_PUBLICA } = require('./config');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};
const COMPRIMIVEL = new Set(['.html', '.css', '.js', '.json', '.txt', '.xml']);
const STREAM = new Set(['.mp3', '.ogg', '.pdf', '.zip']);

// cache em memória: arquivo -> { mtime, corpo, gz, etag }
const cache = new Map();

function carregar(arquivo) {
  const st = fs.statSync(arquivo);
  const c = cache.get(arquivo);
  if (c && c.mtime === st.mtimeMs) return c;
  const corpo = fs.readFileSync(arquivo);
  const ext = path.extname(arquivo).toLowerCase();
  const novo = {
    mtime: st.mtimeMs,
    corpo,
    gz: COMPRIMIVEL.has(ext) && corpo.length > 1024 ? zlib.gzipSync(corpo, { level: 9 }) : null,
    etag: '"' + crypto.createHash('sha1').update(corpo).digest('base64url').slice(0, 16) + '"',
  };
  if (st.size < 2 * 1024 * 1024) cache.set(arquivo, novo);
  return novo;
}

// "/css/styles.css" -> "/css/styles.css?v=abc123" (muda quando o arquivo muda)
function versao(url) {
  try {
    return `${url}?v=${carregar(path.join(PASTA_PUBLICA, url)).etag.slice(1, 9)}`;
  } catch {
    return url;
  }
}

function dentro(base, pedido) {
  const alvo = path.resolve(base, '.' + path.posix.normalize('/' + pedido));
  return alvo.startsWith(base + path.sep) ? alvo : null;
}

function mandarArquivo(req, res, arquivo, { imutavel = false, anexo = null } = {}) {
  let st;
  try {
    st = fs.statSync(arquivo);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;

  const ext = path.extname(arquivo).toLowerCase();
  const tipo = TIPOS[ext];
  if (!tipo) return false;

  const versionado = imutavel || /[?&]v=/.test(req.url);
  res.setHeader('Content-Type', tipo);
  res.setHeader('Cache-Control', versionado ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
  if (anexo) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(anexo)}`);

  // arquivos grandes e mídia vão em stream, com suporte a Range (pular no meio da música)
  if (st.size >= 2 * 1024 * 1024 || STREAM.has(ext)) {
    res.setHeader('Accept-Ranges', 'bytes');
    let ini = 0;
    let fim = st.size - 1;
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (r && (r[1] || r[2])) {
      if (r[1]) { ini = Number(r[1]); if (r[2]) fim = Math.min(Number(r[2]), fim); }
      else ini = Math.max(0, st.size - Number(r[2]));
      if (ini > fim || ini >= st.size) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${st.size}`);
        res.end();
        return true;
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${ini}-${fim}/${st.size}`);
    }
    res.setHeader('Content-Length', fim - ini + 1);
    if (req.method === 'HEAD' || st.size === 0) return res.end(), true;
    fs.createReadStream(arquivo, { start: ini, end: fim }).on('error', () => res.destroy()).pipe(res);
    return true;
  }

  const c = carregar(arquivo);
  res.setHeader('ETag', c.etag);
  if (req.headers['if-none-match'] === c.etag) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  const querGz = c.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (c.gz) res.setHeader('Vary', 'Accept-Encoding');
  if (querGz) res.setHeader('Content-Encoding', 'gzip');
  const corpo = querGz ? c.gz : c.corpo;
  res.setHeader('Content-Length', corpo.length);
  res.end(req.method === 'HEAD' ? undefined : corpo);
  return true;
}

function servirPublico(req, res, pathname) {
  const arquivo = dentro(PASTA_PUBLICA, pathname);
  return !!arquivo && mandarArquivo(req, res, arquivo);
}

module.exports = { TIPOS, versao, dentro, mandarArquivo, servirPublico };

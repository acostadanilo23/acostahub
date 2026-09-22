const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// formato: scrypt:N:r:p:sal:hash (base64url, sem "$" pra não brigar com docker/.env)
async function gerarHash(senha) {
  const N = 16384, r = 8, p = 1;
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(senha, sal, 64, { N, r, p });
  return ['scrypt', N, r, p, sal.toString('base64url'), hash.toString('base64url')].join(':');
}

async function conferirSenha(senha, guardado) {
  const partes = String(guardado).split(':');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64url');
  const obtido = await scrypt(String(senha), Buffer.from(sal, 'base64url'), esperado.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return crypto.timingSafeEqual(esperado, obtido);
}

module.exports = { gerarHash, conferirSenha };

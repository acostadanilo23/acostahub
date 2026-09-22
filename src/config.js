const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');

try {
  process.loadEnvFile(path.join(RAIZ, '.env'));
} catch {
  // sem .env: usa as variáveis do ambiente (docker, systemd...)
}

const env = process.env;

module.exports = {
  RAIZ,
  PASTA_PUBLICA: path.join(RAIZ, 'public'),
  PASTA_DADOS: path.resolve(RAIZ, env.PASTA_DADOS || 'data'),
  PORTA: Number(env.PORT) || 3000,
  HOST: env.HOST || '0.0.0.0',
  SITE_URL: (env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  ADMIN_USUARIO: env.ADMIN_USUARIO || 'hb',
  ADMIN_SENHA_HASH: env.ADMIN_SENHA_HASH || '',
  COOKIE_SEGURO: env.COOKIE_SEGURO === 'true',
  CONFIAR_PROXY: env.CONFIAR_PROXY === 'true',
  UPLOAD_MAX_MB: Number(env.UPLOAD_MAX_MB) || 15,
  FUSO: env.FUSO_HORARIO || 'America/Sao_Paulo',
  EMAIL: env.EMAIL_CONTATO || 'contato@huntbuddy.fun',
};

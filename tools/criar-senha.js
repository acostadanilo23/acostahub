// Gera o ADMIN_SENHA_HASH pro .env
// uso:  npm run senha            (pergunta a senha sem mostrar na tela)
const readline = require('node:readline');
const { gerarHash } = require('../src/senha');

function perguntar(texto) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = true;
    rl._writeToOutput = (s) => { if (!rl.stdoutMuted || s.includes(texto)) process.stdout.write(s); };
    rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); ok(r); });
  });
}

(async () => {
  const senha = process.argv[2] || await perguntar('Nova senha do painel: ');
  if (senha.length < 10) {
    console.error('Usa pelo menos 10 caracteres, vai.');
    process.exit(1);
  }
  if (!process.argv[2] && senha !== await perguntar('Repete a senha: ')) {
    console.error('As senhas não batem.');
    process.exit(1);
  }
  console.log('\nCole essa linha no seu .env:\n');
  console.log(`ADMIN_SENHA_HASH=${await gerarHash(senha)}\n`);
  process.exit(0);
})();

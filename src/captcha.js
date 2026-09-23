// Desafio anti-robô caseiro, sem JavaScript e sem cookie: uma continha ou "que cor é esse quadrado?".
// A resposta não vai pra página: vai só uma assinatura (HMAC) da resposta certa com prazo de validade.
// Cada desafio vale uma vez só (a lista de usados fica na memória).
const crypto = require('node:crypto');
const db = require('./db');

const SEGREDO = db.ajuste('segredo_captcha', () => crypto.randomBytes(32).toString('hex'));
const VALIDADE = 2 * 60 * 60000;

// cor -> [como aparece, respostas aceitas]
const CORES = {
  vermelho: ['#e00000', ['vermelho', 'vermelha']],
  azul: ['#0040ff', ['azul']],
  verde: ['#00b000', ['verde']],
  amarelo: ['#ffe000', ['amarelo', 'amarela']],
  preto: ['#000000', ['preto', 'preta']],
  branco: ['#ffffff', ['branco', 'branca']],
  laranja: ['#ff8000', ['laranja']],
  roxo: ['#8000c0', ['roxo', 'roxa', 'violeta']],
  rosa: ['#ff60c0', ['rosa', 'pink']],
};

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// qualquer jeito aceito de responder vira a resposta "oficial"
function canonica(resposta) {
  const r = normalizar(resposta);
  if (/^\d{1,3}$/.test(r)) return String(Number(r));
  for (const [cor, [, aceitas]] of Object.entries(CORES)) if (aceitas.includes(r)) return cor;
  return r;
}

const assinar = (expira, sal, resposta) => crypto.createHmac('sha256', SEGREDO).update(`${expira}|${sal}|${resposta}`).digest('base64url').slice(0, 24);

// devolve o pedaço de formulário (label + campo + desafio escondido)
function campo() {
  const expira = Date.now() + VALIDADE;
  const sal = crypto.randomBytes(6).toString('base64url'); // dois desafios iguais no mesmo instante não colidem
  let pergunta;
  let resposta;
  if (crypto.randomInt(2)) {
    const [a, b] = [crypto.randomInt(1, 10), crypto.randomInt(1, 10)];
    pergunta = `Anti-robô: quanto é ${a} + ${b}?`;
    resposta = String(a + b);
  } else {
    const nomes = Object.keys(CORES);
    resposta = nomes[crypto.randomInt(nomes.length)];
    pergunta = `Anti-robô: que cor é esse quadrado? <span class="desafio-cor" style="background:${CORES[resposta][0]}"></span>`;
  }
  return `<label>${pergunta} <input name="resposta" maxlength="20" required autocomplete="off"></label>
                        <input type="hidden" name="desafio" value="${expira}.${sal}.${assinar(expira, sal, resposta)}">
                        <small class="desafio-dica">não deu pra ver? recarregue a página pra trocar a pergunta</small>`;
}

const usados = new Map(); // desafio -> expira

function conferir(desafio, resposta) {
  const [exp, sal, assinatura] = String(desafio || '').split('.');
  const expira = Number(exp);
  const agora = Date.now();
  if (!expira || !sal || !assinatura || expira < agora || expira > agora + VALIDADE || usados.has(desafio)) return false;
  // queima o desafio em qualquer tentativa, certa ou errada: robô não fica chutando 2, 3, 4... no mesmo
  if (usados.size > 5000) for (const [k, v] of usados) if (v < agora) usados.delete(k);
  usados.set(desafio, expira);
  const certa = Buffer.from(assinar(expira, sal, canonica(resposta)));
  const recebida = Buffer.from(assinatura);
  return certa.length === recebida.length && crypto.timingSafeEqual(certa, recebida);
}

module.exports = { campo, conferir };

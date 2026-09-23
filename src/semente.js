// Na primeira vez que o servidor sobe (banco vazio), cadastra o primeiro post do site antigo.
const db = require('./db');
const md = require('./markdown');
const { minutosLeitura } = require('./util');

const CONTEUDO = `Essa semana eu tava vendo um [vídeo](https://www.youtube.com/watch?v=43TJzoo8ivQ) no youtube do canal [HardLevel](https://www.youtube.com/@hardlevel) *(excelente canal sobre PS2 para o público brasileiro)* sobre alguém ter implementado o RetroAchievements no PS2. Eu já conhecia o RetroAchievements, mas nunca tinha usado no console, e fiquei curioso pra ver como funcionava.

![Foto da Thumbnail do vídeo do HardLevel sobre o RetroAchievements no PS2](/images/blog/post1/3-640x153.webp "o vídeo que começou tudo")

O vídeo mostrava a interface do app, que é bem simples, **mas só tinha inglês.**

Tendo em vista como o PS2 ainda é popular no Brasil por ser um console barato e com uma biblioteca de jogos enorme, achei que seria legal ter a interface traduzida pro português. Felizmente o HardLevel colocou o link do projeto na descrição do vídeo. Então fui atrás do projeto no GitHub e encontrei o xerabora, um companion para RetroAchievements que funciona em um console PS2 de verdade.

Sempre tive vontade de contribuir com um projeto open source, mas nunca soube bem por onde começar. Abri um issue no repositório perguntando se podia ajudar com traduções para português e espanhol, e o autor respondeu que já tinha feito uma primeira passagem para as duas línguas, mas precisava de um olho nativo pra revisar.

![Print do issue aberto no github com minha contribuição](/images/blog/post1/4-640x579.webp "a issue onde eu ofereci ajuda")

**Eu nunca tinha feito revisão de tradução antes**, mas achei que seria uma boa oportunidade de aprender. Então comecei a revisar o arquivo de tradução para português, e percebi que tinha algumas coisas que não tavam fazendo sentido, e outras que eram traduções literais do inglês. Com isso em mente fui fazendo as alterações e mexendo no que fazia sentido, seguindo o fluxo de desenvolvimento correto quando não se tem poder de escrita no repo.

:::fluxo
Fork → Branch → Commit → Pull Request
:::

Quando terminei, abri um pull request com minhas alterações e agora é só esperar ele validar.

## O único "problema": o espanhol

Espanhol não é minha língua e eu não sei quase nada de espanhol. Então eu não podia revisar o arquivo de tradução para espanhol, mas como eu já tinha feito a revisão do português, achei que poderia ajudar com o espanhol também com a ajuda de uma IA pra me ajudar a traduzir, mas mesmo assim algumas coisas ainda não estavam muito naturais. Então eu tive que pesquisar alguns termos em espanhol e ver como eles eram usados em jogos, e com isso consegui fazer algumas alterações que deixaram a tradução mais natural.

![Print do PR aberto no github com minha contribuição](/images/blog/post1/1-640x485.webp "o pull request, esperando review")
![Print do PR aberto no github com minha contribuição](/images/blog/post1/2-640x485.webp)

Foi uma experiência muito legal, e eu aprendi bastante sobre como funciona o fluxo de desenvolvimento de um projeto open source, e também sobre como fazer revisão de tradução pra um projeto simples.

Serviu pra me mostrar que eu posso contribuir com projetos open source mesmo sem ter muito conhecimento técnico, sempre foi algo que eu colocava dificuldades e no fim não foi tão difícil quanto eu imaginava.
`;

// o HTML dos posts fica pronto no banco; se o renderizador mudar, atualiza tudo ao iniciar
function rerenderizar() {
  let n = 0;
  for (const p of db.conteudos()) {
    const html = md.renderizar(p.conteudo);
    const minutos = minutosLeitura(md.textoPuro(p.conteudo));
    if (html !== p.html || minutos !== p.minutos) { db.trocarHtml(p.id, html, minutos); n++; }
  }
  if (n) console.log(`Re-renderizei ${n} post(s).`);
}

// coleções iniciais — mesmos slugs de antes, pra nenhum link mudar
const SEED_COLECOES = [
  { slug: 'ps1',      nome: 'PS1',      subtitulo: 'PlayStation',        grupo: 'videogames', estilo: 'p-ps1',    ordem: 1  },
  { slug: 'ps2',      nome: 'PS2',      subtitulo: 'PlayStation 2',      grupo: 'videogames', estilo: 'p-ps2',    ordem: 2  },
  { slug: 'ps3',      nome: 'PS3',      subtitulo: 'PlayStation 3',      grupo: 'videogames', estilo: 'p-ps3',    ordem: 3  },
  { slug: 'ps4',      nome: 'PS4',      subtitulo: 'PlayStation 4',      grupo: 'videogames', estilo: 'p-ps4',    ordem: 4  },
  { slug: 'xbox',     nome: 'XBOX',     subtitulo: 'Xbox',               grupo: 'videogames', estilo: 'p-xbox',   ordem: 5  },
  { slug: 'n64',      nome: 'N64',      subtitulo: 'Nintendo 64',        grupo: 'videogames', estilo: 'p-n64',    ordem: 6  },
  { slug: 'wii',      nome: 'Wii',      subtitulo: 'Wii',               grupo: 'videogames', estilo: 'p-wii',    ordem: 7  },
  { slug: 'consoles', nome: 'Consoles', subtitulo: 'os aparelhos em si', grupo: 'videogames', estilo: 'p-consoles', ordem: 8 },
  { slug: 'livros',   nome: 'Livros',   subtitulo: 'a estante',          grupo: 'outros',     estilo: 'p-livros', ordem: 9  },
  { slug: 'filmes',   nome: 'Filmes',   subtitulo: 'DVDs e afins',       grupo: 'outros',     estilo: 'p-filmes', ordem: 10 },
  { slug: 'jogos-pc', nome: 'PC',       subtitulo: 'jogos de PC',        grupo: 'outros',     estilo: 'p-pc',     ordem: 11 },
];

function semeaduraColecoes() {
  if (db.contarColecoes() > 0) return;
  for (const c of SEED_COLECOES) db.inserirColecao(c);
  console.log(`Banco novo: cadastrei ${SEED_COLECOES.length} coleções.`);
}

// roda uma vez só (marca em ajustes), pra não desfazer se depois trocarem a cor no painel
function estiloProprioConsoles() {
  db.ajuste('migracao-estilo-consoles', () => {
    const c = db.colecaoPorSlug('consoles');
    if (c && c.estilo === 'p-ps3') {
      db.atualizarColecao(c.id, { ...c, estilo: 'p-consoles' });
      console.log('Consoles ganhou estilo próprio (p-consoles).');
    }
    return 'feito';
  });
}

module.exports = function semente() {
  semeaduraColecoes();
  estiloProprioConsoles();
  if (db.contarPosts() > 0) return rerenderizar();
  db.inserirPost({
    slug: 'minha-primeira-contribuicao-open-source',
    titulo: 'Minha Primeira Contribuição Open Source',
    resumo: 'Como eu revisei a tradução PT-BR e ES do xerabora, um companion de RetroAchievements pro PS2.',
    tldr: 'vi o vídeo do HardLevel\nachei o xerabora no GitHub\nofereci ajuda numa issue\nrevisei PT-BR (e ES!)\nabri o PR',
    conteudo: CONTEUDO,
    html: md.renderizar(CONTEUDO),
    minutos: minutosLeitura(md.textoPuro(CONTEUDO)),
    secao: 'blog',
    tags: 'Open Source, PS2, Tradução',
    status: 'publicado',
    publicado_em: '2026-09-10T12:00',
  });
  console.log('Banco novo: cadastrei o primeiro post.');
};


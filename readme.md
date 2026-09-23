# HB Hub

O cantinho do HB na internet, com cara de portal de 2003 (GameSpot + Cartoon Network + Neocities).
Blog completo com painel de administração, editor de posts e anexos.

- **Node.js puro, zero dependências**: `node:http`, `node:sqlite` e `node:crypto`. Sem `npm install`.
- **Site público sem JavaScript** (só o bate-papo usa): tudo renderizado no servidor, com gzip e cache.
- **Painel em `/admin`**: login, lista de posts, editor em Markdown com barra de ferramentas, prévia ao vivo,
  anexos (arrastar, colar ou botão), imagens convertidas pra WebP no navegador, rascunho, agendamento,
  backup local do que não foi salvo e atalhos (Ctrl+S, Ctrl+B, Ctrl+I, Ctrl+K).
- RSS em `/feed.xml`, tags, paginação e seções (Blog, Opiniões, Projetos).
- **Contador de visitas de verdade**, sem cookie e sem guardar IP (veja abaixo), com gráfico no painel.
- **Bate-papo** em `/chat`, simples: apelido, cor e mensagem, com a lista de quem está na sala
  (clicar num nome coloca `@nome` na mensagem, e quem é chamado vê a linha destacada). Tempo real com Server-Sent Events.
  O webmaster logado entra com o selo ADM, pode usar o apelido "HB", apagar mensagens e expulsar gente (1 hora).
  As mensagens ficam só na memória: reiniciou o servidor, a sala zera.

Precisa de **Node 22.13 ou mais novo** (recomendado: 24).

## Rodando

```bash
cp .env.example .env
npm run senha        # gera o ADMIN_SENHA_HASH, cola no .env
npm start            # http://localhost:3000  (painel em /admin)
```

Pra desenvolver com recarregamento automático: `npm run dev`.

Na primeira vez que sobe, o servidor cria `data/blog.db` e cadastra o primeiro post.

## Rodando no servidor (Docker)

```bash
cp .env.example .env   # preencha SITE_URL e ADMIN_SENHA_HASH
docker compose up -d --build
```

O container escuta só em `127.0.0.1:3000`; coloque um proxy reverso (nginx, Caddy, Traefik) com HTTPS na frente.
Com HTTPS, deixe `COOKIE_SEGURO=true` e `CONFIAR_PROXY=true`. No nginx, repasse o Host:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Connection "";
    proxy_read_timeout 1h;      # o bate-papo fica com a conexão aberta
    client_max_body_size 20m;   # tamanho máximo de anexo
}
```

O servidor já manda `X-Accel-Buffering: no` no bate-papo, então o nginx não segura as mensagens.
Rode **uma instância só** (o bate-papo e as travas de login ficam na memória do processo).

Pra gerar a senha dentro do container: `docker compose run --rm hbhub node tools/criar-senha.js`.

### Atualização

O servidor de produção confere a branch `main` a cada 2 minutos e publica sozinho: faz backup do banco,
reconstrói a imagem e só dá o deploy por concluído se o container ficar saudável. Basta dar push na `main`.

### Backup

Cópia consistente do banco com o site no ar: `docker exec hbhub node tools/backup-db.js /tmp/blog.db`
(depois `docker cp hbhub:/tmp/blog.db .`).

Tudo que importa fica no volume `hbhub-dados` (banco + anexos):

```bash
docker run --rm -v acostahub_hbhub-dados:/d -v "$PWD":/b alpine tar czf /b/backup-hbhub.tgz -C /d .
```

## Estrutura

```
server.js               rotas, API e servidor HTTP
src/config.js           lê o .env
src/db.js               SQLite (posts, anexos, sessões)
src/auth.js             login, sessão e trava de força bruta
src/contador.js         contador de visitas
src/chat.js             bate-papo (em memória, Server-Sent Events)
public/chat/chat.js     o único JavaScript do site público
src/markdown.js         Markdown -> HTML (escapa todo HTML digitado)
src/views/              páginas públicas e do painel
public/css/styles.css   o visual todo do site
public/admin/           CSS e JS do painel
tools/criar-senha.js    gera o hash da senha
```

## Escrevendo

O editor aceita Markdown mais dois blocos especiais:

```
:::fluxo
Fork → Branch → Commit → Pull Request
:::

:::aviso
**Atenção:** isso vira um post-it amarelo.
:::
```

Imagem com legenda: `![texto alternativo](/uploads/foto.webp "legenda")`. Várias imagens em linhas seguidas
viram uma figura só. MP3 anexado vira um player.

## Contador de visitas

Cada visitante vira um HMAC de (segredo do servidor + dia + IP + navegador). Esse hash só vive durante o dia
e é apagado depois; o que fica guardado é só o total por dia e as páginas mais vistas. Não usa cookie.
Robôs, prefetch e o webmaster logado não contam. Um visitante que volta no dia seguinte conta de novo,
como os contadores de antigamente.

## Segurança

- **sem JWT, de propósito**: a sessão é um token aleatório de 256 bits num cookie `HttpOnly` + `SameSite=Strict`,
  e o banco guarda só o hash dele. Sair invalida na hora, não tem chave secreta pra vazar.
- senha com scrypt
- 5 tentativas erradas de login travam o IP por 15 minutos (atrás de proxy, usa o IP que o proxy adicionou,
  não o que o cliente manda)
- POST/PUT/DELETE de outra origem são recusados (CSRF)
- Content-Security-Policy sem scripts de terceiros
- anexos: só imagem, PDF, ZIP, MP3 e TXT, conferindo o conteúdo real do arquivo (SVG e HTML são recusados)
- bate-papo: tudo que os outros escrevem entra na página como texto (nunca HTML), apelidos só com letras/números,
  anti-flood, limite de pessoas por IP e de entradas por minuto

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production PASTA_DADOS=/app/data

COPY package.json server.js ./
COPY src ./src
COPY public ./public
COPY tools ./tools

RUN mkdir -p /app/data && chown node:node /app/data
USER node

EXPOSE 3000
VOLUME /app/data

HEALTHCHECK --interval=1m --timeout=5s CMD wget -qO- http://127.0.0.1:3000/robots.txt >/dev/null || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]

FROM node:24-alpine

RUN apk upgrade --no-cache

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --chown=node:node package.json server.js ./
COPY --chown=node:node index.html styles.css ./
COPY --chown=node:node src ./src
COPY --chown=node:node tests ./tests

USER node

EXPOSE 3000

CMD ["node", "server.js"]

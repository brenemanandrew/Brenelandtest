FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs route.mjs tools.mjs split.mjs ledger.mjs adapters.mjs ./
COPY public ./public
COPY worker ./worker
ENV DATA_DIR=/data PORT=8080
CMD ["node", "server.mjs"]

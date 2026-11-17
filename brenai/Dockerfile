FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs persona.mjs away.mjs ./
COPY public ./public
# the PC bridge files, downloadable from https://brenai.fly.dev/bridge/ (no secrets in them)
COPY bridge ./public/bridge
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server.mjs"]

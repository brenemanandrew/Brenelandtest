FROM node:22-slim
WORKDIR /app
# Tailscale binaries from the official image (Fly's documented way), used in userspace mode by start.sh
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /app/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /app/tailscale
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs route.mjs tools.mjs split.mjs ledger.mjs adapters.mjs parts.mjs projects.mjs pcagent.mjs start.sh ./
COPY public ./public
COPY worker ./worker
COPY pc ./pc
COPY projects ./projects
ENV DATA_DIR=/data PORT=8080
CMD ["/app/start.sh"]

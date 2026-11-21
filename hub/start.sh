#!/bin/sh
# Brenebase start: join the tailnet first if a Tailscale key is set (userspace networking, no root device needed),
# then run the app. Without TS_AUTHKEY the app runs anyway and reaches the PC by its polling agent only.
if [ -n "$TS_AUTHKEY" ]; then
  mkdir -p /data/tailscale
  /app/tailscaled --tun=userspace-networking --state=/data/tailscale/tailscaled.state --socket=/tmp/tailscaled.sock --outbound-http-proxy-listen=localhost:1055 &
  sleep 2
  /app/tailscale --socket=/tmp/tailscaled.sock up --authkey="$TS_AUTHKEY" --hostname="${TS_HOSTNAME:-brenebase}" || echo "tailscale up failed; continuing without it"
  export TS_PROXY=localhost:1055
fi
exec node server.mjs

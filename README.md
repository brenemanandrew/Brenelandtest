# Brenelandtest

Test build of the Breneland character builder (dressing room intro, face, hair, body, outfit, voice).

- `site/` is the whole app: `index.html` plus hair, body and clothing data loaded on demand.
- Three.js comes from a CDN, so the page needs internet.
- Deploy: `fly deploy --ha=false` from this folder (app name is set in `fly.toml`; change it if yours differs).
- Run locally: `npx serve site` or any static file server pointed at `site/`.

This is a test environment. The main game lives in Breneland-Next.

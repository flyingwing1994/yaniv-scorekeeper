# CLAUDE.md – yaniv-scorekeeper

Taal: **Nederlands**.

## Werkwijze
Volg `WORKFLOW.md` en `skills/dev-workflow/SKILL.md` uit [flyingwing1994/.github](https://github.com/flyingwing1994/.github): elke wijziging via issue → branch → PR, nooit rechtstreeks naar `main`, Claude merget nooit zelf. Checks en review staan in `.github/workflows/pr.yml`.

## Deze repo
- `web/`: PWA (React, TypeScript, Vite). `npm run build` (incl. typecheck), `npm test` (vitest).
- `server/`: Node ≥ 22.13 (Docker en checks: Node 26) zonder dependencies (`node:sqlite`); API en statische bestanden.
- Deploy: Docker + Cloudflare Tunnel, handmatig (zie `DEPLOY.md`). Geheimen (`APP_PIN`, `TUNNEL_TOKEN`) alleen in `.env`, nooit in git.

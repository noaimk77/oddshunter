<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- stripe-projects-cli managed:agents-md:start -->
## Stripe Projects CLI

This repository is initialized for the Stripe project "oddscope".

## Tools used

- [Stripe CLI](https://docs.stripe.com/stripe-cli) with the `projects` plugin to manage third-party services, credentials, and deployments for this project. Use the stripe-projects-cli to manage deploying and access to third party services.
<!-- stripe-projects-cli managed:agents-md:end -->

<!-- ==================================================================== -->
<!-- Règles projet pour les assistants IA (Claude, Codex, …)              -->
<!-- Éditer ici, PAS dans les blocs managés ci-dessus.                     -->
<!-- ==================================================================== -->

# Règles OddsHunter pour assistants IA

## À lire d'abord, dans l'ordre
1. `PASSATION_CODEX.md` — dossier de passation complet (contexte, secrets, accès).
2. `ARCHITECTURE.md` — source de vérité technique (prime sur `CLAUDE.md`, qui est historique).
3. `OPERATIONS.md` — déploiement, dépannage, rollback.
4. `ROADMAP.md` — priorités et décisions produit.
5. `BOT_HANDOFF.md` — journal de travail sur `src/worker/` (lire avant d'y toucher).

## Périmètre
- **Ce dépôt (`github.com/noaimk77/oddshunter`, branche `redesign/odds-hunter`) est
  la seule source de vérité du code.** Ne jamais éditer le worker dans
  `~/Downloads/oddshunter/site-web-actuel/` (copie obsolète du site).
- Nom interne du package : `oddscope` (ancien nom).

## Ne JAMAIS faire sans validation humaine explicite de Noaim
- Passer Stripe en **mode live** (`sk_live_...`) ou modifier un prix / produit Stripe.
- Mettre un flag `SEND_LIVE_ALERTS` / `SEND_SUSPICIOUS_ALERTS` /
  `SEND_TIP_CONSENSUS_ALERTS` / `SEND_LEGACY_DETECTOR_ALERTS` à `true`.
- Modifier un seuil sensible : `TIP_CONSENSUS_MIN_GROUPS`,
  `TIP_CONSENSUS_WINDOW_MINUTES`, `MIN_SCORE_TO_ALERT`,
  `SUSPICIOUS_MIN_SCORE`, `getFixingOddsRange`, les poids de `score.ts`.
- Déployer le worker (Fly) ou le site (Vercel).
- Jouer une migration Prisma destructive (faire un export d'abord).
- Poster automatiquement dans le canal VIP ou sur un réseau social hors
  du pipeline validé, ou envoyer un e-mail au nom du projet.
- Toucher `src/worker/providers/betexplorer.ts` tant qu'un déploiement
  worker en attente n'est pas confirmé passé (conflit `DETAIL_MARKET_CODES`).
- Committer `.env`, une session Telegram, une clé privée, un token.
- Éditer quoi que ce soit sous `.projects/` (géré par le CLI Stripe).

## Règles métier importantes
- **Mode observation par défaut** : le worker détecte et stocke toujours,
  mais n'envoie rien tant qu'un flag `SEND_*` n'est pas explicitement `true`.
  Un déploiement neuf ne doit jamais partir en envoi.
- **Consensus** = même pronostic dans **≥ 3 canaux Telegram distincts** sous
  **24 h** → repost automatique dans le VIP. Anti-doublon = contrainte
  unique `ConsensusAlert.fingerprint`. Garde qualité finale
  `shouldSendConsensusAlert` avant tout envoi.
- **Pipeline B** cible les **championnats obscurs** (Inde, petites ligues
  latino), pas les grands championnats. Bande de cote "fixable" 1.2–3.0.
- **Contrainte 0 €** sur les sources de données (pas d'API payante sans
  accord). BetExplorer est la seule source active.
- Toujours des **données réelles** : ne jamais seeder `Signal`,
  `OddsSnapshot`, etc. avec des lignes fabriquées.
- Site en **français**, thème dark premium, pas de design "AI-looking".

## Commandes sûres (lecture / vérif, sans effet de bord)
```bash
npm ci
npx prisma generate
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run dev            # site local
npm run worker:dev     # worker local (reste en mode observation si les flags SEND_* sont absents)
flyctl status ; flyctl logs ; flyctl secrets list   # noms de secrets seulement
git status ; git log ; git diff
```

## Pièges connus
- Valeurs `.env` entourées de `'...'` : les stripper avant de les pousser
  vers Fly / Vercel (bug `DATABASE_URL` rencontré 3×).
- `fly.toml` n'a pas de `release_command` : jouer `prisma migrate deploy`
  à la main avant un déploiement worker qui dépend d'un nouveau champ.
- Un `price_...` Stripe **live** utilisé en mode **test** échoue en silence.
- `main` est très en retard sur `redesign/odds-hunter`.

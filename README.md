# OddsHunter

Monorepo d'OddsHunter : un **site** d'acquisition (Next.js) et un **worker**
Telegram (Node) qui alimentent deux abonnements à 75 €/mois — accès
**Telegram VIP** et accès **Bot**.

- **Bot consensus** : quand le même pronostic apparaît dans ≥ 3 canaux
  Telegram distincts sous 24 h, il est reposté dans le canal VIP.
- **Bot mouvements de cotes** : détection de chutes de cotes / mouvements
  suspects sur des championnats peu surveillés.
- **Site** : landing, auth, Stripe Checkout, lien d'affiliation 1xBet.

## Démarrage rapide

```bash
git clone https://github.com/noaimk77/oddshunter.git
cd oddshunter
git checkout redesign/odds-hunter      # branche par défaut

nvm use                                 # Node 20
npm ci
cp .env.example .env                    # puis remplir (voir PASSATION_CODEX.md §4)
npx prisma generate

npm run dev                             # site   -> http://localhost:3000
npm run worker:dev                      # worker -> détection + bot + tip listener
```

Sans `DATABASE_URL`, rien ne démarre. Sans clés Telegram/Anthropic, le
worker démarre mais le pipeline consensus reste inactif (log explicite).
Sans provider de cotes, l'ingestion est un no-op silencieux (normal).

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de dev Next.js (port 3000) |
| `npm run build` | `prisma generate && next build` |
| `npm run worker:dev` | Worker en watch (`tsx watch src/worker/index.ts`) |
| `npm run worker:start` | Worker prod (commande de démarrage Fly) |
| `npm test` | Vitest (détecteurs + parseurs) |
| `npm run lint` | ESLint |

## Documentation

| Fichier | Contenu |
|---|---|
| [`PASSATION_CODEX.md`](./PASSATION_CODEX.md) | **Dossier de passation** — contexte, produits, accès, secrets, checklists |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Source de vérité technique — pipelines, schéma, déploiement |
| [`OPERATIONS.md`](./OPERATIONS.md) | Runbook — déploiement, dépannage, rollback, sauvegardes |
| [`ROADMAP.md`](./ROADMAP.md) | Priorités, risques, journal des décisions produit |
| [`AGENTS.md`](./AGENTS.md) | Règles pour les assistants IA — ce qu'il ne faut jamais changer sans validation |
| [`BOT_HANDOFF.md`](./BOT_HANDOFF.md) | Journal de travail détaillé sur `src/worker/` |
| `CLAUDE.md` | Historique (partiellement périmé) — `ARCHITECTURE.md` prime |

## Infra en un coup d'œil

| Composant | Hébergeur | Détail |
|---|---|---|
| Site | Vercel | projet `site-web-actuel` |
| Worker | Fly.io | app `oddshunter-worker`, région `cdg` |
| Base de données | Supabase | Postgres, Prisma 7 (adapter `pg`) |
| Paiement | Stripe | projet `oddscope` — **mode TEST** |

> Branche déployée : `redesign/odds-hunter`. `main` est en retard.

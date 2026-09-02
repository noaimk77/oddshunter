# OPERATIONS — OddsHunter

> Procédures quotidiennes, déploiement, dépannage, rollback.
> Rien dans ce fichier ne contient de secret. Les commandes qui lisent des
> secrets les prennent depuis `.env` local ou les secrets de l'hébergeur.

## 0. Comptes & tableaux de bord

| Service | Compte | Console |
|---|---|---|
| GitHub | `noaimk77` | https://github.com/noaimk77/oddshunter |
| Fly.io (worker) | `noaim.k77@gmail.com` | https://fly.io/apps/oddshunter-worker |
| Vercel (site) | org `team_LrAP0DCA3TSiYZW9WFaRZVsz` | projet `site-web-actuel` |
| Supabase (DB) | — | dashboard du projet (ref dans `.env` local) |
| Stripe | compte "Odds.Hunter98", projet `oddscope` | dashboard.stripe.com — **mode TEST** |
| Telegram | compte perso de Noaim (MTProto) + bot @BotFather | — |
| API-Football | `dashboard.api-football.com` | plan Ultra (historique — voir notes) |

Railway / Netlify / Render : **anciens hébergeurs**, plus utilisés, à
désactiver une fois la migration confirmée stable.

## 1. Démarrage local

```bash
cd ~/oddshunter
nvm use            # Node 20 (voir .node-version)
npm ci
cp .env.example .env   # puis remplir — voir la section "secrets" de PASSATION_CODEX.md
npx prisma generate

# Site :
npm run dev            # http://localhost:3000

# Worker (détection + bot + tip listener) :
npm run worker:dev     # tsx watch src/worker/index.ts
```

Sans `DATABASE_URL` le site et le worker refusent de démarrer.
Sans clés Telegram/Anthropic le worker démarre mais le pipeline consensus
ne se lance pas (log explicite). Sans provider de cotes configuré,
l'ingestion est un no-op silencieux (comportement correct).

## 2. Tests & vérifs avant commit

```bash
npm test               # vitest — détecteurs + parseurs (fonctions pures)
npx tsc --noEmit       # typecheck
npm run lint           # eslint
npm run build          # build site complet (prisma generate + next build)
```

Convention de commits : `type(scope): sujet` — ex.
`feat(worker): ...`, `fix(site): ...`, `docs: ...`.
Fin de message de commit :
`Co-Authored-By: <ton identité d'assistant>`.

## 3. Base de données — migrations

```bash
# Créer une migration à partir d'un changement de schema.prisma :
npx prisma migrate dev --name description_courte

# Appliquer en prod (Supabase) — DATABASE_URL doit pointer sur la prod :
npx prisma migrate deploy

# Inspecter :
npx prisma studio
```

⚠️ `fly.toml` n'a **pas** de `release_command` : les migrations ne sont
**pas** jouées automatiquement au déploiement du worker. Les jouer à la
main **avant** de déployer un worker qui dépend d'un nouveau champ.

## 4. Déploiement du worker (Fly.io)

```bash
# Pré-requis une seule fois :
curl -L https://fly.io/install.sh | sh
flyctl auth login

# Déployer :
cd ~/oddshunter
flyctl deploy --config fly.toml --dockerfile Dockerfile.worker

# Vérifier :
flyctl status
flyctl logs         # attendre : "[worker] Odds Hunter worker starting…"
```

Gérer les secrets (affiche les **noms** seulement, jamais les valeurs) :

```bash
flyctl secrets list
flyctl secrets set NOM="valeur"      # sans guillemets simples autour de la valeur
flyctl secrets unset NOM
```

Un `flyctl secrets set` redéclenche un déploiement (~30 s).

## 5. Déploiement du site (Vercel)

Le site se déploie depuis le dossier lié Vercel. Depuis ce dépôt :

```bash
cd ~/oddshunter
npx vercel pull          # récupère la config du projet lié
npx vercel --prod        # build + déploie
```

Variables d'env prod : **Project Settings → Environment Variables** dans le
dashboard Vercel (pas via `.env` local, qui ne pousse rien en prod).
Après changement d'une variable → **redéployer** pour qu'elle prenne.

> Dette : le dossier historiquement lié à Vercel est
> `~/Downloads/oddshunter/site-web-actuel/` (sans `.git`). Objectif :
> déployer le site **depuis ce dépôt** et connecter Vercel au repo GitHub.
> Voir ROADMAP.

## 6. Runbook — routines

### Quotidien
- `flyctl logs` : le worker tourne, pas de boucle de redémarrage
  (`exit_code=137` = OOM).
- Chercher dans les logs : `consensus reached`, `stored ... pick`,
  `skipping stale message` (backlog après reconnexion — normal si
  ponctuel, suspect si en rafale).
- Vérifier qu'aucun `unhandled promise rejection` répété n'apparaît.

### Hebdo
- Quota DB Supabase (opérations/mois) — les cadences du worker sont
  calibrées pour ne pas l'épuiser ; un changement de cadence peut le faire.
- Quota API-Football si l'ingestion API est réactivée un jour.
- `ScrapedTip` / `ConsensusAlert` : le pipeline consensus produit-il des
  fingerprints propres ? (échantillon en base)

### Sur incident "le bot ne poste plus"
1. `flyctl status` + `flyctl logs` — le process est-il vivant ?
2. Rechercher `[tipListener] listening across all joined groups` au dernier
   démarrage. Absent → le client MTProto n'a pas booté (session invalide ?
   `TELEGRAM_USER_SESSION`).
3. Rechercher une longue plage sans **aucun** message loggé (impossible en
   trafic normal avec 150+ chats) → lien MTProto tombé.
4. `SEND_TIP_CONSENSUS_ALERTS` vaut bien `true` ? (`flyctl secrets list`)
5. Le compte perso est-il toujours membre du canal VIP et des canaux
   sources ? (un ban/kick casse tout silencieusement)

## 7. Rollback

### Worker — arrêt d'urgence des envois (état sûr, ~30 s)
```bash
flyctl secrets set SEND_LIVE_ALERTS=false \
  SEND_SUSPICIOUS_ALERTS=false \
  SEND_TIP_CONSENSUS_ALERTS=false
```
Le worker continue de détecter et stocker, mais **n'envoie plus rien**.

### Worker — revenir à la version précédente
```bash
flyctl releases                 # liste des releases
flyctl deploy --image <digest>  # ou : flyctl releases rollback
```

### Site — Vercel
Dashboard Vercel → onglet **Deployments** → un déploiement antérieur →
**Promote to Production** (instantané).

### DB
Pas de rollback de migration automatique. Supabase fait des sauvegardes
côté plateforme (point-in-time selon le plan) — à vérifier dans le
dashboard. **Toujours** faire un export avant une migration destructive
(cf. leçon "backup avant migration").

## 8. Sauvegardes

| Donnée | Sauvegarde actuelle | À faire |
|---|---|---|
| Postgres (Supabase) | Sauvegardes plateforme (selon plan) | Confirmer la rétention ; `pg_dump` planifié hors-plateforme |
| `TELEGRAM_USER_SESSION` | Dans les secrets Fly + `.env` local | Copie chiffrée hors-ligne (sa perte = re-login manuel complet) |
| Config Stripe | Source de vérité chez Stripe | — |
| Code | GitHub | OK |

## 9. Monitoring / observabilité — état

- **Logs** : `flyctl logs` (worker), dashboard Vercel (site). Pas
  d'agrégateur externe.
- **Pas d'alerting** sur worker mort, lien MTProto tombé, quota DB proche.
  C'est le manque n°1 d'exploitation — voir ROADMAP « Heartbeat /
  observabilité ».
- Pas de Sentry / APM.

## 10. Ce qu'il ne faut PAS faire sans validation humaine explicite

- Passer Stripe en **mode live** (`sk_live_...`).
- Mettre un `SEND_*_ALERTS` à `true` pour une **première** connexion de
  source réelle.
- Baisser `TIP_CONSENSUS_MIN_GROUPS` ou `SUSPICIOUS_MIN_SCORE` /
  `MIN_SCORE_TO_ALERT`.
- Jouer une migration destructive sans export préalable.
- Publier / poster automatiquement sur un réseau social ou dans le canal
  VIP hors du pipeline validé.
- Committer `.env`, une session Telegram, une clé privée.
- Toucher `src/worker/providers/betexplorer.ts` tant qu'un déploiement
  worker en attente n'est pas confirmé (conflit `DETAIL_MARKET_CODES`).

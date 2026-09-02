# ARCHITECTURE — OddsHunter

> Dernière révision : 2026-09-02. Source de vérité technique. En cas de
> divergence avec `CLAUDE.md` (historique) ou la mémoire d'un assistant,
> ce fichier prime.

## 1. Vue d'ensemble

OddsHunter = un monorepo, deux exécutables déployés séparément + des
produits de contenu non techniques.

```
                       ┌─────────────────────────────────────────┐
   Utilisateur ───────▶│ SITE  (Next.js 16, App Router)          │
   (web)               │  - landing / acquisition (lien 1xBet)   │
                       │  - auth NextAuth v5 (email+mot de passe) │
                       │  - Stripe Checkout + webhooks + portail  │
                       │  - /account : lien canal VIP si actif    │
                       │  Déployé sur Vercel                      │
                       └───────────────┬─────────────────────────┘
                                       │ Postgres (Prisma 7)
                       ┌───────────────▼─────────────────────────┐
                       │ BASE DE DONNÉES  (Postgres — Supabase)   │
                       │  entitlements, users, signaux, tips,     │
                       │  consensus, tickets, stats stratégies    │
                       └───────────────▲─────────────────────────┘
                                       │ Prisma 7 (adapter pg)
                       ┌───────────────┴─────────────────────────┐
   Groupes Telegram ──▶│ WORKER  (process Node long-vivant)      │──▶ Canal VIP
   (MTProto, compte    │  src/worker/index.ts                    │    Telegram
    perso)             │  A. Pipeline "consensus pronostics"     │
   BetExplorer ───────▶│  B. Pipeline "mouvements de cotes"      │──▶ DM abonnés
   (scraping HTTP)     │  C. Bot Telegram (grammy) commandes     │    + canaux
                       │  Déployé sur Fly.io (app oddshunter-worker)│
                       └─────────────────────────────────────────┘
```

### Produits

| # | Produit | Nature | État |
|---|---------|--------|------|
| 1 | **Bot consensus** | Worker, pipeline A | Fonctionnel, en observation/affinage (qualité parsing) |
| 2 | **Bot chute de cotes / mouvements suspects** | Worker, pipeline B | Fonctionnel techniquement, sous-alimenté (1 seule source, pas de volume/liquidité) |
| 3 | **Site d'acquisition** | Next.js sur Vercel | Fonctionnel (Stripe en mode test) |
| 4 | **Contenu YouTube / TikTok / X / Instagram** | Hors dépôt | Idée / non démarré |

### Modèle économique

Deux abonnements à **75 €/mois** : accès **Telegram VIP** et accès **Bot**.
Acquisition via le site + un **lien d'affiliation 1xBet/XBet**. Stripe gère
la facturation ; la table `Entitlement` reflète l'état d'accès sans
rappeler Stripe à chaque requête.

## 2. Dépôt

- **Git** : `https://github.com/noaimk77/oddshunter.git`
- **Branche par défaut / déployée** : `redesign/odds-hunter` (c'est
  `origin/HEAD`). `main` existe mais est en retard — ne pas y pousser sans
  raison.
- **Nom interne du package** : `oddscope` (ancien nom du projet).
- ⚠️ **Un second dossier existe** : `~/Downloads/oddshunter/site-web-actuel/`
  — copie **partielle et plus ancienne** du site, liée au projet Vercel
  `site-web-actuel` (`prj_8oa7wox8WKLyAZAXUheeNYYH3YII`,
  org `team_LrAP0DCA3TSiYZW9WFaRZVsz`), **sans `.git`**. C'est un point de
  dette : voir ROADMAP « Consolider le déploiement du site ». Considérer
  **ce dépôt-ci comme la seule source de vérité du code** ; ne pas éditer
  le worker ailleurs.

## 3. Stack & versions

| Domaine | Choix |
|---|---|
| Runtime | Node 20 (`.node-version`), `engines.node >= 18` |
| Framework site | Next.js 16.3.1, App Router, `output: standalone` |
| UI | Tailwind CSS v4, shadcn/ui (base-ui), Framer Motion, Lucide |
| i18n | FR (défaut) + EN/ES/RU, dictionnaires cookie-based, pas de routing d'URL (`src/i18n/`) |
| Auth | NextAuth v5 beta (`@auth/prisma-adapter`), credentials email + `bcryptjs` |
| Paiement | Stripe (`stripe` v22), Checkout + webhooks + Billing Portal |
| ORM | Prisma 7 (`prisma-client` generator, sortie `src/generated/prisma/`), **adapter explicite `@prisma/adapter-pg`** |
| DB | PostgreSQL — **Supabase** aujourd'hui (Neon → Prisma Postgres → Supabase) |
| Worker runner | `tsx` (pas de build, exécution TS directe) |
| Telegram bot | `grammy` (Bot API, long polling) |
| Telegram lecture groupes | `telegram` (gramjs, MTProto, compte perso) |
| OCR | `tesseract.js` + `eng.traineddata` / `fra.traineddata` (commités à la racine) |
| Scraping | `cheerio` |
| Tests | `vitest` (fonctions pures des détecteurs + parseurs) |
| LLM fallback | `@anthropic-ai/sdk` (parsing pronostic quand déterministe échoue) |

## 4. Arborescence

```
src/
  app/                         # routes Next (App Router)
    (auth)/                    # login, register, forgot/reset password
    account/                   # "Mon compte" : profil, abonnements, lien VIP
    abonnement/                # page tarifs / checkout
    1xbet/  bookmakers/  reseaux/  faq/  mentions-legales/  settings/
    api/
      auth/[...nextauth]/route.ts
      stripe/checkout/route.ts        # crée la session Checkout
      stripe/portal/route.ts          # Billing Portal
      stripe/webhook/route.ts         # sync Entitlement <- Stripe (signature vérifiée, idempotent via StripeEvent)
  features/                     # landing/, account/, billing/, settings/, affiliates/
  components/ui/                # primitives shadcn
  lib/
    db.ts                      # PrismaClient + PrismaPg(DATABASE_URL) — singleton
    auth.ts  guards.ts         # NextAuth + requireAuth
    stripe.ts  plans.ts        # config Stripe + lecture live des prix (cache 15 min, fallback statique)
    entitlements.ts            # syncEntitlementFromSubscription()
    email.ts  password.ts  rate-limit.ts  validation.ts
  i18n/dictionaries/{fr,en,es,ru}.ts
  generated/prisma/            # client Prisma généré (git-ignoré)

  worker/
    index.ts                   # boucle principale : verrou pg, ingestion (lente) + détection (rapide) + stratégies + bot + tip listener
    config.ts                  # TOUS les seuils/flags, override par env sans redeploy
    lib/lock.ts                # pg_advisory_lock — pas de passes concurrentes
    ingest.ts                  # provider -> upsert Competition/Event/Market/Selection/OddsSnapshot
    outcomeResolver.ts         # Signal -> résultat réel (1X2, O/U) via API-Football
    providers/
      betexplorer.ts           # ★ SOURCE PRINCIPALE (gratuite, sans clé)
      apiFootball.ts            # branché pour scores/fixtures ; /odds bloqué en gratuit — retiré de l'ingestion
      theOddsApi.ts sofascore.ts betfair.ts   # non branchés / stubs
    detectors/                 # fonctions pures + tests : oddsDrop, oddsRise, vigExplosion,
                               #   marketLock, multiBookConfirmation, valueBet, momentum,
                               #   liveScorelessPick, score (moteur 0-100), signalOutcome
    strategies/                # strategyRunner, liveOdds, liveMatchMonitor (pivot "value bets statistiques")
    telegram/
      bot.ts                   # commandes grammy : /start /subscribe /settings /status /history /help
      linking.ts               # token signé usage-unique 15 min : compte web <-> chat Telegram
      userClient.ts            # client MTProto (retry infini, autoReconnect)
      tipListener.ts           # ★ écoute NewMessage sur TOUS les groupes joints -> pipeline consensus
      tipParser.ts             # extraction fixture + marché + sélection, fingerprint normalisé
      tipOcr.ts                # OCR des captures d'écran de coupons
      tipLlmFallback.ts        # fallback Claude quand le parseur déterministe échoue
      tipConsensus.ts          # checkConsensus (strict) + checkDirectionalConsensus
      vipGroup.ts              # résout le groupe VIP via lien d'invitation, poste l'alerte
      alertFormat.ts           # formatage message + shouldSendConsensusAlert (garde qualité finale)
      consensusOutcomeResolver.ts  # note le résultat (✅/❌) en réponse au message d'alerte
      sendAlert.ts sendStrategyAlert.ts suspiciousFeed.ts

prisma/
  schema.prisma
  migrations/                  # 16 migrations, dernière : 20260902131843_add_consensus_alert_outcome_tracking

Dockerfile.worker              # image Fly (worker uniquement)
fly.toml                       # app oddshunter-worker, région cdg, 512MB + 512MB swap
railway.json  netlify.toml     # résidus des hébergeurs précédents (worker/site)
```

## 5. Pipeline A — consensus de pronostics (le cœur du bot VIP)

**Objectif** : quand le **même pronostic** apparaît dans **≥ N canaux
distincts** dans une fenêtre de temps, le reposter automatiquement dans le
canal VIP.

Fichiers : `tipListener.ts` → `tipParser.ts` / `tipOcr.ts` /
`tipLlmFallback.ts` → `tipConsensus.ts` → `vipGroup.ts` /
`consensusOutcomeResolver.ts`.

### Collecte
- `userClient.ts` ouvre un client **MTProto authentifié comme le compte
  Telegram personnel de Noaim** (le bot API ne peut pas lire les groupes où
  il n'est pas admin). `connectionRetries: Infinity`, `autoReconnect: true`,
  `maxConcurrentDownloads: 1` (mémoire plate sur la box 512 MB).
- `tipListener.startTipListener()` pose **un seul handler `NewMessage`** sur
  **tous les groupes/canaux** dont le compte est membre. Pas d'allowlist :
  le principe est de capter *n'importe quels* canaux qui se recoupent.
- Messages privés ignorés. **Rejet du backlog** : si `message.date`
  (horodatage Telegram) > `TIP_MAX_MESSAGE_AGE_MINUTES` (défaut 30 min),
  le message est jeté avant tout traitement coûteux — corrige l'incident
  du 2026-08-30/31 (worker muet 2 h33, puis à la reconnexion un coupon
  pré-match vieux de 10 h posté comme pick live).

### Normalisation
Pour chaque message : la **légende texte** et l'**OCR de la photo** sont
traités comme **deux candidats indépendants** (`source: TEXT | IMAGE`) —
la plupart des canaux postent le coupon en image et une confirmation
laconique en texte.

Chaque candidat passe 3 tentatives dans l'ordre :
1. Fixture **et** pick présents dans ce candidat → parseur déterministe
   (`extractFixture` + `extractSelection`), puis fallback LLM pour le
   marché/sélection uniquement.
2. Seulement une fixture ("Puerto Rico vs Cuba", pas de pick) → **mémorisée
   pour ce chat** (`ChatFixtureContext`) pour qu'un message ultérieur
   sans contexte ("W2", "Victoire de Cuba") s'y rattache.
3. Aucune fixture → tenter contre la dernière fixture mémorisée du chat
   (sauf « chats firehose » multi-matchs, exclus car source de faux
   rattachements).
   Sinon, dernier recours : `extractFullTipWithLLM` (équipes + pick depuis
   l'OCR/l'image via Claude Vision).

`buildParsedTip()` produit un **fingerprint normalisé** : noms d'équipes +
marché + sélection, minuscules, accents/espaces retirés. Deux tipsters qui
formulent le même pick différemment doivent collapser sur le même
fingerprint (`tipParser.ts`, testé).

`resolveFixture()` tente de canoniser les noms d'équipes contre les
`Event` connus en base.

### Stockage
- `ScrapedTip` : une ligne par candidat parsé (fingerprint, équipes,
  marché, sélection, `sourceChatId/Title`, `source`, `detectedAt` =
  **notre** horodatage de traitement).
- `GroupTicket` : **indépendant du consensus** — toute message en forme de
  coupon avec une cote (et un résultat si présent), pour les stats
  par-groupe ("tickets aujourd'hui", "taux de réussite ce mois").

### Détection de consensus (`tipConsensus.ts`)
Config : `getTipConsensusConfig()` → `minGroups` (`TIP_CONSENSUS_MIN_GROUPS`,
**défaut 3**), `windowMinutes` (`TIP_CONSENSUS_WINDOW_MINUTES`, **défaut
1440 = 24 h**). Historique : 4 → 3 → 2 / 20 min, puis remonté à 3 / 24 h
le 2026-08-27 (« trois fois sur trois canaux », les vrais tipsters postent
à des heures d'écart, pas des minutes).

Deux vérifications, dans cet ordre :
1. **`checkConsensus` (strict)** : ≥ `minGroups` **`sourceChatId`
   distincts** ont posté **exactement le même fingerprint** dans la
   fenêtre.
2. **`checkDirectionalConsensus`** (seulement si le strict n'a pas
   déclenché) : ≥ `minGroups` chats distincts ont parié **le même côté du
   même match** quelle que soit la ligne exacte (Over 4.5 / 5.5 / 6.5
   bucketent ensemble ; handicaps -4.5 / -5 sur le favori aussi). Clé de
   dédup `dir:<slugs d'équipes triés>|<direction>`, tolérante au
   fracturing des noms ("Johor Darul Takzim" / "Darul Takzim" / "Takzim").

### Anti-doublons
La table **`ConsensusAlert`** a une **contrainte unique sur `fingerprint`**.
Le premier passage qui franchit le seuil fait un `create` — sous
concurrence, un seul appelant gagne l'insert (erreur Prisma `P2002` →
`triggered: false`). Une fois une ligne posée pour un fingerprint, aucune
ré-alerte sur les messages suivants qui matchent.

### Envoi VIP
Uniquement si `SEND_TIP_CONSENSUS_ALERTS=true` (sinon : log
« mode observation », rien envoyé). Puis **garde qualité finale**
`shouldSendConsensusAlert(parsed)` — rejette silencieusement un pick
OCR-cassé ("OVER_18", fragment de légende comme équipe). Une seule alerte
absurde = un abonné payant qui doute de toutes les alertes.

`vipGroup.sendConsensusAlert()` résout l'entité du groupe VIP via
`TELEGRAM_VIP_INVITE_LINK` (rejoint une fois si besoin, puis cache pour la
vie du process), poste le message, renvoie `(chatId, messageId)`.

### Résolution du résultat
`ConsensusAlert` stocke équipes/marché/sélection/`oddsAtAlert` +
`sentChatId/sentMessageId`. `consensusOutcomeResolver.resolvePendingConsensusOutcomes()`
(appelé dans la boucle `index.ts`) récupère le score final, juge
WON/LOST/VOID/UNRESOLVED, et **répond au message d'alerte** pour que le
verdict s'affiche en thread.

## 6. Pipeline B — mouvements de cotes / matchs suspects

**Objectif produit** (Noaim, 2026-08-18) : cibler les **championnats
obscurs et peu surveillés** (Inde toutes divisions, petits championnats
d'Amérique latine) — un mouvement truqué a plus de chances de passer
inaperçu là où personne ne regarde. Cela exclut de fait les agrégateurs
grand-championnat.

### Source de données
**BetExplorer** (`providers/betexplorer.ts`) — gratuit, sans compte,
`robots.txt` autorise les chemins utilisés, HTML rendu côté serveur.
Deux temps :
1. `/football/dropping-odds/` — 1 requête, feed de triage : tous les
   matchs en chute, % de chute + consensus multi-bookmakers déjà calculé
   par BetExplorer.
2. `/match-odds/{id}/0/{marché}/bestOdds/` — détail par bookmaker, mais
   seulement pour les **N plus grosses chutes par cycle**
   (`BETEXPLORER_MAX_DETAIL_FETCHES_PER_CYCLE`, défaut 8), délai poli
   `BETEXPLORER_MIN_REQUEST_INTERVAL_MS` (défaut 1,5 s).
   Marchés extraits : **1X2, DNB (`ha`), Double Chance (`dc`), BTTS
   (`bts`)**. **Over/Under et Handicap Asiatique NON branchés** — leur
   réponse regroupe plusieurs lignes dans un fragment (~1,2 MB) ;
   demandent un parseur ligne-par-ligne (chantier ouvert, voir ROADMAP).

`ingest.ts` : `provider → upsert Competition/Event/Market/Selection`, et
`OddsSnapshot` **seulement si le prix a changé**. Point de perf connu :
~1,1 s/point (4 upserts séquentiels sur la latence DB).

### Détecteurs (`detectors/`, fonctions pures testées)
`ODDS_DROP`, `ODDS_RISE`, `VIG_EXPLOSION`, `MARKET_LOCK`,
`MULTI_BOOK_CONFIRMATION`, `VALUE_BET`, + live : `MOMENTUM`,
`LIVE_SCORELESS_PICK`.

- **Filtre de plausibilité** (`getFixingOddsRange`, défaut 1.2–3.0) : une
  sélection dont le prix d'ouverture sort de cette bande est **ignorée
  avant** que ODDS_DROP/RISE tournent — on ne truque pas un match pour
  bouger une cote à 12.
- **Moteur de score** `score.ts` : 0–100, pondérations dans
  `DEFAULT_SCORE_WEIGHTS`, chaque facteur loggé dans `Signal.reasons`
  (JSON) pour recalibrer sans redéployer. Facteurs `volume`/`liquidity`
  laissés à 0 — **aucune source d'exchange/volume accessible depuis la
  France** (Betfair Exchange bloqué par l'ANJ).
- **Filtre "mouvement expliqué"** (`SUSPICIOUS_FILTER_EXPLAINED_MOVES`) :
  si Sofascore montre un but / carton rouge / penalty / VAR dans les 5
  dernières minutes, le signal est jeté (la cote reflète l'événement, pas
  de l'argent sharp).

### Seuils de livraison
- `MIN_SCORE_TO_ALERT` (défaut **35** — recalibré depuis 55 le 2026-08-20
  après audit : 1 signal sur 64 seulement dépassait 55, max historique 56).
- `SUSPICIOUS_MIN_SCORE` (défaut **55**) — plus haut car c'est le produit
  payant : qualité > volume.

### Écriture
`Signal` (type, `dedupKey` stable, `score`, `reasons`, prix, `metadata`,
statut `OPEN`/`UPDATED`/`RESOLVED`/`REJECTED`). Un signal qui se renforce
**met à jour** la ligne existante (et édite le message Telegram via
`SignalDelivery.messageRef`) au lieu de spammer. `SignalOutcome` note si
le pick s'est réalisé (1X2, O/U) — la boucle de feedback pour ne pas
vendre un seuil jamais validé.

### Cadences (`config.ts`, ralenties pour la quota DB free-tier)
- `WORKER_POLL_INTERVAL_MS` détection : 3 min
- `INGEST_POLL_INTERVAL_MS` ingestion : 15 min
- `STRATEGY_POLL_INTERVAL_MS` : 5 min
- `withWorkerLock` (`pg_advisory_lock`) empêche les passes concurrentes si
  deux instances tournent.

## 7. Site — auth & paiement

- **Auth** : NextAuth v5, provider credentials (email + mot de passe hashé
  bcrypt). Reset password maison (`PasswordResetToken`) car Auth.js n'a pas
  de reset credentials natif. Envoi d'e-mail via AgentMail —
  **historiquement cassé** (compte suspendu), workaround = lien de reset
  direct.
- **Checkout** : `/api/stripe/checkout` crée la session (redirige vers
  `/register` si non connecté). `/api/stripe/portal` = Billing Portal.
- **Webhook** `/api/stripe/webhook` : lit le corps **brut** (`.text()`)
  avant `constructEvent` (signature). **Idempotent** via `StripeEvent`
  (id d'événement déjà vu = no-op). Gère `customer.subscription.*`,
  `checkout.session.completed`, `invoice.payment_failed` →
  `syncEntitlementFromSubscription()` met à jour `Entitlement`.
- **Prix** : `plans.ts` lit les prix **en live** depuis Stripe si
  `STRIPE_SECRET_KEY` est présent (cache 15 min), sinon fallback statique
  (75 €/mois VIP + BOT). Piège connu : un `price_...` **live** utilisé en
  **mode test** échoue silencieusement côté serveur.

## 8. Schéma de données (tables principales)

| Domaine | Tables |
|---|---|
| Auth | `User`, `Account`, `Session`, `VerificationToken`, `PasswordResetToken` |
| Facturation | `Entitlement` (`type` VIP/BOT, `status`, `stripeSubscriptionId`), `StripeEvent` |
| Produit alertes user | `WatchlistItem`, `AlertRule`, `AlertTrigger`, `Notification` |
| Données sportives | `Provider`, `SyncLog`, `Competition`, `Event`, `Market`, `Selection`, `OddsSnapshot`, `VolumeSnapshot` |
| Moteur de détection | `Signal`, `SignalOutcome`, `SignalDelivery` |
| Liaison Telegram | `TelegramLink` (compte↔chatId), `TelegramLinkToken` |
| Consensus pronostics | `ScrapedTip`, `ConsensusAlert` (unique `fingerprint`), `GroupTicket`, `ChatFixtureContext` |
| Moteur stratégies | `StrategyStats`, `StrategyPick`, `StrategyPickDelivery` |

**Données sensibles en base** : e-mails utilisateurs, hash de mots de
passe (`bcrypt`), `stripeCustomerId`, `telegramChatId` + username,
`ScrapedTip.rawText` / `GroupTicket.rawText` (contenu brut de messages de
groupes tiers — potentiellement PII de tipsters). Pas de numéro de carte
(Stripe hébergé). **Rétention** : aucune purge automatique implémentée —
voir ROADMAP.

## 9. Déploiement

| Cible | Où | Comment |
|---|---|---|
| **Worker** | Fly.io, app `oddshunter-worker`, région `cdg`, 1 VM shared-cpu-1x 512 MB + 512 MB swap | `flyctl deploy --config fly.toml --dockerfile Dockerfile.worker` |
| **Site** | Vercel, projet `site-web-actuel` | build `npm run build` (= `prisma generate && next build --webpack`), sortie `.next` |
| **DB** | Supabase (Postgres) | migrations : `npx prisma migrate deploy` |

Historique d'hébergement (résidus encore dans le repo) : worker sur
Render puis Railway (`railway.json`, essai 500 h expiré) puis Fly ; site
sur Netlify (`netlify.toml`, crédits épuisés) puis Vercel.

## 10. Détails connus / pièges

- **Guillemets dans les env** : les valeurs de `.env` local sont entourées
  de `'...'`. Copiées telles quelles vers Fly/Vercel/Railway →
  `DATABASE_URL` corrompu → « Can't reach database server ». Toujours
  stripper. Bug rencontré 3 fois (Railway, Netlify, Fly).
- **OOM du worker** : Node (prisma generate + tsx JIT + cache 155 chats de
  gramjs) dépassait 256 MB → OOM-kill en boucle. Fix : 512 MB RAM +
  `swap_size_mb = 512` **au niveau racine** de `fly.toml` (nested sous
  `[[vm]]` = silencieusement ignoré).
- **gramjs `connectionRetries: 5`** (ancien) : après 5 échecs le listener
  `NewMessage` mourait en silence, process vivant → Fly ne redémarre pas →
  « marche aujourd'hui, muet demain ». Fix : retry infini.
- **`fly.toml` `release_command`** `prisma migrate deploy` retiré (échouait
  « datasource.url property is required » sur les machines de release) —
  migrations appliquées depuis le local pour l'instant.
- **Deux dossiers site** : voir §2.

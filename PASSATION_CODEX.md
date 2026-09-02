# DOSSIER DE PASSATION — OddsHunter

> Destiné à établir une collaboration durable entre Noaim, Claude et Codex.
> Rédigé le 2026-09-02. **Aucun secret dans ce fichier** : seulement où
> chaque secret est stocké et comment le configurer.
>
> Compléments : `ARCHITECTURE.md` (technique), `OPERATIONS.md` (runbook),
> `ROADMAP.md` (priorités), `AGENTS.md` (règles IA), `BOT_HANDOFF.md`
> (journal worker).

---

## 1. Vue d'ensemble

### Objectif global & modèle économique
OddsHunter vend deux abonnements à **75 €/mois** :
- **Telegram VIP** : accès à un canal privé où sont repostés des pronostics
  à fort consensus et des alertes de mouvements suspects.
- **Bot** : accès aux bots automatisés / au feed d'alertes.

**Acquisition** via le site web + un **lien d'affiliation 1xBet/XBet**
(commission sur les inscriptions/dépôts référés). Objectif secondaire :
audience via contenu réseaux sociaux.

Facturation par **Stripe** ; l'accès est gaté par la table `Entitlement`
(miroir local de l'abonnement Stripe).

### Produits

| Produit | Description | État |
|---|---|---|
| **Bot Telegram — consensus** | Lorsqu'au moins **3 canaux distincts** publient le même pronostic dans une fenêtre de **24 h**, une alerte est postée dans le canal VIP. Pipeline `src/worker/telegram/tipListener.ts` → `tipConsensus.ts` → `vipGroup.ts`. | **Fonctionnel**, en observation/affinage. Limité par la qualité du parsing/OCR et le nombre de canaux sources observés. Envoi réel gaté par `SEND_TIP_CONSENSUS_ALERTS`. |
| **Bot Telegram — chutes de cotes / mouvements suspects** | Scrape BetExplorer, détecte `ODDS_DROP`/`ODDS_RISE`/`VIG_EXPLOSION`/`MARKET_LOCK`/`MULTI_BOOK_CONFIRMATION`, score 0–100, filtre "mouvement expliqué". Cible les championnats obscurs. | **Fonctionnel techniquement**, **sous-alimenté** : une seule source de données, pas d'accès volume/liquidité (Betfair Exchange bloqué en France). Peu de signaux dépassent le seuil. Envoi gaté par `SEND_SUSPICIOUS_ALERTS`. |
| **Site web d'acquisition** | Next.js 16 : landing, auth, Stripe Checkout + webhooks + portail, page `/account` avec lien VIP, pages `/1xbet` `/bookmakers` `/reseaux` `/faq` `/mentions-legales`, i18n FR/EN/ES/RU. | **Fonctionnel**. Stripe en **mode test** (aucun paiement réel). E-mail "mot de passe oublié" **cassé** (AgentMail suspendu) — workaround lien direct. Déploiement à consolider (voir §2). |
| **Contenu YouTube / TikTok / X / Instagram** | Non technique, hors dépôt. | **Idée / non démarré.** Le site a une page `/reseaux` avec des liens. |

### État synthétique

| Composant | État |
|---|---|
| Worker Telegram (bot API, commandes) | ✅ Fonctionnel |
| Pipeline consensus | 🟡 Fonctionnel, à améliorer (qualité + couverture) |
| Pipeline mouvements de cotes | 🟡 Fonctionnel, sous-alimenté |
| Site (auth, Stripe test, i18n) | ✅ Fonctionnel |
| E-mail transactionnel | 🔴 Cassé (AgentMail) |
| Déploiement site | 🟡 Fonctionne mais depuis un dossier hors-repo (dette) |
| Observabilité / alerting | 🔴 Quasi inexistante |
| Contenu réseaux sociaux | ⚪ Non démarré |

---

## 2. Code et infrastructure

### Dépôt Git

| | |
|---|---|
| URL | `https://github.com/noaimk77/oddshunter.git` |
| Branche principale / déployée | **`redesign/odds-hunter`** (c'est `origin/HEAD`) |
| Autre branche | `main` — présente mais **en retard**, ne pas y pousser |
| Nom du package | `oddscope` (ancien nom du projet) |
| Dernières modifs | Branche `redesign/odds-hunter` avec **changements non commités** au 2026-09-02 (worker : détecteurs, betexplorer, config ; site : landing/i18n ; `prisma/schema.prisma` + nouvelle migration `20260902131843_add_consensus_alert_outcome_tracking`). **Codex : commencer par `git status` et décider avec Noaim quoi commiter.** |

**Point de vigilance — deux dossiers pour le site :**
- `~/oddshunter/` = **ce dépôt** (monorepo site + worker). Source de vérité.
- `~/Downloads/oddshunter/site-web-actuel/` = copie **partielle et plus
  ancienne** du site, **sans `.git`**, liée au projet Vercel
  `site-web-actuel`. C'est de là que le site a été déployé historiquement.
  → Objectif : déployer le site depuis ce dépôt et supprimer ce dossier
  (ROADMAP P4).

### Structure des dossiers
Voir `ARCHITECTURE.md §4` pour l'arborescence complète et commentée.
Résumé :
- `src/app/` — routes Next (App Router), dont `src/app/api/stripe/*`.
- `src/features/`, `src/components/`, `src/lib/` — site.
- `src/worker/` — le worker : `index.ts` (boucle), `config.ts` (tous les
  seuils/flags), `providers/`, `detectors/`, `strategies/`, `telegram/`.
- `prisma/schema.prisma` + `prisma/migrations/` (16 migrations).
- `Dockerfile.worker`, `fly.toml` — déploiement worker.

### Langages, frameworks, versions
Voir `ARCHITECTURE.md §3`. Essentiel : Node 20, Next.js 16.3.1, Prisma 7
(**adapter `@prisma/adapter-pg` explicite**), Postgres, `grammy` (bot API),
`telegram`/gramjs (MTProto), `tesseract.js` (OCR), `vitest`.

### Commandes

| But | Commande |
|---|---|
| Install | `npm ci` |
| Générer le client Prisma | `npx prisma generate` |
| Dev site | `npm run dev` (port 3000) |
| Dev worker | `npm run worker:dev` |
| Tests | `npm test` |
| Typecheck | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Build site | `npm run build` |
| Migration (dev) | `npx prisma migrate dev --name <desc>` |
| Migration (prod) | `npx prisma migrate deploy` |
| Déployer worker | `flyctl deploy --config fly.toml --dockerfile Dockerfile.worker` |
| Déployer site | `npx vercel --prod` (depuis le dossier lié) |

### Hébergement, domaines, DB, tâches planifiées, webhooks, logs, monitoring, sauvegardes

| Sujet | État |
|---|---|
| **Site** | Vercel, projet `site-web-actuel` (org `team_LrAP0DCA3TSiYZW9WFaRZVsz`, projet `prj_8oa7wox8WKLyAZAXUheeNYYH3YII`). |
| **Worker** | Fly.io, app `oddshunter-worker`, région `cdg`, 1 VM shared-cpu-1x 512 MB + 512 MB swap. |
| **Base de données** | **Supabase** (Postgres). Historique : Neon → Prisma Postgres → Supabase. Le code lit uniquement `DATABASE_URL`. |
| **Domaines** | Site servi sur un sous-domaine Vercel (`site-web-actuel.vercel.app`). Groupe Telegram public : `https://t.me/oddshunter98`. Pas de domaine custom documenté — à confirmer avec Noaim. |
| **Tâches planifiées** | Aucune tâche cron externe. Le worker est un **process long-vivant** avec ses propres boucles internes (détection 3 min, ingestion 15 min, stratégies 5 min) protégées par `pg_advisory_lock`. |
| **Webhooks** | 1 seul : `POST /api/stripe/webhook` (site). Signature vérifiée sur corps brut, idempotent via table `StripeEvent`. Le secret est `STRIPE_WEBHOOK_SECRET`. |
| **Logs** | `flyctl logs` (worker), dashboard Vercel (site). Pas d'agrégateur. |
| **Monitoring** | **Aucun alerting.** Pas de Sentry/APM. Manque n°1 (ROADMAP P1). |
| **Sauvegardes** | Sauvegardes plateforme Supabase (rétention à confirmer). Pas d'export hors-plateforme planifié. `TELEGRAM_USER_SESSION` doit avoir une copie de secours chiffrée. |

### Variables d'environnement — NOMS et usage uniquement

Le fichier **`.env.example`** (mis à jour, à la racine) liste **tous** les
noms avec un commentaire d'usage. Récapitulatif par cible :

**Site (Vercel) :**
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_VIP`,
`STRIPE_PRICE_BOT`, `AGENTMAIL_AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_VIP_INVITE_LINK`.

**Worker (Fly) :**
`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
`TELEGRAM_VIP_INVITE_LINK`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`,
`TELEGRAM_USER_SESSION`, `ANTHROPIC_API_KEY` (+ `ANTHROPIC_WORKSPACE_ID`,
`TIP_LLM_FALLBACK_MODEL`), `API_FOOTBALL_KEY` (optionnel, provider non
branché), et les flags/seuils : `SEND_LIVE_ALERTS`,
`SEND_SUSPICIOUS_ALERTS`, `SEND_TIP_CONSENSUS_ALERTS`,
`SEND_LEGACY_DETECTOR_ALERTS`, `SUSPICIOUS_FILTER_EXPLAINED_MOVES`,
`SUSPICIOUS_MIN_SCORE`, `MIN_SCORE_TO_ALERT`, `TIP_CONSENSUS_MIN_GROUPS`,
`TIP_CONSENSUS_WINDOW_MINUTES`, `TIP_MAX_MESSAGE_AGE_MINUTES`, etc.
(défauts dans `src/worker/config.ts`).

**Jamais de valeur dans le repo.** Consulter les valeurs :
- Local : `.env` (git-ignoré).
- Worker : `flyctl secrets list` (noms seuls).
- Site : dashboard Vercel → Project Settings → Environment Variables.

---

## 3. Bots et données

### Collecte Telegram → normalisation → consensus → anti-doublon → envoi VIP
Décrit en détail dans **`ARCHITECTURE.md §5`**. Points clés :

1. **Collecte** : client MTProto authentifié comme le **compte personnel de
   Noaim** (`userClient.ts`), un handler `NewMessage` sur **tous** les
   groupes joints, pas d'allowlist. Messages privés ignorés. Backlog
   (message > 30 min d'âge Telegram) rejeté avant traitement.
2. **Normalisation** (`tipParser.ts`, `tipOcr.ts`, `tipLlmFallback.ts`) :
   texte et OCR de l'image traités comme deux candidats indépendants ;
   3 tentatives (fixture+pick ici / fixture seule mémorisée / recall via
   contexte du chat), fallback LLM (Claude) en dernier recours. Sortie :
   un **fingerprint normalisé** (équipes + marché + sélection, sans
   accents/casse/espaces).
3. **Détection de consensus** (`tipConsensus.ts`) :
   - **strict** : ≥ 3 `sourceChatId` distincts, même fingerprint, sous 24 h.
   - **directionnel** (si strict KO) : ≥ 3 chats, même côté du même match,
     lignes différentes tolérées.
4. **Anti-doublon** : contrainte **unique** sur `ConsensusAlert.fingerprint`.
   Le premier passage au-dessus du seuil `create` la ligne ; les suivants
   échouent (`P2002`) → pas de ré-alerte. Concurrency-safe.
5. **Envoi VIP** : seulement si `SEND_TIP_CONSENSUS_ALERTS=true`, puis garde
   qualité `shouldSendConsensusAlert` (rejette les picks OCR-cassés).
   `vipGroup.sendConsensusAlert()` résout le groupe via
   `TELEGRAM_VIP_INVITE_LINK`, poste, renvoie `(chatId, messageId)`.
6. **Résolution** : `consensusOutcomeResolver` note WON/LOST/VOID en
   **réponse** au message d'alerte.

### Groupes / canaux Telegram suivis
- **Public gratuit** (affiché sur le site) : `https://t.me/oddshunter98`.
- **Canal VIP privé** : accès via `TELEGRAM_VIP_INVITE_LINK` (jamais en
  clair dans le code ; secret Fly + `.env`). Affiché sur `/account`
  uniquement aux abonnés VIP actifs.
- **Canaux sources du consensus** : **pas de liste curée dans le code** —
  le pipeline observe *tous* les groupes dont le compte MTProto de Noaim
  est membre (150+ au moment des incidents d'août). La "liste" est donc
  l'appartenance du compte Telegram personnel. `ScrapedTip.sourceChatId` /
  `sourceChatTitle` en base donnent la liste réelle observée. **Gestion
  d'accès** : Noaim rejoint/quitte les groupes manuellement avec son
  compte. Recommandation : migrer vers un **compte Telegram de service
  dédié** (voir §7).

### Sources de cotes, détection des chutes, seuils, fréquence, limites
Détail dans **`ARCHITECTURE.md §6`** et `BOT_HANDOFF.md`. Résumé :
- **Source active unique : BetExplorer** (gratuit, sans clé). Feed
  `dropping-odds` (triage) + détail par bookmaker pour les 8 plus grosses
  chutes/cycle, délai poli 1,5 s. Marchés extraits : 1X2, DNB, DC, BTTS
  (Over/Under & Handicap Asiatique **pas encore** — parseur ligne-par-ligne
  à écrire).
- **Fréquence** : ingestion toutes les 15 min, détection toutes les 3 min
  (relit la base), stratégies toutes les 5 min.
- **Seuils** : bande de cote "fixable" 1.2–3.0 (hors bande = ignoré) ;
  `MIN_SCORE_TO_ALERT=35` ; `SUSPICIOUS_MIN_SCORE=55` ; filtre
  "mouvement expliqué" via Sofascore (but/rouge/penalty/VAR < 5 min → jeté).
- **Limites connues** : pas de donnée de volume/liquidité (Betfair Exchange
  bloqué par l'ANJ en France) ; API-Football `/odds` bloqué en gratuit ;
  peu de signaux dépassent le seuil avec la source actuelle ; perf
  ~1,1 s/point à l'ingestion.

### Schéma des données
Tables listées dans **`ARCHITECTURE.md §8`**. Champs importants, rétention,
sensibilité :
- **Sensible** : `User.email`, `User.passwordHash` (bcrypt),
  `User.stripeCustomerId`, `TelegramLink.telegramChatId`/`telegramUsername`,
  `ScrapedTip.rawText` / `GroupTicket.rawText` (contenu brut de messages de
  groupes tiers — peut contenir des données personnelles de tipsters).
- **Pas de** numéro de carte (Stripe hébergé).
- **Rétention** : **aucune purge automatique**. À implémenter pour les
  `rawText` (ROADMAP P5).

### Exemples anonymisés

**Message entrant (canal source, texte) :**
```
🔥 PRONO DU JOUR 🔥
Équipe A – Équipe B
Over 2.5 buts @ 1.85
Mise conseillée : 2/10
```

**Message entrant (canal source, image = coupon) :**
```
[photo d'un coupon de paris]  légende : "banker du soir ✅"
→ OCR extrait : "ÉQUIPE A / ÉQUIPE B  1X2  1  COTE 1.72"
```

**Alerte produite dans le VIP (consensus atteint) :**
```
📊 CONSENSUS DÉTECTÉ — 3 canaux
Équipe A vs Équipe B
Marché : Over 2.5 buts
Cote relevée : ~1.85
```
(puis, après le match, en réponse : `✅ Passé` ou `❌ Perdu`.)

**Alerte pipeline B (mouvement de cote) :**
```
⚠️ MOUVEMENT SUSPECT — score 58/100
[Championnat obscur] Équipe X vs Équipe Y
1X2 → victoire X : 2.40 → 1.95 (-18,8 %), persistant 22 min
Confirmé par 3 bookmakers
```

---

## 4. Accès et secrets — sans les révéler

Principe général pour Codex : **accès en lecture d'abord**, comptes/tokens
**dédiés** (jamais réutiliser un token personnel de Noaim), **privilège
minimal**, **révocables** individuellement.

### GitHub
- **Compte / org** : `noaimk77`, dépôt `oddshunter`.
- **Droit minimal pour Codex** : au choix —
  - collaborateur **Write** sur le dépôt (si Codex doit pousser des
    branches / ouvrir des PR), ou
  - un **fork** + PR (aucun accès en écriture au dépôt principal).
  - Pour du CI/lecture seule : accès **Read**.
- **Où placer le secret** : un **fine-grained Personal Access Token** ou une
  **deploy key** dédiée, stocké côté Codex dans son gestionnaire de secrets
  / variables d'environnement — **pas** dans le repo.
- **Créer un accès dédié** : GitHub → Settings → Developer settings →
  Fine-grained tokens → *New token* → limiter au seul dépôt `oddshunter`,
  permissions *Contents: Read/Write*, *Pull requests: Read/Write*,
  expiration courte (30–90 j). Révoquer = supprimer le token.

### Telegram
- **Bot API** : le bot est créé via **@BotFather** sur le compte de Noaim.
  Token = `TELEGRAM_BOT_TOKEN`. Pour un environnement de test, créer un
  **second bot** via BotFather (`/newbot`) plutôt que partager le token de
  prod. Régénération : BotFather → `/revoke`.
- **MTProto (compte perso)** : `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`
  (depuis https://my.telegram.org/apps) + `TELEGRAM_USER_SESSION` (session
  string). **Le plus sensible : équivaut à l'accès complet au compte
  Telegram personnel de Noaim.**
  - **Ne jamais** donner cette session à Codex.
  - Recommandation forte : créer un **compte Telegram de service dédié**
    (numéro dédié), le faire rejoindre les canaux sources + le VIP, et
    générer *sa* session. Révocation = Telegram → Paramètres → Appareils →
    *Terminer la session*.
  - **Où placer le secret** : secret Fly (`flyctl secrets set`) + copie
    chiffrée hors-ligne. Jamais dans le repo, jamais loggé.

### Hébergeur — Fly.io (worker)
- **Compte** : `noaim.k77@gmail.com`.
- **Droit minimal pour Codex** : inviter Codex comme **membre de
  l'organisation Fly** avec accès à la seule app `oddshunter-worker` si un
  déploiement autonome est voulu ; sinon, **pas d'accès** — Codex prépare
  le code, Noaim déploie.
- **Secret** : `fly auth token` génère un token d'API ; le placer dans le
  gestionnaire de secrets de Codex. Révoquer via le dashboard Fly.
- Les secrets applicatifs vivent dans `flyctl secrets` (déjà en place).

### Hébergeur — Vercel (site)
- **Org** : `team_LrAP0DCA3TSiYZW9WFaRZVsz`, projet `site-web-actuel`.
- **Droit minimal** : rôle **Member** limité au projet, ou aucun accès
  (Noaim déploie). Pour des *preview deployments* automatiques, connecter
  le repo GitHub au projet plutôt que donner un token.
- **Secret** : Vercel → Account Settings → Tokens → token *scopé au projet*.
  Gestionnaire de secrets de Codex. Révocable individuellement.

### Base de données — Supabase
- **Droit minimal pour Codex : LECTURE SEULE au départ.** Créer un rôle
  Postgres dédié :
  ```sql
  CREATE ROLE codex_ro LOGIN PASSWORD '<défini hors de ce fichier>';
  GRANT CONNECT ON DATABASE postgres TO codex_ro;
  GRANT USAGE ON SCHEMA public TO codex_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO codex_ro;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO codex_ro;
  ```
  Idéalement via le **pooler** Supabase, et exclure les tables sensibles si
  possible (ou fournir des vues masquées de `User` / `*.rawText`).
- **Où placer le secret** : chaîne de connexion `codex_ro` dans le
  gestionnaire de secrets de Codex ; **jamais** la chaîne `service_role`.
- **Révocation** : `DROP ROLE codex_ro;` ou rotation du mot de passe.
- Passage en écriture : plus tard, rôle distinct limité aux tables non
  sensibles, sur décision de Noaim.

### Domaine / DNS
- Géré côté Vercel (sous-domaine) pour l'instant. Si un domaine custom est
  ajouté : accès **DNS en lecture** suffit pour Codex ; les modifications
  DNS restent chez Noaim (action difficilement réversible).

### Analytics
- Pas d'outil d'analytics installé actuellement (`src/` n'en contient pas).
  Si Vercel Analytics ou Plausible est ajouté : accès **Viewer** pour Codex.

### XBet / affiliation 1xBet
- Compte d'affiliation détenu par Noaim (portail partenaire 1xBet).
- **Ne pas donner d'accès à Codex.** Le seul artefact nécessaire est le
  **lien d'affiliation** (public), déjà utilisé sur le site (`/1xbet`).
  Toute modification du lien ou consultation des revenus reste manuelle.

### Réseaux sociaux
- Comptes non créés / non connectés. Quand ils le seront :
  **jamais** de mot de passe partagé ; utiliser les accès délégués natifs
  (ex. "rôles" de page), et **validation humaine obligatoire avant toute
  publication** (voir §7).

### E-mail — AgentMail
- Provisionné via Stripe Projects. `AGENTMAIL_AGENTMAIL_API_KEY` +
  `AGENTMAIL_INBOX_ID`. Compte historiquement suspendu. Si repris : clé
  d'API dédiée, stockée en secret d'hébergeur, révocable.

### Stripe
- Projet `oddscope`, compte "Odds.Hunter98". **Mode test.**
- **Droit minimal pour Codex** : une **clé API restreinte** (Restricted
  Key) en **lecture seule** sur les ressources utiles (Prices, Products,
  Subscriptions, Events) — **mode test uniquement**. Jamais la clé secrète
  standard, jamais de clé live.
- **Où** : gestionnaire de secrets de Codex / `.env` local non versionné.
- **Créer** : Dashboard Stripe (test) → Developers → API keys → *Create
  restricted key* → cocher *Read* sur les ressources nécessaires.
  Révocation immédiate depuis le même écran.

### Stockage
- Pas de bucket objet applicatif (OCR fait en mémoire). Rien à déléguer.

### `.env.example` et exclusion Git — état vérifié
- **`.env.example`** : mis à jour à la racine — **noms de variables
  uniquement**, aucune valeur.
- **`.gitignore`** (vérifié) exclut bien : `.env`, `.env.*`
  (avec `!.env.example`), `*.pem`, `/src/generated/prisma`, `.netlify/`,
  `.projects/cache`, `.projects/vault`, `*.db`. ✅
- **À faire** (ROADMAP) : ajouter `scratch_*.ts` au `.gitignore` (13
  scripts de debug traînent à la racine) et vérifier qu'aucun `.env`
  n'a jamais été commité (`git log --all --full-history -- .env`).

---

## 5. Documentation ajoutée au dépôt

| Fichier | Rôle | État |
|---|---|---|
| `README.md` | Démarrage rapide | ✅ Réécrit (remplace le boilerplate CNA) |
| `ARCHITECTURE.md` | Source de vérité technique | ✅ Créé |
| `OPERATIONS.md` | Procédures quotidiennes, déploiement, dépannage, rollback | ✅ Créé |
| `ROADMAP.md` | Priorités, risques, journal des décisions | ✅ Créé |
| `AGENTS.md` | Règles pour assistants IA (métier, commandes sûres, interdits) | ✅ Complété (section "Règles OddsHunter") |
| `.env.example` | Noms de variables + usage, zéro valeur | ✅ Réécrit |
| `PASSATION_CODEX.md` | Ce dossier | ✅ Créé |
| `CLAUDE.md` | Historique | ⚠️ Conservé mais partiellement périmé — `ARCHITECTURE.md` prime |
| `BOT_HANDOFF.md` | Journal détaillé worker | Existant, à jour au 2026-08-20 |

---

## 6. Connecteurs et collaboration

### Connecteurs recommandés côté Codex (accès minimal)

| Connecteur | Pourquoi | Accès minimal au départ |
|---|---|---|
| **GitHub** | Lire le code, ouvrir des PR | Fine-grained token limité au dépôt `oddshunter` (Contents R/W, PR R/W) — ou fork + PR |
| **Base de données (lecture seule)** | Comprendre les données réelles (fingerprints, signaux, entitlements) sans risque d'écriture | Rôle `codex_ro` Postgres (`SELECT` uniquement), via pooler Supabase |
| **Fly.io** | Lire les logs/statuts du worker | Token API en lecture ; déploiement réservé à Noaim au début |
| **Vercel** | Lire les logs/déploiements du site | Rôle Viewer scopé au projet |
| **Stripe (test, restricted read)** | Vérifier prix/produits/abonnements | Restricted key *read* en mode test |
| **Telegram** | *Optionnel* — tester le bot | **Seulement** via un **bot de test dédié** (BotFather `/newbot`). Jamais la session MTProto. |
| **Gestionnaire de tâches** | Suivi partagé | GitHub Projects (issues) ou un tableau externe lié au repo |

Ne **pas** connecter : l'affiliation 1xBet, les comptes réseaux sociaux, la
clé Stripe live, la session Telegram personnelle.

### Source de vérité commune
1. **Dépôt Git** `github.com/noaimk77/oddshunter`, branche
   `redesign/odds-hunter` — le code.
2. **Documentation versionnée** dans le repo : `ARCHITECTURE.md`,
   `OPERATIONS.md`, `ROADMAP.md`, `AGENTS.md`, `BOT_HANDOFF.md`,
   `PASSATION_CODEX.md`.
3. **Tableau de tâches** : GitHub Issues/Projects du dépôt (à créer).
   `ROADMAP.md` est la vue "priorités", les issues la vue "unités de
   travail".

### Signaler une modification importante
Toute modification de : **règle de consensus** (nombre de canaux, fenêtre),
**seuil de cote / score**, **flag `SEND_*`**, **nouvelle source de
données**, **déploiement**, **incident**, doit être :
1. Écrite dans une **entrée datée** de `ROADMAP.md` (section "Journal") ou
   `BOT_HANDOFF.md` pour le worker, **dans la même PR** que le changement.
2. Résumée dans la **description de PR** (avant/après, raison, risque,
   rollback).
3. Pour un changement de comportement en prod : un message à Noaim avec le
   diff de config et l'effet attendu, **avant** application.

Ainsi Codex (ou Claude) qui reprend le fil repart d'un contexte exact en
lisant `git log` + `ROADMAP.md` + `BOT_HANDOFF.md`.

---

## 7. Sécurité et conformité

### Risques identifiés
- **Token du bot Telegram** (`TELEGRAM_BOT_TOKEN`) : compromission = envoi
  de messages au nom du bot. → secret d'hébergeur, rotation via BotFather.
- **Session MTProto** (`TELEGRAM_USER_SESSION`) : compromission = accès
  complet au **compte personnel** de Noaim (messages, contacts, groupes).
  Risque le plus élevé. → compte de service dédié, secret Fly + copie
  chiffrée, jamais de log, jamais à Codex.
- **Accès aux groupes** : dépend de l'appartenance d'un compte réel ; un
  ban/kick casse le pipeline silencieusement ; un comportement perçu comme
  du spam peut faire limiter le compte.
- **Données utilisateurs** : e-mails, hash de mots de passe,
  `stripeCustomerId`, identifiants Telegram, contenu brut de messages
  tiers. → chiffrement au repos côté Supabase, accès `SELECT` restreint,
  purge des `rawText` à implémenter.
- **Compte d'affiliation 1xBet** : usage détenu par Noaim ; ne pas
  automatiser, ne pas exposer les identifiants.
- **Automatisation réseaux sociaux** : risque de publication non désirée /
  non conforme. → aucune publication automatique sans validation humaine.
- **Exposition de secrets** : dans un commit, un log, un message d'erreur.
  → `.gitignore` strict (fait), revue de diff, jamais `console.log` d'une
  valeur d'env, rotation immédiate au moindre doute.

### Mesures indispensables
- **Comptes de service dédiés** pour chaque intégration (bot de test,
  compte Telegram de service, rôle DB `codex_ro`, tokens scopés).
- **Privilège minimal** : lecture seule par défaut ; écriture accordée
  table par table / ressource par ressource, sur décision de Noaim.
- **Rotation / révocation** : chaque secret doit être révocable
  individuellement sans casser les autres. Documenter la procédure de
  re-génération de la session Telegram.
- **Logs sans données sensibles** : jamais de token, de session, d'e-mail
  complet, de `rawText` intégral dans les logs.
- **Validation humaine obligatoire avant** : tout envoi public (canal VIP
  hors pipeline validé, réseaux sociaux, e-mail au nom du projet), tout
  passage de flag `SEND_*` à `true`, toute baisse de seuil sensible, tout
  passage Stripe en live, toute migration destructive.

### Conformité (à faire vérifier — pas un avis juridique)
Points à examiner avec un professionnel selon les pays ciblés :
- **Paris sportifs & promotion de pronostics** : la publicité et la
  diffusion de pronostics sportifs sont **réglementées voire restreintes**
  dans plusieurs juridictions (en France, encadrement ANJ ; messages de
  prévention obligatoires ; restrictions sur le démarchage). Vérifier ce
  qui s'applique à un service payant de pronostics.
- **Affiliation 1xBet/XBet** : 1xBet **n'est pas licencié dans plusieurs
  pays** (dont la France) ; en promouvoir l'inscription peut être
  problématique selon le pays de l'audience et de l'éditeur. Vérifier la
  légalité de l'affiliation et les obligations de transparence (mention
  "lien affilié").
- **Protection des données (RGPD si audience UE)** : base légale pour
  stocker e-mails et contenu de messages de groupes tiers, information des
  personnes, durée de conservation, registre de traitement, DPA avec les
  sous-traitants (Supabase, Vercel, Fly, Stripe, Anthropic).
- **Scraping BetExplorer** : `robots.txt` autorise les chemins utilisés et
  le scraping est "poli", mais vérifier les CGU du site.
- **Lecture de messages de groupes Telegram tiers** : s'assurer que la
  collecte et la rediffusion (même reformulée) de pronostics de canaux
  tiers ne violent pas leurs conditions ni un droit d'auteur sur des
  contenus éditoriaux.
- **Jeu responsable** : prévoir mentions d'âge (18+), avertissements sur
  les risques, information sur l'aide au jeu.

---

## A. Checklist — ce que Noaim doit fournir manuellement à Codex

- [ ] **Accès GitHub** : inviter Codex en collaborateur (Write) sur
  `noaimk77/oddshunter`, **ou** confirmer le workflow fork + PR.
- [ ] **Créer un tableau de tâches** : activer GitHub Issues/Projects sur
  le dépôt (ou fournir le lien du tableau externe).
- [ ] **Base de données (lecture seule)** : créer le rôle `codex_ro` sur
  Supabase (script §4) et transmettre la chaîne de connexion à Codex **via
  un canal sécurisé** (pas ce dépôt, pas un chat public).
- [ ] **Fly.io** : décider si Codex a un accès lecture (token API) ou
  aucun ; le cas échéant, générer et transmettre le token.
- [ ] **Vercel** : décider accès Viewer ou aucun ; générer le token scopé
  si oui.
- [ ] **Stripe (test)** : créer une *restricted key* read-only en mode
  test et la transmettre.
- [ ] **Bot Telegram de test** : créer via BotFather (`/newbot`) si Codex
  doit tester le bot, transmettre ce token-là (jamais celui de prod,
  jamais la session MTProto).
- [ ] **Confirmer la branche de travail** : `redesign/odds-hunter`.
- [ ] **Trancher les changements non commités** actuels avec Codex/Claude
  (les commiter proprement ou les remiser).
- [ ] **Décision infra site** : autoriser la consolidation du déploiement
  Vercel depuis ce dépôt (ROADMAP P4).
- [ ] **Valeurs d'env manquantes** : indiquer à Codex lesquelles sont
  réellement configurées en prod (surtout `ANTHROPIC_API_KEY` côté worker,
  absente du `.env` local mais requise par le fallback LLM).
- [ ] **Domaine** : préciser s'il existe un domaine custom et qui gère le
  DNS.
- [ ] **Conformité** : indiquer les pays réellement ciblés (audience et
  éditeur) pour cadrer la revue légale.
- [ ] **Copie de secours** de `TELEGRAM_USER_SESSION` (chiffrée, hors
  ligne) — et décider de créer un compte Telegram de service dédié.

## B. Checklist — avant que Codex modifie ou déploie quoi que ce soit

- [ ] `git status` propre / changements en cours compris et cadrés.
- [ ] Sur la bonne branche (`redesign/odds-hunter`), à jour (`git pull`).
- [ ] `npm ci` + `npx prisma generate` OK.
- [ ] `npm test` vert, `npx tsc --noEmit` propre, `npm run lint` propre.
- [ ] `npm run build` OK si le site est touché.
- [ ] Aucun secret ajouté au diff (`git diff` relu ; pas de `.env`, clé,
  token, session, ID sensible).
- [ ] Si `schema.prisma` change : migration créée **et** revue ; pour la
  prod, export DB fait avant `migrate deploy`.
- [ ] Si un flag `SEND_*` ou un seuil sensible change : **accord explicite
  de Noaim**, entrée datée dans `ROADMAP.md` / `BOT_HANDOFF.md`, plan de
  rollback écrit.
- [ ] Si le worker est touché : `BOT_HANDOFF.md` relu, pas de déploiement
  worker en attente non confirmé (conflit `betexplorer.ts`).
- [ ] Migrations prod jouées **avant** le déploiement worker si un champ
  nouveau est requis (`fly.toml` n'a pas de `release_command`).
- [ ] Déploiement : d'abord worker en **état sûr** (`SEND_*=false`) puis
  observation 24–48 h avant d'activer les envois.
- [ ] Après déploiement : `flyctl logs` / dashboard Vercel vérifiés,
  message de résumé à Noaim (quoi, pourquoi, comment revenir en arrière).

## C. Trois priorités techniques les plus importantes

1. **Fiabilité d'exploitation du worker** (ROADMAP P1) — heartbeat +
   watchdog du listener MTProto + alerte en cas de silence anormal ou de
   quota DB proche. Le worker est aujourd'hui un point unique de
   défaillance sans détection ("marche aujourd'hui, muet demain").
2. **Qualité & couverture du pipeline consensus** (ROADMAP P2) — mesurer
   les faux négatifs (parsing/OCR ratés), améliorer l'OCR, élargir les
   canaux sources observés, tableau de bord "santé consensus"
   (fingerprints/jour, alertes/jour, taux WON). C'est le produit vendu.
3. **Consolider le déploiement du site** (ROADMAP P4) — déployer depuis ce
   dépôt, connecter Vercel au repo GitHub, supprimer le dossier
   `site-web-actuel/` divergent, nettoyer les résidus Netlify/Railway/Render.
   Sans ça, toute collaboration sur le site repose sur un dossier
   hors-contrôle-de-version.

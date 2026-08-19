@AGENTS.md

<!-- stripe-projects-cli managed:claude-md:start -->
look at AGENTS.md for your rules
<!-- stripe-projects-cli managed:claude-md:end -->

# Projet Oddshunter

## Résumé
Landing page + système d'abonnement pour Oddshunter — service de signaux de mouvements de cotes sportives. Deux offres à 75€/mois chacune : VIP Telegram et Bot automatisé.

## Stack technique
- **Framework** : Next.js 16.3 (app router) avec Tailwind CSS v4
- **UI** : shadcn/ui (base-ui), Framer Motion, Lucide icons
- **Auth** : NextAuth.js (email/password)
- **Paiement** : Stripe (Checkout + webhooks + portail client)
- **BDD** : Neon Postgres via Prisma ORM
- **Déploiement** : Netlify (production) — URL : https://oddshunter98.netlify.app
- **Env vars** : gérées via `stripe projects` CLI (ne pas éditer .env à la main)

## Commandes clés
```bash
npm run dev          # serveur de dev (port 3000)
npm run build        # build production
stripe projects env --pull   # récupérer les env vars
# Déployer sur Netlify :
NETLIFY_AUTH_TOKEN=$(grep NETLIFY_NETLIFY_AUTH_TOKEN .env | cut -d= -f2) npx netlify-cli deploy --build --prod
```

## Structure des fichiers importants
```
src/app/page.tsx                          # Landing page principale
src/app/account/page.tsx                  # Page "Mon compte" (profil + abonnements + lien VIP)
src/app/(auth)/                           # Login, register, forgot/reset password
src/features/landing/
  landing-header.tsx                      # Header sticky + menu hamburger mobile
  landing-footer.tsx                      # Footer avec socials + mentions légales
  social-section.tsx                      # Liens réseaux sociaux (Telegram gratuit, Insta, TikTok, X, YouTube)
  bookmakers-section.tsx                  # Placeholder "bientôt disponible"
  subscription-section.tsx                # Cards VIP + Bot avec Stripe Checkout
  faq-accordion.tsx                       # FAQ accordion
  scroll-to-top.tsx                       # Bouton retour en haut
  reveal.tsx                              # Scroll-reveal (IntersectionObserver + fallback timer)
  checkout-cta.tsx                        # Bouton Stripe Checkout (redirige vers /register si non connecté)
src/components/shared/
  odds-hunter-mascot.tsx                  # Mascotte SVG/PNG avec parallax mouse
  wordmark.tsx                            # Logo "ODDS HUNTER"
  brand-mark.tsx                          # Icône radar/crosshair
src/lib/
  plans.ts                                # Définitions des plans Stripe (VIP + BOT)
  stripe.ts                               # Config Stripe
  guards.ts                               # Auth guards (requireAuth)
  auth.ts                                 # NextAuth config
src/app/globals.css                       # Design system (couleurs, animations, utilitaires CSS)
```

## Worker (bot automatisé — src/worker/)
Processus séparé (pensé pour tourner sur Railway, pas sur Netlify Functions) qui détecte les mouvements de cotes et écrit des `Signal` en base. **État au 2026-08-18 : bot Telegram + base de données opérationnels ; il ne manque plus qu'une clé API-Football pour que l'ingestion tourne pour de vrai.**
```
npm run worker:dev     # boucle de détection en local (tsx watch)
npm run worker:start   # commande de démarrage prod (à pointer depuis Railway)
```
```
src/worker/
  config.ts                       # seuils configurables via env (voir .env.example) + INGEST_POLL_INTERVAL_MS + pays ciblés
  index.ts                        # boucle principale : verrou Postgres, ingestion (cadence lente) + détection (cadence rapide), mode observation
  lib/lock.ts                     # verrou d'exécution (pg_advisory_lock) — évite les passes concurrentes
  detectors/
    oddsDrop.ts / .test.ts        # détecteur ODDS_DROP pré-match (fonction pure, testée)
    score.ts / .test.ts           # moteur de score 0-100 + raisons, poids configurables
  providers/
    types.ts                      # interfaces normalisées (MarketDataProvider / ExchangeDataProvider / LiveStateProvider)
    betexplorer.ts                # adaptateur réel — source de cotes PRINCIPALE (gratuit, sans clé) — voir "Fournisseurs de données"
    apiFootball.ts                # adaptateur réel — fixtures/scores gratuits ; /odds bloqué en gratuit (voir ci-dessous)
    theOddsApi.ts                 # adaptateur réel mais NON branché — couvre les grands championnats, plus l'objectif (voir ci-dessous)
    betfair.ts                    # adaptateur stub — inutilisable depuis la France (Exchange bloqué par la réglementation)
  ingest.ts                       # fetch un provider → upsert Competition/Event/Market/Selection/OddsSnapshot (snapshot seulement si le prix a changé)
  telegram/
    bot.ts                        # commandes grammy : /start /subscribe /settings /status /history /help
    linking.ts / .test.ts         # génération/consommation du lien de liaison compte↔Telegram (token signé, usage unique, 15 min)
    sendAlert.ts                  # formatage + envoi d'un Signal (édite le message existant si le signal se renforce)
```

## Fournisseurs de données
Le cahier des charges original visait Pinnacle/Bet365/SBOBET/SABA en direct + OddsMatrix/Sportradar comme agrégateurs pro. Recherche du 2026-08-18 : **Sportradar** (10 000$+/mois, contrat entreprise) et **OddsMatrix** (pas de self-service, il faut passer par un commercial) ne sont pas réalistes avant d'avoir du revenu.

**Contrainte "0€ absolu" posée par Noaim le 2026-08-19** — audit complet effectué : PS3838 (B2B uniquement, aucun accès retail), SBOBET (aucune API publique), Betfair Exchange et OrbitX (bloqués par la réglementation française — même liquidité que Betfair), Asian Connect (accessible mais sans API, interface manuelle uniquement) sont tous des impasses vérifiées, pas des suppositions. Détails complets dans la mémoire `oddshunter-bot`.

**Source principale retenue : BetExplorer** (betexplorer.com) — gratuit, sans compte, `robots.txt` autorise explicitement les chemins utilisés (seuls `/ad/`, `/redirect/`, `/bookmaker/` et des query params sont interdits). HTML rendu côté serveur (confirmé via curl brut, pas besoin de navigateur headless). Couvre nativement les ligues obscures voulues (Écosse Highland League, Iran, petites ligues australiennes... apparues spontanément dans le premier test). Deux endpoints :
- `/football/dropping-odds/` — feed de triage : tous les matchs en chute significative, tous championnats, avec % de chute et consensus multi-bookmakers déjà calculé par BetExplorer.
- `/match-odds/{matchId}/0/{marché}/bestOdds/?lang=en` — détail par bookmaker individuel (nom, cote, timestamp), y compris des books orientés Asie comme BetInAsia. Marchés dispo au-delà du 1X2 : O/U, Handicap Asiatique, DNB, DC, BTTS.

`src/worker/providers/betexplorer.ts` implémente ça en deux temps : la page dropping-odds (1 requête, triage large) puis le détail par bookmaker seulement pour les N plus grosses chutes par cycle (`BETEXPLORER_MAX_DETAIL_FETCHES_PER_CYCLE`, défaut 15) — pas de scraping agressif de tous les matchs. Délai poli entre requêtes (`BETEXPLORER_MIN_REQUEST_INTERVAL_MS`, défaut 1.5s). Testé en direct (2026-08-19) : fonctionne, cotes réelles et mouvantes confirmées. **Point de perf connu** : l'ingestion existante (`ingest.ts`) fait 4 upserts DB séquentiels par point de donnée (~1.1s/point sur la latence Neon) — avec la couche détail activée, un cycle complet peut prendre plusieurs minutes. Pas bloquant vu le cycle d'ingestion par défaut (20 min), mais optimisable plus tard (upserts groupés / cache en mémoire des IDs déjà vus dans le passage).

**Décision produit du 2026-08-18 (Noaim) : cibler les championnats obscurs/peu surveillés (Inde toutes divisions, petits championnats d'Amérique latine), pas les grands championnats commerciaux** — un mouvement suspect a plus de chances de passer inaperçu là où personne ne regarde. Ça exclut de facto les agrégateurs type The Odds API / TheOddsAPI (ne couvrent que les grandes ligues). Source V1 retenue : **API-Football**, gratuite, ~1200 compétitions couvertes dans le monde. `src/worker/providers/apiFootball.ts` (`createApiFootballOddsProvider`) résout les championnats par pays (`GET /leagues?country=`, liste dans `API_FOOTBALL_TARGET_COUNTRIES`), puis récupère les cotes par championnat (`GET /odds?league=&season=`) et les fixtures pour les noms d'équipes. Budget quotidien (100 requêtes/jour en gratuit) suivi en mémoire — d'où une ingestion toutes les 20 min (`INGEST_POLL_INTERVAL_MS`), découplée de la détection qui elle tourne toutes les 30s.

`theOddsApi.ts` reste dans le repo (code réel, testé) mais n'est plus branché — il a été écrit avant ce changement de cap produit, quand on visait encore les grands championnats. Pourrait resservir un jour pour confirmer un mouvement via une deuxième source sur les gros matchs.

**Bloquant avant de connecter des données réelles** :
- `API_FOOTBALL_KEY` : pas encore configuré — inscription gratuite sur dashboard.api-football.com (aucune vérification d'identité)
- `BETFAIR_APP_KEY/USERNAME/PASSWORD` : accès développeur pas encore actif (nécessite un vrai compte Betfair vérifié — à faire par Noaim uniquement)
- Mode observation (`SEND_LIVE_ALERTS=false` par défaut) : le worker calcule et stocke les signaux mais n'envoie rien tant que ce n'est pas explicitement activé, une fois la qualité validée sur données réelles

## Liens Telegram
- **Groupe gratuit** (section réseaux + footer) : `https://t.me/oddshunter98`
- **VIP privé** (page compte, abonnés actifs uniquement) : via env var `TELEGRAM_VIP_INVITE_LINK`
  - Valeur actuelle : `https://t.me/+JxsH3cnSYME2MGI0`

## Design system
- Thème dark-only, palette dorée (#f5b800) comme accent
- Surfaces graduées : surface-0 (#050505) à surface-4 (#151518)
- Animations CSS custom : `gradient-text`, `shimmer`, `glow-border`, `signal-pulse`, `ambient-glow`, `bg-grid`
- Respect de `prefers-reduced-motion`
- Police : Geist Sans / Geist Mono

## Stripe
- Projet Stripe : "oddscope" (compte Odds.Hunter98)
- **Le site tourne en mode TEST Stripe** (`STRIPE_SECRET_KEY` = `sk_test_...`) — aucun paiement réel ne passe actuellement, et c'est voulu tant que Noaim n'a pas explicitement demandé de passer en live (bascule qui traite de l'argent réel, à ne jamais faire sans confirmation explicite).
- Prix VIP : `price_1U4mxKINKReF4ckusfZmVX1W` (mode test, fonctionne)
- Prix BOT : `price_1U6CzfINKReF4ckujFshOKSG` (mode test, créé le 2026-08-19 — **l'ancien `price_1U4OMTINKReF4ckuNNGT0CN0` n'existait qu'en mode live**, donc toute tentative d'abonnement au Bot échouait silencieusement côté serveur alors que le site semblait normal. Repéré uniquement parce que Noaim a testé le vrai parcours d'achat.)
- Webhook secret dans env var `STRIPE_WEBHOOK_SECRET`
- **Piège Netlify** : `stripe projects variables set` + `env --pull` ne met à jour que le `.env` local, **pas** les variables d'environnement Netlify en production. Il faut aussi `netlify-cli env:set <VAR> <valeur> --context production`, puis redéployer — sinon le site en prod continue de tourner avec l'ancienne valeur silencieusement.

## Providers (via stripe projects)
- AgentMail (email transactionnel)
- Neon (Postgres)
- Netlify (hébergement du site)
- Railway (héberge le worker `src/worker/` — **déployé et actif 24/7 depuis le 2026-08-19**)
- Render (lié mais Netlify est le déploiement principal du site)

## Worker déployé sur Railway
- Compte Railway : `noaim.k77@gmail.com` (CLI installé via `curl -fsSL https://railway.app/install.sh | sh`, séparé du compte lié à Stripe Projects — deux comptes distincts)
- Projet : `oddshunter-worker` (project ID `2b9c1d52-05e4-4258-af40-a3616add7515`, service ID `297da1ed-767c-47e2-ad55-59dae54e5aa1`, env `production` = `9132e59e-3174-4d77-86e4-fb62f28721f8`)
- **Plan gratuit = essai limité (500h de calcul, ~20 jours en continu), pas permanent.** À revoir avant expiration : soit passer sur le plan payant Railway (5$/mois, casse la contrainte 0€), soit migrer vers Oracle Cloud Free Tier (gratuit à vie mais nécessite que Noaim crée le compte lui-même).
- `railway.json` à la racine force `deploy.startCommand: npm run worker:start` (sinon Railway lance `next start`, le site, par défaut) — la commande CLI `environment edit --service-config` ne persistait pas de façon fiable, le fichier commité est la méthode qui marche.
- Variables d'env copiées depuis `.env` local vers Railway via `railway variable set --stdin` (jamais affichées) — **attention** : les valeurs dans `.env` local sont entourées de guillemets simples (`'...'`), il faut les retirer avant de les transmettre à Railway ou la valeur est corrompue (bug rencontré : `DATABASE_URL` mal transmis via interpolation shell directe → `Can't reach database server`, corrigé en passant par stdin après avoir strippé les guillemets).
- `SEND_LIVE_ALERTS` non défini sur Railway = mode observation actif (comportement par défaut, cohérent avec le local).
- Logs : `railway logs --project <id> --service <id> --environment <id> --lines N` (CLI local : `source ~/.railway/env` d'abord).

## Règles
- Langue du site : **français**
- Pas de design "AI-looking" — style sobre, premium, dark
- Animations fluides mais pas excessives
- Ne jamais committer le fichier `.env`
- Ne pas éditer les fichiers sous `.projects/` — le CLI gère tout

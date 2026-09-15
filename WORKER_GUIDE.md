# Worker Guide — Odds Hunter Signal Detection Engine

**Pour** : Claude Code (Codex), ChatGPT, agents IA continuant le développement

**Location** : `src/worker/` dans https://github.com/noaimk77/oddshunter

**Deployed on** : Fly.io, app `oddshunter-worker` (region Paris CDG)

**Current branch** : Merge de `main` + `fix/consensus-claim-lifecycle` (voir TRANSFER_STATUS.md pour la version exacte)

---

## Le Système en 30 Secondes

```
Fetch odds data from providers (BetExplorer, API-Football, etc.)
         ↓
Normalize into DB (Competition/Event/Market/Selection/OddsSnapshot)
         ↓
Run detection engines (odds drop, odds rise, vig explosion, market lock, multi-book confirm, value bet)
         ↓
Score each signal (0-100 based on magnitude, persistence, multi-book agreement)
         ↓
Deliver to Telegram (IF SEND_LIVE_ALERTS=true) OR log only (observation mode)
         ↓
Monitor Telegram for pronostics consensus (2+ sources → VIP alert)
         ↓
Track match outcomes (live score updates → message edit)
```

---

## Fichiers Clés

### Processus principal
- **`src/worker/index.ts`** — main loop (ingest + detection + outcome resolution)
- **`src/worker/config.ts`** — config centralisée (env vars + defaults)
- **`src/worker/ingest.ts`** — fetch providers, normalize to DB

### Moteurs de détection
- **`src/worker/detectors/oddsDrop.ts`** — chute de cote (pre-match)
- **`src/worker/detectors/oddsRise.ts`** — montée de cote
- **`src/worker/detectors/vigExplosion.ts`** — marge bookmaker inusitée
- **`src/worker/detectors/marketLock.ts`** — marché verrouillé
- **`src/worker/detectors/multiBookConfirmation.ts`** — même mouvement sur 3+ books
- **`src/worker/detectors/valueBet.ts`** — valeur implicite vs benchmarks
- **`src/worker/detectors/score.ts`** — scoring 0-100 (testée)

### Providers de données
- **`src/worker/providers/betexplorer.ts`** — scraper BetExplorer (source principale, gratuit)
- **`src/worker/providers/apiFootball.ts`** — API-Football (100 req/day free)
- **`src/worker/providers/theOddsApi.ts`** — The Odds API (non-wired)
- **`src/worker/providers/betfair.ts`** — Betfair stub
- **`src/worker/providers/types.ts`** — interfaces normalisées

### Stratégies avancées
- **`src/worker/strategies/liveMatchMonitor.ts`** — monitoring en direct des matchs
- **`src/worker/strategies/liveOdds.ts`** — cotes live intra-match
- **`src/worker/strategies/strategyRunner.ts`** — orchestrateur

### Telegram & Consensus VIP
- **`src/worker/telegram/tipListener.ts`** — MTProto listener (groupes sources)
- **`src/worker/telegram/tipParser.ts`** — extraction fixture/market/selection
- **`src/worker/telegram/vipGroup.ts`** — validation + envoi VIP
- **`src/worker/telegram/alertFormat.ts`** — formatage messages
- **`src/worker/telegram/consensusOutcomeResolver.ts`** — suivi résultats
- **`src/worker/telegram/sendAlert.ts`** — envoi via bot API
- **`src/worker/telegram/cashoutResolver.ts`** — suivi cash-outs

### Outcome resolution
- **`src/worker/outcomeResolver.ts`** — grading des signaux (win/loss/push)
- **`src/worker/livePicks.ts`** — tracking picks en direct
- **`src/worker/momentumPicks.ts`** — signaux momentum

### Utilitaires
- **`src/worker/lib/lock.ts`** — verrou Postgres (évite les races)
- **`src/worker/lib/purge.ts`** — nettoyage des vieilles données

---

## Démarrage Local

### Prérequis
```bash
node --version    # ≥18.0.0
npm install
```

### Variables d'environnement
```bash
cp .env.example .env.local

# Remplir au minimum :
DATABASE_URL="postgresql://..."  # Supabase pooler URL
TELEGRAM_API_ID="123456"
TELEGRAM_API_HASH="..."
TELEGRAM_BOT_TOKEN="..."
# Voir .env.example pour liste complète
```

### Lancer localement
```bash
npm run worker:dev
# Attendre : "[tipListener] tip listener connected — N chats/channels cached"
```

Le worker va :
1. Se connecter à Supabase
2. Se connecter à Telegram (MTProto listener)
3. Entrer dans la boucle de détection

**Mode observation** (par défaut) : calcule les signaux mais n'envoie RIEN.
→ Voir `SEND_LIVE_ALERTS` dans config.ts

### Tests
```bash
npm run test                       # Vitest (worker tests)
npm run test -- --ui              # UI mode
npm run test -- src/worker/detectors  # Tests détecteurs seulement
```

Tests actuellement couverts :
- ✓ `oddsDrop.test.ts` — fonction pure, testée
- ✓ `score.test.ts` — scoring engine, testée
- ✓ `tipParser.test.ts` — parsing pronostics, 256+ test cases
- ✓ `ticketParser.test.ts` — parsing bet-slips
- ✓ `linking.test.ts` — account linking

---

## Modifier les Détecteurs

### Exemple : augmenter le seuil de odds-drop

**Fichier** : `src/worker/detectors/oddsDrop.ts`

```typescript
// Avant :
const ODDS_DROP_THRESHOLD_PERCENT = 5;  // 5%

// Après :
const ODDS_DROP_THRESHOLD_PERCENT = 7;  // 7%
```

OU via env var :
```bash
flyctl secrets set ODDS_DROP_THRESHOLD_PERCENT=7 -a oddshunter-worker
```

### Exemple : ajouter un nouveau détecteur

1. Créer `src/worker/detectors/newThing.ts`
2. Implémenter `function detectNewThing(signal: SignalData): NewThingOutcome`
3. Ajouter les tests `src/worker/detectors/newThing.test.ts`
4. Importer et appeler dans `src/worker/index.ts` (main loop)
5. Commit + push
6. Deploy : `flyctl deploy -a oddshunter-worker`

---

## Modifier le Consensus VIP

### Fichiers concernés
- `src/worker/telegram/tipListener.ts` — récupte les pronostics
- `src/worker/telegram/tipParser.ts` — extrait fixture/market/selection
- `src/worker/telegram/vipGroup.ts` — envoie au VIP
- `src/worker/telegram/alertFormat.ts` — formate le message

### Hausse du seuil (2 groups → 3)
```bash
flyctl secrets set TIP_CONSENSUS_MIN_GROUPS=3 -a oddshunter-worker
```

Redeploy automatique en ~30s. Vérifier :
```bash
flyctl logs -a oddshunter-worker | grep "consensus"
```

### Modifier le template du message VIP
Fichier : `src/worker/telegram/alertFormat.ts`

Fonction : `formatConsensusMessage()`

```typescript
// Avant
const msg = `⚽ ${match}\n🌍 ${country}\nÀ parier : ${selection}`;

// Après
const msg = `⚽ ${match}\n🌍 ${country}\n🎯 Sélection : ${selection}`;
```

Puis : commit + deploy

### Ignorer un groupe/chat
Actuellement : **pas d'allow-list/deny-list implémentée**.

À faire : modifier `src/worker/telegram/tipListener.ts` pour filtrer par chat ID.

```typescript
const BLOCKED_CHAT_IDS = ["-1002475716201", "-1001992430602"];
if (BLOCKED_CHAT_IDS.includes(message.chatId)) return; // skip
```

---

## Variables de Configuration

### Détection
- `ODDS_DROP_THRESHOLD_PERCENT` (default 5)
- `ODDS_DROP_MIN_PERSISTENCE_SEC` (default 120)
- `ODDS_DROP_CORRECTION_REBOUND_PERCENT` (default 2)
- `WORKER_POLL_INTERVAL_MS` (default 30000 = 30s)
- `INGEST_POLL_INTERVAL_MS` (default 1200000 = 20 min)
- `STRATEGY_POLL_INTERVAL_MS` (default 60000 = 1 min)

### Delivery
- `SEND_LIVE_ALERTS` (default false) — flip to true when validating signals
- `SEND_LEGACY_DETECTOR_ALERTS` (default false)
- `SEND_SUSPICIOUS_ALERTS` (default true)
- `SEND_TIP_CONSENSUS_ALERTS` (default true)

### Consensus VIP
- `TIP_CONSENSUS_MIN_GROUPS` (default 2)
- `TIP_CONSENSUS_WINDOW_MINUTES` (default 1440 = 24h)
- `TIP_CONSENSUS_HT_WINDOW_MINUTES` (default 25)
- `TIP_LLM_FALLBACK_ENABLED` (default true) — Claude Haiku extraction
- `CONSENSUS_REQUIRE_RESOLVABLE_FIXTURE` (default true)
- `CONSENSUS_REQUIRE_PREMATCH` (default true)

### Data & Providers
- `API_FOOTBALL_TARGET_COUNTRIES` (default "India,Bolivia,Paraguay,Peru,Ecuador,Venezuela")
- `API_FOOTBALL_KEY` (empty = provider disabled)
- `BETEXPLORER_ENABLED` (default true)
- `BETEXPLORER_MAX_DETAIL_FETCHES_PER_CYCLE` (default 15)
- `BETFAIR_APP_KEY`, `BETFAIR_USERNAME`, `BETFAIR_PASSWORD` (all empty = disabled)

### Telegram
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` — MTProto credentials (user account)
- `TELEGRAM_USER_SESSION` — serialized gramjs session
- `TELEGRAM_BOT_TOKEN` — bot API token
- `TELEGRAM_VIP_INVITE_LINK` — private group link
- `TIP_LISTENER_CHANNELS_ONLY` (default false) — filter broadcast channels only

### LLM
- `ANTHROPIC_API_KEY` (empty = LLM fallback disabled)
- `TIP_LLM_FALLBACK_MODEL` (default "claude-haiku-4-5-20251001")

Voir `src/worker/config.ts` pour la liste complète.

---

## Déploiement

### Normal flow
```bash
cd ~/oddshunter
git add .
git commit -m "fix(worker): description"
git push origin fix/consensus-claim-lifecycle  # (ou ta branche)
flyctl deploy -a oddshunter-worker
```

### Vérifier le déploiement
```bash
# Logs en direct
flyctl logs -a oddshunter-worker -n 50

# Attendre :
# [worker] signal detected: odds drop 6%, Foo vs Bar
# [tipListener] processing message from chat -1234567890
# [vipGroup] posting consensus alert — Foo vs Bar, OVER_2_5 (2 groups)
```

### Modifier une config sans code
```bash
flyctl secrets set VAR1=value1 VAR2=value2 -a oddshunter-worker
# Observe automatic redeploy (~30s)
# Verify: flyctl ssh console -C "printenv VAR1" -a oddshunter-worker
```

### Rollback
```bash
flyctl releases -a oddshunter-worker    # List
flyctl releases rollback -a oddshunter-worker
```

### D'urgence : redémarrer
```bash
flyctl restart -a oddshunter-worker
```

---

## Tester sans Envoyer au VIP

### Mode observation (par défaut)
Worker calcule les signaux mais n'envoie rien. Parfait pour dev & testing.

Vérifier : `SEND_LIVE_ALERTS=false` dans config.ts ou fly.toml

### Tester un détecteur localement
```bash
npm run worker:dev
# Le worker démarre, tourne sur les données réelles (mais en observation)
# Regarder les logs pour les signals calculés

# Chercher une phrase spécifique :
npm run worker:dev | grep "odds drop"
```

### Tester l'envoi Telegram sans toucher le VIP réel
1. Créer un groupe de test Telegram privé
2. Inviter le bot dedans
3. Modifier `TELEGRAM_VIP_INVITE_LINK` en local pour pointer au groupe de test
4. Set `SEND_LIVE_ALERTS=true` en local
5. Tester
6. Revert avant de commit

### Tester les migrations BD
```bash
npx prisma migrate dev --name test
# Applique sur ta BD locale
npx prisma migrate reset  # Rollback (⚠️ DATA LOSS)
```

---

## Dépannage

### Worker crash immédiate
```bash
flyctl logs -a oddshunter-worker -n 100
# Chercher : "error", "exception", "failed to connect"
```

Causes fréquentes :
- `DATABASE_URL` manquante ou mal formée
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` manquants
- Supabase inaccessible (maintenance?)

### Aucun signal n'apparaît
- Vérifier : `SEND_LIVE_ALERTS=true`
- Vérifier : au moins un provider configuré (API key présente)
- Vérifier : BetExplorer accessible (curl http://betexplorer.com)

### Consensus alerts stoppées
- Vérifier : `SEND_TIP_CONSENSUS_ALERTS=true`
- Vérifier : MTProto listener connecté (logs : "tip listener connected")
- Vérifier : groupes Telegram actifs (trafic de pronostics)

### Erreur "Can't reach database"
- `DATABASE_URL` corruptée (caractères échappés mal?)
- Supabase down?
- Fly peut pas atteindre le pooler (rare)

Fix :
```bash
flyctl ssh console -C "printenv DATABASE_URL" -a oddshunter-worker
# Copier la valeur, vérifier qu'elle est propre
```

---

## À Savoir

### Coût infrastructure = 0€ absolument
- Fly.io free tier (512MB RAM OK pour ce travail)
- Supabase free tier
- API-Football gratuit (100 req/day)
- BetExplorer gratuit (robots.txt permet scraping)

Toute upgrade payante = **demander avant**

### Entités principales en BD
- **OddsSnapshot** — cote + timestamp (ingest)
- **Signal** — detection result (drop/rise/vig/lock/etc, score 0-100)
- **ScrapedTip** — pronostic extrait Telegram
- **ConsensusAlert** — alerte VIP
- **PendingConsensusOutcome** — suivi des résultats

Voir `prisma/schema.prisma` pour le schéma complet.

### Langues
- Site web : français
- Messages Telegram : selon source (auto-detect)

### Logs de production à monitorer
```bash
# Boucle ingest (toutes les 20 min)
[worker] ingestion cycle N completed

# Boucle detection (toutes les 30s)
[worker] detection pass completed — N signals

# Signals envoyés
[worker] signal delivered: odds drop 6%, Foo vs Bar, score 75

# Consensus VIP
[vipGroup] posting consensus alert — Foo vs Bar (2 groups)
```

---

## Points Bloquants Actuels

1. **Sofascore** = 403 (Cloudflare block) — fallback TheSportsDB OK mais limité
2. **API-Football** = 100 req/day gratuit — triage des championnats requis
3. **Betfair** = bloqué France, pas d'API simple
4. **Consensusing** = rare (dépend du trafic multi-sources)
5. **OCR** = OK mais pas 100% (preprocessing + Tesseract + LLM fallback)

---

**Last updated** : 2026-09-15  
**For** : Codex, Claude Code, ChatGPT


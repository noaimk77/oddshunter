# Transfer Status — État Exact du Projet pour Codex

**Date** : 2026-09-15  
**Checked** : code local + git status + memory

---

## 🟢 Production Deployments

### Worker (Fly.io)

| Aspect | Status | Detail |
|--------|--------|--------|
| **Deployed** | ✓ | App `oddshunter-worker`, region Paris CDG |
| **Uptime** | ✓ | 24/7 process, auto-restart on crash |
| **Branch in prod** | ❓ | **INCONNU** — doit être vérifié dans Fly |
| **Last seen working** | ✓ | 2026-09-12 (memory), probablement plus récent |
| **Config via secrets** | ✓ | Fly secrets set (rolling redeploy) |
| **Logs accessible** | ✓ | `flyctl logs -a oddshunter-worker` |

**Action pour Codex** : 
```bash
flyctl logs -a oddshunter-worker -n 20
# Doit voir : "[tipListener] tip listener connected" ou "[worker] detection pass"
```

### Site Web (Vercel)

| Aspect | Status | Detail |
|--------|--------|--------|
| **Deployed** | ✓ | Project `site-web-actuel`, alias `oddshunter98.vercel.app` |
| **Code source** | ⚠️ | `~/Downloads/oddshunter/site-web-actuel/` (NOT a git repo) |
| **Deploy method** | ✓ | CLI direct : `npx vercel deploy --prod` |
| **DB connected** | ✓ | Supabase Postgres (shared with worker) |
| **Auth working** | ? | **NON TESTÉ RÉCEMMENT** |
| **Payments (Stripe)** | ? | Mode TEST, aucun paiement réel accepté |

**Note** : Site code dans ce repo (`~/oddshunter/src/app/`) est **STALE**. La vraie source est site-web-actuel.

---

## 📁 Répertoires Clés

```
~/oddshunter/                                  (git repo, PRIMARY)
  ├─ src/worker/                              ✓ Code worker complet
  │   ├─ index.ts                             ✓ Main loop
  │   ├─ detectors/                           ✓ 6+ moteurs
  │   ├─ providers/                           ✓ APIs
  │   ├─ strategies/                          ✓ Live monitoring
  │   ├─ telegram/                            ✓ Consensus + alerts
  │   └─ lib/                                 ✓ Utilities
  │
  ├─ src/app/                                 ⚠️ STALE (site-web-actuel is current)
  ├─ src/components/, src/lib/                ⚠️ STALE
  ├─ prisma/schema.prisma                     ✓ DB schema (shared)
  ├─ CLAUDE.md                                ✓ Doc existant
  ├─ AGENTS.md                                ✓ Auto-généré Next.js + Stripe
  ├─ .env.example                             ✓ Variables doc'd
  ├─ package.json                             ✓ Dépendances
  ├─ Dockerfile.worker                        ✓ Fly image
  └─ fly.toml                                 ✓ Fly config

~/Downloads/oddshunter/site-web-actuel/      (NO git, Vercel)
  ├─ src/app/, src/components/                ✓ CURRENT site code
  ├─ src/lib/                                 ✓ Auth, Stripe, DB
  ├─ .vercel/project.json                     ✓ Vercel project ID
  ├─ package.json                             ✓ Site-specific deps
  └─ (NO .git, deploy via CLI)               ⚠️ No version control here
```

---

## 🔧 Code Status

### Dépendances

| Package | Version | Status |
|---------|---------|--------|
| next | 16.3.1 | Latest |
| react | 19.2.8 | Latest |
| prisma | 7.9.1 | Latest |
| @anthropic-ai/sdk | 0.122.0 | Latest (LLM fallback) |
| telegram | 2.26.22 | MTProto client |
| grammy | 1.45.1 | Telegram bot framework |
| stripe | 22.5.0 | Payments |
| tesseract.js | 7.0.0 | OCR (bet-slips) |
| sharp | 0.33.5 | Image processing |

All versions locked in `package.json` — `npm install` reproduces exact env.

### Tests

| Test Suite | Status | Coverage |
|-----------|--------|----------|
| `detectors/*.test.ts` | ✓ | oddsDrop, oddsRise, score (passing) |
| `telegram/*.test.ts` | ✓ | tipParser, linking, etc (passing) |
| `npm run test` | ✓ | Vitest, runs locally |
| `npm run build` | ✓ | TypeScript compile + Next.js build |
| `npm run lint` | ? | **À vérifier** |

**Vérifier avant de merger code** :
```bash
npm run build
npm run test
npm run lint
```

---

## 🌐 APIs & Secrets

### Mandatory (Worker starts without, but features disabled)

| API | Key | Status | Notes |
|-----|-----|--------|-------|
| **Telegram Bot** | `TELEGRAM_BOT_TOKEN` | ✓ Configured on Fly | Bot @oddshunter_bot |
| **Telegram MTProto** | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_USER_SESSION` | ✓ Configured on Fly | Noaim's account |
| **Supabase** | `DATABASE_URL` (pooler) | ✓ Configured on Fly | Shared site + worker |
| **Anthropic** | `ANTHROPIC_API_KEY` | ✓ Configured on Fly | Claude Haiku LLM fallback (optional, monitored) |

### Optional (Features disabled if missing)

| API | Key | Status | Purpose |
|-----|-----|--------|---------|
| **API-Football** | `API_FOOTBALL_KEY` | ❌ Empty | Fixtures + odds (100 req/day free) |
| **Betfair** | `BETFAIR_APP_KEY`, etc | ❌ Empty | Exchange odds (not working in France) |
| **The Odds API** | `THE_ODDS_API_KEY` | ❌ Empty | (Not wired) |

### Site Only (Vercel)

| API | Key | Status | Purpose |
|-----|-----|--------|---------|
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | ✓ Test keys | Payments (TEST MODE, no real $$) |
| **NextAuth** | `NEXTAUTH_SECRET`, `AUTH_URL` | ✓ Configured | Site auth |
| **AgentMail** | `AGENTMAIL_API_KEY` | ✓ Configured (maybe?) | Transactional email |
| **Telegram VIP** | `TELEGRAM_VIP_INVITE_LINK` | ✓ Configured | Private group URL |

---

## 📝 Git Branches

| Branch | Purpose | Status | Ahead/Behind |
|--------|---------|--------|--------------|
| `main` | Stable baseline | ✓ Exists | +2 commits |
| `fix/consensus-claim-lifecycle` | **CURRENT** | ✓ Active | +2 commits ahead of origin |
| `redesign/odds-hunter` | Older work | ✓ Historical | +18 commits |
| `docs/passation-codex` | Documentation | ✓ Exists | (check) |
| `wip/worker-consensus-snapshot` | WIP | ✓ Exists | (old) |

**Current working tree** : CLEAN (no uncommitted changes)

**For Codex** : Push your work to a feature branch, PR into `main`, don't force-push.

---

## 📊 Database

### Supabase Postgres

| Aspect | Status | Notes |
|--------|--------|-------|
| **Tier** | Free | 500MB storage, 5GB egress/month |
| **Connection** | ✓ Pooler (port 6543) | Fly-friendly, pgbouncer |
| **Schema** | ✓ Migrated (Prisma) | All tables present |
| **Data volume** | ⚠️ Unknown | ScrapedTip ~300+ rows (recent), Signal count unknown |
| **Backups** | ✓ Managed | Supabase does daily backups (free tier) |

**Access for Codex** :
```bash
# Pull connection string from Fly
flyctl ssh console -C "printenv DATABASE_URL" -a oddshunter-worker
# Connect locally (if IP whitelisted)
psql "postgresql://user:pass@host/db?..."
```

**OR** : Supabase dashboard at https://supabase.com

---

## 📱 Telegram Setup

| Component | Status | Details |
|-----------|--------|---------|
| **User Account** | ✓ MTProto | Noaim's personal account (listener) |
| **Cached Groups** | ✓ ~155+ | 18+ distinct source chats observed |
| **Bot (@oddshunter_bot)** | ✓ Created | Sends alerts, links accounts |
| **VIP Group** | ✓ Private | Invite link in env var |
| **Public Group** | ✓ Active | https://t.me/oddshunter98 |

**Listener Status** (logs should confirm) :
```bash
flyctl logs -a oddshunter-worker | grep "tip listener"
# Should see : "tip listener connected — N chats/channels cached — LIVE"
```

If not connected → MTProto session expired → regenerate (manual Noaim action).

---

## 📋 Checklist pour Codex

### Avant de commencer
- [ ] Lire WORKER_GUIDE.md (ce document)
- [ ] Vérifier logs Fly : `flyctl logs -a oddshunter-worker -n 20`
- [ ] Vérifier git status : `git status`, `git log --oneline -5`
- [ ] Vérifier test status : `npm run test` (au moins une fois)

### Avant de déployer
- [ ] `npm run build` ✓ (no errors)
- [ ] `npm run test` ✓ (all tests passing)
- [ ] `npm run lint` ✓ (no warnings)
- [ ] `git push origin <branch>` ✓ (pushed to GitHub)
- [ ] `flyctl deploy -a oddshunter-worker` ✓
- [ ] `flyctl logs -a oddshunter-worker` ✓ (check for "connected" / "signal detected")

### Après déployer
- [ ] Attendre 30s (redeploy)
- [ ] Lire les logs : `flyctl logs -a oddshunter-worker -n 50`
- [ ] Chercher des erreurs / crashes
- [ ] Si tout OK → document updated, changement complet

### Ne jamais
- ❌ Force push (git push --force)
- ❌ Modifier production DB directement (Prisma migrations only)
- ❌ Commit .env files
- ❌ Hardcode secrets dans le code
- ❌ Modifier Fly app config sans consulting Noaim (0€ constraint)

---

## 🚨 Known Issues

### Current (as of 2026-09-15)

1. **Sofascore API = 403 (Cloudflare)**
   - Status : Dead
   - Impact : Fixture resolution fallback (TheSportsDB OK but less data)
   - Fix : Use TheSportsDB + Pinnacle (already done)

2. **API-Football free tier = 100 req/day**
   - Status : Limitation
   - Impact : Ingest every 20 min to stay under cap
   - Fix : Triangulate with other sources (low-volume strategy working)

3. **Consensus alerts = rare**
   - Status : Expected (depends on multi-source traffic)
   - Impact : May take hours to see one alert
   - Fix : Not a bug, by design (2+ sources required)

4. **OCR on stylized bet-slips**
   - Status : ~80% accuracy
   - Impact : Some slips not parsed (LLM fallback helps)
   - Fix : Preprocessing + Tesseract + LLM = mitigation in place

5. **OOM crashes on 512MB Fly (historical)**
   - Status : Mitigated (OCR serialization, max message age)
   - Impact : Rare now, but still possible under heavy load
   - Fix : Upgrade RAM (breaks 0€ constraint), or accept rare gaps

### Recent Changes (2026-09-12 to 2026-09-15)

- ✓ Fixture-existence gate added
- ✓ Forward dedup implemented
- ✓ Cash-out follow-up added
- ✓ Double-chance false positive fixed
- ✓ Broadcast-channel-only bug reverted (was killing all alerts)

---

## 🎯 What Codex Should Do Next

### Immediate
1. Read WORKER_GUIDE.md → understand the system
2. `git clone` + `npm install` → build locally
3. `npm run test` → verify test suite
4. `npm run worker:dev` → launch locally (observation mode)
5. Monitor logs for 30s → see the ingest/detection cycle

### Short-term
1. Pick ONE feature to improve (see "To Explore" in WORKER_GUIDE.md)
2. Make the change in code
3. Test locally : `npm run test -- --ui`
4. Push branch → `flyctl deploy -a oddshunter-worker`
5. Monitor prod logs for 5 min

### Long-term
- Audit Telegram source coverage (which groups are active?)
- Calibrate detection thresholds on real signal outcomes
- Implement allow-list / deny-list for chats
- Test liveMatchMonitor and liveOdds strategies
- Consider BetExplorer detail-fetch optimization

---

## 📞 Emergency Contacts

- **Noaim** (owner) : noaim.k77@gmail.com
- **Slack** / **Discord** : (configuration inconnue)

If worker is down and you don't know what's wrong :
1. Check `flyctl logs -a oddshunter-worker -n 100` for errors
2. Rollback : `flyctl releases rollback -a oddshunter-worker`
3. Contact Noaim with the error log

---

**Last verified** : 2026-09-15 by Claude Haiku 4.5  
**Next verification** : After first Codex deployment


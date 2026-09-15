# 🚀 Pour Commencer avec Odds Hunter (Codex)

**Copie ce texte et envoie-le à Codex/ChatGPT MAINTENANT.**

---

Je te transfère la maintenance complète du projet Odds Hunter (signal de mouvements de cotes sportives). 

**Ce que tu dois faire :**

1. **Lire ces 4 fichiers du repo** :
   - `TRANSFER_STATUS.md` — état exact de chaque composant (2026-09-15)
   - `WORKER_GUIDE.md` — guide complet du worker (où tu vas travailler)
   - `CLAUDE.md` — documentation existante du projet
   - `ODDS_HUNTER_HANDOVER_TECHNIQUE.md` — architecture complète (dans scratchpad)

2. **Cloner et préparer le code** :
   ```bash
   git clone https://github.com/noaimk77/oddshunter.git
   cd oddshunter
   npm install
   cp .env.example .env.local
   # Remplir .env.local avec les valeurs (voir .env.example pour doc)
   ```

3. **Tester localement** :
   ```bash
   npm run build              # Compile
   npm run test               # Tests vitest
   npm run worker:dev         # Launch worker (observation mode)
   ```
   Attendre la ligne : `[tipListener] tip listener connected — N chats/channels cached`

4. **État actuel** (important) :
   - **Worker** : Fly.io (Paris), app `oddshunter-worker` — 24/7
   - **Site** : Vercel, séparé (code stale ici, vraie source = site-web-actuel/)
   - **BD** : Supabase Postgres (shared entre site + worker)
   - **Branches** : Sur `fix/consensus-claim-lifecycle` (récent), peut différer de prod
   - **Tests** : ✓ Passing (detectors, telegram)
   - **Deploy** : `flyctl deploy -a oddshunter-worker` après pushing code

5. **Accès nécessaires** (pour Noaim à fournir) :
   - [ ] GitHub : inviter Codex comme collaborator (github.com/noaimk77/oddshunter)
   - [ ] Fly.io : inviter Codex au workspace oddshunter-worker
   - [ ] Vercel : inviter Codex au projet site-web-actuel (optionnel si site pas changé)
   - [ ] Supabase : donner la connection string ou inviter l'agent
   - [ ] `.env` local : remplir les secrets (DATABASE_URL, TELEGRAM_*, ANTHROPIC_API_KEY, etc.)

6. **Contraintes immuables** :
   - **Coût = 0€** absolu (sauf approbation explicite de Noaim)
   - **Langue site** : français
   - Jamais committer `.env.local`, secrets, ou fichiers sensibles
   - Avant toute modif coûteuse (upgrade RAM, API key payante) : demander d'abord

7. **Où travailler** (priorités) :
   - `src/worker/` — cœur du système (détecteurs, providers, Telegram consensus)
   - `src/worker/detectors/` — ajouter de nouveaux moteurs de détection
   - `src/worker/telegram/` — modifier consensus VIP, alertes, parsing
   - `src/app/` (stale ici, travail site = site-web-actuel/)

8. **Avant de déployer** :
   ```bash
   npm run build && npm run test && npm run lint  # ✓ all green
   git push origin <ta-branche>
   flyctl deploy -a oddshunter-worker
   flyctl logs -a oddshunter-worker -n 50       # Vérifier les logs
   ```

9. **Si quelque chose casse** :
   - Rollback : `flyctl releases rollback -a oddshunter-worker`
   - Logs : `flyctl logs -a oddshunter-worker -n 100` (chercher "error")
   - Contact Noaim : noaim.k77@gmail.com

---

**Points clés à retenir** :

- **Monorepo** : worker + site frontend ensemble, mais site-web-actuel en prod est séparé
- **Processus 24/7** : Worker détecte anomalies de cotes + consensus Telegram (2+ sources VIP)
- **Features** : Odds drop, odds rise, vig explosion, market lock, multi-book confirm, value bets, consensus VIP
- **Mode observation** (défaut) : calcule les signaux, n'envoie rien avant approbation
- **Telegram** : bot + MTProto listener + VIP group (alertes auto)
- **Tests** : `npm run test` avant chaque commit
- **Deploy** : Après push Git, `flyctl deploy`, attendre redeploy, vérifier logs

**C'est parti !** 🚀


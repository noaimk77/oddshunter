# ✅ Actions Manuelles pour le Transfert à Codex

**Fait par** : Claude Haiku 4.5  
**Date** : 2026-09-15  
**Pour** : Noaim (propriétaire du projet)

Ceci est la checklist exacte des actions que **tu dois faire** pour que Codex puisse reprendre le projet.

---

## Accès GitHub

- [ ] **Inviter Codex/Claude comme collaborator** sur https://github.com/noaimk77/oddshunter
  - URL : Settings > Collaborators > Invite
  - Email : À fournir par Codex
  - Permissions : Write (pour push des branches)

- [ ] **Vérifier les branches visibles** :
  ```bash
  cd ~/oddshunter
  git branch -a
  # Codex doit voir : main, fix/consensus-claim-lifecycle, redesign/odds-hunter, etc.
  ```

---

## Accès Fly.io

- [ ] **Inviter Codex au workspace Fly.io** :
  ```bash
  flyctl orgs invite-member <email-codex> -o <org-name>
  # Codex accepte l'invite (via email)
  ```

- [ ] **Vérifier l'accès** :
  ```bash
  flyctl apps -a oddshunter-worker
  # Codex doit voir l'app
  flyctl logs -a oddshunter-worker -n 5
  # Codex doit voir les logs en direct
  ```

---

## Accès Vercel (Site Web)

**OPTIONNEL** (si Codex modifie le site, qui est rare) :

- [ ] **Inviter Codex au projet site-web-actuel** :
  - URL : https://vercel.com/dashboard
  - Project > Settings > Team > Invitations
  - Email : À fournir par Codex

---

## Accès Supabase (Base de données)

**Option A : Inviter Codex directement** (recommandé)
- [ ] Se logger à https://supabase.com
- [ ] Aller au projet Odds Hunter
- [ ] Settings > Team > Members > Add Member
- [ ] Email de Codex

**Option B : Donner la connection string** (si pas d'accès direct)
- [ ] Connection string = `DATABASE_URL` du Fly
  ```bash
  flyctl ssh console -C "printenv DATABASE_URL" -a oddshunter-worker
  # Copier la valeur COMPLÈTE (inclure le ?pgbouncer=true&connection_limit=1&sslmode=no-verify)
  # La DONNER À CODEX SÉCURISÉ (jamais dans Slack/chat public)
  ```

---

## Variables d'Environnement Locales (.env.local)

Codex aura besoin des vraies valeurs pour tester localement. **NE PAS les commit.**

- [ ] Créer un fichier sécurisé avec les secrets (ex: 1Password, Vault, email chiffré)
- [ ] Donner à Codex :
  ```
  DATABASE_URL="..."
  TELEGRAM_API_ID="..."
  TELEGRAM_API_HASH="..."
  TELEGRAM_USER_SESSION="..."  (giant serialized value)
  TELEGRAM_BOT_TOKEN="..."
  TELEGRAM_VIP_INVITE_LINK="..."
  ANTHROPIC_API_KEY="..."
  (autres selon .env.example)
  ```

**JAMAIS** :
- ❌ Dans un email/Slack/message public
- ❌ Dans un commit Git
- ❌ Dans GitHub Issues/PRs

**Méthode recommandée** :
- Créer un accès Fly.io directement (Option A pour l'accès Supabase)
- Codex tire les vars du Fly quand déploie
- Codex a besoin juste d'une `.env.local` locale pour le dev (tu peux la fournir via chiffrement ou directement en personne/call)

---

## Anthropic API Key (Claude LLM Fallback)

- [ ] **Créer une NEW API key pour Codex** (pas donner ta clé personnelle)
  - URL : https://console.anthropic.com/account/api_keys
  - Generate New Key
  - Copier
  - La donner à Codex via email chiffré / 1Password / etc.

- [ ] **Ou** : Leave empty locally (LLM fallback disabled) — Codex peut tester sans

- [ ] **En prod** : La clé est déjà configurée sur Fly, Codex utilise celle-là

---

## Stripe Test Keys

- [ ] **Vérifier que tu as les TEST keys** (pas les PROD keys) :
  ```bash
  cd ~/Downloads/oddshunter/site-web-actuel
  grep STRIPE_SECRET_KEY .env || echo "Not in .env (Vercel secrets)"
  ```

- [ ] **Donner à Codex** (si modifie le site) :
  - `STRIPE_PUBLISHABLE_KEY` (pas secret)
  - `STRIPE_SECRET_KEY` (secret, via chiffrement)

- [ ] **JAMAIS** donner les PROD keys à un agent IA — c'est du vrai argent

---

## Telegram Bot & Account

- [ ] **Vérifier que le bot existe** :
  - @oddshunter_bot sur Telegram (doit être actif)
  - Tu as l'accès au BotFather

- [ ] **Vérifier la session MTProto** :
  ```bash
  flyctl ssh console -C "printenv TELEGRAM_USER_SESSION | head -c 50" -a oddshunter-worker
  # Si vide = session morte, doit être régénérée (manual, via Telegram)
  ```

- [ ] **VIP group invite link** :
  ```bash
  flyctl ssh console -C "printenv TELEGRAM_VIP_INVITE_LINK" -a oddshunter-worker
  # Doit être non-vide et valide (https://t.me/+...)
  ```

---

## Documentation Finalisée

- [ ] **Vérifier que Codex peut lire les guides** :
  - `CODEX_START.md` ✓ (créé)
  - `TRANSFER_STATUS.md` ✓ (créé)
  - `WORKER_GUIDE.md` ✓ (créé)
  - `CLAUDE.md` ✓ (existant)
  - `ODDS_HUNTER_HANDOVER_TECHNIQUE.md` ✓ (dans scratchpad)

- [ ] **Accessible depuis GitHub** :
  ```bash
  cd ~/oddshunter
  git add CODEX_START.md TRANSFER_STATUS.md WORKER_GUIDE.md ACTIONS_MANUELLES.md
  git commit -m "docs: transfer checklist and guides for Codex"
  git push origin <branch>
  ```

---

## Vérifications Finales (pour toi, avant de donner à Codex)

- [ ] **Worker en prod fonctionne** :
  ```bash
  flyctl logs -a oddshunter-worker -n 20
  # Chercher : "tip listener connected" OU "[worker] signal detected"
  # Si ERREUR : fix d'abord avant de passer à Codex
  ```

- [ ] **Site en prod accessible** :
  ```bash
  curl -I https://oddshunter98.vercel.app
  # Doit retourner 200
  ```

- [ ] **BD accessible** :
  ```bash
  psql "postgresql://..." -c "SELECT COUNT(*) FROM \"Signal\";"
  # Doit retourner un nombre, pas une erreur
  ```

- [ ] **Tests passent** :
  ```bash
  cd ~/oddshunter
  npm install
  npm run test
  npm run build
  # Tous les trois ✓
  ```

---

## Remise à Codex (Étapes Finales)

1. **Copier CODEX_START.md** →  le texte complet
2. **Coller dans ChatGPT / Claude Code** directement
3. Codex lit les 4 guides → clone le repo → npm install → npm run test
4. Codex demande l'accès Fly/GitHub → tu invites
5. Codex demande les secrets → tu fournis sécurisé
6. **Codex prêt à travailler** 🚀

---

## Support Ongoing

- **Si Codex pose questions** : il doit lire WORKER_GUIDE.md en détail
- **Si Codex veut déployer** : lire TRANSFER_STATUS.md § "Checklist pour Codex"
- **Si worker casse** : rollback (`flyctl releases rollback`), contact Codex
- **Si tu veux changer de config** : `flyctl secrets set VAR=val` directement (Codex n'a pas à le faire)

---

## Format Notification Finale

Une fois tout en place, tu peux envoyer à Codex :

```
Yo Codex, j'ai préparé le transfert de Odds Hunter pour toi.
Lis CODEX_START.md dans le repo (~/oddshunter/).
Les autres guides sont là aussi : WORKER_GUIDE.md, TRANSFER_STATUS.md, CLAUDE.md.
Tu as accès Fly.io? GitHub? (Dis-moi ce qui manque, je vais inviter.)
J'ai mis les secrets en .env.local (mail séparé chiffré).
Go ! 🚀
```

---

**Fait ?** Cocher tout ci-dessus → **Codex peut commencer.**


# CLAUDEMAP — État du projet Oddshunter

**Dernière mise à jour** : 2026-08-19 — Bot opérationnel, site partiellement bloqué (Netlify crédits), migration Vercel en cours.

## État live

| Composant | Status | Notes |
|-----------|--------|-------|
| **Site** | 🟡 Prod OK, redeploy bloqué | Netlify out of credits → migrate to Vercel (user signing up now) |
| **Bot Telegram** | ✅ Actif 24/7 | Railway, long-polling ON, alertes réelles ON, 39 signaux généré |
| **Auth** | ✅ Connecté | DB fixed (DATABASE_URL guillemets), cycle create→logout→login OK |
| **Paiements** | ✅ Branché | Test-mode Stripe, prix BOT créé et déployé, VIP+Bot actifs en prod |
| **Email** | 🔴 Cassé | AgentMail suspendu, pas de mail mot-de-passe oublié (workaround: lien direct) |

## Bugs actifs & workarounds

| Problème | Cause | Workaround |
|----------|-------|-----------|
| Netlify redeploy impossible | 300 crédits/mois épuisé | Vercel (user creating account) |
| Emails bloqués | AgentMail account suspended (AWS) | Lien reset direct temporaire jusqu'à déblocage |
| Vercel pas intégré | Attente signup utilisateur | Une fois GitHub lié → Netlify → Vercel migration auto |

## Checklist déploiement Vercel

- [ ] User crée compte Vercel + GitHub OAuth
- [ ] Signale "c'est fait"
- [ ] Je pousse le dernier commit (ButtonBot styling) à main
- [ ] Vercel auto-déploie à partir du dépôt GitHub
- [ ] Vérifie bouton Bot en jaune plein (pas contour)
- [ ] Netlify → Vercel bascule complète (domaine, env vars, etc.)

## Fichiers clés (structure stable)

- `src/app/page.tsx` — homepage
- `src/features/landing/subscription-section.tsx` — cartes VIP/Bot (status.tone="live" pour les deux maintenant)
- `src/worker/index.ts` — worker loop + telegram bot listening
- `CLAUDE.md` — doc technique complète (reference stable)

## Commandes fréquentes

```bash
npm run dev                          # dev local
npm run build && npm run build       # build prod
npm run worker:dev                   # worker + détection local
git add/commit                       # commits réguliers
stripe projects env --pull           # env vars local
```

## Coûts & limites

- **Railway** : 500h trial → expire ~2026-09-08 → bascule payant ou Oracle Cloud gratuit
- **Netlify** : Crédits épuisés → Vercel migration active
- **AgentMail** : Suspend → déblocage attendu (AWS compliance) ou passer à autre service
- **Stripe** : Test-mode 100% (aucun paiement réel)

## Prochaines étapes

1. User complète signup Vercel
2. Migration site → Vercel (redeploy automatique de main)
3. Netlify cancellation optionnel (ou gardé en backup)
4. Déblocage AgentMail ou changement provider email
5. Premier test signal SMS/email avec données réelles (une fois AgentMail OK)
6. Railway trial → payant ou Oracle (avant 2026-09-08)

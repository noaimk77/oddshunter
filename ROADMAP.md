# ROADMAP — OddsHunter

> Priorités, risques, prochaines étapes. Révision : 2026-09-02.
> Mettre à jour à chaque changement de cap ou décision produit.

## Priorités techniques (ordre)

### P1 — Fiabilité d'exploitation du worker
Le worker est un point unique de défaillance sans filet.
- [ ] **Heartbeat / observabilité** : distinguer "aucun signal" de
  "pipeline en panne". Métrique de dernier message MTProto reçu, dernier
  cycle d'ingestion, dernier `ScrapedTip`. Alerte (Telegram DM à Noaim ?)
  si silence anormal > X min.
- [ ] **Watchdog du listener MTProto** : si aucun `NewMessage` sur tous
  les chats pendant N min, forcer une reconnexion (le backstop mentionné
  dans `userClient.ts` n'est pas implémenté).
- [ ] Surveillance quota DB Supabase (opérations/mois) avec marge d'alerte.
- [ ] Rejouer les migrations au déploiement Fly de façon fiable
  (`release_command`) ou documenter le geste manuel dans le pipeline.

### P2 — Qualité du pipeline consensus (produit VIP principal)
C'est là que se joue la valeur perçue par l'abonné.
- [ ] Mesurer le taux de faux négatifs : combien de "3 canaux, même pick"
  réels ne déclenchent pas (parser/OCR ratés). Échantillonnage manuel sur
  `ScrapedTip` vs messages bruts.
- [ ] Améliorer l'OCR des coupons (prétraitement image, langues).
- [ ] Étendre la couverture de canaux sources (le consensus ne vaut que
  par le nombre de canaux distincts observés).
- [ ] Tableau de bord interne "santé consensus" : fingerprints/jour,
  alertes/jour, taux WON via `ConsensusAlert.outcome`.
- [ ] Revoir `TIP_CONSENSUS_WINDOW_MINUTES` (24 h) et `minGroups` (3) à la
  lumière des données réelles — **changement soumis à validation Noaim**.

### P3 — Source de données du pipeline B
- [ ] Parseur **ligne-par-ligne** BetExplorer pour brancher Over/Under et
  Handicap Asiatique dans `DETAIL_MARKET_CODES` (aujourd'hui : 1X2, DNB,
  DC, BTTS uniquement). Chantier de code pur, indépendant.
- [ ] Fenêtres de vitesse multi-échelles (1/3/5/15/60 min) + détecteur de
  changement de ligne (Over 2.5 → Over 3.0) sur données déjà collectées.
- [ ] Batching des upserts dans `ingest.ts` (~1,1 s/point aujourd'hui).
- [ ] (Décision Noaim requise, casse la contrainte 0 €) : 2e source
  pré-match — API-Football Pro (~19 $/mois) ou revendeur Pinnacle.

### P4 — Consolider le déploiement du site
- [ ] Déployer le site **depuis ce dépôt** (pas depuis
  `~/Downloads/oddshunter/site-web-actuel/`).
- [ ] Connecter le projet Vercel `site-web-actuel` au repo GitHub
  (auto-deploy sur push de `redesign/odds-hunter`).
- [ ] Supprimer le dossier divergent une fois la bascule confirmée.
- [ ] Nettoyer les résidus d'hébergeurs : `netlify.toml`, `railway.json`,
  `RENDER_URL`, `NEXT_PUBLIC_APP_URL` pointant sur `onrender.com` dans les
  secrets du worker.

### P5 — Dettes diverses
- [ ] E-mail transactionnel : débloquer AgentMail ou changer de provider
  (le "mot de passe oublié" est cassé, workaround = lien direct).
- [ ] Rétention des données : purge/anonymisation de `ScrapedTip.rawText`
  et `GroupTicket.rawText` (contenu de groupes tiers) après N jours.
- [ ] Convertir les `status` `String` en enums Postgres (safe follow-up).
- [ ] Supprimer les 13 fichiers `scratch_*.ts` à la racine (scripts
  ponctuels de debug, ne devraient pas être suivis).
- [ ] Décider du sort de `main` (très en retard sur `redesign/odds-hunter`).

## Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Session Telegram (`TELEGRAM_USER_SESSION`) révoquée / expirée | Pipeline consensus mort, silencieux | Watchdog + alerte ; copie de secours chiffrée ; procédure de re-login documentée |
| Compte perso Telegram banni/limité (spam MTProto perçu) | Idem + risque sur le compte personnel | Envisager un **compte de service dédié** distinct du compte perso de Noaim |
| BetExplorer change son HTML | Pipeline B aveugle | `BETEXPLORER_ENABLED=false` en secours ; tests sur fixtures réels ; surveillance du volume de points/cycle |
| Quota DB free-tier épuisé | Worker + site en erreur | Cadences calibrées ; surveillance ; plan payant si le produit décolle |
| Stripe passé en live par erreur | Argent réel traité sans être prêt | Règle "jamais sans validation explicite" ; garde dans la doc |
| Alerte OCR-cassée postée au VIP | Perte de confiance des abonnés payants | `shouldSendConsensusAlert` déjà en place ; garder une validation humaine tant que le volume est faible |
| Exposition de secrets dans un commit / log | Compromission | `.gitignore` strict, revue de diff, jamais de secret en log ; rotation si doute |
| Conformité paris / affiliation 1xBet / promotion de pronostics | Juridique (selon pays ciblés) | Voir PASSATION_CODEX §7 — faire vérifier par un juriste, ne pas trancher seul |

## Décisions produit (journal)

- **2026-08-18** : cibler les championnats obscurs, pas les grands
  championnats commerciaux (pipeline B).
- **2026-08-19** : contrainte "0 € absolu" sur les sources de données.
- **2026-08-20** : `MIN_SCORE_TO_ALERT` 55 → 35 ; bande de cote de fixing
  1.2–3.0 ; extension marchés BetExplorer (DNB/DC/BTTS).
- **2026-08-22** : ajout du suivi des résultats (`SignalOutcome`) ;
  `GroupTicket` + `ChatFixtureContext` ; consensus 2 groupes / 20 min.
- **2026-08-23** : pivot vers "value bets statistiques" style InPlay
  Alerts (`strategies/`), puis…
- **2026-08-28** : re-pivot vers "matchs suspects" (`SEND_SUSPICIOUS_ALERTS`).
- **2026-08-27** : consensus 3 canaux / 24 h ("trois fois sur trois
  canaux").
- **2026-09-02** : suivi des résultats du consensus (`ConsensusAlert`
  outcome).

> Le produit a beaucoup pivoté : les détecteurs "legacy" et le moteur
> "stratégies" coexistent dans le code, gatés par des flags d'envoi
> séparés. Ne pas supprimer un pipeline sans confirmer avec Noaim lequel
> est le produit vendu à l'instant T.

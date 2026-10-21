# BOT_HANDOFF — journal de travail Claude / Codex sur le bot Oddshunter

**Lire ce fichier avant toute intervention sur `src/worker/`.** Le code réel du worker déployé sur Railway vit dans **`~/oddscope/src/worker/`** (ce repo), pas dans `site-web-actuel/src/worker/` (copie partielle/obsolète du site, migré vers Vercel séparément — voir CLAUDE.md). Ne pas travailler sur cette dernière pour le bot.

---

## 2026-08-20 — Audit factuel (Claude, phase A/B)

### 1. État réel du worker — confirmé, pas supposé

- `railway.json` (`deploy.startCommand: npm run worker:start`) correspond exactement à `package.json` (`"worker:start": "tsx src/worker/index.ts"`) — Railway exécute bien le bon process.
- Logs Railway (fenêtre de 500 lignes) : **aucun redémarrage** détecté — le process tourne en continu, ne crash pas silencieusement.
- `SEND_LIVE_ALERTS=true` sur Railway (confirmé via `railway variable list`, pas supposé).
- Variables présentes sur Railway (présence vérifiée, valeurs jamais affichées) : `API_FOOTBALL_KEY`, `AUTH_SECRET` (inutile au worker, résidu), `DATABASE_URL`, `SEND_LIVE_ALERTS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`.
- Variables **absentes** sur Railway (donc tournent sur leur valeur par défaut codée en dur, ce qui est normal, pas un bug) : `MIN_SCORE_TO_ALERT`, `FIXING_ODDS_MIN/MAX`, `BETEXPLORER_MAX_DETAIL_FETCHES_PER_CYCLE`, `BETEXPLORER_MIN_DROP_PERCENT_FOR_DETAIL`, `MULTI_BOOK_MIN_CONFIRMING_BOOKMAKERS`, `ODDS_DROP_THRESHOLD_PERCENT`, `INGEST_POLL_INTERVAL_MS`, `API_FOOTBALL_TARGET_COUNTRIES`.
- `NEXT_PUBLIC_APP_URL` sur ce service Railway pointe vers `oddshunter.onrender.com` — résidu d'une config Render jamais nettoyée. Sans effet sur le worker (variable non consommée par `src/worker/`), mais à nettoyer un jour.
- Requête directe sur la base Neon réelle (script `tsx` ponctuel, supprimé après usage) :
  - 1202 `OddsSnapshot` au total, le plus récent essentiellement en temps réel (ingestion confirmée active).
  - 370 `Competition`, 2037 `Event`, 222 `Market` — couverture réelle correcte, pas le vrai goulot.
  - 64 `Signal` ouverts/mis à jour (10 OPEN + 54 UPDATED). Score moyen OPEN = 15/100, score moyen UPDATED = 26/100, **score max jamais atteint = 56/100**.
  - **1 seul signal sur 64 dépasse le seuil `MIN_SCORE_TO_ALERT=55`** actuellement en prod.
  - 24 `SignalDelivery` au total depuis le début du produit ; la dernière remonte à **6h+** avant cet audit.
  - 1 seul utilisateur avec entitlement BOT actif, 1 seul compte Telegram lié (Noaim lui-même — normal, pré-lancement).

### 2. Cause exacte, confirmée (pas une hypothèse)

**Le seuil `MIN_SCORE_TO_ALERT=55` déployé plus tôt dans cette session est la cause directe et immédiate du silence quasi total.** Le rééquilibrage du score (fait la même session) était la bonne direction, mais le vrai plafond pratique des signaux produits par nos sources actuelles (agrégateurs de cotes bookmakers, aucune donnée de volume/liquidité, peu de confirmation multi-bookmaker) tourne autour de 15-30/100, avec de rares pointes à ~55. Un seuil à 55 filtre donc presque tout, y compris des mouvements réels. **À recalibrer** — proposition : 35/100 (garde un vrai filtre sur le bruit sans tout bloquer), à confirmer avec Noaim avant de redéployer.

Cause secondaire, déjà identifiée et corrigée dans le code (pas encore déployée — bloquée par une panne Railway/Google Cloud du 2026-08-20, cf. `status.railway.com`) : le détail par bookmaker (nécessaire pour `multiBookAgreement`, qui pèse 20% du score) n'était récupéré que pour les chutes ≥30%, soit 6 matchs sur 17 sur un échantillon réel vérifié en direct. Seuil baissé à 15% + cap remonté de 15 à 25/cycle — en attente de déploiement.

`API_FOOTBALL_KEY` est présent mais l'ingestion retourne systématiquement `0 points, 0 new snapshots` — confirmé de nouveau, cohérent avec le blocage déjà documenté (endpoint `/odds` limité à l'historique 2022-2024 en gratuit, plan Pro à 19$/mois nécessaire). BetExplorer reste l'unique source réellement fonctionnelle.

### 3. Tableau des sources de données

| Source | Pré-match/Live | Sports/ligues | Rafraîchissement réel | Historique | Lignes dispo | Cotes | Volume/liquidité | Limites/coût/légalité | Fiabilité testée |
|---|---|---|---|---|---|---|---|---|---|
| **BetExplorer** (actif) | Pré-match uniquement (pas de live) | Football, ~370 compétitions couvertes dont ligues obscures ciblées | ~20 min (cadence d'ingestion configurée) | Oui, via `OddsSnapshot` horodaté à chaque poll | 1X2 confirmé ; O/U, Handicap Asiatique, DNB, DC, BTTS exposés par le site mais **non branchés dans notre parseur** (seul 1X2 est extrait actuellement) | Par bookmaker (jusqu'à 18 vus sur un vrai match Ligue Conférence testé ce jour), pas de prix consensus calculé par nous | **Non disponible** — jamais fabriqué, confirmé absent de la source | Gratuit, pas de compte ; `robots.txt` autorise les chemins utilisés ; scraping poli (délai entre requêtes) | Vérifié en direct ce jour sur 3 vrais matchs : équipes, dates, heures, ID bookmaker, nom bookmaker, cote, drop% tous extraits correctement |
| **API-Football** (branché, non fonctionnel) | Prévu pré-match | ~1200 compétitions en théorie (pays ciblés : Inde, Bolivie, Paraguay, Pérou, Équateur, Venezuela) | N/A — retourne 0 point à chaque cycle | N/A | N/A | N/A | Non | Clé gratuite présente mais endpoint `/odds` bloqué en gratuit (historique seulement) ; plan Pro 19$/mois débloquerait | Confirmé cassé (0 points à chaque cycle, logs à l'appui) |
| **Betfair Exchange** | Live + pré-match, volume réel | N/A | N/A | N/A | N/A | N/A | Oui (c'est leur donnée phare) | **Bloqué réglementairement pour la France** (ANJ n'autorise pas l'exchange) — pas une question d'argent | Confirmé bloqué, vérifié plusieurs fois |
| **Pinnacle (direct ou revendeur)** | Live + pré-match | Ligues sérieuses uniquement (pas les ligues obscures ciblées) | N/A | N/A | N/A | N/A | Non (sauf revendeur spécialisé) | API perso fermée au public depuis juillet 2025 (compte financé + candidature) ; revendeurs (SharpAPI etc.) payants | Vérifié absent de BetExplorer sur 3 matchs réels dont un à 18 bookmakers |

### 4. Réalisable immédiatement (gratuit, sans nouveau compte, sans secret manquant)

- **Baisser `MIN_SCORE_TO_ALERT`** de 55 à une valeur réaliste (proposition 35, à valider) — c'est la cause n°1 du silence, fix en une ligne, aucun risque technique.
- **Déployer le fix BetExplorer déjà écrit** (seuil détail 30%→15%, cap 15→25/cycle) — bloqué uniquement par la panne Railway en cours, pas par du code manquant.
- **Brancher les marchés O/U, Handicap Asiatique, BTTS, DC, DNB** dans `betexplorer.ts` — le site les expose déjà (confirmé dans le HTML), le parseur actuel n'extrait que 1X2. Travail de code pur, pas de nouvelle source.
- **Ajouter des fenêtres de vitesse multi-échelles (1/3/5/15/60 min)** et un détecteur de changement de ligne (Over 2.5 → Over 3.0) — nouvelle logique sur des données déjà collectées.
- **Heartbeat / distinction "pas de signal" vs "pipeline en panne"** — ajout de métriques sur des données déjà en base.
- **Batching des upserts dans `ingest.ts`** (actuellement ~1,1s/point séquentiel) — optimisation pure, aucune dépendance externe.

### 5. Nécessite une action payante ou de Noaim

- **API-Football Pro (19$/mois)** — débloquerait une vraie deuxième source pré-match, mais casse la règle 0€ déjà posée.
- **Betfair Exchange** — bloqué réglementairement, aucune somme d'argent ne le débloque depuis la France.
- **Pinnacle** — API perso fermée (candidature manuelle chez eux, pas garantie), ou revendeur payant (SharpAPI etc., prix non vérifié).
- **Mode live (score/minute du match)** — nécessiterait une source de scores live fiable (API-Football en a une gratuite pour les scores, séparée de l'endpoint odds bloqué — à vérifier si exploitable pour enrichir le contexte match sans avoir les cotes live).

### 6. Plan priorisé proposé

1. Recalibrer `MIN_SCORE_TO_ALERT` (attente confirmation Noaim sur la valeur)
2. Déployer le fix BetExplorer (bloqué sur panne Railway, retry automatique programmé)
3. Étendre le parseur BetExplorer aux marchés O/U, AH, BTTS, DC, DNB
4. Détecteurs de vitesse multi-fenêtres + changement de ligne
5. Heartbeat/observabilité
6. Optimisation `ingest.ts`
7. (Optionnel, en attente de décision Noaim) API-Football Pro ou revendeur Pinnacle si le budget 0€ est révisé

---

## 2026-08-20 (suite) — corrections livrées, en attente de déploiement (Claude)

Noaim a confirmé le seuil à 35 et donné le feu vert sur toute la liste "réalisable tout de suite". Fait, testé localement (`tsc --noEmit` propre, vitest 47/47 dont 3 nouveaux tests), **pas encore déployé** — bloqué par la panne Railway/Google Cloud (toujours active au moment d'écrire ceci, `status.railway.com` : "Deployments are slow; will be temporarily paused", identifiée 14h53 UTC). Retry automatique programmé.

**Déployé et confirmé en prod le 2026-08-20** (`railway up -c`, redémarrage propre vérifié via `railway logs` — pas de crash, `LIVE ALERTS ON`, bot Telegram en écoute). La panne Railway/Google Cloud a fini par se résorber assez pour laisser passer ce déploiement.

**Premier cycle d'ingestion post-déploiement, vérifié en direct** : `ingested betexplorer: 135 points, 84 new snapshots` — contre ~9-14 nouveaux snapshots/cycle avant ce déploiement (6 à 9x plus de données par cycle, cohérent avec 4 marchés × seuil de détail élargi). Passe de détection suivante propre, aucune erreur : 4 `ODDS_DROP` (scores 30/47/51/56) + 1 `VIG_EXPLOSION` détectés, dont trois (47, 51, 56) dépassent maintenant le seuil `MIN_SCORE_TO_ALERT=35` — avant, avec l'ancien seuil à 55, une seule aurait pu passer.

1. **`MIN_SCORE_TO_ALERT` : 55 → 35** (`config.ts`) — cause directe du silence, corrigée.
2. **Marchés BetExplorer étendus** (`providers/betexplorer.ts`) : en plus de 1X2, la couche détail par bookmaker récupère maintenant **DNB (`ha`), Double Chance (`dc`), BTTS (`bts`)** — vérifiés en direct sur un vrai match avant d'écrire le code (2/3/2 colonnes fixes, pas de dimension "ligne"). Nouveaux fixtures réels dans `__fixtures__/`, 3 nouveaux tests.
   - **Explicitement pas fait** : Over/Under et Handicap Asiatique. Vérifié en direct que leur réponse BetExplorer regroupe plusieurs lignes (1.5/2.5/3.5... pour O/U) dans un seul fragment (~1.2MB vs ~100KB pour les marchés simples) — les ajouter correctement demande un parseur qui groupe par ligne, pas juste par bookmaker, sinon on mélangerait des cotes de lignes différentes comme si c'était le même marché. **Prochaine tâche pour Codex ou Claude** : écrire ce parseur ligne-par-ligne avant de brancher `ou`/`ah` dans `DETAIL_MARKET_CODES`.
   - Volume de requêtes par cycle passé de ~25 à ~100 (25 matchs × 4 marchés), toujours espacé de 1.5s (`minRequestIntervalMs`) → ~150s par cycle de 20 min, largement dans le budget, pas de scraping agressif.
3. Le fix précédent (seuil de détail 30%→15%, cap 15→25/cycle) reste dans le même déploiement en attente.

**Pas encore fait de la liste "réalisable tout de suite"** (reste à faire, prochaine session) : fenêtres de vitesse multi-échelles (1/3/5/15/60 min), détecteur de changement de ligne, heartbeat/observabilité, batching des upserts dans `ingest.ts`. Prioriser dans cet ordre au prochain tour.

**Prochaine action proposée à Codex** : ne pas toucher `providers/betexplorer.ts` tant que le déploiement en attente n'est pas confirmé passé (éviter un conflit sur `DETAIL_MARKET_CODES`/`MARKET_COLUMN_LABELS`). Le parseur ligne-par-ligne pour O/U et AH est un bon prochain chantier indépendant si Codex veut s'en charger — voir la note ci-dessus.

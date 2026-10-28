# Worker deploy: production image + Buffer/X publisher

Production (`oddshunter-worker`, v182, 2026-10-17) runs code that is newer
than anything on GitHub. A normal `fly deploy` from this repo would roll the
worker back by weeks. This kit instead starts FROM the exact production image
and only adds `src/worker/social/bufferPublisher.ts` plus two small hooks.

Steps (needs `FLY_API_TOKEN` and `BUFFER_API_KEY` in the environment):

```sh
mkdir -p /tmp/deploy/src/worker/social && cd /tmp/deploy
cp <repo>/scripts/fly-overlay/{Dockerfile,patch.py} .
cp <repo>/src/worker/social/bufferPublisher.ts src/worker/social/
# the two production files to patch, straight from the running machine
flyctl ssh console -a oddshunter-worker \
  -C 'tar cf - -C /app src/worker/telegram/consensusOutcomeResolver.ts src/worker/telegram/pickShare.ts' | tar xf -
python3 patch.py .                     # fails loudly if production code moved
flyctl config save -a oddshunter-worker -y
echo "BUFFER_API_KEY=$BUFFER_API_KEY" | flyctl secrets import --stage -a oddshunter-worker
flyctl deploy --remote-only --dockerfile Dockerfile -a oddshunter-worker
```

The Dockerfile's last step imports the three patched modules, so a broken
patch fails the build and production is left untouched.

Rollback: `flyctl deploy -a oddshunter-worker --image registry.fly.io/oddshunter-worker:deployment-01M54SQFM8Q05F8NT1PEX0VBCE`.

## v184 (2026-10-23) — « ✅ PRONO VALIDÉ » dans le VIP
Image `deployment-01M5N8ZYFB2H524AZYZ6D3RARX`, construite `FROM` l'image v183
(`deployment-01M5GEK04FXXJBFZZ6FX8PK8SK`, retour arrière possible vers celle-ci)
avec seulement `consensusOutcomeResolver.ts` modifié : quand un prono VIP est gagné,
le compte de Noaim répond au message du prono « ✅ PRONO VALIDÉ ✅ + score ».
La notation reste silencieuse pour les pertes (`editMessage: false` dans index.ts,
choix de Noaim du 2026-09-06). Le patch appliqué est la fonction `postWonReply`
de `patch.py`, appelée juste après `resolved++` dans `applyVerdict`.

## v185 (2026-10-27, déployée) — prono VIP gagné transféré dans le canal gratuit
Image `deployment-01M5ZRBSAE5FTGH1X13KYN9CYS`, construite `FROM` l'image v184
(`deployment-01M5N8ZYFB2H524AZYZ6D3RARX`, retour arrière possible vers celle-ci).
Le `fly.toml` sauvegardé pointe sur `Dockerfile.worker` : le passer à `Dockerfile`
avant `flyctl deploy`, sinon le build échoue. En plus de `patch_free_forward.py`
(indentation corrigée à 6 espaces pour coller à la prod), deux retraits faits à la main :
- `index.ts` : appel `sendPendingWinRecaps` supprimé. La prod
  (`SEND_FREE_CHANNEL_POSTS=true`) transférait déjà chaque gain depuis la boucle, ce qui
  aurait fait doublon avec le nouveau transfert au moment de la notation.
- `freeChannel.ts` : `maybeSendDailyRecap` n'envoie plus le texte « Hier dans le VIP »
  (3 variantes). La note du lundi, la promo série et le message du soir restent.
`pickShare.ts` ne fait pas doublon : il publie le prono gratuit (« 🎁 ») avant le match,
pas un transfert après la victoire.

### Notes d'origine
À appliquer sur le `consensusOutcomeResolver.ts` de v184 (récupéré sur la machine) :
`python3 patch_free_forward.py .`. Quand un prono VIP est gagné, juste après la
réponse « ✅ PRONO VALIDÉ ✅ » dans le VIP, le message VIP original est transféré
tel quel dans le canal gratuit, puis le compte répond sous le transfert
« ✅✅✅ Prono VIP validé ! + score ». Nouveau secret requis :
`TELEGRAM_FREE_CHANNEL` (@username, t.me/username ou lien t.me/+invitation).
Demande de Noaim du 2026-10-27 : plus de récap texte « Hier dans le VIP » — ce récap
vit dans le code de prod absent de GitHub, à retirer au même déploiement.

## v186 (2026-10-28, déployée) — canal gratuit : 1xBet tous les 3 jours, nouvelle note du lundi
Image `deployment-01M60ZTQ2P9WMB8XHEH598BQXC`, construite `FROM` l'image v185
(`deployment-01M5ZRBSAE5FTGH1X13KYN9CYS`, retour arrière possible vers celle-ci) avec
`Dockerfile.v186` et `patch_v186.py`, appliqué sur `freeChannel.ts`, `freeChannel.test.ts`
et `index.ts` de v185. Le build lance les tests de `freeChannel.test.ts`, vérifie que
Telegram lit bien le HTML (tuto = premier lien, href = lien d'affiliation) et échoue sinon.
Le transfert des gagnants de v185 (`consensusOutcomeResolver.ts`) n'est pas touché.

```sh
mkdir -p /tmp/deploy && cd /tmp/deploy
cp <repo>/scripts/fly-overlay/{Dockerfile.v186,patch_v186.py} . && mv Dockerfile.v186 Dockerfile
flyctl ssh console -a oddshunter-worker \
  -C 'tar cf - -C /app src/worker/index.ts src/worker/telegram/freeChannel.ts src/worker/telegram/freeChannel.test.ts' | tar xf -
python3 patch_v186.py .
flyctl config save -a oddshunter-worker -y   # puis dockerfile = "Dockerfile" dans fly.toml
flyctl deploy --remote-only --dockerfile Dockerfile -a oddshunter-worker
```
(`--build-only` ne pousse pas l'image dans le registre : un `deploy --image` derrière échoue.)

- **Message 1xBet** (remplace le message du soir quotidien) : vers 19h00–19h25 Paris, quand
  le dernier message 1xBet du canal a au moins 3 jours calendaires ; textes A → B → C → D
  de Noaim en HTML, lien preview activé (le tuto YouTube est le premier lien). Rien avant
  le 31/10/2026 (A posté à la main le 28/10). Pas de table ni de volume sur le worker :
  la date et le texte du dernier envoi sont relus dans le canal (recherche « 1xbet » +
  id de la vidéo), donc un redéploiement ou un message posté à la main sont pris en compte ;
  le texte suivant est celui d'après (A si le dernier n'est pas un des 4).
- **Note du lundi** (~10h Paris) : un seul message, une ligne par prono VIP gagné la
  semaine passée `✅ Équipe A vs Équipe B | prono @cote` (sans `@cote` si inconnue), puis
  « Le VIP c'est par ici 👉 https://oddshunter98.vercel.app/abonnement ». Rien n'est posté
  s'il n'y a aucun gagnant. Reconnue après un redémarrage par sa première ligne.
- Restent inchangés dans le gratuit : transfert de chaque gagnant + « ✅✅✅ Prono VIP validé ! »
  (v185), promo « série en cours » (`maybeSendStreakPromo`), prono « 🎁 » de `pickShare.ts`.

## v187 (2026-10-28, déployée) — alerte VIP : noms d'équipes + photo
Image `deployment-01M610N2QW5HZ88PX9B4DAE37G`, construite `FROM` l'image v186 (`deployment-01M60ZTQ2P9WMB8XHEH598BQXC`, retour arrière
possible vers celle-ci) avec `Dockerfile.v187`, `patch_v187.py` (sur `tipParser.ts`,
`tipParser.test.ts`, `tipLlmFallback.ts`, `vipGroup.ts` de v186) et le nouveau module
`src/worker/telegram/alertImage.ts` (+ son test) de ce repo. Le build lance 151 tests
(parseur, image, VIP, LLM, canal gratuit) et le contrôle de types.

```sh
mkdir -p /tmp/deploy/src/worker/telegram && cd /tmp/deploy
cp <repo>/scripts/fly-overlay/{Dockerfile.v187,patch_v187.py} . && mv Dockerfile.v187 Dockerfile
cp <repo>/src/worker/telegram/alertImage*.ts src/worker/telegram/
flyctl ssh console -a oddshunter-worker -C 'tar cf - -C /app src/worker/telegram/tipParser.ts \
  src/worker/telegram/tipParser.test.ts src/worker/telegram/tipLlmFallback.ts src/worker/telegram/vipGroup.ts' | tar xf -
python3 patch_v187.py .
flyctl config save -a oddshunter-worker -y   # puis dockerfile = "Dockerfile" dans fly.toml
flyctl deploy --remote-only --dockerfile Dockerfile -a oddshunter-worker
```

Cas réel du 2026-10-28 11h10 : « U21 vs U21 / Plus de 4,5 buts @2,04 » pour Khon Kaen
United U21 vs Rasi Salai United U21. Les groupes sources avaient posté une capture de
téléphone d'un autre canal (« vip 3.0 »). L'OCR met les noms sur une ligne et
« U21 03 : 48 U21 » dessous ; le parseur prenait le chrono pour un score et « U21 » pour
les deux équipes, et le VIP recevait la capture de la conversation telle quelle.
- `tipParser.ts` : un côté qui n'est qu'une catégorie (U19/U21…, II, III, Res, Reserve(s))
  ou la même équipe des deux côtés n'est plus un match ; Gemini lit alors les noms sur
  l'image (chemin `extractFullTipWithLLM` déjà en place).
- `vipGroup.ts` + `alertImage.ts` : juste avant de poster, Gemini dit si la photo est une
  capture de conversation et donne le cadre de la capture bookmaker qui montre le prono ;
  elle est recadrée avec `sharp`. Capture directe ou pas de réponse en 10 s : photo
  inchangée. Conversation sans capture exploitable : alerte en texte seul. La même photo
  part au prono 🎁 du canal gratuit.

## v188 (2026-10-28, déployée) — résultat VIP en éditant l'alerte
Image `deployment-01M61JXXY4XBFHW9M0JQSGQHCF`, construite `FROM` l'image v187 (`deployment-01M610N2QW5HZ88PX9B4DAE37G`, retour arrière
possible vers celle-ci) avec `Dockerfile.v188` et `patch_v188.py`, appliqué sur
`consensusOutcomeResolver.ts` et son test récupérés sur la machine v187.

- Chaque prono VIP noté reçoit son résultat **dans le message d'origine** (édition de la
  légende, mise en forme gardée) : gagné `✅✅✅✅`, perdu `❌`, remboursé `🔁🔁`, sur une
  ligne à la fin. Une ligne déjà présente est remplacée, jamais empilée.
- La réponse « ✅ PRONO VALIDÉ ✅ » de v184 sous le prono est supprimée.
- Seul un prono gagné va dans le canal gratuit : le message VIP, déjà modifié avec ses
  ✅✅✅✅, y est transféré, puis la courte réponse « ✅✅✅ Prono VIP validé ! + score » de
  v185 sous le transfert (gardée à la demande de Noaim). Perdus et remboursés : VIP seulement.
- Inchangé : `editMessage: false` dans `index.ts` (l'ancienne ligne « Résultat : … » reste
  désactivée), publication X des gagnants via Buffer.

## v189 (2026-10-28, déployée) — seul FixHunter publie seul dans le VIP
Image `deployment-01M61KF8GEE4R37M5WK5RKRVZZ`, construite `FROM` l'image v188 (`deployment-01M61JXXY4XBFHW9M0JQSGQHCF`, retour arrière
possible vers celle-ci) avec `Dockerfile.v189` et `patch_v189.py`, appliqué sur `config.ts`,
`vipFolder.ts` (+ test) et `tipListener.ts` de v188. Le build lance tous les tests de
`src/worker/telegram` (361) et le contrôle de types.

Demande de Noaim du 2026-10-28 : un prono part dans le VIP seulement quand 2 groupes envoient
le même, sauf FixHunter qui suffit seul.
- `lonePickGoesToVip` : avant, un prono seul partait au VIP s'il venait d'un groupe du dossier
  Telegram « VIP » (Suspicious Game…) ou d'un « Max bet »/« 3/3 » de Vip ESPORTS. Maintenant
  seulement de FixHunter, reconnu par son id (`LONE_VIP_SOURCE_CHAT_IDS`, défaut
  `-1001999889425`). Les autres attendent un 2e groupe (le prono est gardé et monte au VIP
  dès qu'un 2e groupe envoie le même).
- Flip de Vip ESPORTS : posté seulement en réponse sous un prono déjà dans le VIP, plus
  jamais en message seul.
- Inchangé : autobet (paris auto des groupes suivis), lecture du dossier « VIP » pour l'écoute.

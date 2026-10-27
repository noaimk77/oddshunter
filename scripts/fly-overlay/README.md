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

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

## v185 (à déployer) — prono VIP gagné transféré dans le canal gratuit
À appliquer sur le `consensusOutcomeResolver.ts` de v184 (récupéré sur la machine) :
`python3 patch_free_forward.py .`. Quand un prono VIP est gagné, juste après la
réponse « ✅ PRONO VALIDÉ ✅ » dans le VIP, le message VIP original est transféré
tel quel dans le canal gratuit, puis le compte répond sous le transfert
« ✅✅✅ Prono VIP validé ! + score ». Nouveau secret requis :
`TELEGRAM_FREE_CHANNEL` (@username, t.me/username ou lien t.me/+invitation).
Demande de Noaim du 2026-10-27 : plus de récap texte « Hier dans le VIP » — ce récap
vit dans le code de prod absent de GitHub, à retirer au même déploiement.

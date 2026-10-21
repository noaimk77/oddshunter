# Migration Railway → Fly.io — checklist manuelle

Railway trial (500h) approche de la fin. Fly.io free tier = 3 VMs shared-cpu 256MB, permanent. Ce doc suit ça étape par étape — c'est **toi** qui les fais, moi je peux pas m'authentifier à ta place.

## 1. Installer flyctl (une fois)

```bash
curl -L https://fly.io/install.sh | sh
```

Ajoute `~/.fly/bin` à ton PATH (le script le dit à la fin). Puis :

```bash
flyctl auth signup
```

Ça ouvre le navigateur. **Note importante** : Fly demande une carte bancaire à l'inscription pour "vérification" — aucun débit sur le free tier, mais nécessaire. Si tu refuses, l'inscription échoue.

## 2. Créer l'app

Depuis `~/oddscope` :

```bash
cd ~/oddscope
flyctl launch --no-deploy --copy-config --name oddshunter-worker
```

Réponses :
- "Would you like to copy its configuration to the new app?" → **Y**
- "Do you want to tweak these settings before proceeding?" → **N**
- "Would you like to set up a Postgresql database now?" → **N** (on garde Prisma Postgres)
- "Would you like to set up an Upstash Redis database now?" → **N**

Ça crée l'app sur Fly. Vérifie :

```bash
flyctl apps list
```

## 3. Copier tes secrets depuis .env local

Vérifie d'abord que ton `.env` est à jour (les valeurs sans guillemets simples autour). Puis pousse tout d'un coup :

```bash
flyctl secrets set \
  DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d "'")" \
  TELEGRAM_BOT_TOKEN="$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2- | tr -d "'")" \
  TELEGRAM_BOT_USERNAME="$(grep '^TELEGRAM_BOT_USERNAME=' .env | cut -d= -f2- | tr -d "'")" \
  TELEGRAM_VIP_INVITE_LINK="$(grep '^TELEGRAM_VIP_INVITE_LINK=' .env | cut -d= -f2- | tr -d "'")" \
  TELEGRAM_API_ID="$(grep '^TELEGRAM_API_ID=' .env | cut -d= -f2- | tr -d "'")" \
  TELEGRAM_API_HASH="$(grep '^TELEGRAM_API_HASH=' .env | cut -d= -f2- | tr -d "'")" \
  TELEGRAM_USER_SESSION="$(grep '^TELEGRAM_USER_SESSION=' .env | cut -d= -f2- | tr -d "'")" \
  API_FOOTBALL_KEY="$(grep '^API_FOOTBALL_KEY=' .env | cut -d= -f2- | tr -d "'")" \
  THE_ODDS_API_KEY="$(grep '^THE_ODDS_API_KEY=' .env | cut -d= -f2- | tr -d "'")" \
  STRIPE_SECRET_KEY="$(grep '^STRIPE_SECRET_KEY=' .env | cut -d= -f2- | tr -d "'")" \
  STRIPE_WEBHOOK_SECRET="$(grep '^STRIPE_WEBHOOK_SECRET=' .env | cut -d= -f2- | tr -d "'")" \
  AGENTMAIL_AGENTMAIL_API_KEY="$(grep '^AGENTMAIL_AGENTMAIL_API_KEY=' .env | cut -d= -f2- | tr -d "'")" \
  AGENTMAIL_INBOX_ID="$(grep '^AGENTMAIL_INBOX_ID=' .env | cut -d= -f2- | tr -d "'")"
```

**Piège connu** (déjà rencontré sur Railway et Netlify) : ne JAMAIS laisser les guillemets simples autour des valeurs, le `tr -d "'"` ci-dessus les strippe. Si tu skippes cette étape, `DATABASE_URL` sera corrompu et le worker fera "Can't reach database server".

## 4. Activer le nouveau produit

Nouveaux flags pour l'OddsNotifier-lite (créés le 2026-08-28) :

```bash
flyctl secrets set \
  SEND_LIVE_ALERTS=true \
  SEND_SUSPICIOUS_ALERTS=true \
  SEND_LEGACY_DETECTOR_ALERTS=false \
  SEND_TIP_CONSENSUS_ALERTS=false \
  SUSPICIOUS_MIN_SCORE=55 \
  SUSPICIOUS_FILTER_EXPLAINED_MOVES=true
```

**Ordre important** : laisse `SEND_SUSPICIOUS_ALERTS=false` pendant 24-48h après le premier déploiement pour observer les Signal rows en base sans envoyer sur Telegram. Une fois que tu vois que ça détecte des trucs de qualité, tu montes à `true`.

## 5. Créer les channels Telegram (optionnel — livraison directe DM aux payants marche sans)

Si tu veux un feed public séparé (comme OddsNotifier) :

1. Crée 2 channels Telegram privés : `Oddshunter Alerts` et `Oddshunter Closures`
2. Ajoute ton bot (@oddshunter_bot ou peu importe) comme admin de chaque channel
3. Récupère leurs chat IDs — envoie un message dans le channel, puis :
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
4. Push sur Fly :
   ```bash
   flyctl secrets set \
     TELEGRAM_SUSPICIOUS_ALERTS_CHAT_ID="-1001234567890" \
     TELEGRAM_SUSPICIOUS_CLOSURES_CHAT_ID="-1009876543210"
   ```

## 6. Déployer

```bash
flyctl deploy --config fly.toml --dockerfile Dockerfile.worker
```

Le premier build prend 3-5 min (Docker layer cache vide). Les suivants ~1 min.

## 7. Vérifier

```bash
flyctl status
flyctl logs
```

Tu dois voir :
- `[worker] Odds Hunter worker starting…`
- La ligne de statut avec `SUSPICIOUS-LITE FEED ON`
- Des cycles de détection réguliers (toutes les 3 min par défaut)

Si erreurs de connexion DB → vérifie `DATABASE_URL` sur Fly (`flyctl secrets list` — tu verras juste les noms, pas les valeurs).

## 8. Éteindre Railway (une fois Fly vérifié pendant 24h)

Dans le dashboard Railway → `oddshunter-worker` service → Settings → Delete Service. Tu récupères tes 500h restantes (utile si tu redémarres un autre projet).

## Rollback rapide

Si le nouveau produit part en vrille, sur Fly :

```bash
flyctl secrets set SEND_SUSPICIOUS_ALERTS=false
```

Fly redéploie automatiquement (30s). Le worker revient à "détection silencieuse sans envoi Telegram" — état sûr.

Si tu veux revenir au produit tip-consensus :

```bash
flyctl secrets set \
  SEND_SUSPICIOUS_ALERTS=false \
  SEND_TIP_CONSENSUS_ALERTS=true
```

## Coût réel du free tier

- 3 VMs shared-cpu-1x, 256MB RAM chacune = suffisant pour ce worker
- 160GB de bandwidth sortante/mois = énorme pour un worker Telegram
- Postgres Fly NON utilisé (on garde Prisma Postgres, qui est aussi gratuit)
- Aucun débit CB tant que tu restes dans ces limites

Si un jour tu dépasses (peu probable), Fly te préviendra avant de facturer.

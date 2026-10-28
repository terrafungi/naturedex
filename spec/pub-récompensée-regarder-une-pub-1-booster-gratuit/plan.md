# Pub récompensée : « Regarder une pub → 1 booster gratuit »

## Context
L'utilisateur veut que les joueurs puissent regarder une vidéo publicitaire en jeu pour gagner un booster gratuit. Aucune fonctionnalité pub n'a jamais existé dans le code. La régie choisie est **Google AdSense H5 Games Ads** (Ad Placement API, type `reward`). La limite n'a pas été précisée, donc on part sur **3 pubs par joueur et par jour Paris** (une constante facile à changer).

Limite technique : les pubs récompensées web de Google n'ont pas de vérification côté serveur. Le serveur ne peut donc pas prouver qu'une pub a été vue. On protège la récompense par :
- un jeton serveur à usage unique ;
- une durée minimale entre le début et la réclamation ;
- un plafond quotidien.

Au pire, un tricheur gagne 3 boosters par jour.

## Backend : `functions/api/`

### `schema.sql`
Ajouter en fin de fichier une section `-- Rewarded ads`, appliquée à la main via `sed -n '/^-- Rewarded ads/,$p' … | psql`, comme les sections précédentes :
```sql
CREATE TABLE IF NOT EXISTS ad_views (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS ad_views_user_claimed ON ad_views(user_id, claimed_at);
```
Le type de `user_id` est à vérifier sur `users.id`.

### `index.mjs`
Constantes près de `MAX_CHARGES` : `AD_DAILY = 3`, `AD_MIN_SECONDS = 12`.

Trois nouvelles actions, toutes avec `requireUser` :
- **`adStatus`** renvoie `{ adsLeft, adDaily }`. Le décompte est `COUNT(*)` des `claimed_at` du jour, calculé avec `PARIS_DAY` (`index.mjs:415`).
- **`adStart`** :
  - renvoie 429 « Plus de pub récompensée aujourd'hui » si `adsLeft = 0` ;
  - sinon insère un jeton aléatoire (`crypto.randomUUID()`) et renvoie `{ token }` ;
  - purge au passage les jetons non réclamés de plus d'une heure de ce joueur.
- **`adClaim({ token })`** s'exécute dans `inTransaction` (`index.mjs:686`) :
  1. `SELECT … FROM users WHERE id=$1 FOR UPDATE`, comme `openBooster`.
  2. `UPDATE ad_views SET claimed_at=now() WHERE token=$2 AND user_id=$1 AND claimed_at IS NULL AND started_at <= now() - AD_MIN_SECONDS AND started_at > now() - interval '1 hour' RETURNING id`. S'il n'y a pas de ligne, renvoyer 409 « Pub non terminée ».
  3. Revérifier le plafond du jour, sinon 429.
  4. `UPDATE users SET boosters = boosters + 1`. On réutilise le pool de boosters bonus déjà consommé par `openBooster` (`index.mjs:1271`).
  5. Renvoyer `{ user: publicUser(u), adsLeft }`.

## Frontend : `web/`

### `web/src/ads.js` (nouveau)
- `ADSENSE_CLIENT = 'ca-pub-…'` reste vide tant que l'utilisateur ne l'a pas fourni. C'est un identifiant public, pas un secret.
- `loadAds()` injecte une seule fois `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=…`, avec `data-ad-frequency-hint="30s"`, plus `data-adbreak-test="on"` si l'URL contient `?adtest`.
- Il définit le shim officiel `adBreak` / `adConfig`, puis appelle `adConfig({ preloadAdBreaks: 'on', sound: 'on' })`.
- `showRewardedAd()` renvoie une Promise qui vaut `'viewed' | 'dismissed' | 'unavailable'`. Elle s'appuie sur `adBreak({ type: 'reward', name: 'booster-offert', beforeReward: (show) => show(), adViewed, adDismissed, adBreakDone })`. Si `beforeReward` n'est jamais appelé (pas de pub disponible, plafond Google…), elle résout `'unavailable'`.
- `adsEnabled()` vaut `!!ADSENSE_CLIENT`.

### `web/src/pages/Boosters.jsx`
Ajouter une carte « Booster offert » en tête de la grille de droite (lignes 148–169), sur toute la largeur (`sm:col-span-2`), dans le même style que « Bonus du jour » :
- icône lucide `Clapperboard` ou `PlayCircle` ;
- texte « Regarde une courte vidéo et gagne 1 booster gratuit · {adsLeft}/3 aujourd'hui » ;
- un bouton qui enchaîne : `adStart` → `showRewardedAd()` → si `'viewed'`, `adClaim` puis `setUser(res.user)` et un message « +1 booster bonus ! ». Le bouton « Ouvrir un booster bonus (n) » existant prend ensuite le relais automatiquement ;
- les messages pour `dismissed` / `unavailable` : « Pub interrompue, pas de booster » et « Aucune pub disponible pour l'instant, réessaie plus tard » ;
- le bouton est désactivé quand `adsLeft = 0`, avec le texte « Reviens demain » ;
- la carte est cachée si `!adsEnabled()` ;
- `adsLeft` est chargé via `api('adStatus')` au montage ;
- `loadAds()` n'est appelé qu'au montage de cette page. Pas de script pub ailleurs sur le site.

### `web/public/ads.txt` (nouveau)
Contenu : `google.com, pub-XXXX, DIRECT, f08c47fec0942fa0`. Ce fichier est obligatoire pour AdSense, et il n'est créé que si le ca-pub est connu.

### Confidentialité
S'il existe une page de confidentialité ou des CGU (à chercher avec grep « confidentialit »), y ajouter un paragraphe sur les pubs Google et les cookies publicitaires.

## Ce que l'utilisateur doit faire (à expliquer dans la réponse)
1. Créer ou utiliser un compte AdSense et ajouter naturedex.fr comme site. Cela demande une validation Google.
2. Demander l'accès aux **H5 Games Ads** (Ad Placement API) dans AdSense.
3. Activer le message RGPD de Google (AdSense → Confidentialité et messages). C'est obligatoire en France.
4. Me donner son identifiant `ca-pub-…`. Je l'ajouterai alors avec ads.txt et redéploierai.

En attendant, tout est déployé mais la carte reste cachée. On peut tester avec `?adtest` une fois le ca-pub fourni.

## Déploiement
1. Appliquer la section SQL.
2. Faire le commit avant de déployer, en gardant les deux lignes ci-dessous (titre puis puces) :
   ```
   feat: pub récompensée — 1 booster gratuit (3 par jour)
   ```
   - Ajouter le Co-Authored-By.
   - Lancer `git add -A`.
3. Déployer la fonction : `openkbs fn deploy api -s "rate(1 minute)"`.
4. Déployer le site : `npm --prefix web run build && openkbs site deploy`.

## Vérification
1. **API** : tester avec un compte `zz_test_ad` créé pour l'occasion, avec `Content-Type: application/json`.
   - `adStatus` doit renvoyer 3.
   - `adStart` puis `adClaim` immédiat doit donner 409.
   - Après 13 s, `adClaim` doit réussir et `boosters` passer à +1.
   - Réutiliser le même jeton doit donner 409.
   - Après 3 réclamations, `adStart` doit donner 429.
   - Ensuite, supprimer le compte de test, ses sessions et ses `ad_views`.
2. **Interface** : avec `npm run build`, vérifier que la carte est absente sans ca-pub. Puis forcer temporairement `ADSENSE_CLIENT` en local pour contrôler la mise en page avec agent-browser sur `/booster`, puis remettre la valeur et lancer `agent-browser close --all`.
3. Supprimer les fichiers `_t.mjs` de test avant le commit.

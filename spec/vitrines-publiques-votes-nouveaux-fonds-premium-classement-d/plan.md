# Vitrines publiques, votes, nouveaux fonds premium, classement des donateurs

## Contexte
L'utilisateur veut :
- un onglet **Vitrines** dans le menu, avec deux parties :
  - « Les vitrines des joueurs » ;
  - « Top vitrines », classé par les votes des joueurs.
- **plus de fonds premium**, achetables pour les vitrines ;
- un classement des **meilleurs donateurs** (achats en boutique, donc dons aux associations), avec le montant en €.

**Ce qui existe déjà**
- Une vitrine par joueur, enregistrée côté serveur dans la table `showcases` : `user_id` PK, `title`, `background`, `layout`, `format`, `card_ids`, `updated_at`.
- Le dessin se fait sur un canvas dans le navigateur : `ShowcaseCanvas`, `drawShowcase` dans `web/src/showcase.js`.
- La vitrine s'affiche déjà sur `/joueur/:username`.
- Le prix des fonds est défini côté serveur dans `SHOWCASE_PREMIUM` (`index.mjs:996`). La possession est dans `showcase_backgrounds`, l'achat via l'action `buyBackground`.
- Le classement (`Leaderboard.jsx` et l'action `leaderboard`) utilise des requêtes `BOARDS` (`index.mjs:331`) qui renvoient `(user_id, score, extra)`.
- Les achats sont dans `purchases` : `donation_cents`, `association`, `status='paid'`, `livemode`.
- Aucun système de vote n'existe.

**Choix retenus**
- Donateurs : montant en € affiché, avec une option « ne pas apparaître ».
- Top vitrines : onglets « Cette semaine » et « De tous les temps ». Défaut proposé, car la question est restée sans réponse.
- 6 nouveaux fonds de 300 à 900 pépites. Défaut proposé également.

## 1. Schéma (`functions/api/schema.sql`, marqueur `-- Vitrines publiques`)
- Table `showcase_votes` :
  - `voter_id` et `owner_id`, tous deux `INT REFERENCES users ON DELETE CASCADE` ;
  - `created_at` ;
  - `PRIMARY KEY (voter_id, owner_id)`, soit un vote par joueur et par vitrine ;
  - index sur `(owner_id, created_at)`.
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_donations BOOLEAN NOT NULL DEFAULT false`.

## 2. Serveur (`functions/api/index.mjs`)

### Action `showcases` (galerie)
- Paramètres :
  - `{ sort: 'recent' | 'week' | 'all', scope: 'all' | 'friends', offset, limit ≤ 24 }`.
- Contenu renvoyé pour chaque vitrine :
  - `username`, `title`, `background`, `layout`, `format`, `cards` (mêmes champs que `loadShowcase`, cartes encore possédées seulement) ;
  - `votes` (selon le tri : 7 derniers jours ou total), `totalVotes`, `voted` (par moi), `SEASON_BADGE` ;
  - les vitrines `zz_test_*` sont exclues, comme dans le classement.
- Réutiliser la requête de `loadShowcase` (`index.mjs:1007`) en la généralisant à plusieurs utilisateurs, avec un helper `loadShowcases(db, userIds)`.

### Actions `voteShowcase` et `unvoteShowcase`
- Paramètre : `{ username }`.
- Règles :
  - pas de vote pour sa propre vitrine (400) ;
  - la vitrine doit exister ;
  - un seul vote par vitrine (`ON CONFLICT DO NOTHING`).
- Anti-triche :
  - le votant doit avoir un compte de plus de 24 h ;
  - et avoir ouvert au moins 3 boosters (table `openings`), comme les plafonds de cadeaux qui empêchent les comptes jetables ;
  - au maximum 30 votes par jour, sinon 429.
- Renvoie `{ votes, voted }`.

### Divers
- L'action `player` renvoie aussi `showcase.votes` et `voted`, pour pouvoir voter depuis le profil d'un joueur.
- Nouveau board `donors` dans `BOARDS` :
  - requête : `SELECT user_id, SUM(donation_cents) AS score, COUNT(*) AS extra FROM purchases WHERE status='paid' AND livemode AND user_id IS NOT NULL GROUP BY user_id` ;
  - exclut les joueurs avec `hide_donations` ;
  - ajoute l'association la plus soutenue de chaque joueur (sous-requête `mode()`) dans un champ `assoc`.
- Action `setDonationPrivacy` `{ hidden }`.
- `SHOWCASE_PREMIUM` gagne 6 fonds, également ajoutés à `SHOWCASE_BACKGROUNDS` :

| Fond | Prix (pépites) |
|---|---|
| `recif` (Récif corallien) | 300 |
| `sousbois` (Sous-bois brumeux) | 350 |
| `cerisiers` (Cerisiers en fleurs) | 450 |
| `savane` (Savane au couchant) | 500 |
| `abysses` (Abysses lumineuses) | 700 |
| `arcenciel` (Prisme arc-en-ciel) | 900 |

## 3. Client

### `web/src/showcase.js`
- 6 nouvelles entrées dans `BACKGROUNDS`, avec `premium: true` et une fonction `paint` dans le même style que `aurore`, `volcan` et `galaxie` (dégradés, particules aléatoires `rand`, silhouettes) :
  - Récif : bleu turquoise, rayons de lumière, coraux en silhouette, bulles ;
  - Sous-bois : brume verte, troncs en dégradé, rais de lumière ;
  - Cerisiers : ciel rose, branches, pétales ;
  - Savane : soleil couchant orange, acacias en silhouette ;
  - Abysses : noir-bleu, points bioluminescents, méduses ;
  - Arc-en-ciel : dégradé conique irisé, reflets.

### Nouvelle page `web/src/pages/Showcases.jsx` (route `/vitrines`)
- Onglets « Récentes », « Top semaine » et « Top de tous les temps », plus un filtre « Tous / Amis ».
- Le podium du top reprend le style or, argent et bronze du classement.
- Grille de vitrines réutilisant `ShowcaseCanvas` en miniature (format carré ou story réduit, `loading` progressif), chaque vitrine affichant le pseudo vers `/joueur/:name`, le titre et un bouton cœur ♥ avec le nombre de votes.
- Le vote est optimiste : le compteur change tout de suite, puis revient en arrière si le serveur renvoie une erreur.
- Bouton « Créer / modifier ma vitrine » vers `/vitrine`.
- Pagination « Afficher plus ».
- Les canvas sont rendus seulement quand ils deviennent visibles (IntersectionObserver), pour rester légers sur mobile.

### Autres fichiers
- `web/src/main.jsx` : route `/vitrines` dans `Private`.
- `Layout.jsx`, menu `NAV` : entrée « Vitrines » (icône `Frame`) après Collection, donc dans « Plus » sur mobile.
- `Player.jsx` : bouton ♥ et compteur sous la vitrine d'un autre joueur.
- `Leaderboard.jsx` : onglet « Donateurs » :
  - unité : montant formaté en € ;
  - ligne secondaire : « N achats · association » ;
  - un texte explique que 20 % de chaque achat va aux associations ;
  - lien vers la boutique ;
  - interrupteur « Ne pas apparaître dans le classement des donateurs », visible pour moi si j'ai déjà acheté.

## Vérification
1. Appliquer le schéma, lancer `node --check`, puis tester avec `_x.mjs` sur des comptes `zz_test_*` :
   - créer des vitrines et voter ;
   - double vote refusé, vote pour sa propre vitrine refusé (400), compte trop récent refusé ;
   - tris semaine / tous les temps ;
   - board `donors` en utilisant une transaction annulée (pas d'achat réel) ;
   - `hide_donations` respecté.
2. Build, aperçu local et captures à 375 / 1280 px de `/vitrines`, du sélecteur des 6 nouveaux fonds dans l'éditeur, de l'onglet Donateurs et du cœur sur le profil d'un joueur. Puis `agent-browser close --all`.
3. Nettoyer les comptes de test, commit, déployer la fonction (`-t 120`) puis le site.

# Plan — « NaturDex » : jeu de cartes à collectionner sur la nature (Wikipédia)

## Contexte
Le projet est vide (une fonction `api` d'exemple et une page `site/index.html` par défaut). L'utilisateur veut un jeu de cartes à collectionner façon Pokémon, avec des cartes générées depuis Wikipédia/Wikidata pour tout le vivant : animaux, plantes, arbres, algues, champignons, moisissures, bactéries, virus, fossiles. Il veut des boosters à ouvrir et des niveaux de rareté (commune, peu commune…).
Choix déjà faits : **comptes joueurs en ligne** (collection sauvegardée sur le serveur). Boosters : **pièces gagnées** (choix recommandé appliqué par défaut, la question n'a pas eu de réponse).

## Ce que le joueur pourra faire (v1)
- Créer un compte (pseudo + mot de passe) et se connecter. Pas d'e-mail, car le projet n'a pas de domaine vérifié.
- Recevoir 3 boosters gratuits à l'inscription, puis un **bonus quotidien** de pièces.
- **Acheter et ouvrir un booster** de 6 cartes avec une animation : on déchire le paquet, puis on retourne les cartes une par une, avec un éclat spécial pour les rares.
- Voir sa **collection / Pokédex** : grille filtrable par type et par rareté, compteur « X / N découvertes », cartes pas encore trouvées en silhouette.
- **Recycler les doublons** contre des pièces (le prix dépend de la rareté).
- Voir le détail d'une carte : grande image, résumé Wikipédia, lien vers l'article, statut de conservation.

Hors périmètre v1 : combats, échanges entre joueurs, classements. On pourra les ajouter ensuite.

## Les cartes
**Types (équivalent des types Pokémon)** : Mammifère, Oiseau, Reptile & Amphibien, Poisson, Insecte & Arthropode, Créature marine, Plante à fleurs, Arbre, Algue, Champignon, Moisissure, Bactérie, Virus, Fossile. Chaque type a sa couleur et son icône (lucide).

**Rareté** (5 niveaux) = **popularité de l'espèce**, mesurée par le **nombre de vues de son article sur fr.wikipédia sur les 12 derniers mois** (API Wikimedia Pageviews, testée et fonctionnelle). Plus une espèce est consultée, plus sa carte est forte et rare. Les stars sortent donc en Légendaire : Lion, Loup, Chêne, Amanite tue-mouches, Tyrannosaure, Escherichia coli, SARS-CoV-2…

Le classement se fait **par percentile au sein de chaque type**. Sinon, toutes les Légendaires seraient des mammifères, et chaque type (bactéries, algues, moisissures…) a ainsi ses propres stars :
| Rareté | Percentile de vues dans le type |
|---|---|
| Commune | 0–50 % |
| Peu commune | 50–80 % |
| Rare | 80–94 % |
| Épique (holo) | 94–99 % |
| Légendaire | top 1 % (au moins 1 par type) |

Le statut de conservation UICN (menacé, éteint…) reste affiché sur la carte comme information et badge, mais **n'influe pas sur la rareté**. Les vues servent aussi de base aux PV de la carte : une espèce plus populaire est plus forte.

**Contenu d'une carte** : nom français, nom scientifique, image Wikipédia, type, rareté, 2 à 3 lignes de résumé, et des « stats » décoratives tirées de façon déterministe des données (PV, taille/masse quand Wikidata les a).

**Probabilités par booster (6 cartes)** : 4 emplacements Commune/Peu commune (70/30), 1 emplacement Peu commune ou mieux, 1 emplacement « chance » (Rare 70 %, Épique 22 %, Légendaire 8 %).

## Architecture
- **Catalogue pré-généré** : un script `scripts/build-catalog.mjs` interroge Wikidata en SPARQL, un type à la fois. La hiérarchie taxonomique est remontée sur une profondeur fixe : une union des profondeurs 2 à 6 vers un taxon ancre, par ex. Mammalia `Q7377`. J'ai testé : réponse en ~1 s, alors que la remontée récursive `P171*` dépasse le délai. Le script filtre sur l'existence d'un article fr.wikipedia, récupère le statut UICN (`P141`) et les sitelinks (servent seulement de pré-filtre pour ne garder que les espèces assez connues), puis complète avec l'API REST `fr.wikipedia.org/api/rest_v1/page/summary/{titre}` (image + résumé) et avec l'API Pageviews (vues mensuelles sur 12 mois, additionnées ; colonne `views` dans `cards`). La rareté est calculée à la fin, une fois tout le catalogue chargé. Le script respecte les limites de débit de Wikimedia (User-Agent identifié, petite concurrence). Les cartes sans image sont exclues. Fossiles : taxons éteints connus surtout par fossiles (dinosaures, trilobites, ammonites…). Objectif : ~1 500 à 2 500 cartes, insérées dans Postgres. Le jeu ne dépend donc pas de Wikipédia pendant la partie : c'est rapide et stable. On relance le script pour enrichir le catalogue.
- **Postgres** (Neon) : `"postgres": true` dans `openkbs.json`, puis `openkbs deploy`.
  - `cards(id, qid, name, sci_name, type, rarity, views, image_url, extract, wiki_url, iucn, stats jsonb)`
  - `users(id, username unique, pass_hash, coins, last_daily, created_at)`
  - `sessions(token, user_id, expires_at)`
  - `user_cards(user_id, card_id, count, first_at)` avec clé primaire (user_id, card_id)
  - `openings(id, user_id, card_ids, at)` pour l'historique et le débogage
  - Migration SQL dans `functions/api/schema.sql`, appliquée par le script de seed.
- **Fonction `api`** (`functions/api/index.mjs`) : on garde le pattern existant de dispatch par `action` et l'en-tête CORS, avec le pool `pg` du skill. Dépendance : `pg`.
  - Actions : `register`, `login`, `me`, `claimDaily`, `buyBooster`, `openBooster`, `collection`, `catalog` (liste légère pour la grille et les silhouettes), `card`, `recycle`.
  - Mots de passe hachés avec `crypto.scrypt`, token de session aléatoire dans l'en-tête `Authorization: Bearer`.
  - **Le tirage des boosters se fait côté serveur**, dans une transaction (débit des pièces + insertion des cartes). Impossible de tricher depuis le navigateur.
- **Frontend** : React + Vite + Tailwind dans `web/`, build vers `site/` ; `"spa": "/index.html"` dans `openkbs.json` ; `BrowserRouter` ; pages `/`, `/connexion`, `/booster`, `/collection`, `/carte/:id`. L'appel à l'API passe d'abord par `/api`, puis par l'URL directe de la fonction après le premier déploiement.
- **Direction artistique** : « carnet de naturaliste / cabinet de curiosités ». Fond papier crème à grain, encre vert forêt, accents laiton/or. Typo d'affichage Fraunces, texte en Instrument Sans. Les cartes ont un cadre gravé aux couleurs du type. Effet holographique en CSS (dégradé conique + suivi de la souris) pour Épique/Légendaire. Animation d'ouverture de booster avec Motion.

## Fichiers principaux
- `openkbs.json` : activer postgres, `spa`
- `scripts/build-catalog.mjs`, `functions/api/schema.sql`
- `functions/api/index.mjs`, `functions/api/package.json` (pg)
- `web/` (Vite) : `src/pages/*`, `src/components/Card.jsx`, `BoosterOpening.jsx`, `src/api.js`
- `site/` : sortie du build (remplace l'`index.html` par défaut)

## Étapes
1. Activer Postgres (`openkbs.json` + `openkbs deploy`), créer le schéma.
2. Écrire et lancer le script de catalogue, vérifier la répartition par type et par rareté.
3. API + déploiement (`openkbs fn deploy api`), tests avec `openkbs fn invoke`.
4. Frontend, build, `openkbs site deploy`.
5. Commit avant chaque déploiement (message `feat: …`).

## Vérification
- `openkbs fn invoke api -d '{"action":"register",...}'`, puis `claimDaily`, `buyBooster`/`openBooster` : vérifier les 6 cartes, le débit de pièces et la mise à jour de la collection.
- Requête SQL : répartition des cartes par type et rareté (chaque type présent, Légendaires rares).
- Simulation de 1 000 tirages côté serveur pour contrôler les probabilités.
- agent-browser sur le site déployé : inscription, ouverture d'un booster (captures), collection, détail d'une carte, recyclage d'un doublon ; vérifier aussi l'affichage mobile. Puis `agent-browser close --all`.

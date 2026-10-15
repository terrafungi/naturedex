# Blog nature SEO, généré automatiquement chaque jour

## Context
L'utilisateur veut :
- une partie blog optimisée SEO, avec sources ;
- les 3 derniers articles en vignettes sur la page d'accueil ;
- les sujets nature les plus variés possible (fun facts, actualités, etc.) ;
- 1 article auto-généré par jour.

**Contraintes vérifiées :**
- Le site est une SPA React. Toutes les pages, y compris `/`, sont réservées aux connectés, donc Google ne voit aujourd'hui que la page de connexion.
- Il n'y a ni robots.txt, ni sitemap, ni JSON-LD.
- Seuls `/api/*` (vers la Lambda) et `/media/*` (S3) sont dynamiques sur naturedex.fr. La Lambda sert déjà du HTML serveur pour `/api/partage/:id` (`sharePage`, `functions/api/index.mjs:401`).
- Un SEO propre exige du HTML complet côté serveur, sans JavaScript.

**Architecture retenue :**
- La Lambda rend les pages blog en HTML complet, publiques et sans connexion, sous `https://naturedex.fr/api/blog/...`.
- Des redirections 301 en bord CloudFront rendent l'adresse courte `naturedex.fr/blog` partageable.

**Ancrage factuel, aucune source inventée :**
- Le modèle ne fait que **rédiger** à partir de matériaux réels récupérés par le code :
  - textes Wikipédia FR des espèces de nos 60 000 cartes (image + `wiki_url` déjà en base) ;
  - flux RSS d'actualité vérifiés et accessibles : Sciences et Avenir (nature-environnement, animaux), CNRS Le Journal, Reporterre, Futura, Science et Vie, ScienceDaily plants_animals.
- **La liste des sources est construite par le code, jamais par l'IA.**

## 1. Schéma (`functions/api/schema.sql`, marqueur `-- Blog`)
**Table `blog_posts` :**
- `id serial` ;
- `slug text unique` ;
- `category text` ;
- `title`, `description` (méta ≤ 155 caractères), `excerpt` ;
- `body jsonb`, qui contient `sections [{h2, paragraphs[], list?}]`, `keyFacts[]` et `faq[{q,a}]` ;
- `sources jsonb [{title, url, publisher}]` ;
- `image_url`, `image_alt`, `image_credit` ;
- `card_ids int[]` (cartes liées) ;
- `tags text[]` ;
- `source_key text unique` (URL RSS ou qid utilisé, pour ne jamais traiter deux fois le même sujet) ;
- `status text` (`generating` / `published` / `failed`) ;
- `published_at timestamptz`, `day date` ;
- index sur `published_at desc` et sur `category`.

## 2. Génération (`functions/api/blog.mjs`, nouveau module, sur le modèle de `arena.mjs`)

### Rubriques en rotation (16)
Le jour de l'année choisit la rubrique. Les actualités passent environ 3 fois par semaine.

| Rubrique | Matière première |
|---|---|
| Actualité nature | Item RSS récent non traité : titre, résumé, lien. Reformulation et mise en contexte, pas de copie ; le lien de l'article d'origine est cité. |
| Fun fact | Espèce populaire tirée au hasard dans `cards` ; texte Wikipédia complet via l'API `prop=extracts`. |
| Portrait d'espèce | Idem. |
| Records du vivant (top 5) | 5 cartes d'un même type. |
| Mythe ou réalité ? | Une espèce. |
| Espèce menacée | Carte avec un `iucn` EN / CR / VU. |
| Fossiles & préhistoire | Carte de type fossile. |
| Champignons | Carte de type champignon. |
| Monde invisible | Bactéries et virus. |
| Botanique | Une plante. |
| Comportement animal | Une espèce animale. |
| Oiseaux | Un oiseau. |
| Océans | Espèce marine. |
| Insectes | Un insecte. |
| Que voir en nature ce mois-ci en France | Mois courant, espèces de saison. |
| Jardin & biodiversité | Renvoi au Jardin du jeu. |

### Pipeline `generatePost(db, category)`
1. Récupérer les matériaux : cartes et/ou RSS, puis texte Wikipédia (≤ 12k caractères, User-Agent déjà utilisé dans `fillExtract`, `index.mjs:670`).
2. Appel LLM `gemini-3.5-flash` en fetch brut sur `proxy.openkbs.com/v1/google/...:generateContent` :
   - `responseMimeType: application/json` ;
   - prompt FR : ton vivant, 900 à 1 300 mots, n'utiliser QUE les faits fournis ;
   - mot-clé principal dans le titre, H2 descriptifs, FAQ de 3 questions.
3. Contrôles : JSON valide, longueurs titre et description, nombre minimal de mots. Slug généré par le code, sans accents et unique.
4. Image : la carte principale (Wikimedia Commons, crédit et licence affichés). Pour une actualité, recherche dans `cards` d'une espèce citée, sinon une carte du type correspondant.
5. Insertion `published`. Les sources sont la page Wikipédia de chaque carte et l'article RSS.

### Ordonnancement
- Dans la branche `event.source === 'schedule'`, à chaque minute : si aucun article pour le jour (heure de Paris) et qu'il est au moins 8 h, réserver le jour par un `INSERT ... status='generating'` (contrainte d'unicité sur `day`, donc une seule Lambda génère), puis générer.
- En cas d'échec : `failed`, puis nouvel essai au tick suivant, 3 essais maximum par jour.
- **Remplissage initial :** tant qu'il y a moins de 16 articles publiés, en générer 1 par minute, une par rubrique, pour lancer le blog avec du contenu varié.
- Timeout de la fonction porté à 120 s : `openkbs.json` et `openkbs fn deploy api -s "rate(1 minute)" -t 120`.

## 3. Pages HTML serveur (handler GET dans `index.mjs`, à côté de `/partage`)

### Routes
| Route | Contenu |
|---|---|
| `/api/blog` | Accueil du blog : article à la une, grille paginée (`?page=`), filtres par rubrique |
| `/api/blog/rubrique/:cat` | Pages de rubrique |
| `/api/blog/:slug` | Article |
| `/api/blog/sitemap.xml` | Accueil, rubriques, articles, avec `lastmod` |
| `/api/blog/rss.xml` | Flux RSS |

### SEO de chaque article
- `<title>`, meta description, canonical, `og:*` et `twitter:*` avec l'image, `article:published_time`.
- JSON-LD : `BlogPosting` (auteur Organization NatureDex, image, dates), `BreadcrumbList` et `FAQPage`.
- Un seul H1, H2 structurés, image avec alt, largeur, hauteur et `loading=lazy` (hors image principale), `lang="fr"`.
- Encadré « À retenir », FAQ, section **Sources** (liens `rel="noopener"` vers Wikipédia et les médias), crédit image.
- Liens internes : articles similaires de la même rubrique, cartes NatureDex de l'espèce, CTA « Collectionne cette espèce sur NatureDex » vers l'inscription.

### Rendu
- CSS inline aux couleurs du site : fond vert nuit, Playfair Display / Plus Jakarta Sans. Aucun JavaScript, page rapide et responsive.
- `Cache-Control: public, max-age=600`.
- Réutiliser `esc` et `SITE` (`index.mjs:380-382`).

### Redirections et robots (`openkbs.json` et `web/public/robots.txt`)
- Ajouter dans `openkbs.json` : `"redirects": { "rules": [{ "from": "/blog", "to": "/api/blog" }, { "from": "/blog/*", "to": "/api/blog/:splat" }] }`. C'est compatible avec `spa`.
- `robots.txt` : tout autorisé, plus `Sitemap: https://naturedex.fr/api/blog/sitemap.xml`.

## 4. Page d'accueil et liens
- **Action publique** `blogLatest` (ajoutée à `PUBLIC_ACTIONS`, `index.mjs:2293`) qui renvoie les 3 derniers articles : titre, extrait, image, rubrique, date, URL.
- **`web/src/pages/Landing.jsx`** : nouvelle section « Le blog nature » après `<Featured/>`.
  - 3 vignettes `nd-glass` (image, pastille de rubrique, titre en `font-display`, extrait, date) vers `/api/blog/:slug`.
  - Lien « Tous les articles ».
  - Reprend `SectionHead` et `Reveal`.
- **Lien Blog visible des visiteurs non connectés** :
  - dans le footer de `Layout.jsx` (affiché à tous) ;
  - sur la page de connexion (`Auth.jsx`), pour que Google découvre le blog depuis la seule page publique de l'app.

## Vérification
1. Appliquer le schéma, puis lancer `node --check` et déployer la fonction (`-t 120`).
2. Générer 1 article de test en invoquant la génération (fichier temporaire `_x.mjs` avec `DATABASE_URL`, ou en attendant le tick planifié), puis contrôler :
   - la cohérence du contenu avec la source Wikipédia ;
   - que les URLs des sources répondent 200 ;
   - la longueur et l'absence de JSON cassé.
3. Lancer `curl` sur `/api/blog`, l'article, `sitemap.xml`, `rss.xml` et `/blog` (301). Valider le JSON-LD (parse JSON) et la présence de toutes les balises meta.
4. Captures navigateur à 375 px et 1280 px de l'article et de l'accueil du blog, ainsi que de la section vignettes de la page d'accueil (compte `zz_test_*`, supprimé ensuite), puis `agent-browser close --all`.
5. Commit `feat: blog nature — articles quotidiens sourcés, SEO`, build, `openkbs site deploy` et déploiement de la fonction.
6. Laisser le remplissage initial produire les 16 premiers articles (environ 16 minutes) et en relire quelques-uns.

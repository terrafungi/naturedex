# Fiche Google Play — NatureDex

Tout se remplit dans Play Console → **Croissance → Présence sur le Play Store → Fiche principale**.

## Textes

**Nom de l'application** (30 caractères max)

```
NatureDex : cartes nature
```

**Description courte** (80 caractères max)

```
Collectionne plus de 150 000 vraies espèces en cartes et explore la nature !
```

**Description complète** (4 000 caractères max)

```
Ouvre des boosters, découvre de vraies espèces et construis la plus belle collection du monde vivant.

NatureDex est un jeu de cartes à collectionner où chaque carte est une espèce qui existe vraiment : mammifères, oiseaux, insectes, poissons, plantes, champignons… Plus de 150 000 espèces, avec leurs photos et leurs fiches issues de Wikipédia et Wikimedia Commons. On joue, et sans s'en rendre compte, on apprend.

★ OUVRE DES BOOSTERS
Déchire ton booster et révèle tes cartes une à une. Communes, peu communes, rares, épiques, légendaires… et les 50 espèces stars cachées en cartes Secrètes. Le Lion, l'Orque ou le Koala tomberont-ils dans ta collection ?

★ PARS EN EXPLORATION
Des cartes apparaissent sur une vraie carte, autour de toi, avec les espèces qui vivent réellement dans ta région. En forêt, les cartes rares sortent bien plus souvent : une bonne excuse pour aller marcher dehors.

★ PHOTOGRAPHIE LE VIVANT
Sur le terrain, prends en photo une vraie plante ou un vrai animal : l'IA reconnaît l'espèce et ta photo devient une carte unique.

★ AFFRONTE LES RANGERS EN DUEL
Créatures, Énergies et Naturalistes : construis ton deck, défie les rangers et gagne de nouvelles cartes. Combats au tour par tour, saisons, classement et badges.

★ QUIZ ARENA
Quatre modes de jeu pour tester tes connaissances, et un concours chaque semaine où le podium gagne des pépites.

★ CULTIVE TON JARDIN 3D
Plante, récolte, installe ta ruche et ton atelier sur ton île, puis transforme tes plantes en boosters.

★ TON AVATAR EN 3D
Plus de 100 tenues, chapeaux et compagnons pour habiller ton naturaliste.

★ JOUE AVEC TES AMIS
Enchères pour échanger tes doubles, vitrines pour exposer tes plus belles cartes, messages, défis du jour et des dizaines de trophées à débloquer.

★ UN JEU SOLIDAIRE
20 % de chaque achat en boutique est reversé à l'association de ton choix : la LPO (Ligue pour la protection des oiseaux) ou Wikipédia.

NatureDex est gratuit. Des achats facultatifs (crédits, Pass Naturaliste) permettent d'aller plus loin.

Ta vie privée compte : en exploration, seule ta dernière position sert au jeu, jamais ton trajet.

Rejoins la communauté sur naturedex.fr
```

## Visuels

| Champ Play Console | Fichier |
|---|---|
| Icône de l'application (512 × 512) | `android/store_icon.png` |
| Image de présentation (1024 × 500) | `marketing/playstore/feature-graphic-1024x500.png` |
| Captures d'écran du téléphone (2 à 8) | `marketing/playstore/screenshots/01-boosters.png` … `08-solidaire.png`, dans cet ordre |
| Vidéo (lien YouTube) | `marketing/playstore/video/naturedex-promo-1920x1080.mp4` à publier sur YouTube |

Les captures font 1080 × 1920 : elles conviennent aussi pour les tablettes 7 et 10 pouces si Play Console les demande.

## Vidéo

Google Play n'accepte qu'un lien YouTube :

1. Sur YouTube → Créer → Importer une vidéo → choisir `naturedex-promo-1920x1080.mp4`.
2. Titre : `NatureDex — Collectionne la nature`. Public : « Non, elle n'est pas conçue pour les enfants » si le jeu vise tous publics, sinon répondre selon ta classification.
3. Visibilité : **Non répertoriée** (ou Publique). Surtout pas « Privée » : Google Play refuse les vidéos privées.
4. Copier le lien (`https://www.youtube.com/watch?v=…`) et le coller dans le champ « Vidéo » de la fiche.
5. Désactiver la monétisation de la vidéo : Google Play refuse les vidéos avec publicités.

## Catégorie et coordonnées

- Catégorie : **Jeux → Cartes** (ou Jeux → Éducation).
- Tags : Cartes à collectionner, Nature, Éducatif, Exploration.
- Site web : `https://naturedex.fr`
- Règles de confidentialité : `https://naturedex.fr/confidentialite`

## Régénérer les visuels

Les sources sont dans `src/`. Les captures brutes de l'app (compte démo) sont dans `src/shots/`.

- Captures + bannière : `sh src/render.sh` (modifier les textes dans `src/build.mjs`).
- Vidéo : `npm i ffmpeg-static` puis `FFMPEG=$(node -p "require('ffmpeg-static')") sh src/video.sh` (timeline dans `src/video.html`, musique dans `src/soundtrack.mjs`).

# Activer les notifications push (travail fait par Claude sur GitHub)

## Contexte
Claude (sur GitHub) a ajouté les notifications push et demande 3 étapes de mise en ligne :
SQL dans `schema.sql`, clés VAPID dans la fonction `api`, puis déploiement.

**Constat :** le dépôt GitHub `terrafungi/naturedex` ne contient PAS encore ce travail.
Une seule branche (`master`), identique à ce projet (dernier commit 07f2a3b « rotation des images »).
Aucune trace de VAPID / push dans le code. Le fichier `vapid-keys.local.txt` n'existe que
chez Claude, il n'a jamais été envoyé (normal : il contient une clé secrète).

## Étape 0 — à faire par l'utilisateur
Dans la conversation Claude/GitHub : lui demander de **pousser ses changements sur la branche
`master`** (ou d'ouvrir une Pull Request, puis cliquer « Merge »). Le fichier de clés n'est pas
nécessaire : je génère de nouvelles clés ici (aucun joueur n'a encore activé les notifications,
donc rien n'est cassé).

## Étapes que je ferai ensuite
1. `git pull origin master` — récupérer le code des notifications ; vérifier le diff
   (`functions/api`, `site/`, fin de `schema.sql`).
2. Exécuter uniquement les nouvelles lignes SQL de fin de `functions/api/schema.sql`
   sur la base, via `psql "$(openkbs postgres connection --libpq)"`.
3. Générer une paire de clés VAPID (`npx web-push generate-vapid-keys`) et l'ajouter à
   `functions/api/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) sans afficher la clé privée.
   Lui donner une copie de sauvegarde à conserver.
4. `openkbs fn deploy api` puis `openkbs site deploy`. Pas de nouvel AAB.

## Vérification
- `openkbs fn logs api` sans erreur ; la section « Notifications » apparaît dans l'app.
- Activer les notifications sur un téléphone de test et recevoir une notification d'essai.

# DSolar-ERP — Frontend

Application Angular 21 LTS, TypeScript 5.9 strict, composants standalone, routes lazy, RxJS et signals. Développement en français, sans données fictives ni logique financière dupliquée.

## Démarrage

Node.js 22.12+ (branche 22), npm 11.6.2. Installer cette version de npm avec `npm install --global npm@11.6.2` si nécessaire. Depuis frontend/ : exécuter `npm ci`, puis `npm start`. Le proxy de développement relaie /api vers localhost:3000. Démarrer le backend séparément avec sa base de développement. Aucun secret, URL PostgreSQL ou clé JWT dans le navigateur. En production, servir l'application et /api/v1 sous la même origine via reverse proxy ; le serveur doit renvoyer index.html pour les routes Angular, jamais pour /api.

## Architecture

- core/api : transport, préfixe, erreurs et intercepteur.
- features/auth : contrats de domaine, port HTTP, service de session, guards et écran.
- features/dashboard : contrat de lecture, adaptateur API et présentation.
- layout : shell responsive et navigation.
- shared : réservé aux composants véritablement réutilisables.

Les DTO externes sont validés à l'exécution depuis unknown. Les montants restent des chaînes. Le backend est l'autorité des droits, transitions et calculs. Les guards frontend ne remplacent pas la sécurité serveur. Les tokens sont conservés seulement en mémoire, sans localStorage/sessionStorage : un rechargement nécessite une nouvelle connexion. Le renouvellement est mutualisé pour éviter la révocation concurrente des refresh tokens. Les lectures sont rejouées au plus une fois dans la même session ; aucune mutation n’est rejouée automatiquement. Les requêtes authentifiées restent limitées au préfixe relatif /api/v1.

## Qualité

npm run typecheck, npm run lint, npm test, npm run format:check, npm run build. Le workflow frontend.yml est appelé par ci.yml et valide le socle indépendamment du backend. Les deux validations sont requises pour la livraison. La charte initiale reprend framboise, bleu nuit, blanc et beige clair, sans dégradé. Le logo officiel reste à intégrer (le mot-symbole provisoire n'est pas le logo officiel).

## Périmètre initial

Connexion réelle, déconnexion, session, guards, shell responsive, lecture des indicateurs globaux du backend réservée au périmètre administratif. Les autres interfaces seront développées module par module. La compatibilité intégrale ne peut être affirmée qu'après tests de recette sur toutes les routes utilisées. Voir ../backend/docs/05-integration-frontend.md et ../backend/docs/07-swagger.md.

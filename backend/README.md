# DSolar-ERP — Backend

API interne NestJS / Prisma / PostgreSQL, réservée aux utilisateurs autorisés.

**[Documentation technique complète du backend](docs/README.md)** : architecture, modules, flux métier, sécurité, API, données, exploitation et tests.

## Démarrage local

Depuis ce dossier :

```bash
npm ci
cp .env.example .env
npm run prisma:generate
npm run prisma:validate
npm run start:dev
```

Sous PowerShell, remplacer `cp .env.example .env` par `Copy-Item .env.example .env`.
Configurer les variables d'environnement avec des secrets propres à l'environnement local.
Ne jamais utiliser la base de production pour les tests.

API : `http://localhost:3000/api/v1`.

La documentation Swagger est disponible sur `/documentation` uniquement si `NODE_ENV=development` et `ENABLE_SWAGGER=true`.

## Contrôles

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
node --test scripts/local-integration-database.test.cjs
```

Les tests PostgreSQL utilisent une base éphémère dédiée (voir le workflow qualité à la racine).
Les migrations versionnées sont conservées dans `prisma/migrations/`.
Leur déplacement n'exige pas de régénération ni de réinitialisation de la base.

## Architecture

- `src/modules/` : modules métier, présentation, application, domaine et infrastructure.
- `src/infrastructure/` : infrastructure commune, sécurité HTTP et Prisma.
- `src/shared/` : fonctions et types partagés.
- `scripts/` : contrôles d'intégration et provisionnement des privilèges SQL.
- `docs/` : documentation technique du backend.

Les controllers délèguent la logique métier aux services applicatifs ; les repositories gèrent la persistance.
TypeScript strict, ESLint, validations et messages API en français.

## Déploiement

Configurer le répertoire de travail du service backend sur `backend/` (ou utiliser `npm --prefix backend` depuis la racine).
Installation : `npm ci`. Génération Prisma : `npm run prisma:generate`. Compilation : `npm run build`. Démarrage : `npm run start:prod`.

Appliquer les migrations dans un job dédié, après validation et sauvegarde, avec les droits de migration.
Ne pas fournir les secrets du propriétaire au processus NestJS.
Voir [la documentation de sécurité PostgreSQL](docs/database-security.md).

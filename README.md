# DSolar-ERP

Logiciel de gestion interne de D-Solar and Agri.

## Organisation du dépôt

```text
DSolar-ERP/
├── backend/          # API NestJS, Prisma, migrations, tests et scripts
├── frontend/         # Application Angular
├── .github/
│   └── workflows/    # Intégration continue
├── .gitignore
└── README.md
```

- [Backend](backend/README.md) : installation, architecture, tests et déploiement.
- [Frontend](frontend/README.md) : interface Angular et instructions de développement.

## Démarrage du backend

```bash
cd backend
npm ci
cp .env.example .env
npm run prisma:generate
npm run start:dev
```

Configurer les secrets locaux avant le démarrage. Les tests d'intégration doivent exclusivement utiliser une base PostgreSQL dédiée aux tests.
Les commandes npm du backend s'exécutent dans `backend/`. Le workflow qualité conserve les tests, la compilation, les contrôles de typage, de sécurité et les migrations sur PostgreSQL éphémère.

Le déplacement du code ne change ni les routes API, ni les modèles Prisma, ni les migrations existantes. Il ne déclenche aucune migration sur la base de production.

## Intégration continue et livraison

[Documentation CI/CD](.github/README.md) — orchestration, validations indépendantes, artefacts et déploiement protégé.

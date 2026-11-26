# Documentation technique DSolar-ERP

Documentation du backend NestJS, basée sur le code de la branche `dev` au commit `e44804ae427e5227965ca1829f994fc9b1763010` (réorganisation validée). Les fichiers Markdown sont maintenus dans le dépôt afin que l'équipe puisse les lire et les mettre à jour avec le code.

## Parcours de lecture

| Document | Contenu |
| --- | --- |
| [01 — Architecture](01-architecture.md) | Organisation, couches, injection, transactions |
| [02 — Modules métier](02-modules.md) | Responsabilités des 16 modules |
| [03 — Flux métier](03-flux-metier.md) | Stocks, achats, ventes, trésorerie, comptabilité |
| [04 — Sécurité](04-securite.md) | JWT, permissions, magasins, validation et audit |
| [05 — Intégration frontend](05-integration-frontend.md) | Contrats HTTP, pagination, erreurs, fichiers, SSE |
| [06 — API identité et stocks](06-api-identite-stocks.md) | Routes et DTO |
| [06 — API commerciale](06-api-commerce.md) | Routes et DTO |
| [06 — API financière et transversale](06-api-finance.md) | Routes et DTO |
| [07 — Swagger](07-swagger.md) | Documentation interactive OpenAPI, JWT et exemples de test |
| [08 — Données](08-data-dictionary.md) | Modèles, relations, enums et migrations |
| [09 — Installation et exploitation](09-exploitation.md) | Configuration, démarrage, déploiement, sauvegardes |
| [10 — Tests et maintenance](10-tests-maintenance.md) | CI, suites, évolution sûre |
| [Sécurité de la base](database-security.md) | Procédure détaillée des privilèges PostgreSQL |

## Source de vérité

Le code, les tests et les migrations priment en cas de divergence. Les exemples de données sont fictifs. Les migrations ne sont pas exécutées par cette documentation. Les règles de gestion ne constituent pas une certification fiscale ou comptable.

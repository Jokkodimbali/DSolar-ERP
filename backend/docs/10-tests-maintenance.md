# Tests, CI/CD et maintenance

## Situation de référence

Le commit e44804ae427e5227965ca1829f994fc9b1763010, après séparation backend/frontend, a été validé par le [pipeline 45433363023](https://github.com/Jokkodimbali/DSolar-ERP/actions/runs/45433363023) : les trois jobs ont réussi. Ce constat est limité à cette version du code.

## Tests locaux

Depuis backend/ :

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
node --test scripts/local-integration-database.test.cjs
```

Jest exécute les fichiers .spec.ts situés sous src/. Les tests conditionnels PostgreSQL ne tournent pas systématiquement dans la suite unitaire. Les tests d'intégration nécessitent une base locale dédiée dsolar_test et les variables définies dans le workflow. Ne pas employer Neon de production, même pour une seule suite.

## GitHub Actions

Le workflow [quality.yml](../../.github/workflows/quality.yml) s'exécute sur push main/dev, pull requests et déclenchement manuel. Son working-directory est backend/ et le cache npm pointe sur backend/package-lock.json. Il comporte trois jobs :

| Job | Contenu |
| --- | --- |
| quality | Génération/validation Prisma, TypeScript, ESLint, Jest, compilation, garde de base locale, Prettier |
| dependency-security | Installation sans scripts, npm audit des dépendances de production au seuil high |
| postgres-integration | Service PostgreSQL 16 éphémère, migrations, smoke, intégrations métier et contrôles de rôle SQL |

Les tests d'intégration couvrent parcours commercial avec avoirs et deux tranches, isolation par magasin, trésorerie, dépenses, retours fournisseurs, comptabilité, banque, limitation des requêtes d'authentification, paramètres et notifications. Le job provisionne un rôle runtime restreint et vérifie le refus d'un propriétaire ou d'un rôle dont les droits ont dérivé.

Les tests HTTP sur notifications et images se trouvent dans [new-endpoints.spec.ts](../src/infrastructure/http/new-endpoints.spec.ts). Ils utilisent NestJS et des doubles des ports ; ils ne remplacent pas des tests de bout en bout sur une base réelle de préproduction.

Le workflow de formatage fournit un patch de diagnostic en cas d'échec, sans rendre le contrôle facultatif. Les workflows ponctuels de remédiation sont manuels et ne sont pas un processus de déploiement.

## Préparer une modification

1. Identifier le module et le contrat API concerné ; créer des tests de régression.
2. Ajouter ou modifier le port, le service/domaine et le repository selon le besoin, sans introduire de logique métier dans le controller.
3. Ajouter une migration versionnée si le schéma doit évoluer. Vérifier les droits runtime et les invariants SQL.
4. Ajouter la permission de route et tester les accès négatifs (sans jeton, autre magasin, rôle insuffisant, ressource inexistante).
5. Vérifier l'idempotence, la concurrence et la cohérence des montants pour toute mutation financière ou de stock.
6. Exécuter les contrôles locaux et le CI ; relire les changements de migrations et de contrats.
7. Mettre à jour les documents de référence et le frontend si le contrat a changé.

## Limites des validations

Une suite verte atteste les scénarios couverts, pas une garantie absolue d'absence de vulnérabilité ou de bug. Il reste nécessaire de valider la recette utilisateur, les performances sous charge, les données historiques, les restaurations, les règles comptables et fiscales applicables et le déploiement réel. Ne jamais effectuer une migration de production simplement pour confirmer un test.

Les règles de TypeScript strict, no-explicit-any et no-unsafe-* protègent le code de production ; les mocks de tests sont soumis à des règles adaptées. Ne pas affaiblir la configuration pour faire passer artificiellement le pipeline.

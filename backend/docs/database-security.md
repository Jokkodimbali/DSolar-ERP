# Séparation des privilèges PostgreSQL

Le backend doit utiliser un rôle de connexion distinct du propriétaire des objets et du rôle de migration. Ce script est prévu pour la base dédiée DSolar ERP et le schéma `public` ; il ne crée pas de compte et ne modifie aucune donnée métier.

## Préparer un environnement de préproduction

1. Sauvegarder et vérifier les droits existants. Créer un login applicatif non privilégié par SQL, avec un secret généré et conservé dans le gestionnaire de secrets. Il ne doit posséder aucun objet, ni être membre d'un autre rôle. Ne pas réutiliser un rôle administrateur Neon.
2. Dans la base dédiée seulement, le propriétaire vérifie et retire les privilèges publics CREATE sur le schéma public et TEMPORARY sur la base. Cette dernière mesure évite le masquage des tables utilisées par les déclencheurs avec des tables temporaires. Vérifier l'impact sur les autres clients avant toute modification.
3. Appliquer les migrations avec le propriétaire, puis exécuter :

```bash
psql "$MIGRATION_DATABASE_URL" -v runtime_role=dsolar_runtime -f scripts/provision-runtime-role.sql
```

Utiliser une connexion directe (non poolée) pour le provisionnement. Le script s'exécute en transaction, vérifie les droits effectifs et échoue si le rôle possède des privilèges incompatibles. Réexécuter après chaque migration ajoutant des tables. Les tables inconnues ne reçoivent pas de droits automatiquement.

## Déploiement

- Backend : DATABASE_URL désigne le rôle applicatif. Ne pas transmettre le mot de passe propriétaire au processus NestJS ; si DIRECT_URL est exigée par un outil de génération, utiliser une URL non privilégiée dans cet environnement.
- Migrations / initialisation des permissions : job séparé avec les secrets du propriétaire. Ne pas lancer le seed administrateur via le rôle restreint.
- Les droits métier sont toujours contrôlés par NestJS ; le compte SQL partagé ne constitue pas une isolation utilisateur par utilisateur. Les tables métier modifiables conservent les droits CRUD nécessaires à cette version.
- Le script réserve le journal d'audit, les mouvements de stock, les événements de transfert et les lignes comptables à SELECT/INSERT. Les rôles et permissions sont en lecture seule. Le compte applicatif ne reçoit pas TRUNCATE, TRIGGER ni accès à _prisma_migrations.
- Tester les fonctionnalités de bout en bout et les sauvegardes/restaurations en préproduction avant changement des secrets. Le propriétaire et les opérateurs privilégiés peuvent toujours modifier les objets : sauvegardes indépendantes et supervision restent nécessaires.

## Vérification au démarrage

Après validation en préproduction, définir `DB_REQUIRE_RESTRICTED_ROLE=true` dans le backend uniquement (pas dans le job de migration ni dans le seed). NestJS contrôle les privilèges effectifs avant de démarrer. En cas de privilèges incompatibles, il refuse de démarrer.

Cette vérification requiert PostgreSQL 15 ou ultérieur, le schéma public et les migrations à jour. Elle vérifie notamment les attributs du rôle, les affiliations, la propriété des objets, les droits DDL/TEMP, le contournement des triggers, les fonctions SECURITY DEFINER accessibles dans public, les droits de modification du journal et des lignes comptables ainsi que l'accès aux métadonnées de migration.

Ce contrôle est une défense supplémentaire et non une preuve d'isolation totale. Il ne remplace ni le provisionnement explicite, ni la revue des nouvelles tables/fonctions et des droits dans les autres schémas, ni le contrôle d'autorisation métier. Il est exécuté au démarrage et ne détecte pas une modification des droits en cours d'exécution avant le redémarrage.

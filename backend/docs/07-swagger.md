# Swagger / OpenAPI

La documentation interactive est générée par NestJS à partir des controllers et DTO. Elle n'est disponible qu'en développement, avec activation explicite :

```dotenv
NODE_ENV=development
ENABLE_SWAGGER=true
```

Démarrer depuis backend/ avec une base de développement configurée : `npm run start:dev`. Ouvrir :

- http://localhost:3000/documentation — interface Swagger UI.
- http://localhost:3000/documentation-json — document OpenAPI JSON.
- http://localhost:3000/documentation-yaml — document OpenAPI YAML.

## Tester une requête

1. Exécuter POST /api/v1/auth/login avec un compte de développement.
2. Copier uniquement le champ jetonAcces.
3. Cliquer sur Authorize et coller le jeton, sans préfixe Bearer (Swagger l'ajoute).
4. Exécuter les routes autorisées. Les opérations de mutation changent réellement les données de la base configurée.
5. Se déconnecter et supprimer l'autorisation dans Swagger. Le jeton n'est pas conservé par Swagger entre les rechargements.

Les permissions de route, les contrôles métier et l'isolation des magasins restent appliqués. Les routes publiques sont identifiées explicitement ; refresh et logout exigent leur DTO de jeton de renouvellement.

## Contrats

Les DTO contiennent les métadonnées OpenAPI : champs requis/facultatifs, types, énumérations, contraintes de longueur et de valeur, formats et objets imbriqués. Les règles métier transactionnelles restent définies dans le code. Les erreurs partagent le schéma ApiError. Les réponses de connexion, pagination générique, notifications, images et résumé de paiements ont des schémas explicites. Les autres réponses indiquent leur statut sans inventer de structure : consulter les ports, services et [références API](06-api-commerce.md).

Le téléchargement de fichiers, les uploads multipart (champ file) et le flux SSE sont documentés selon leur type de contenu. Pour SSE, utiliser un client compatible avec les en-têtes Bearer ; Swagger UI n'est pas un client SSE temps réel dédié.

Les tests de génération OpenAPI exécutés dans Jest vérifient les 214 routes, la sécurité, les DTO clés, les fichiers et le résumé financier sans connexion à Neon. Ne jamais activer Swagger sur une instance de production : la condition de démarrage interdit son montage dans ce mode, même si ENABLE_SWAGGER=true.

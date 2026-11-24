# Sécurité applicative et données

## Modèle d'accès

API interne, aucun accès public aux données de gestion. Le bootstrap attribue à ADMIN les huit permissions ; MAGASINIER reçoit par défaut stores.read, products.read, inventory.read et inventory.manage. Les attributions de magasins sont indépendantes des rôles.

| Permission | Famille |
| --- | --- |
| users.manage | Gestion des utilisateurs et fonctions administratives/financières |
| stores.read / stores.manage | Lecture et gestion des magasins |
| products.read / products.manage | Catalogue |
| inventory.read / inventory.manage | Stocks et approvisionnements |
| sales.read / sales.manage | Ventes et documents |

La permission de route est une condition nécessaire, pas suffisante. Certains repositories imposent le rôle ADMIN actif ou l'accès à tous les magasins d'un document. Un administrateur ne dispose pas systématiquement d'un contournement de ces filtres. Consulter les sources avant de modifier les permissions.

## Authentification

- Argon2 pour les mots de passe ; comparaison avec un hash factice en cas de compte inconnu ou inactif.
- JWT d'accès et de renouvellement signés séparément, avec des secrets distincts d'au moins 32 caractères.
- Les refresh tokens sont liés à une session, hashés en base et renouvelés par rotation. La réutilisation d'un ancien jeton détectée par le service révoque les sessions de l'utilisateur. Le client doit sérialiser les renouvellements pour éviter les courses.
- AccessGuard vérifie le format Bearer, le jeton, le compte actif, la version de révocation, la session, son propriétaire et les permissions. Les changements de droits/état peuvent révoquer les accès.
- Les routes login, refresh et logout ont une limitation de débit persistante ; le guard ne remplace pas un pare-feu ou une protection volumétrique.

Sources : [auth.use-cases.ts](../src/modules/identity/application/auth.use-cases.ts), [AccessGuard](../src/modules/identity/presentation/access.guard.ts), [configuration JWT](../src/modules/identity/infrastructure/jwt-configuration.ts).

## Politique de route par défaut restrictive

RoutePolicyGuard refuse une route sans déclaration valide. Une route publique doit porter PublicRoute sans AccessGuard ni permission. Une route privée requiert AccessGuard et soit AuthenticatedOnly, soit RequirePermissions avec des codes internes autorisés. Ne jamais ajouter PublicRoute pour contourner une erreur 403. L'inventaire de routes est testé par endpoint-policy.spec.ts.

Routes publiques : health, login, refresh, logout (ces deux dernières exigent le jeton de renouvellement selon le DTO). Les images, PDF, recherches et SSE sont protégés.

## HTTP et validation

[main.ts](../src/main.ts) active ValidationPipe avec whitelist, forbidNonWhitelisted et transformation. Le filtre [SafeExceptionFilter](../src/infrastructure/http/safe-exception.filter.ts) renvoie un message français, transforme P2002/P2003/P2034 en 409 et masque les erreurs techniques. Les en-têtes de sécurité sont définis dans [http-security.ts](../src/infrastructure/http/http-security.ts). CORS limite les origines configurées ; CORS n'est pas une authentification. TRUST_PROXY_HOPS doit correspondre à la topologie réelle des proxies, sinon les limites par IP peuvent être inexactes.

Les images sont reçues en multipart, type et taille contrôlés côté serveur : JPEG ou PNG compatible PDF, maximum 2 Mio, dimensions jusqu'à 4096 pixels par côté et 4 194 304 pixels au total. PNG 8 bits non entrelacé avec vérification de structure, CRC et décompression bornée ; JPEG avec contrôle de structure des segments et scans, pas de décodage complet. Pas de SVG actif ni de récupération d'image depuis une URL arbitraire. Les octets sont stockés dans ImageAsset, et l'accès nécessite une session. Prévoir des quotas et limites de requêtes au niveau de l'exploitation.

## PostgreSQL

Les contraintes et déclencheurs des migrations protègent les données et historiques, notamment les mouvements, audit, lignes comptables, paramètres société et images. Les droits du compte SQL ne remplacent pas les contrôles par utilisateur dans NestJS. Le rôle de migration/propriétaire ne doit pas être celui du runtime ; DB_REQUIRE_RESTRICTED_ROLE permet le contrôle des droits au démarrage. Voir [database-security.md](database-security.md), qui contient la procédure détaillée.

## Check-list de mise en production

HTTPS, secrets distincts par environnement, CORS exact, proxy fiable, Swagger désactivé, compte runtime restreint, sauvegardes/restauration testées, journaux sans données sensibles, supervision, limites de débit et de taille, tests de sécurité et recette de préproduction. Un CI vert ne démontre pas l'absence de toute faille ; une revue indépendante est recommandée pour les fonctions financières.

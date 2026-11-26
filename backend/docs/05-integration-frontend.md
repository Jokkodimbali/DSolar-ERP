# Guide d'intégration du frontend Angular

Ce document décrit les contrats actuels de l'API. Le frontend n'est pas encore implémenté. Les exemples utilisent des valeurs fictives ; ne jamais envoyer de véritables secrets dans les journaux.

## 1. Base et authentification

Base locale : http://localhost:3000/api/v1. Utiliser une configuration d'environnement Angular, jamais un secret JWT ou une URL PostgreSQL dans le navigateur.

```http
POST /api/v1/auth/login
Content-Type: application/json

{"email":"admin@example.test","password":"<mot-de-passe-local>"}
```

Réponse : objet avec `jetonAcces`, `jetonRenouvellement`, `utilisateur`. Utiliser `Authorization: Bearer <jetonAcces>` pour les routes protégées. GET /auth/me permet de récupérer l'identité. POST /auth/refresh et /auth/logout acceptent `{"refreshToken":"<jeton>"}`. Le renouvellement doit être unique et partagé entre les requêtes concurrentes ; éviter les renouvellements en parallèle. Un 401 non récupérable doit vider l'état de session et rediriger vers la connexion. Un 403 ne doit pas déclencher de rafraîchissement infini.

Le menu se construit à partir des permissions et du rôle ; les guards Angular améliorent l'UX mais ne remplacent jamais les guards backend.

## 2. Réponses, erreurs et messages

Les endpoints conservent leurs objets/réponses métier d'origine. Il n'existe pas d'enveloppe globale `success/data` obligatoire. Les mutations réussies transmettent un en-tête `X-Success-Message` encodé avec encodeURIComponent ; décoder côté client avec decodeURIComponent après vérification de sa présence. CORS expose cet en-tête. Certaines réponses comprennent également un champ message.

```json
{"statusCode":400,"message":["Le champ « adresse électronique » doit être une adresse électronique valide."]}
```

Le champ message peut être une chaîne ou un tableau de chaînes. Afficher les erreurs de champ à proximité des inputs quand le rapprochement est fiable, et conserver un message général accessible. Ne pas afficher un toast de succès avant le retour HTTP.

| Code | Comportement frontend recommandé |
| --- | --- |
| 400 | Corriger les entrées |
| 401 | Renouveler une seule fois ou reconnecter |
| 403 | Afficher l'accès refusé |
| 404 | Ressource indisponible dans le périmètre |
| 409 | Recharger les données et inviter à résoudre le conflit |
| 413 / 415 | Vérifier taille et format |
| 429 | Espacer les tentatives |
| 5xx | Message technique générique et possibilité de réessayer prudemment |

## 3. Pagination et recherche

Les nouvelles listes paginées acceptent généralement page (1 à 100000), limit (1 à 100), search (120 caractères au maximum), selon PageQueryDto. Le frontend ne doit pas télécharger l'ensemble de la table pour la filtrer. Une page normale retourne :

```json
{"items":[],"pagination":{"page":1,"limit":25,"total":0,"pages":0}}
```

Les notifications ajoutent enabled et unread ; leur limite par défaut est 50. Les anciennes routes non paginées et certains historiques par curseur restent disponibles : ne pas supposer un format unique pour tous les GET.

Exemples de listes :
- GET /products/search?page=1&limit=25&search=panneau&active=true
- GET /customers/search?page=1&limit=25&search=client
- GET /sales-orders/search?page=1&limit=25&status=CONFIRMED
- GET /purchase-orders/search?page=1&limit=25&outstanding=true
- GET /search/stocks?page=1&limit=25&storeId=<uuid>
- GET /search/stock-movements?page=1&limit=25&productId=<uuid>
- GET /notifications?page=1&limit=25&read=false

Les chemins ci-dessus sont relatifs à /api/v1. Chaque famille de liste possède ses propres filtres et statuts ; un filtre incompatible doit être supprimé lors d'un changement d'écran. Voir les trois références API et les services de recherche. Les filtres booléens de recherche sont transmis en chaînes true/false. Réinitialiser la page lors d'une recherche ou d'un changement de filtre, temporiser la saisie et annuler les requêtes obsolètes.

## 4. Montants, statuts, dates

Les contrats actuels mêlent chaînes décimales (paiements, comptabilité, quantités de certains flux) et valeurs numériques (par exemple DTO de proforma). Respecter le type indiqué par chaque DTO ; ne pas convertir les montants de haute précision en Number pour effectuer des calculs financiers. Afficher les montants en FCFA/XOF et les dates selon le fuseau configuré, par défaut Africa/Dakar. Traduire les enums techniques en français sans changer les codes envoyés au serveur. Les calculs et autorisations finaux sont exécutés côté backend.

Pour un règlement, POST /sales-orders/:orderId/payments avec :

```json
{"amount":"100.00","method":"CASH","idempotencyKey":"reglement-exemple-0001"}
```

La clé est propre à une intention de paiement et doit être conservée pour une relance identique, pas réutilisée pour un autre paiement. Lire GET /sales-orders/:orderId/payments/summary avant d'afficher le formulaire. Les valeurs du résumé sont la référence nette des avoirs. Le bouton de confirmation doit être désactivé pendant la requête, sans considérer cette protection UI comme une garantie transactionnelle.

## 5. Téléversement et PDF

POST /media/company/logo ou POST /media/products/:id/photo avec multipart/form-data, champ file unique. Laisser le navigateur produire le boundary ; ne pas définir manuellement Content-Type. Prévisualiser le fichier et afficher les contraintes de format/dimensions. La réponse contient id, mimeType, createdAt, url et message. La lecture GET /media/images/:id nécessite Bearer : utiliser HttpClient avec responseType blob, puis URL.createObjectURL et révoquer l'URL lorsqu'elle n'est plus nécessaire. Ne jamais placer le JWT dans une URL.

Pour le logo, téléverser puis utiliser l'URL interne retournée dans PUT /settings/company. GET /settings/company fournit la révision ; envoyer expectedRevision (0 lors de la première version). Un conflit 409 implique relecture des paramètres. Les champs texte du DTO sont requis sauf timeZone optionnel ; utiliser une chaîne vide pour les champs facultatifs métier.

Téléchargements PDF :
- GET /proformas/:id/pdf
- GET /invoices/:id/pdf
- GET /sales-orders/:orderId/deliveries/:id/pdf
- GET /sales-orders/:orderId/payments/:id/pdf

Récupérer avec Bearer et responseType blob. Traiter également les erreurs JSON éventuelles reçues sous forme de blob. Les exports dashboard sont des CSV ; ne pas interpréter leur contenu comme du JSON.

## 6. Notifications SSE

GET /notifications/stream avec Authorization Bearer. Le service vérifie la session à chaque interrogation toutes les 5 secondes et émet seulement si le contenu a changé. Le flux s'arrête après 60 secondes ou en cas d'erreur d'accès ; le client doit gérer la reconnexion avec un jeton valide et un délai progressif.

EventSource natif ne permet pas d'ajouter un en-tête Authorization standard. Utiliser fetch avec lecture du flux et parseur SSE, ou un client SSE compatible Bearer. L'événement porte le type notifications et un JSON sérialisé dans data. Annuler la connexion à la déconnexion/navigation pertinente. Eviter plusieurs connexions simultanées inutiles.

GET /notifications permet de relire une page. POST /notifications/:id/read et POST /notifications/read-all marquent les événements accessibles comme lus. unread est un compteur utilisateur, non le nombre d'éléments de la page.

## 7. Préparer les écrans

Conserver une couche HTTP par domaine, des types de contrats vérifiés, un service d'authentification et d'erreur commun, des composants réutilisables pour listes, formulaires, pagination, états vides et chargements. Ne pas réimplémenter les transitions financières dans le navigateur. Prévoir des confirmations explicites pour les annulations, clôtures et contrepassations. Le frontend doit rester français, responsive et sans dégradés, conformément à la direction graphique retenue.

Sources : [DTO pagination](../src/infrastructure/http/page-query.dto.ts), [controllers](06-api-commerce.md), [authentification](../src/modules/identity/application/auth.use-cases.ts), [SSE](../src/modules/notifications/application/notifications.service.ts).

# Design system DSolar ERP

Les composants Angular partagés résident dans `src/app/shared/ui`.
La palette, les espaces, la navigation et les boutons restent définis dans `src/styles.css`.
Les primitives communes des formulaires, tableaux et états sont dans `shared/ui/ui.css`.

- PageHeader : titre, contexte, description et actions projetées.
- Feedback : message explicite avec rôle accessible, succès ou erreur.
- StatusBadge : état binaire avec libellé textuel.
- Pagination : page contrôlée par le parent, aucun appel réseau interne.
- EmptyState : absence de données et actions projetées.
- Confirm : confirmation explicite en ligne, sans modifier directement les données.
- Classes ui-field, ui-toolbar, ui-table et ui-actions : conventions communes.

Les composants ne connaissent ni les API, ni les autorisations, ni les règles métier.
Les pages orchestrent leurs services et adaptent leurs données.
Utiliser les mêmes composants pour chaque nouveau module.
Les formulaires restent typés via Reactive Forms ; les autorisations et validations métier restent contrôlées par le serveur.
Aucun dégradé. Toute couleur de statut doit être accompagnée d'un libellé.

## Maquette officielle

La proposition UI/UX DSolar-ERP responsive fournie par le propriétaire du projet est la référence visuelle : navigation claire, fond blanc cassé, accent framboise, pictogrammes linéaires, cartes KPI, graphique et panneaux d'activité, navigation mobile basse. Pas de dégradés.

Les indicateurs sont uniquement ceux réellement retournés par les API. Les liens de navigation sont limités aux modules effectivement disponibles et autorisés. Le logo officiel, la recherche globale, les notifications et les raccourcis métier restent à intégrer.

Le graphique de facturation présente les 12 mois de l'année sélectionnée depuis l'API monthly-revenue. La table conserve les montants exacts ; seules les proportions graphiques sont calculées côté interface, avec une arithmétique entière. Les montants négatifs restent distincts sous l'axe zéro.

## Navigation opérationnelle

La recherche globale interroge les cinq sources existantes autorisées par session : produits, magasins, clients, commandes, factures. Les résultats sont limités aux cinq premières lignes par catégorie et n'exposent que les libellés et références utiles. La recherche respecte les autorisations du serveur ; les liens de détail seront raccordés avec les écrans métier.

Le centre de notifications utilise GET /notifications et le flux SSE /notifications/stream avec le jeton Bearer en en-tête. Le flux est interrompu à la fermeture de session et reconnecté après interruption, sans persistance de jeton. La lecture individuelle et collective est enregistrée exclusivement par le backend.

Le logo officiel fourni est conservé sans altération dans public/d-solar-and-agri.svg. Le raccourci Nouvelle vente ouvre la création d'une proforma brouillon et respecte les permissions commerciales. Les prix et taux sont saisis explicitement ; les totaux et règles métier sont appliqués par NestJS. L'affectation de son propre compte à un magasin est possible avec confirmation et reconnexion obligatoire, conformément au backend.

## Contrôle de fidélité visuelle

La validation doit porter sur les captures réelles à 1440 × 900, 1024 × 768 et 390 × 844, avec contrôle du logo, de la grille KPI, de la disposition des quatre panneaux, des débordements horizontaux et des parcours fonctionnels. Les statistiques de période et la comparaison au mois précédent nécessitent encore des contrats backend dédiés. Les photos de produits, la navigation des modules non livrés et les liens de détail ne doivent pas être simulés.

## Synthèse mensuelle du tableau de bord

Le sélecteur mensuel pilote les indicateurs financiers et le graphique quotidien via GET /dashboard/period?month=AAAA-MM. La facturation est nette des avoirs émis, les encaissements nets des annulations enregistrées. Les commandes comptées sont créées dans le mois et encore confirmées ou livrées. Les dates sont en UTC (heure de Dakar). La comparaison porte sur le mois civil précédent complet, même si le mois sélectionné est en cours ; aucune variation n'est affichée lorsque sa base est nulle ou négative. Le stock et les listes d'activité récente restent des vues instantanées. Le rapport annuel reste accessible dans les rapports détaillés.

## Charte obligatoire pour chaque écran

Les pages métier réutilisent PageHeader, les panneaux .panel, les champs .ui-field, les tableaux .ui-table, les actions .primary/.secondary, les statuts textuels et EmptyState. Les tokens --ui-radius, --ui-control-radius, --ui-panel-border, --ui-panel-shadow et --ui-gap dans shared/ui/ui.css définissent la densité commune. Ne pas réintroduire de styles de boutons, titres ou tableaux propres à un module. La connexion reprend la palette claire et le logo officiel. Les pages d'accueil, compte, accès refusé, magasins, ventes, commandes, alertes et activité utilisent cette même base. Les variations spécifiques au graphique restent dans son module. Les contrôles d'accès et calculs restent inchangés. Les captures à 1440, 1024 et 390 pixels doivent couvrir les pages métier, pas uniquement le dashboard.

## Utilisateurs et menus déroulants

Le module Utilisateurs (permission users.manage) réutilise les primitives partagées. GET /users retourne explicitement status et roleCodes en plus de l'identité publique. La création et les modifications utilisent les DTO NestJS existants, avec les seuls rôles ADMIN et MAGASINIER. La désactivation est définitive dans l'interface actuelle : le backend ne fournit pas de route de réactivation. La désactivation de son propre compte n'est pas proposée. Les droits, révocations de sessions et protections du dernier administrateur sont appliqués au serveur. Aucun secret de compte n'est exposé par la liste.

La directive appDismissOutside ferme les panneaux transitoires lors d'un clic extérieur ou d'Échap, avec restauration du focus sur le déclencheur pour Échap. Les déclencheurs externes explicitement déclarés sont exclus du clic extérieur de leur panneau. Les nouveaux menus doivent réutiliser cette directive ; les filtres natifs select conservent le comportement du navigateur.

## Catalogue des produits

La page Produits utilise les filtres et la pagination du serveur, les références réelles, les DTO du catalogue et le service média authentifié. Le SKU est immuable après création. Les montants sont transmis sous forme de chaînes décimales ; le serveur clôture les périodes tarifaires. Les seuls formats d'image acceptés sont PNG et JPEG, 2 Mio maximum. Les mutations sont réservées à products.manage. Les références disposent d'une liste et d'une modification de libellé. Les catégories sans enfant ni produit et les marques sans produit peuvent être supprimées avec confirmation. Les codes, la hiérarchie existante et les taux fiscaux sont conservés ; un changement de taux exige un nouveau régime. Aucun régime fiscal n'est supprimé.

## Stocks — consultation, ajustements et journal

L'écran /stocks présente quatre compteurs de références (pas de somme de pièces et de mètres), le magasin actif autorisé, les quantités exactes retournées par NestJS, la recherche et une pagination d'affichage. Les ajustements conservent une clé UUID et une commande immuable pendant les tentatives de la même opération. Le journal /inventory/stores/:storeId/movements/search utilise une pagination serveur et inclut les mouvements des produits devenus inactifs. Les droits sont revérifiés côté serveur pour chaque consultation. Les transferts et inventaires physiques seront intégrés dans un lot distinct.

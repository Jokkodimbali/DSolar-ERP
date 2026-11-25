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

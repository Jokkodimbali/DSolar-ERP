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

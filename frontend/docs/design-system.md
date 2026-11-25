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

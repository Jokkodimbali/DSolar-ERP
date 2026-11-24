# Modules métier — responsabilités et frontières

Les modules suivants correspondent aux imports de [AppModule](../src/app.module.ts). Pour les signatures exactes, consulter les références HTTP et les ports d'application. Le tableau ne confère aucun droit d'accès : les guards et les repositories restent la source d'autorisation.

| Module | Responsabilité | Principaux modèles |
| --- | --- | --- |
| [Identity](../src/modules/identity) | Connexion, refresh, logout, compte courant, utilisateurs, accès, initialisation administrateur, limitation de débit | User, Role, Permission, RefreshSession, UserStoreAccess |
| [Stores](../src/modules/stores) | Créer et gérer les magasins, activation et attribution d'accès | Store, UserStoreAccess |
| [Products](../src/modules/products) | Catalogue, marques, catégories, fiscalité, tarifs et recherche | Product, ProductPrice, TaxRegime, Brand, Category |
| [Inventory](../src/modules/inventory) | Quantités disponibles, ajustements, transferts et inventaires physiques | StoreStock, StockMovement, StockTransfer, InventorySession |
| [Procurement](../src/modules/procurement) | Fournisseurs, commandes d'achat, réception, historique des achats et recherche | Supplier, PurchaseOrder, GoodsReceipt |
| [Sales](../src/modules/sales) | Clients, proformas, commandes, factures, avoirs, paiements, livraisons, PDF et rapports | Customer, Proforma, SalesOrder, Invoice, CreditNote, Payment, DeliveryNote |
| [Treasury](../src/modules/treasury) | Caisses, sessions, entrées/sorties, transferts, rapprochement des encaissements, clôture | CashRegister, CashSession, CashMovement |
| [Expenses](../src/modules/expenses) | Catégories, dépenses, approbation, paiement, annulation et remboursement | ExpenseCategory, Expense |
| [SupplierReturns](../src/modules/supplier-returns) | Retours de marchandises, numéros de série et avoirs fournisseurs | SupplierReturn, SupplierReturnLine, SupplierReturnCredit |
| [Accounting](../src/modules/accounting) | Comptes, journaux, périodes, écritures, règles, états financiers, rapprochement bancaire et traitement des sources | LedgerAccount, LedgerEntry, LedgerLine, LedgerBankStatement |
| [Dashboard](../src/modules/dashboard) | Indicateurs, activité, créances, ventes, approvisionnements, valorisation et exports CSV | Agrégats des données métier |
| [Audit](../src/modules/audit) | Consultation filtrée du journal des opérations | AuditLog |
| [Settings](../src/modules/settings) | Informations société, logo, coordonnées, seuil de stock, fuseau et versions immuables | CompanySettings |
| [Notifications](../src/modules/notifications) | Alertes issues des événements d'audit, lecture et flux SSE | AuditLog, NotificationRead |
| [Media](../src/modules/media) | Téléversement sécurisé des logos et photos, lecture authentifiée | ImageAsset |
| [OperationalSearch](../src/modules/operational-search) | Listes paginées opérationnelles et comptables, filtres et recherche en base | Référentiels et modèles des autres modules |

## Coopération entre domaines

- Le catalogue fournit le produit et ses tarifs ; le stock est distinct par magasin. Une photo n'est pas un mouvement de stock.
- Une réception d'achat confirmée augmente le stock ; le retour fournisseur suit le flux inverse sous contrôle de quantité et de traçabilité.
- Une commande client confirmée réserve les quantités ; sa livraison confirmée consomme le stock et libère la réservation correspondante.
- La facturation et les encaissements ont leurs propres états. Le fait qu'une commande soit payée ne signifie pas qu'elle est livrée.
- Une dépense ou un encaissement peut produire une source de trésorerie/comptabilité ; la comptabilisation dépend de la configuration et des règles de source.
- Les rapports sont des vues calculées, pas des écritures métier supplémentaires.
- Les paramètres versionnés et le journal d'audit relient les modules sans modifier rétroactivement les documents émis.

## Périmètre

Deux rôles internes : ADMIN et MAGASINIER. Les droits effectifs et les accès par magasin doivent être vérifiés sur chaque ressource. Le backend ne constitue pas un portail client public ni une passerelle de paiement externe. Les moyens de paiement enregistrent des opérations ; ils ne prouvent pas une exécution chez un opérateur tiers.

Voir [flux métier](03-flux-metier.md), [sécurité](04-securite.md) et [dictionnaire des données](08-data-dictionary.md).

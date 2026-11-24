# Base de données — dictionnaire Prisma

Référence : [schema.prisma](../prisma/schema.prisma), commit `e44804ae427e5227965ca1829f994fc9b1763010`. 69 modèles et 14 énumérations. Les définitions suivantes sont extraites du schéma actuel, pas d'une introspection de Neon. Les migrations complètent ces déclarations par des contraintes et déclencheurs SQL.

## Organisation métier

### Identité et accès

| Modèle | Responsabilité |
| --- | --- |
| `User` | Compte interne et version de révocation des jetons |
| `Role` | Rôle métier |
| `Permission` | Permission élémentaire |
| `UserRole` | Association utilisateur-rôle |
| `RolePermission` | Association rôle-permission |
| `UserStoreAccess` | Accès d'un utilisateur à un magasin |
| `RefreshSession` | Session de renouvellement révocable |
| `AuthRateLimitBucket` | Compteur persistant de limitation des requêtes d'authentification |

### Catalogue et magasins

| Modèle | Responsabilité |
| --- | --- |
| `Store` | Magasin |
| `Product` | Référentiel produit |
| `Category` | Catégorie de produit |
| `Brand` | Marque |
| `TaxRegime` | Régime fiscal |
| `ProductPrice` | Tarif historisé |
| `StoreStock` | Quantité et réservation par magasin et produit |
| `SerialNumber` | Traçabilité des numéros de série |

### Stocks et inventaires

| Modèle | Responsabilité |
| --- | --- |
| `StockMovement` | Journal des variations de stock |
| `StockTransfer` | Transfert intermagasins |
| `StockTransferLine` | Produit et quantité transférés |
| `StockTransferEvent` | Historique des événements du transfert |
| `InventorySession` | Session d'inventaire |
| `InventoryLine` | Comptage par produit |

### Achats

| Modèle | Responsabilité |
| --- | --- |
| `Supplier` | Fournisseur |
| `PurchaseOrder` | Commande d'achat |
| `PurchaseOrderLine` | Ligne d'achat |
| `GoodsReceipt` | Réception fournisseur |
| `GoodsReceiptLine` | Ligne réceptionnée |
| `SupplierReturn` | Retour fournisseur |
| `SupplierReturnLine` | Ligne retournée |
| `SupplierReturnCredit` | Avoir fournisseur |
| `SupplierReturnSerial` | Numéro de série retourné |

### Ventes

| Modèle | Responsabilité |
| --- | --- |
| `Customer` | Client |
| `Proforma` | Devis proforma |
| `ProformaLine` | Ligne de devis |
| `SalesOrder` | Commande client |
| `SalesOrderLine` | Ligne de commande |
| `DeliveryNote` | Bon de livraison |
| `DeliveryLine` | Ligne livrée |
| `Invoice` | Facture |
| `InvoiceLine` | Ligne de facture |
| `CreditNote` | Avoir client |
| `CreditNoteLine` | Ventilation de l'avoir |
| `Payment` | Encaissement |
| `PaymentAllocation` | Affectation à une facture |
| `PaymentReversal` | Contrepassation d'un paiement |
| `DiscountApproval` | Trace d'approbation de remise |
| `DocumentSequence` | Séquence de documents |

### Finance

| Modèle | Responsabilité |
| --- | --- |
| `CashRegister` | Caisse |
| `CashSession` | Session de caisse |
| `CashMovement` | Mouvement de trésorerie |
| `ExpenseCategory` | Catégorie de dépense |
| `Expense` | Dépense |

### Comptabilité

| Modèle | Responsabilité |
| --- | --- |
| `LedgerAccount` | Compte comptable |
| `LedgerJournal` | Journal |
| `LedgerPeriod` | Période comptable |
| `LedgerEntry` | Écriture |
| `LedgerLine` | Ligne débit/crédit |
| `LedgerPostingRule` | Règle de comptabilisation |
| `LedgerAccountClassification` | Classification pour les états financiers |
| `LedgerBankAccount` | Compte bancaire |
| `LedgerBankStatement` | Relevé bancaire |
| `LedgerBankLine` | Ligne bancaire rapprochable |
| `LedgerAutomation` | Configuration de traitement automatique |
| `LedgerAutomationFailure` | Échec de comptabilisation suivi |

### Services transversaux

| Modèle | Responsabilité |
| --- | --- |
| `AuditLog` | Journal d'audit |
| `IdempotencyKey` | Déduplication |
| `CompanySettings` | Version immuable des paramètres |
| `NotificationRead` | Lecture individuelle d'une notification |
| `ImageAsset` | Fichier image binaire |

## Relations, champs et contraintes déclarées

### Store

Magasin.

```prisma
model Store {
  id String @id @default(uuid()) @db.Uuid
  code String @unique @db.VarChar(30)
  name String @db.VarChar(160)
  address String?
  status StoreStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  stocks StoreStock[]
  userAccess UserStoreAccess[]
  stocksOut StockMovement[]
  transfersOut StockTransfer[] @relation("TransferOrigin")
  transfersIn StockTransfer[] @relation("TransferDestination")
  receipts GoodsReceipt[]
  inventories InventorySession[]
  deliveries DeliveryLine[]
  salesLines SalesOrderLine[]
  cashRegisters CashRegister[]
  expenses Expense[]
}
```

### Product

Référentiel produit.

```prisma
model Product {
  imageAssets ImageAsset[]
  id String @id @default(uuid()) @db.Uuid
  sku String @unique @db.VarChar(80)
  name String @db.VarChar(200)
  description String?
  unit String @default("PIECE")
  active Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  stocks StoreStock[]
  categoryId String? @db.Uuid
  brandId String? @db.Uuid
  taxRegimeId String? @db.Uuid
  category Category? @relation(fields:[categoryId],references:[id],onDelete:Restrict)
  brand Brand? @relation(fields:[brandId],references:[id],onDelete:Restrict)
  taxRegime TaxRegime? @relation(fields:[taxRegimeId],references:[id],onDelete:Restrict)
  prices ProductPrice[]
  movements StockMovement[]
  transferLines StockTransferLine[]
  receiptLines GoodsReceiptLine[]
  inventoryLines InventoryLine[]
  proformaLines ProformaLine[]
  salesLines SalesOrderLine[]
  deliveryLines DeliveryLine[]
  invoiceLines InvoiceLine[]
  serials SerialNumber[]
  isSolarPlant Boolean @default(false)
}
```

### StoreStock

Quantité et réservation par magasin et produit.

```prisma
model StoreStock {
  id String @id @default(uuid()) @db.Uuid
  storeId String @db.Uuid
  productId String @db.Uuid
  quantity Decimal @default(0) @db.Decimal(18,3)
  reserved Decimal @default(0) @db.Decimal(18,3)
  store Store @relation(fields:[storeId],references:[id],onDelete:Restrict)
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  updatedAt DateTime @updatedAt
  @@unique([storeId,productId])
  @@index([productId])
}
```

### User

Compte interne et version de révocation des jetons.

```prisma
model User {
  id String @id @default(uuid()) @db.Uuid
  email String @unique @db.VarChar(255)
  fullName String @db.VarChar(180)
  passwordHash String
  status UserStatus @default(ACTIVE)
  tokenVersion Int @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  roles UserRole[]
  stores UserStoreAccess[]
  sessions RefreshSession[]
  auditLogs AuditLog[]
  payments Payment[]
  notificationReads NotificationRead[]
}
```

### Role

Rôle métier.

```prisma
model Role {
  id String @id @default(uuid()) @db.Uuid
  code String @unique @db.VarChar(60)
  name String @db.VarChar(120)
  users UserRole[]
  permissions RolePermission[]
}
```

### Permission

Permission élémentaire.

```prisma
model Permission {
  id String @id @default(uuid()) @db.Uuid
  code String @unique @db.VarChar(100)
  description String @db.VarChar(200)
  roles RolePermission[]
}
```

### UserRole

Association utilisateur-rôle.

```prisma
model UserRole {
  userId String @db.Uuid
  roleId String @db.Uuid
  user User @relation(fields:[userId],references:[id],onDelete:Cascade)
  role Role @relation(fields:[roleId],references:[id],onDelete:Restrict)
  @@id([userId,roleId])
}
```

### RolePermission

Association rôle-permission.

```prisma
model RolePermission {
  roleId String @db.Uuid
  permissionId String @db.Uuid
  role Role @relation(fields:[roleId],references:[id],onDelete:Cascade)
  permission Permission @relation(fields:[permissionId],references:[id],onDelete:Restrict)
  @@id([roleId,permissionId])
}
```

### UserStoreAccess

Accès d'un utilisateur à un magasin.

```prisma
model UserStoreAccess {
  userId String @db.Uuid
  storeId String @db.Uuid
  user User @relation(fields:[userId],references:[id],onDelete:Cascade)
  store Store @relation(fields:[storeId],references:[id],onDelete:Restrict)
  @@id([userId,storeId])
}
```

### RefreshSession

Session de renouvellement révocable.

```prisma
model RefreshSession {
  id String @id @default(uuid()) @db.Uuid
  userId String @db.Uuid
  tokenHash String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields:[userId],references:[id],onDelete:Cascade)
  @@index([userId])
  @@index([expiresAt])
}
```

### Category

Catégorie de produit.

```prisma
model Category {
  id String @id @default(uuid()) @db.Uuid
  code String @unique
  name String
  parentId String? @db.Uuid
  parent Category? @relation("CategoryTree",fields:[parentId],references:[id])
  children Category[] @relation("CategoryTree")
  products Product[]
}
```

### Brand

Marque.

```prisma
model Brand {
  id String @id @default(uuid()) @db.Uuid
  name String @unique
  products Product[]
}
```

### TaxRegime

Régime fiscal.

```prisma
model TaxRegime {
  id String @id @default(uuid()) @db.Uuid
  code String @unique
  name String
  rate Decimal @db.Decimal(7,4)
  legalBasis String?
  validFrom DateTime?
  validTo DateTime?
  products Product[]
}
```

### ProductPrice

Tarif historisé.

```prisma
model ProductPrice {
  id String @id @default(uuid()) @db.Uuid
  productId String @db.Uuid
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  purchasePrice Decimal? @db.Decimal(18,2)
  salePrice Decimal @db.Decimal(18,2)
  validFrom DateTime @default(now())
  validTo DateTime?
  @@index([productId,validFrom])
}
```

### StockMovement

Journal des variations de stock.

```prisma
model StockMovement {
  id String @id @default(uuid()) @db.Uuid
  storeId String @db.Uuid
  productId String @db.Uuid
  store Store @relation(fields:[storeId],references:[id],onDelete:Restrict)
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  type MovementType
  quantity Decimal @db.Decimal(18,3)
  referenceType String
  referenceId String @db.Uuid
  operationKey String @unique
  actorId String? @db.Uuid
  reason String?
  createdAt DateTime @default(now())
  @@index([storeId,productId,createdAt])
  @@index([referenceType,referenceId])
}
```

### SerialNumber

Traçabilité des numéros de série.

```prisma
model SerialNumber {
  id String @id @default(uuid()) @db.Uuid
  productId String @db.Uuid
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  receiptLineId String? @db.Uuid
  receiptLine GoodsReceiptLine? @relation(fields: [receiptLineId], references: [id], onDelete: Restrict)
  returnSelections SupplierReturnSerial[]
  serial String @unique
  currentStoreId String? @db.Uuid
  status String @default("AVAILABLE")
  createdAt DateTime @default(now())
}
```

### StockTransfer

Transfert intermagasins.

```prisma
model StockTransfer {
  id String @id @default(uuid()) @db.Uuid
  number String @unique
  originId String @db.Uuid
  destinationId String @db.Uuid
  origin Store @relation("TransferOrigin",fields:[originId],references:[id],onDelete:Restrict)
  destination Store @relation("TransferDestination",fields:[destinationId],references:[id],onDelete:Restrict)
  status TransferStatus @default(DRAFT)
  createdById String @db.Uuid
  approvedById String? @db.Uuid
  shippedById String? @db.Uuid
  receivedById String? @db.Uuid
  cancelledById String? @db.Uuid
  closedById String? @db.Uuid
  approvedAt DateTime?
  cancelledAt DateTime?
  closedAt DateTime?
  lines StockTransferLine[]
  events StockTransferEvent[]
  createdAt DateTime @default(now())
  shippedAt DateTime?
  receivedAt DateTime?
}
```

### StockTransferLine

Produit et quantité transférés.

```prisma
model StockTransferLine {
  id String @id @default(uuid()) @db.Uuid
  transferId String @db.Uuid
  productId String @db.Uuid
  transfer StockTransfer @relation(fields:[transferId],references:[id],onDelete:Restrict)
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  quantity Decimal @db.Decimal(18,3)
  receivedQuantity Decimal @default(0) @db.Decimal(18,3)
  damagedQuantity Decimal @default(0) @db.Decimal(18,3)
  missingQuantity Decimal @default(0) @db.Decimal(18,3)
  @@unique([transferId,productId])
}
```

### StockTransferEvent

Historique des événements du transfert.

```prisma
model StockTransferEvent {
  id String @id @default(uuid()) @db.Uuid
  transferId String @db.Uuid
  transfer StockTransfer @relation(fields:[transferId],references:[id],onDelete:Restrict)
  actorId String @db.Uuid
  action String @db.VarChar(40)
  operationKey String @unique @db.VarChar(120)
  payload Json?
  createdAt DateTime @default(now())
  @@index([transferId,createdAt])
}
```

### InventorySession

Session d'inventaire.

```prisma
model InventorySession {
  id String @id @default(uuid()) @db.Uuid
  storeId String @db.Uuid
  store Store @relation(fields:[storeId],references:[id],onDelete:Restrict)
  status String @default("DRAFT")
  startedAt DateTime @default(now())
  validatedAt DateTime?
  lines InventoryLine[]
}
```

### InventoryLine

Comptage par produit.

```prisma
model InventoryLine {
  id String @id @default(uuid()) @db.Uuid
  sessionId String @db.Uuid
  productId String @db.Uuid
  session InventorySession @relation(fields:[sessionId],references:[id],onDelete:Restrict)
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  expected Decimal @db.Decimal(18,3)
  counted Decimal? @db.Decimal(18,3)
  reason String?
  @@unique([sessionId,productId])
}
```

### Supplier

Fournisseur.

```prisma
model Supplier {
  id String @id @default(uuid()) @db.Uuid
  name String
  taxId String?
  phone String?
  email String?
  address String?
  active Boolean @default(true)
  orders PurchaseOrder[]
}
```

### PurchaseOrder

Commande d'achat.

```prisma
model PurchaseOrder {
  id String @id @default(uuid()) @db.Uuid
  number String @unique
  supplierId String @db.Uuid
  supplier Supplier @relation(fields:[supplierId],references:[id],onDelete:Restrict)
  status OrderStatus @default(DRAFT)
  orderedAt DateTime @default(now())
  lines PurchaseOrderLine[]
  receipts GoodsReceipt[]
}
```

### PurchaseOrderLine

Ligne d'achat.

```prisma
model PurchaseOrderLine {
  id String @id @default(uuid()) @db.Uuid
  orderId String @db.Uuid
  order PurchaseOrder @relation(fields:[orderId],references:[id],onDelete:Restrict)
  productId String @db.Uuid
  quantity Decimal @db.Decimal(18,3)
  unitCost Decimal @db.Decimal(18,2)
}
```

### GoodsReceipt

Réception fournisseur.

```prisma
model GoodsReceipt {
  id String @id @default(uuid()) @db.Uuid
  number String @unique
  purchaseOrderId String? @db.Uuid
  purchaseOrder PurchaseOrder? @relation(fields:[purchaseOrderId],references:[id],onDelete:Restrict)
  storeId String @db.Uuid
  store Store @relation(fields:[storeId],references:[id],onDelete:Restrict)
  status ReceiptStatus @default(DRAFT)
  receivedAt DateTime?
  lines GoodsReceiptLine[]
  supplierReturns SupplierReturn[]
}
```

### GoodsReceiptLine

Ligne réceptionnée.

```prisma
model GoodsReceiptLine {
  id String @id @default(uuid()) @db.Uuid
  receiptId String @db.Uuid
  productId String @db.Uuid
  receipt GoodsReceipt @relation(fields:[receiptId],references:[id],onDelete:Restrict)
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  quantity Decimal @db.Decimal(18,3)
  unitCost Decimal @db.Decimal(18,2)
  returnLines SupplierReturnLine[]
  serialNumbers SerialNumber[]
}
```

### Customer

Client.

```prisma
model Customer {
  id String @id @default(uuid()) @db.Uuid
  name String
  taxId String?
  phone String?
  email String?
  address String?
  createdAt DateTime @default(now())
  proformas Proforma[]
  orders SalesOrder[]
  invoices Invoice[]
}
```

### Proforma

Devis proforma.

```prisma
model Proforma {
  companySettingsId String? @db.Uuid
  companySettings CompanySettings? @relation(fields: [companySettingsId], references: [id], onDelete: Restrict)
  id String @id @default(uuid()) @db.Uuid
  number String @unique
  customerId String @db.Uuid
  customer Customer @relation(fields:[customerId],references:[id],onDelete:Restrict)
  status DocumentStatus @default(DRAFT)
  issuedAt DateTime?
  expiresAt DateTime?
  total Decimal @default(0) @db.Decimal(18,2)
  lines ProformaLine[]
  salesOrders SalesOrder[]
  createdAt DateTime @default(now())
}
```

### ProformaLine

Ligne de devis.

```prisma
model ProformaLine {
  id String @id @default(uuid()) @db.Uuid
  proformaId String @db.Uuid
  productId String @db.Uuid
  storeId String @db.Uuid
  proforma Proforma @relation(fields:[proformaId],references:[id],onDelete:Restrict)
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  quantity Decimal @db.Decimal(18,3)
  unitPrice Decimal @db.Decimal(18,2)
  discount Decimal @default(0) @db.Decimal(18,2)
  taxRate Decimal @default(0) @db.Decimal(7,4)
  lineTotal Decimal @db.Decimal(18,2)
}
```

### SalesOrder

Commande client.

```prisma
model SalesOrder {
  id String @id @default(uuid()) @db.Uuid
  number String @unique
  customerId String @db.Uuid
  proformaId String? @db.Uuid
  customer Customer @relation(fields:[customerId],references:[id],onDelete:Restrict)
  proforma Proforma? @relation(fields:[proformaId],references:[id],onDelete:Restrict)
  status OrderStatus @default(DRAFT)
  paymentStatus PaymentStatus @default(UNPAID)
  total Decimal @db.Decimal(18,2)
  amountPaid Decimal @default(0) @db.Decimal(18,2)
  createdAt DateTime @default(now())
  lines SalesOrderLine[]
  deliveries DeliveryNote[]
  payments Payment[]
  invoices Invoice[]
  discounts DiscountApproval[]
}
```

### SalesOrderLine

Ligne de commande.

```prisma
model SalesOrderLine {
  id String @id @default(uuid()) @db.Uuid
  orderId String @db.Uuid
  productId String @db.Uuid
  storeId String @db.Uuid
  order SalesOrder @relation(fields:[orderId],references:[id],onDelete:Restrict)
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  store Store @relation(fields:[storeId],references:[id],onDelete:Restrict)
  quantity Decimal @db.Decimal(18,3)
  unitPrice Decimal @db.Decimal(18,2)
  discount Decimal @default(0) @db.Decimal(18,2)
  taxRate Decimal @default(0) @db.Decimal(7,4)
  lineTotal Decimal @db.Decimal(18,2)
}
```

### DeliveryNote

Bon de livraison.

```prisma
model DeliveryNote {
  companySettingsId String? @db.Uuid
  companySettings CompanySettings? @relation(fields: [companySettingsId], references: [id], onDelete: Restrict)
  id String @id @default(uuid()) @db.Uuid
  number String @unique
  orderId String @db.Uuid
  order SalesOrder @relation(fields:[orderId],references:[id],onDelete:Restrict)
  status ReceiptStatus @default(DRAFT)
  deliveredAt DateTime?
  lines DeliveryLine[]
}
```

### DeliveryLine

Ligne livrée.

```prisma
model DeliveryLine {
  id String @id @default(uuid()) @db.Uuid
  deliveryId String @db.Uuid
  productId String @db.Uuid
  storeId String @db.Uuid
  delivery DeliveryNote @relation(fields:[deliveryId],references:[id],onDelete:Restrict)
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  store Store @relation(fields:[storeId],references:[id],onDelete:Restrict)
  quantity Decimal @db.Decimal(18,3)
}
```

### Invoice

Facture.

```prisma
model Invoice {
  companySettingsId String? @db.Uuid
  companySettings CompanySettings? @relation(fields: [companySettingsId], references: [id], onDelete: Restrict)
  id String @id @default(uuid()) @db.Uuid
  number String @unique
  customerId String @db.Uuid
  orderId String? @db.Uuid
  customer Customer @relation(fields:[customerId],references:[id],onDelete:Restrict)
  order SalesOrder? @relation(fields:[orderId],references:[id],onDelete:Restrict)
  status InvoiceStatus @default(DRAFT)
  issuedAt DateTime?
  totalHt Decimal @db.Decimal(18,2)
  totalTax Decimal @db.Decimal(18,2)
  totalTtc Decimal @db.Decimal(18,2)
  lines InvoiceLine[]
  creditNotes CreditNote[]
  allocations PaymentAllocation[]
}
```

### InvoiceLine

Ligne de facture.

```prisma
model InvoiceLine {
  id String @id @default(uuid()) @db.Uuid
  invoiceId String @db.Uuid
  productId String @db.Uuid
  invoice Invoice @relation(fields:[invoiceId],references:[id],onDelete:Restrict)
  product Product @relation(fields:[productId],references:[id],onDelete:Restrict)
  quantity Decimal @db.Decimal(18,3)
  unitPrice Decimal @db.Decimal(18,2)
  discount Decimal @default(0) @db.Decimal(18,2)
  taxRate Decimal @db.Decimal(7,4)
  taxAmount Decimal @db.Decimal(18,2)
  lineTotal Decimal @db.Decimal(18,2)
  creditLines CreditNoteLine[]
}
```

### CreditNote

Avoir client.

```prisma
model CreditNote {
  id String @id @default(uuid()) @db.Uuid
  number String @unique
  invoiceId String @db.Uuid
  invoice Invoice @relation(fields:[invoiceId],references:[id],onDelete:Restrict)
  amount Decimal @db.Decimal(18,2)
  reason String
  issuedAt DateTime?
  netAmount Decimal? @db.Decimal(18,2)
  taxAmount Decimal? @db.Decimal(18,2)
  lines CreditNoteLine[]
}
```

### Payment

Encaissement.

```prisma
model Payment {
  companySettingsId String? @db.Uuid
  companySettings CompanySettings? @relation(fields: [companySettingsId], references: [id], onDelete: Restrict)
  id String @id @default(uuid()) @db.Uuid
  orderId String @db.Uuid
  order SalesOrder @relation(fields:[orderId],references:[id],onDelete:Restrict)
  receivedById String @db.Uuid
  receivedBy User @relation(fields:[receivedById],references:[id],onDelete:Restrict)
  installmentNumber Int
  amount Decimal @db.Decimal(18,2)
  method PaymentMethod
  externalReference String?
  idempotencyKey String @unique
  receivedAt DateTime @default(now())
  allocations PaymentAllocation[]
  reversals PaymentReversal[]
  cashMovement CashMovement?
  @@unique([orderId,installmentNumber])
}
```

### PaymentAllocation

Affectation à une facture.

```prisma
model PaymentAllocation {
  id String @id @default(uuid()) @db.Uuid
  paymentId String @db.Uuid
  invoiceId String @db.Uuid
  payment Payment @relation(fields:[paymentId],references:[id],onDelete:Restrict)
  invoice Invoice @relation(fields:[invoiceId],references:[id],onDelete:Restrict)
  amount Decimal @db.Decimal(18,2)
  @@unique([paymentId,invoiceId])
}
```

### PaymentReversal

Contrepassation d'un paiement.

```prisma
model PaymentReversal {
  id String @id @default(uuid()) @db.Uuid
  paymentId String @db.Uuid
  payment Payment @relation(fields:[paymentId],references:[id],onDelete:Restrict)
  amount Decimal @db.Decimal(18,2)
  reason String
  createdAt DateTime @default(now())
}
```

### DiscountApproval

Trace d'approbation de remise.

```prisma
model DiscountApproval {
  id String @id @default(uuid()) @db.Uuid
  orderId String @db.Uuid
  order SalesOrder @relation(fields:[orderId],references:[id],onDelete:Restrict)
  type DiscountType
  value Decimal @db.Decimal(18,2)
  reason String?
  approvedById String? @db.Uuid
  approvedAt DateTime?
}
```

### DocumentSequence

Séquence de documents.

```prisma
model DocumentSequence {
  id String @id @default(uuid()) @db.Uuid
  type String
  period String
  nextNumber Int @default(1)
  @@unique([type,period])
}
```

### AuditLog

Journal d'audit.

```prisma
model AuditLog {
  id String @id @default(uuid()) @db.Uuid
  actorId String? @db.Uuid
  actor User? @relation(fields:[actorId],references:[id],onDelete:SetNull)
  action String
  entityType String
  entityId String
  storeId String? @db.Uuid
  payload Json?
  createdAt DateTime @default(now())
  notificationReads NotificationRead[]
  @@index([entityType,entityId,createdAt])
  @@index([createdAt, id])
  @@index([actorId, createdAt, id])
  @@index([storeId, createdAt, id])
}
```

### IdempotencyKey

Déduplication.

```prisma
model IdempotencyKey {
  key String @id
  operation String
  response Json?
  createdAt DateTime @default(now())
}
```

### CashRegister

Caisse.

```prisma
model CashRegister {
  id String @id @default(uuid()) @db.Uuid
  storeId String @db.Uuid
  name String @db.VarChar(100)
  store Store @relation(fields: [storeId], references: [id], onDelete: Restrict)
  sessions CashSession[]
  @@unique([storeId, name])
}
```

### CashSession

Session de caisse.

```prisma
model CashSession {
  id String @id @default(uuid()) @db.Uuid
  registerId String @db.Uuid
  register CashRegister @relation(fields: [registerId], references: [id], onDelete: Restrict)
  opening Decimal @db.Decimal(18,2)
  openedBy String @db.Uuid
  openedAt DateTime @default(now())
  closedAt DateTime?
  closedBy String? @db.Uuid
  counted Decimal? @db.Decimal(18,2)
  expected Decimal? @db.Decimal(18,2)
  movements CashMovement[]
  @@index([registerId, closedAt])
}
```

### CashMovement

Mouvement de trésorerie.

```prisma
model CashMovement {
  id String @id @default(uuid()) @db.Uuid
  sessionId String @db.Uuid
  session CashSession @relation(fields: [sessionId], references: [id], onDelete: Restrict)
  amount Decimal @db.Decimal(18,2)
  reason String @db.VarChar(200)
  expensePayment Expense? @relation("ExpensePayment")
  expenseRefund Expense? @relation("ExpenseRefund")
  transferKey String? @db.Uuid
  reversalOfId String? @unique @db.Uuid
  reversalOf CashMovement? @relation("CashReversal", fields: [reversalOfId], references: [id], onDelete: Restrict)
  reversal CashMovement? @relation("CashReversal")
  paymentId String? @unique @db.Uuid
  payment Payment? @relation(fields: [paymentId], references: [id], onDelete: Restrict)
  operationKey String @unique @db.Uuid
  actorId String @db.Uuid
  createdAt DateTime @default(now())
  @@index([sessionId, createdAt])
  @@index([transferKey])
}
```

### ExpenseCategory

Catégorie de dépense.

```prisma
model ExpenseCategory {
  id String @id @default(uuid()) @db.Uuid
  name String @unique @db.VarChar(100)
  expenses Expense[]
}
```

### Expense

Dépense.

```prisma
model Expense {
  id String @id @default(uuid()) @db.Uuid
  storeId String @db.Uuid
  store Store @relation(fields: [storeId], references: [id], onDelete: Restrict)
  categoryId String @db.Uuid
  category ExpenseCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  description String @db.VarChar(500)
  amount Decimal @db.Decimal(18,2)
  status ExpenseStatus @default(DRAFT)
  operationKey String @unique @db.Uuid
  createdBy String @db.Uuid
  createdAt DateTime @default(now())
  approvedAt DateTime?
  approvedBy String? @db.Uuid
  paidAt DateTime?
  paidBy String? @db.Uuid
  method PaymentMethod?
  reference String? @db.VarChar(200)
  cashMovementId String? @unique @db.Uuid
  cashMovement CashMovement? @relation("ExpensePayment", fields: [cashMovementId], references: [id], onDelete: Restrict)
  refundMovementId String? @unique @db.Uuid
  refundMovement CashMovement? @relation("ExpenseRefund", fields: [refundMovementId], references: [id], onDelete: Restrict)
  endedAt DateTime?
  endedBy String? @db.Uuid
  endReason String? @db.VarChar(500)
  @@index([storeId, status, createdAt])
  @@index([categoryId])
}
```

### SupplierReturn

Retour fournisseur.

```prisma
model SupplierReturn {
  id String @id @default(uuid()) @db.Uuid
  receiptId String @db.Uuid
  receipt GoodsReceipt @relation(fields: [receiptId], references: [id], onDelete: Restrict)
  operationKey String @unique @db.Uuid
  reason String @db.VarChar(500)
  status SupplierReturnStatus @default(DRAFT)
  total Decimal @db.Decimal(18,2)
  createdBy String @db.Uuid
  createdAt DateTime @default(now())
  confirmedBy String? @db.Uuid
  confirmedAt DateTime?
  cancelledBy String? @db.Uuid
  cancelledAt DateTime?
  cancellationReason String? @db.VarChar(500)
  lines SupplierReturnLine[]
  credit SupplierReturnCredit?
  @@index([receiptId, status])
  @@index([createdAt])
}
```

### SupplierReturnLine

Ligne retournée.

```prisma
model SupplierReturnLine {
  id String @id @default(uuid()) @db.Uuid
  returnId String @db.Uuid
  supplierReturn SupplierReturn @relation(fields: [returnId], references: [id], onDelete: Restrict)
  receiptLineId String @db.Uuid
  receiptLine GoodsReceiptLine @relation(fields: [receiptLineId], references: [id], onDelete: Restrict)
  quantity Decimal @db.Decimal(18,3)
  unitCost Decimal @db.Decimal(18,2)
  total Decimal @db.Decimal(18,2)
  serials SupplierReturnSerial[]
  @@unique([returnId, receiptLineId])
  @@index([receiptLineId])
}
```

### SupplierReturnCredit

Avoir fournisseur.

```prisma
model SupplierReturnCredit {
  id String @id @default(uuid()) @db.Uuid
  returnId String @unique @db.Uuid
  supplierReturn SupplierReturn @relation(fields: [returnId], references: [id], onDelete: Restrict)
  reference String @db.VarChar(100)
  supplierId String @db.Uuid
  amount Decimal @db.Decimal(18,2)
  recordedBy String @db.Uuid
  recordedAt DateTime @default(now())
  @@unique([supplierId, reference])
}
```

### SupplierReturnSerial

Numéro de série retourné.

```prisma
model SupplierReturnSerial {
  returnLineId String @db.Uuid
  serialId String @db.Uuid
  returnLine SupplierReturnLine @relation(fields: [returnLineId], references: [id], onDelete: Restrict)
  serial SerialNumber @relation(fields: [serialId], references: [id], onDelete: Restrict)
  @@id([returnLineId, serialId])
  @@index([serialId])
}
```

### LedgerAccount

Compte comptable.

```prisma
model LedgerAccount {
  id String @id @default(uuid()) @db.Uuid
  code String @unique @db.VarChar(30)
  name String @db.VarChar(160)
  lines LedgerLine[]
  classification LedgerAccountClassification?
  bankAccount LedgerBankAccount?
  debitRules LedgerPostingRule[] @relation("RuleDebit")
  creditRules LedgerPostingRule[] @relation("RuleCredit")
  taxRules LedgerPostingRule[] @relation("RuleTax")
}
```

### LedgerJournal

Journal.

```prisma
model LedgerJournal {
  id String @id @default(uuid()) @db.Uuid
  code String @unique @db.VarChar(30)
  name String @db.VarChar(160)
  entries LedgerEntry[]
  postingRules LedgerPostingRule[]
}
```

### LedgerPeriod

Période comptable.

```prisma
model LedgerPeriod {
  id String @id @default(uuid()) @db.Uuid
  name String @unique @db.VarChar(100)
  startsAt DateTime @db.Date
  endsAt DateTime @db.Date
  closedAt DateTime?
  closedBy String? @db.Uuid
  automation LedgerAutomation?
  entries LedgerEntry[]
}
```

### LedgerEntry

Écriture.

```prisma
model LedgerEntry {
  id String @id @default(uuid()) @db.Uuid
  journalId String @db.Uuid
  journal LedgerJournal @relation(fields: [journalId], references: [id], onDelete: Restrict)
  periodId String @db.Uuid
  period LedgerPeriod @relation(fields: [periodId], references: [id], onDelete: Restrict)
  date DateTime @db.Date
  description String @db.VarChar(500)
  operationKey String @unique @db.Uuid
  actorId String @db.Uuid
  createdAt DateTime @default(now())
  postedAt DateTime?
  reversalOfId String? @unique @db.Uuid
  reversalOf LedgerEntry? @relation("LedgerReversal", fields: [reversalOfId], references: [id], onDelete: Restrict)
  reversal LedgerEntry? @relation("LedgerReversal")
  sourceType String? @db.VarChar(40)
  sourceId String? @db.Uuid
  lines LedgerLine[]
  @@unique([sourceType, sourceId])
  @@index([periodId, date, id])
  @@index([journalId, date])
}
```

### LedgerLine

Ligne débit/crédit.

```prisma
model LedgerLine {
  id String @id @default(uuid()) @db.Uuid
  entryId String @db.Uuid
  entry LedgerEntry @relation(fields: [entryId], references: [id], onDelete: Restrict)
  accountId String @db.Uuid
  account LedgerAccount @relation(fields: [accountId], references: [id], onDelete: Restrict)
  debit Decimal @db.Decimal(18,2)
  credit Decimal @db.Decimal(18,2)
  bankMatch LedgerBankLine?
  @@index([entryId])
  @@index([accountId])
}
```

### LedgerPostingRule

Règle de comptabilisation.

```prisma
model LedgerPostingRule {
  key String @id @db.VarChar(120)
  journalId String @db.Uuid
  journal LedgerJournal @relation(fields: [journalId], references: [id], onDelete: Restrict)
  debitAccountId String @db.Uuid
  debitAccount LedgerAccount @relation("RuleDebit", fields: [debitAccountId], references: [id], onDelete: Restrict)
  creditAccountId String @db.Uuid
  creditAccount LedgerAccount @relation("RuleCredit", fields: [creditAccountId], references: [id], onDelete: Restrict)
  taxAccountId String? @db.Uuid
  taxAccount LedgerAccount? @relation("RuleTax", fields: [taxAccountId], references: [id], onDelete: Restrict)
  updatedAt DateTime @updatedAt
}
```

### LedgerAccountClassification

Classification pour les états financiers.

```prisma
model LedgerAccountClassification {
  accountId String @id @db.Uuid
  account LedgerAccount @relation(fields: [accountId], references: [id], onDelete: Restrict)
  category LedgerAccountClass
  classifiedBy String @db.Uuid
  classifiedAt DateTime @default(now())
}
```

### LedgerBankAccount

Compte bancaire.

```prisma
model LedgerBankAccount {
  id String @id @default(uuid()) @db.Uuid
  accountId String @unique @db.Uuid
  account LedgerAccount @relation(fields: [accountId], references: [id], onDelete: Restrict)
  name String @db.VarChar(160)
  revision Int @default(0)
  statements LedgerBankStatement[]
}
```

### LedgerBankStatement

Relevé bancaire.

```prisma
model LedgerBankStatement {
  id String @id @default(uuid()) @db.Uuid
  bankAccountId String @db.Uuid
  bankAccount LedgerBankAccount @relation(fields: [bankAccountId], references: [id], onDelete: Restrict)
  reference String @db.VarChar(100)
  startsAt DateTime @db.Date
  endsAt DateTime @db.Date
  opening Decimal @db.Decimal(18,2)
  closing Decimal @db.Decimal(18,2)
  createdBy String @db.Uuid
  createdAt DateTime @default(now())
  closedBy String? @db.Uuid
  closedAt DateTime?
  lines LedgerBankLine[]
  @@unique([bankAccountId, reference])
  @@index([bankAccountId, startsAt, endsAt])
}
```

### LedgerBankLine

Ligne bancaire rapprochable.

```prisma
model LedgerBankLine {
  id String @id @default(uuid()) @db.Uuid
  statementId String @db.Uuid
  statement LedgerBankStatement @relation(fields: [statementId], references: [id], onDelete: Restrict)
  reference String @db.VarChar(100)
  date DateTime @db.Date
  description String @db.VarChar(500)
  amount Decimal @db.Decimal(18,2)
  ledgerLineId String? @unique @db.Uuid
  ledgerLine LedgerLine? @relation(fields: [ledgerLineId], references: [id], onDelete: Restrict)
  matchedBy String? @db.Uuid
  matchedAt DateTime?
  @@unique([statementId, reference])
  @@index([statementId, date])
}
```

### LedgerAutomation

Configuration de traitement automatique.

```prisma
model LedgerAutomation {
  periodId String @id @db.Uuid
  period LedgerPeriod @relation(fields: [periodId], references: [id], onDelete: Restrict)
  enabled Boolean @default(false)
  actorId String @db.Uuid
  revision Int @default(0)
  updatedAt DateTime @updatedAt
  failures LedgerAutomationFailure[]
}
```

### LedgerAutomationFailure

Échec de comptabilisation suivi.

```prisma
model LedgerAutomationFailure {
  periodId String @db.Uuid
  automation LedgerAutomation @relation(fields: [periodId], references: [periodId], onDelete: Restrict)
  sourceType String @db.VarChar(40)
  sourceId String @db.Uuid
  attempts Int @default(1)
  lastError String @db.VarChar(500)
  nextAttemptAt DateTime
  updatedAt DateTime @updatedAt
  @@id([periodId, sourceType, sourceId])
  @@index([periodId, nextAttemptAt])
}
```

### CreditNoteLine

Ventilation de l'avoir.

```prisma
model CreditNoteLine {
  id String @id @default(uuid()) @db.Uuid
  creditNoteId String @db.Uuid
  creditNote CreditNote @relation(fields: [creditNoteId], references: [id], onDelete: Restrict)
  invoiceLineId String @db.Uuid
  invoiceLine InvoiceLine @relation(fields: [invoiceLineId], references: [id], onDelete: Restrict)
  netAmount Decimal @db.Decimal(18,2)
  taxAmount Decimal @db.Decimal(18,2)
  @@unique([creditNoteId, invoiceLineId])
  @@index([invoiceLineId])
}
```

### AuthRateLimitBucket

Compteur persistant de limitation des requêtes d'authentification.

```prisma
model AuthRateLimitBucket {
  key String @id @db.VarChar(64)
  count Int
  expiresAt DateTime
  @@index([expiresAt])
}
```

### CompanySettings

Version immuable des paramètres.

```prisma
model CompanySettings {
  proformas Proforma[]
  invoices Invoice[]
  deliveries DeliveryNote[]
  payments Payment[]
  id String @id @default(uuid()) @db.Uuid
  revision Int @unique
  legalName String @db.VarChar(180)
  tradeName String @db.VarChar(180)
  taxId String @db.VarChar(80)
  registrationNumber String @db.VarChar(100)
  legalForm String @db.VarChar(100)
  address String @db.VarChar(500)
  phone String @db.VarChar(60)
  email String @db.VarChar(254)
  website String @db.VarChar(300)
  logoUrl String @db.VarChar(500)
  bankName String @db.VarChar(180)
  bankAccount String @db.VarChar(180)
  documentFooter String @db.VarChar(500)
  timeZone String @default("Africa/Dakar") @db.VarChar(80)
  notificationsEnabled Boolean @default(true)
  lowStockThreshold Int @default(5)
  createdAt DateTime @default(now())
}
```

### NotificationRead

Lecture individuelle d'une notification.

```prisma
model NotificationRead {
  userId String @db.Uuid
  auditId String @db.Uuid
  readAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  audit AuditLog @relation(fields: [auditId], references: [id], onDelete: Restrict)
  @@id([userId, auditId])
  @@index([auditId])
}
```

### ImageAsset

Fichier image binaire.

```prisma
model ImageAsset {
  id String @id @default(uuid()) @db.Uuid
  kind String @db.VarChar(20)
  productId String? @db.Uuid
  product Product? @relation(fields: [productId], references: [id], onDelete: Restrict)
  mimeType String @db.VarChar(20)
  data Bytes
  createdAt DateTime @default(now())
  @@index([productId, createdAt, id])
}
```

## Énumérations

```prisma
enum StoreStatus {
  ACTIVE
  INACTIVE
}
```

```prisma
enum UserStatus {
  ACTIVE
  DISABLED
}
```

```prisma
enum MovementType {
  RECEIPT
  DELIVERY
  TRANSFER_OUT
  TRANSFER_IN
  INVENTORY_ADJUSTMENT
  RETURN_IN
  RETURN_OUT
  SITE_CONSUMPTION
  DAMAGE
  LOSS
}
```

```prisma
enum DocumentStatus {
  DRAFT
  ISSUED
  ACCEPTED
  CANCELLED
  EXPIRED
}
```

```prisma
enum OrderStatus {
  DRAFT
  CONFIRMED
  PARTIALLY_DELIVERED
  DELIVERED
  CANCELLED
}
```

```prisma
enum TransferStatus {
  DRAFT
  APPROVED
  SHIPPED
  RECEIVED
  CLOSED_WITH_DISCREPANCY
  CANCELLED
}
```

```prisma
enum ReceiptStatus {
  DRAFT
  CONFIRMED
  CANCELLED
}
```

```prisma
enum PaymentStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
}
```

```prisma
enum PaymentMethod {
  CASH
  BANK_TRANSFER
  CHEQUE
  MOBILE_MONEY
  OTHER
}
```

```prisma
enum InvoiceStatus {
  DRAFT
  ISSUED
  CANCELLED
}
```

```prisma
enum DiscountType {
  PERCENTAGE
  FIXED_AMOUNT
}
```

```prisma
enum ExpenseStatus {
  DRAFT
  APPROVED
  PAID
  CANCELLED
  REFUNDED
}
```

```prisma
enum SupplierReturnStatus {
  DRAFT
  CONFIRMED
  CANCELLED
}
```

```prisma
enum LedgerAccountClass {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}
```

## Migrations versionnées

Les fichiers SQL sont la source de vérité des contraintes supplémentaires. Ne jamais régénérer une migration déjà appliquée.

- [20261112_initial](../prisma/migrations/20261112_initial/migration.sql)
- [20261112_integrity_constraints](../prisma/migrations/20261112_integrity_constraints/migration.sql)
- [20261116_price_period_integrity](../prisma/migrations/20261116_price_period_integrity/migration.sql)
- [20261119_invoice_order_uniqueness](../prisma/migrations/20261119_invoice_order_uniqueness/migration.sql)
- [20261119_sales_order_conversion](../prisma/migrations/20261119_sales_order_conversion/migration.sql)
- [20261119_sales_permissions](../prisma/migrations/20261119_sales_permissions/migration.sql)
- [20261119_two_internal_roles](../prisma/migrations/20261119_two_internal_roles/migration.sql)
- [20261124_treasury](../prisma/migrations/20261124_treasury/migration.sql)
- [20261124_treasury_operations](../prisma/migrations/20261124_treasury_operations/migration.sql)
- [20261125_expenses](../prisma/migrations/20261125_expenses/migration.sql)
- [20261125_supplier_returns](../prisma/migrations/20261125_supplier_returns/migration.sql)
- [20261126_supplier_return_serials](../prisma/migrations/20261126_supplier_return_serials/migration.sql)
- [20261127_accounting](../prisma/migrations/20261127_accounting/migration.sql)
- [20261128_accounting_sources](../prisma/migrations/20261128_accounting_sources/migration.sql)
- [20261129_ledger_integrity](../prisma/migrations/20261129_ledger_integrity/migration.sql)
- [20261130_ledger_concurrency](../prisma/migrations/20261130_ledger_concurrency/migration.sql)
- [20261201_ledger_statements](../prisma/migrations/20261201_ledger_statements/migration.sql)
- [20261202_bank_reconciliation](../prisma/migrations/20261202_bank_reconciliation/migration.sql)
- [20261203_ledger_automation](../prisma/migrations/20261203_ledger_automation/migration.sql)
- [20261204_credit_note_tax](../prisma/migrations/20261204_credit_note_tax/migration.sql)
- [20261205_credit_integrity_security](../prisma/migrations/20261205_credit_integrity_security/migration.sql)
- [20261206_auth_rate_limit](../prisma/migrations/20261206_auth_rate_limit/migration.sql)
- [20261207_audit_append_only](../prisma/migrations/20261207_audit_append_only/migration.sql)
- [20261208_ledger_source_security](../prisma/migrations/20261208_ledger_source_security/migration.sql)
- [20261209_company_settings_notifications](../prisma/migrations/20261209_company_settings_notifications/migration.sql)
- [20261210_company_document_snapshot_stock_alert](../prisma/migrations/20261210_company_document_snapshot_stock_alert/migration.sql)
- [20261211_uploaded_images](../prisma/migrations/20261211_uploaded_images/migration.sql)
- [20261212_company_timezone](../prisma/migrations/20261212_company_timezone/migration.sql)

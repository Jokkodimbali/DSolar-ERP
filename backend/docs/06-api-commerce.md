# API — Achats, ventes, retours, facturation et règlements

Toutes les routes incluent `/api/v1`. Les permissions déclarées ne remplacent pas les contrôles de magasin, d'état ou de rôle du repository. `@CurrentUserId()` est injecté par le serveur. Les montants et quantités sont validés selon le DTO ; conserver les chaînes décimales lorsqu'elles sont exigées. Voir [flux métier](03-flux-metier.md).

## goods-receipts

[Controller source](../src/modules/procurement/presentation/goods-receipts.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/goods-receipts` | inventory.read | `list` |
| GET | `/api/v1/goods-receipts/:id` | inventory.read | `get` |
| POST | `/api/v1/goods-receipts` | inventory.manage | `create` |
| POST | `/api/v1/goods-receipts/:id/cancel` | inventory.manage | `cancel` |
| POST | `/api/v1/goods-receipts/:id/confirm` | inventory.manage | `confirm` |

```typescript
list(@CurrentUserId() actorId: string)
get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
create(@Body() dto: CreateGoodsReceiptDto, @CurrentUserId() actorId: string)
cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

DTO définis dans ce controller :

```typescript
class ReceiptLineDto {
  @IsUUID() productId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitCost!: number;
}

class CreateGoodsReceiptDto {
  @IsString() @IsNotEmpty() @MaxLength(100) number!: string;
  @IsUUID() purchaseOrderId!: string;
  @IsUUID() storeId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
}
```

## procurement-search

[Controller source](../src/modules/procurement/presentation/procurement-search.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/suppliers/search` | inventory.read | `suppliers` |
| GET | `/api/v1/purchase-orders/search` | inventory.read | `orders` |
| GET | `/api/v1/goods-receipts/search` | inventory.read | `receipts` |

```typescript
suppliers(@CurrentUserId() actor: string, @Query() query: ProcurementQueryDto)
orders(@CurrentUserId() actor: string, @Query() query: ProcurementQueryDto)
receipts(@CurrentUserId() actor: string, @Query() query: ProcurementQueryDto)
```

DTO définis dans ce controller :

```typescript
class ProcurementQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['true', 'false']) active?: string;
  @IsOptional() @IsIn(['true', 'false']) outstanding?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() storeId?: string;
}
```

## purchase-orders

[Controller source](../src/modules/procurement/presentation/purchase-orders.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/purchase-orders` | inventory.read | `list` |
| GET | `/api/v1/purchase-orders/outstanding` | inventory.read | `outstanding` |
| GET | `/api/v1/purchase-orders/:id` | inventory.read | `get` |
| GET | `/api/v1/purchase-orders/:id/progress` | inventory.read | `progress` |
| POST | `/api/v1/purchase-orders` | inventory.manage | `create` |
| POST | `/api/v1/purchase-orders/:id/cancel` | inventory.manage | `cancel` |
| POST | `/api/v1/purchase-orders/:id/confirm` | inventory.manage | `confirm` |

```typescript
list()
outstanding()
get(@Param('id', ParseUUIDPipe) id: string)
progress(@Param('id', ParseUUIDPipe) id: string,)
create(@Body() dto: CreatePurchaseOrderDto, @CurrentUserId() actorId: string,)
cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

DTO définis dans ce controller :

```typescript
class PurchaseOrderLineDto {
  @IsUUID() productId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitCost!: number;
}

class CreatePurchaseOrderDto {
  @IsString() @IsNotEmpty() @MaxLength(100) number!: string;
  @IsUUID() supplierId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}
```

## supplier-purchases

[Controller source](../src/modules/procurement/presentation/supplier-purchases.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/suppliers/:id/purchases-summary` | users.manage | `summary` |

```typescript
summary(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

## suppliers

[Controller source](../src/modules/procurement/presentation/suppliers.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/suppliers` | inventory.read | `list` |
| GET | `/api/v1/suppliers/:id` | inventory.read | `get` |
| POST | `/api/v1/suppliers` | inventory.manage | `create` |
| PATCH | `/api/v1/suppliers/:id` | inventory.manage | `update` |
| POST | `/api/v1/suppliers/:id/activate` | inventory.manage | `activate` |
| POST | `/api/v1/suppliers/:id/deactivate` | inventory.manage | `deactivate` |

```typescript
list()
get(@Param('id', ParseUUIDPipe) id: string)
create(@Body() dto: SupplierDto, @CurrentUserId() actorId: string,)
update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto, @CurrentUserId() actorId: string,)
activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

DTO définis dans ce controller :

```typescript
export class SupplierDto {
  @IsString() @IsNotEmpty() @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(100) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) name?: string;
  @IsOptional() @IsString() @MaxLength(100) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
```

## commercial-search

[Controller source](../src/modules/sales/presentation/commercial-search.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/customers/search` | sales.read | `customers` |
| GET | `/api/v1/proformas/search` | sales.read | `proformas` |
| GET | `/api/v1/sales-orders/search` | sales.read | `orders` |
| GET | `/api/v1/invoices/search` | sales.read | `invoices` |
| GET | `/api/v1/deliveries/search` | sales.read | `deliveries` |
| GET | `/api/v1/payments/search` | sales.read | `payments` |
| GET | `/api/v1/credit-notes/search` | sales.read | `creditNotes` |

```typescript
customers(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto)
proformas(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto)
orders(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto)
invoices(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto)
deliveries(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto)
payments(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto)
creditNotes(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto)
```

DTO définis dans ce controller :

```typescript
class CommercialQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() storeId?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
}
```

## credit-notes

[Controller source](../src/modules/sales/presentation/credit-notes.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/invoices/:invoiceId/credit-notes` | sales.read | `list` |
| POST | `/api/v1/invoices/:invoiceId/credit-notes` | sales.manage | `issue` |

```typescript
list(@Param('invoiceId', ParseUUIDPipe) invoiceId: string, @CurrentUserId() actorId: string)
issue(@Param('invoiceId', ParseUUIDPipe) invoiceId: string, @CurrentUserId() actorId: string, @Body() input: IssueCreditNoteDto,)
```

## customers

[Controller source](../src/modules/sales/presentation/customers.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/customers` | sales.read | `list` |
| GET | `/api/v1/customers/:id` | sales.read | `get` |
| POST | `/api/v1/customers` | sales.manage | `create` |
| PATCH | `/api/v1/customers/:id` | sales.manage | `update` |

```typescript
list()
get(@Param('id', ParseUUIDPipe) id: string)
create(@Body() dto: CreateCustomerDto)
update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto)
```

DTO définis dans ce controller :

```typescript
export class CreateCustomerDto {
  @IsString() @IsNotEmpty() @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(100) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) name?: string;
  @IsOptional() @IsString() @MaxLength(100) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
```

## deliveries

[Controller source](../src/modules/sales/presentation/deliveries.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| POST | `/api/v1/sales-orders/:orderId/deliveries` | sales.manage | `create` |
| POST | `/api/v1/sales-orders/:orderId/deliveries/:deliveryId/confirm` | sales.manage | `confirm` |
| POST | `/api/v1/sales-orders/:orderId/deliveries/:deliveryId/cancel` | sales.manage | `cancel` |
| GET | `/api/v1/sales-orders/:orderId/deliveries` | sales.read | `list` |
| GET | `/api/v1/sales-orders/:orderId/deliveries/:deliveryId` | sales.read | `get` |

```typescript
create(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string, @Body() input: CreateDeliveryDto,)
confirm(@Param('orderId', ParseUUIDPipe) orderId: string, @Param('deliveryId', ParseUUIDPipe) deliveryId: string, @CurrentUserId() actorId: string,)
cancel(@Param('orderId', ParseUUIDPipe) orderId: string, @Param('deliveryId', ParseUUIDPipe) deliveryId: string, @CurrentUserId() actorId: string,)
list(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string)
get(@Param('orderId', ParseUUIDPipe) orderId: string, @Param('deliveryId', ParseUUIDPipe) deliveryId: string, @CurrentUserId() actorId: string,)
```

## invoices

[Controller source](../src/modules/sales/presentation/invoices.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/invoices` | sales.read | `list` |
| GET | `/api/v1/invoices/:id` | sales.read | `get` |
| POST | `/api/v1/invoices/from-order/:orderId` | sales.manage | `createFromOrder` |
| POST | `/api/v1/invoices/:id/issue` | sales.manage | `issue` |
| POST | `/api/v1/invoices/:id/cancel` | sales.manage | `cancel` |

```typescript
list(@CurrentUserId() actorId: string)
get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
createFromOrder(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string)
issue(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

## orders

[Controller source](../src/modules/sales/presentation/orders.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/sales-orders` | sales.read | `list` |
| GET | `/api/v1/sales-orders/:id` | sales.read | `get` |
| POST | `/api/v1/sales-orders/:id/cancel` | sales.manage | `cancel` |
| POST | `/api/v1/sales-orders/:id/confirm` | sales.manage | `confirm` |
| POST | `/api/v1/sales-orders/from-proforma/:id` | sales.manage | `convert` |

```typescript
list(@CurrentUserId() actorId: string)
get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
convert(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

## payments

[Controller source](../src/modules/sales/presentation/payments.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/sales-orders/:orderId/payments` | sales.read | `list` |
| GET | `/api/v1/sales-orders/:orderId/payments/summary` | sales.read | `summary` |
| POST | `/api/v1/sales-orders/:orderId/payments` | sales.manage | `record` |
| POST | `/api/v1/sales-orders/:orderId/payments/:paymentId/reverse` | sales.manage | `reverse` |
| POST | `/api/v1/sales-orders/:orderId/payments/:paymentId/allocations/:allocationId/cancel` | sales.manage | `cancelAllocation` |
| POST | `/api/v1/sales-orders/:orderId/payments/:paymentId/allocations` | sales.manage | `allocate` |

```typescript
list(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string)
summary(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string)
record(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string, @Body() input: RecordPaymentDto,)
reverse(@Param('orderId', ParseUUIDPipe) orderId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @CurrentUserId() actorId: string, @Body() input: ReversePaymentDto,)
cancelAllocation(@Param('orderId', ParseUUIDPipe) orderId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Param('allocationId', ParseUUIDPipe) allocationId: string, @CurrentUserId() actorId: string, @Body() input: ReversePaymentDto,)
allocate(@Param('orderId', ParseUUIDPipe) orderId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @CurrentUserId() actorId: string, @Body() input: AllocatePaymentDto,)
```

## proformas

[Controller source](../src/modules/sales/presentation/proformas.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/proformas` | sales.read | `list` |
| GET | `/api/v1/proformas/:id` | sales.read | `get` |
| POST | `/api/v1/proformas` | sales.manage | `create` |
| POST | `/api/v1/proformas/:id/issue` | sales.manage | `issue` |
| PUT | `/api/v1/proformas/:id` | sales.manage | `update` |
| POST | `/api/v1/proformas/:id/accept` | sales.manage | `accept` |
| POST | `/api/v1/proformas/:id/cancel` | sales.manage | `cancel` |
| POST | `/api/v1/proformas/:id/expire` | sales.manage | `expire` |

```typescript
list(@CurrentUserId() actorId: string)
get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
create(@Body() dto: CreateProformaDto, @CurrentUserId() actorId: string)
issue(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateProformaDto, @CurrentUserId() actorId: string,)
accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
expire(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

DTO définis dans ce controller :

```typescript
class ProformaLineDto {
  @IsUUID() productId!: string;
  @IsUUID() storeId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) taxRate!: number;
}

class CreateProformaDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) number?: string;
  @IsUUID() customerId!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProformaLineDto)
  lines!: ProformaLineDto[];
}
```

## sales-documents

[Controller source](../src/modules/sales/presentation/sales-documents.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/proformas/:id/pdf` | sales.read | `proforma` |
| GET | `/api/v1/sales-orders/:orderId/deliveries/:id/pdf` | sales.read | `delivery` |
| GET | `/api/v1/sales-orders/:orderId/payments/:id/pdf` | sales.read | `payment` |
| GET | `/api/v1/invoices/:id/pdf` | sales.read | `invoice` |

```typescript
proforma(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
delivery(@Param('orderId', ParseUUIDPipe) orderId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string,)
payment(@Param('orderId', ParseUUIDPipe) orderId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string,)
invoice(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

## sales-report

[Controller source](../src/modules/sales/presentation/sales-report.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/sales/reports/summary` | sales.read | `summary` |

```typescript
summary(@CurrentUserId() actorId: string)
```

## supplier-returns

[Controller source](../src/modules/supplier-returns/presentation/supplier-returns.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/supplier-returns` | inventory.read | `list` |
| GET | `/api/v1/supplier-returns/:id` | inventory.read | `get` |
| POST | `/api/v1/supplier-returns` | inventory.manage | `create` |
| POST | `/api/v1/supplier-returns/receipt-lines/:id/serials` | inventory.manage | `registerSerials` |
| POST | `/api/v1/supplier-returns/:id/confirm` | inventory.manage | `confirm` |
| POST | `/api/v1/supplier-returns/:id/cancel` | inventory.manage | `cancel` |
| POST | `/api/v1/supplier-returns/:id/credit` | sales.manage | `credit` |

```typescript
list(@CurrentUserId() actor: string, @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,)
get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
create(@Body() dto: ReturnDto, @CurrentUserId() actor: string)
registerSerials(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterSerialsDto, @CurrentUserId() actor: string,)
confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUserId() actor: string)
credit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreditDto, @CurrentUserId() actor: string)
```

DTO définis dans ce controller :

```typescript
class ReturnLineDto {
  @IsUUID()
  receiptLineId!: string;
  @IsString()
  @MaxLength(19)
  quantity!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  serialIds?: string[];
}

class ReturnDto {
  @IsUUID()
  receiptId!: string;
  @IsUUID()
  operationKey!: string;
  @IsString()
  @MaxLength(500)
  reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];
}

class RegisterSerialsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  serials!: string[];
}

class ReasonDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

class CreditDto {
  @IsString()
  @MaxLength(100)
  reference!: string;
}
```

## DTO externes

Sources de validation complémentaires :

- [infrastructure/http/page-query.dto.ts](../src/infrastructure/http/page-query.dto.ts)
- [modules/sales/presentation/allocate-payment.dto.ts](../src/modules/sales/presentation/allocate-payment.dto.ts)
- [modules/sales/presentation/create-delivery.dto.ts](../src/modules/sales/presentation/create-delivery.dto.ts)
- [modules/sales/presentation/issue-credit-note.dto.ts](../src/modules/sales/presentation/issue-credit-note.dto.ts)
- [modules/sales/presentation/record-payment.dto.ts](../src/modules/sales/presentation/record-payment.dto.ts)
- [modules/sales/presentation/reverse-payment.dto.ts](../src/modules/sales/presentation/reverse-payment.dto.ts)

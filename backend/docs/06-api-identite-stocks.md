# API — Identité, magasins, catalogue, stocks et recherche opérationnelle

Toutes les routes ci-dessous incluent `/api/v1`. Les permissions affichées sont celles du controller ; les repositories ajoutent des restrictions d'accès. Les signatures indiquent les DTO, paramètres d'URL et de recherche. `@CurrentUserId()` est injecté par le serveur. Voir [intégration frontend](05-integration-frontend.md).

## health

[Controller source](../src/health.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | Public | `check` |

```typescript
check()
```

## auth

[Controller source](../src/modules/identity/presentation/auth.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | Public | `login` |
| POST | `/api/v1/auth/refresh` | Public | `refresh` |
| POST | `/api/v1/auth/logout` | Public | `logout` |
| GET | `/api/v1/auth/me` | Authentifié | `me` |

```typescript
login(@Body() dto: LoginDto,)
refresh(@Body() dto: RefreshDto)
logout(@Body() dto: RefreshDto)
me(@CurrentUserId() userId: string)
```

## users

[Controller source](../src/modules/identity/presentation/users.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/users` | users.manage | `list` |
| POST | `/api/v1/users` | users.manage | `create` |
| PATCH | `/api/v1/users/:id/disable` | users.manage | `disable` |
| PATCH | `/api/v1/users/:id/access` | users.manage | `replaceAccess` |

```typescript
list()
create(@Body() dto: CreateUserDto, @CurrentUserId() actorId: string,)
disable(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string,)
replaceAccess(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceUserAccessDto, @CurrentUserId() actorId: string,)
```

## inventory

[Controller source](../src/modules/inventory/presentation/inventory.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/inventory/stores/:storeId/stock` | inventory.read | `listStoreStock` |
| GET | `/api/v1/inventory/stores/:storeId/summary` | inventory.read | `summary` |
| GET | `/api/v1/inventory/stores/:storeId/alerts` | inventory.read | `alerts` |
| GET | `/api/v1/inventory/stores/:storeId/products/:productId` | inventory.read | `balance` |
| POST | `/api/v1/inventory/adjustments` | inventory.manage | `adjust` |

```typescript
listStoreStock(@Param('storeId', ParseUUIDPipe) storeId: string, @CurrentUserId() actorId: string)
summary(@Param('storeId', ParseUUIDPipe) storeId: string, @CurrentUserId() actorId: string)
alerts(@Param('storeId', ParseUUIDPipe) storeId: string, @CurrentUserId() actorId: string, @Query('threshold') threshold?: string,)
balance(@Param('storeId', ParseUUIDPipe) storeId: string, @Param('productId', ParseUUIDPipe) productId: string, @CurrentUserId() actorId: string,)
adjust(@Body() dto: AdjustStockDto, @CurrentUserId() actorId: string)
```

## stock-count

[Controller source](../src/modules/inventory/presentation/stock-count.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| POST | `/api/v1/inventory/counts/stores/:storeId` | inventory.manage | `start` |
| GET | `/api/v1/inventory/counts/:id` | inventory.read | `get` |
| POST | `/api/v1/inventory/counts/:id/lines` | inventory.manage | `record` |
| POST | `/api/v1/inventory/counts/:id/cancel` | inventory.manage | `cancel` |
| POST | `/api/v1/inventory/counts/:id/validate` | inventory.manage | `validate` |

```typescript
start(@Param('storeId', ParseUUIDPipe) storeId: string, @CurrentUserId() actorId: string)
get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
record(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordCountDto, @CurrentUserId() actorId: string,)
cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
validate(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

## transfers

[Controller source](../src/modules/inventory/presentation/transfers.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| POST | `/api/v1/inventory/transfers` | inventory.manage | `create` |
| GET | `/api/v1/inventory/transfers/:id` | inventory.read | `get` |
| POST | `/api/v1/inventory/transfers/:id/approve` | inventory.manage | `approve` |
| POST | `/api/v1/inventory/transfers/:id/ship` | inventory.manage | `ship` |
| POST | `/api/v1/inventory/transfers/:id/receive` | inventory.manage | `receive` |
| POST | `/api/v1/inventory/transfers/:id/cancel` | inventory.manage | `cancel` |

```typescript
create(@Body() dto: CreateTransferDto, @CurrentUserId() actorId: string)
get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
ship(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
receive(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string, @Body() dto: ReceiveTransferDto,)
cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string)
```

## operational-search

[Controller source](../src/modules/operational-search/presentation/operational-search.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/search/stores` | stores.read | `stores` |
| GET | `/api/v1/search/users` | users.manage | `users` |
| GET | `/api/v1/search/stocks` | inventory.read | `stocks` |
| GET | `/api/v1/search/transfers` | inventory.read | `transfers` |
| GET | `/api/v1/search/counts` | inventory.read | `counts` |
| GET | `/api/v1/search/expenses` | users.manage | `expenses` |
| GET | `/api/v1/search/returns` | users.manage | `returns` |
| GET | `/api/v1/search/registers` | users.manage | `registers` |
| GET | `/api/v1/search/entries` | users.manage | `entries` |
| GET | `/api/v1/search/bank-statements` | users.manage | `bankStatements` |
| GET | `/api/v1/search/categories` | products.read | `categories` |
| GET | `/api/v1/search/brands` | products.read | `brands` |
| GET | `/api/v1/search/tax-regimes` | products.read | `taxRegimes` |
| GET | `/api/v1/search/price-history` | products.read | `priceHistory` |
| GET | `/api/v1/search/stock-movements` | inventory.read | `stockMovements` |
| GET | `/api/v1/search/accounts` | users.manage | `accounts` |
| GET | `/api/v1/search/journals` | users.manage | `journals` |
| GET | `/api/v1/search/periods` | users.manage | `periods` |
| GET | `/api/v1/search/bank-accounts` | users.manage | `bankAccounts` |
| GET | `/api/v1/search/cash-sessions` | users.manage | `cashSessions` |
| GET | `/api/v1/search/cash-movements` | users.manage | `cashMovements` |
| GET | `/api/v1/search/bank-lines` | users.manage | `bankLines` |

```typescript
stores(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
users(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
stocks(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
transfers(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
counts(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
expenses(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
returns(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
registers(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
entries(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
bankStatements(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
categories(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
brands(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
taxRegimes(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
priceHistory(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
stockMovements(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
accounts(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
journals(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
periods(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
bankAccounts(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
cashSessions(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
cashMovements(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
bankLines(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto)
```

DTO définis dans ce controller :

```typescript
class OperationalQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsUUID() storeId?: string;
  @IsOptional() @IsUUID() periodId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() registerId?: string;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsUUID() statementId?: string;
}
```

## catalogue

[Controller source](../src/modules/products/presentation/catalogue.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/categories` | products.read | `categories` |
| POST | `/api/v1/categories` | products.manage | `createCategory` |
| GET | `/api/v1/brands` | products.read | `brands` |
| POST | `/api/v1/brands` | products.manage | `createBrand` |
| GET | `/api/v1/tax-regimes` | products.read | `taxRegimes` |
| POST | `/api/v1/tax-regimes` | products.manage | `createTaxRegime` |
| GET | `/api/v1/products/:id/prices` | products.read | `prices` |
| POST | `/api/v1/products/:id/prices` | products.manage | `setPrice` |

```typescript
categories()
createCategory(@Body() dto: CreateCategoryDto)
brands()
createBrand(@Body() dto: CreateBrandDto,)
taxRegimes()
createTaxRegime(@Body() dto: CreateTaxRegimeDto)
prices(@Param('id', new ParseUUIDPipe()) id: string,)
setPrice(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetProductPriceDto)
```

## products

[Controller source](../src/modules/products/presentation/products.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/products` | products.read | `list` |
| GET | `/api/v1/products/search` | products.read | `search` |
| GET | `/api/v1/products/:id` | products.read | `get` |
| POST | `/api/v1/products` | products.manage | `create` |
| PATCH | `/api/v1/products/:id` | products.manage | `update` |
| PATCH | `/api/v1/products/:id/activate` | products.manage | `activate` |
| PATCH | `/api/v1/products/:id/deactivate` | products.manage | `deactivate` |

```typescript
list(@Query('active') active?: string)
search(@Query() query: ProductSearchDto)
get(@Param('id', new ParseUUIDPipe()) id: string)
create(@Body() dto: CreateProductDto,)
update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateProductDto,)
activate(@Param('id', new ParseUUIDPipe()) id: string,)
deactivate(@Param('id', new ParseUUIDPipe()) id: string)
```

DTO définis dans ce controller :

```typescript
class ProductSearchDto extends PageQueryDto {
  @IsOptional() @IsIn(['true', 'false']) active?: string;
  @IsOptional() @IsIn(['true', 'false']) isSolarPlant?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsUUID() taxRegimeId?: string;
}
```

## stores

[Controller source](../src/modules/stores/presentation/stores.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/stores` | stores.read | `list` |
| GET | `/api/v1/stores/mine` | stores.read | `mine` |
| POST | `/api/v1/stores/:id/users/:userId` | stores.manage | `grant` |
| DELETE | `/api/v1/stores/:id/users/:userId` | stores.manage | `revoke` |
| GET | `/api/v1/stores/:id` | stores.read | `get` |
| POST | `/api/v1/stores` | stores.manage | `create` |
| PATCH | `/api/v1/stores/:id` | stores.manage | `update` |
| PATCH | `/api/v1/stores/:id/activate` | stores.manage | `activate` |
| PATCH | `/api/v1/stores/:id/deactivate` | stores.manage | `deactivate` |

```typescript
list(@CurrentUserId() userId: string)
mine(@CurrentUserId() userId: string)
grant(@Param('id', new ParseUUIDPipe()) id: string, @Param('userId', new ParseUUIDPipe()) userId: string, @CurrentUserId() actorId: string,)
revoke(@Param('id', new ParseUUIDPipe()) id: string, @Param('userId', new ParseUUIDPipe()) userId: string, @CurrentUserId() actorId: string,)
get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUserId() userId: string,)
create(@Body() dto: CreateStoreDto, @CurrentUserId() actorId: string,)
update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateStoreDto, @CurrentUserId() actorId: string,)
activate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUserId() actorId: string,)
deactivate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUserId() actorId: string)
```

## DTO externes

Sources de validation complémentaires :

- [infrastructure/http/page-query.dto.ts](../src/infrastructure/http/page-query.dto.ts)
- [modules/identity/presentation/dto/auth.dto.ts](../src/modules/identity/presentation/dto/auth.dto.ts)
- [modules/identity/presentation/dto/manage-user.dto.ts](../src/modules/identity/presentation/dto/manage-user.dto.ts)
- [modules/inventory/presentation/adjust-stock.dto.ts](../src/modules/inventory/presentation/adjust-stock.dto.ts)
- [modules/inventory/presentation/receive-transfer.dto.ts](../src/modules/inventory/presentation/receive-transfer.dto.ts)
- [modules/inventory/presentation/stock-count.dto.ts](../src/modules/inventory/presentation/stock-count.dto.ts)
- [modules/inventory/presentation/transfer.dto.ts](../src/modules/inventory/presentation/transfer.dto.ts)
- [modules/products/presentation/dto/catalogue.dto.ts](../src/modules/products/presentation/dto/catalogue.dto.ts)
- [modules/products/presentation/dto/product.dto.ts](../src/modules/products/presentation/dto/product.dto.ts)
- [modules/stores/presentation/dto/create-store.dto.ts](../src/modules/stores/presentation/dto/create-store.dto.ts)
- [modules/stores/presentation/dto/update-store.dto.ts](../src/modules/stores/presentation/dto/update-store.dto.ts)

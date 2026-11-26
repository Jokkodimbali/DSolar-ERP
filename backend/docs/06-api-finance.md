# API — Finance, rapports, audit et services transversaux

Les chemins incluent `/api/v1`. Les permissions déclarées dans les controllers sont complétées par les autorisations métier (notamment les vérifications administrateur). `@CurrentUserId()` est injecté par le serveur. Les routes SSE et fichiers nécessitent une gestion de transport spécifique ; voir [intégration frontend](05-integration-frontend.md).

## accounting

[Controller source](../src/modules/accounting/presentation/accounting.controller.ts).

Les nouvelles périodes activent la comptabilisation automatique dès leur création. Le worker
est actif par défaut hors tests, avec arrêt explicite via `LEDGER_AUTOMATION_WORKER=false`.
Les périodes existantes sans configuration ou désactivées nécessitent une activation par un
administrateur. Les routes `sources` et `post-pending` permettent uniquement de reprendre des
pièces métier réelles ; aucune route ne permet de saisir librement des lignes comptables.
La contrepassation des anciennes écritures manuelles reste possible pour préserver leur historique.

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/accounting/setup` | users.manage | `setup` |
| POST | `/api/v1/accounting/rules` | users.manage | `rule` |
| POST | `/api/v1/accounting/sources` | users.manage | `source` |
| POST | `/api/v1/accounting/accounts` | users.manage | `account` |
| POST | `/api/v1/accounting/accounts/:id/classify` | users.manage | `classify` |
| GET | `/api/v1/accounting/periods/:id/statements` | users.manage | `statements` |
| POST | `/api/v1/accounting/journals` | users.manage | `journal` |
| POST | `/api/v1/accounting/periods` | users.manage | `period` |
| GET | `/api/v1/accounting/periods/:id/automation` | users.manage | `automation` |
| POST | `/api/v1/accounting/periods/:id/automation` | users.manage | `configureAutomation` |
| GET | `/api/v1/accounting/periods/:id/pending` | users.manage | `pending` |
| POST | `/api/v1/accounting/periods/:id/post-pending` | users.manage | `postPending` |
| POST | `/api/v1/accounting/periods/:id/close` | users.manage | `close` |
| POST | `/api/v1/accounting/entries/:id/reverse` | users.manage | `reverse` |
| GET | `/api/v1/accounting/periods/:id/entries` | users.manage | `entries` |
| GET | `/api/v1/accounting/periods/:id/trial-balance` | users.manage | `balance` |

```typescript
setup(@CurrentUserId() actor: string)
rule(@Body() dto: RuleDto, @CurrentUserId() actor: string)
source(@Body() dto: SourceDto, @CurrentUserId() actor: string)
account(@Body() dto: CodeDto, @CurrentUserId() actor: string)
classify(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClassificationDto, @CurrentUserId() actor: string,)
statements(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
journal(@Body() dto: CodeDto, @CurrentUserId() actor: string)
period(@Body() dto: PeriodDto, @CurrentUserId() actor: string)
automation(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
configureAutomation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AutomationDto, @CurrentUserId() actor: string,)
pending(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
postPending(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
close(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseDto, @CurrentUserId() actor: string)
entries(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string, @Query('accountId', new ParseUUIDPipe({ optional: true })) accountId?: string, @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,)
balance(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
```

DTO définis dans ce controller :

```typescript
class CodeDto {
  @IsString()
  @MaxLength(30)
  code!: string;
  @IsString()
  @MaxLength(160)
  name!: string;
}

class ClassificationDto {
  @IsIn([...ACCOUNT_CLASSES])
  category!: AccountClass;
}

class AutomationDto {
  @IsBoolean()
  enabled!: boolean;
}

class PeriodDto {
  @IsString()
  @MaxLength(100)
  name!: string;
  @IsString()
  @MaxLength(10)
  start!: string;
  @IsString()
  @MaxLength(10)
  end!: string;
}

class RuleDto {
  @IsString()
  @MaxLength(120)
  key!: string;
  @IsUUID()
  journalId!: string;
  @IsUUID()
  debitAccountId!: string;
  @IsUUID()
  creditAccountId!: string;
  @IsOptional()
  @IsUUID()
  taxAccountId?: string;
}

class SourceDto {
  @IsIn([...SOURCE_TYPES])
  type!: SourceType;
  @IsUUID()
  id!: string;
}

class ReverseDto {
  @IsUUID()
  periodId!: string;
  @IsUUID()
  operationKey!: string;
  @IsString()
  @MaxLength(10)
  date!: string;
  @IsString()
  @MaxLength(500)
  reason!: string;
}
```

## bank

[Controller source](../src/modules/accounting/presentation/bank.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/accounting/bank/accounts` | users.manage | `accounts` |
| POST | `/api/v1/accounting/bank/accounts` | users.manage | `account` |
| POST | `/api/v1/accounting/bank/statements` | users.manage | `importStatement` |
| GET | `/api/v1/accounting/bank/accounts/:id/statements` | users.manage | `statements` |
| GET | `/api/v1/accounting/bank/statements/:id` | users.manage | `detail` |
| GET | `/api/v1/accounting/bank/statements/:id/suggestions` | users.manage | `suggestions` |
| POST | `/api/v1/accounting/bank/lines/:id/match` | users.manage | `match` |
| POST | `/api/v1/accounting/bank/lines/:id/unmatch` | users.manage | `unmatch` |
| POST | `/api/v1/accounting/bank/statements/:id/close` | users.manage | `close` |

```typescript
accounts(@CurrentUserId() actor: string)
account(@Body() dto: BankAccountDto, @CurrentUserId() actor: string)
importStatement(@Body() dto: StatementDto, @CurrentUserId() actor: string)
statements(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
suggestions(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
match(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MatchDto, @CurrentUserId() actor: string)
unmatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
close(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
```

DTO définis dans ce controller :

```typescript
class BankAccountDto {
  @IsUUID()
  accountId!: string;
  @IsString()
  @MaxLength(160)
  name!: string;
}

class BankLineDto {
  @IsString()
  @MaxLength(100)
  reference!: string;
  @IsString()
  @MaxLength(10)
  date!: string;
  @IsString()
  @MaxLength(500)
  description!: string;
  @IsString()
  @MaxLength(20)
  amount!: string;
}

class StatementDto {
  @IsUUID()
  bankAccountId!: string;
  @IsString()
  @MaxLength(100)
  reference!: string;
  @IsString()
  @MaxLength(10)
  start!: string;
  @IsString()
  @MaxLength(10)
  end!: string;
  @IsString()
  @MaxLength(20)
  opening!: string;
  @IsString()
  @MaxLength(20)
  closing!: string;
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BankLineDto)
  lines!: BankLineDto[];
}

class MatchDto {
  @IsUUID()
  ledgerLineId!: string;
}
```

## audit

[Controller source](../src/modules/audit/presentation/audit.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/audit/summary` | users.manage | `summary` |
| GET | `/api/v1/audit` | users.manage | `list` |

```typescript
summary(@CurrentUserId() actorId: string, @Query('actorId', new ParseUUIDPipe({ optional: true })) filterActorId?: string, @Query('entityType') entityType?: string, @Query('entityId') entityId?: string, @Query('action') action?: string, @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string, @Query('from') from?: string, @Query('to') to?: string,)
list(@CurrentUserId() actorId: string, @Query('limit') limit?: string, @Query('actorId', new ParseUUIDPipe({ optional: true })) filterActorId?: string, @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string, @Query('entityType') entityType?: string, @Query('entityId') entityId?: string, @Query('action') action?: string, @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string, @Query('from') from?: string, @Query('to') to?: string,)
```

## dashboard

[Controller source](../src/modules/dashboard/presentation/dashboard.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/dashboard/exports/receivables.csv` | sales.read | `exportReceivablesCsv` |
| GET | `/api/v1/dashboard/exports/store-sales.csv` | sales.read | `exportStoreSalesCsv` |
| GET | `/api/v1/dashboard/exports/stock-valuation.csv` | sales.read | `exportStockValuationCsv` |
| GET | `/api/v1/dashboard/stock-valuation` | sales.read | `stockValuation` |
| GET | `/api/v1/dashboard/procurement` | sales.read | `procurement` |
| GET | `/api/v1/dashboard/store-sales` | sales.read | `storeSales` |
| GET | `/api/v1/dashboard/recent-activity` | sales.read | `recentActivity` |
| GET | `/api/v1/dashboard/receivables` | sales.read | `receivables` |
| GET | `/api/v1/dashboard/monthly-revenue` | sales.read | `monthlyRevenue` |
| GET | `/api/v1/dashboard/top-products` | sales.read | `topProducts` |
| GET | `/api/v1/dashboard/overview` | sales.read | `overview` |

```typescript
exportReceivablesCsv(@CurrentUserId() actorId: string)
exportStoreSalesCsv(@CurrentUserId() actorId: string)
exportStockValuationCsv(@CurrentUserId() actorId: string)
stockValuation(@CurrentUserId() actorId: string)
procurement(@CurrentUserId() actorId: string)
storeSales(@CurrentUserId() actorId: string)
recentActivity(@CurrentUserId() actorId: string, @Query('limit') limit?: string)
receivables(@CurrentUserId() actorId: string)
monthlyRevenue(@CurrentUserId() actorId: string, @Query('year') year: string)
topProducts(@CurrentUserId() actorId: string, @Query('limit') limit?: string)
overview(@CurrentUserId() actorId: string)
```

## expenses

[Controller source](../src/modules/expenses/presentation/expenses.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/expenses/categories` | sales.read | `categories` |
| POST | `/api/v1/expenses/categories` | sales.manage | `createCategory` |
| GET | `/api/v1/expenses/summary` | sales.read | `summary` |
| GET | `/api/v1/expenses` | sales.read | `list` |
| POST | `/api/v1/expenses` | sales.manage | `create` |
| POST | `/api/v1/expenses/:id/approve` | sales.manage | `approve` |
| POST | `/api/v1/expenses/:id/pay` | sales.manage | `pay` |
| POST | `/api/v1/expenses/:id/cancel` | sales.manage | `cancel` |
| POST | `/api/v1/expenses/:id/refund` | sales.manage | `refund` |

```typescript
categories(@CurrentUserId() actor: string)
createCategory(@Body() dto: CategoryDto, @CurrentUserId() actor: string)
summary(@CurrentUserId() actor: string, @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,)
list(@CurrentUserId() actor: string, @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,)
create(@Body() dto: ExpenseDto, @CurrentUserId() actor: string)
approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayDto, @CurrentUserId() actor: string)
cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUserId() actor: string)
refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUserId() actor: string)
```

DTO définis dans ce controller :

```typescript
class CategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;
}

class ExpenseDto {
  @IsUUID()
  storeId!: string;
  @IsUUID()
  categoryId!: string;
  @IsString()
  @MaxLength(500)
  description!: string;
  @IsString()
  @MaxLength(19)
  amount!: string;
  @IsUUID()
  operationKey!: string;
}

class PayDto {
  @IsIn(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'OTHER'])
  method!: ExpenseMethod;
  @IsOptional()
  @IsUUID()
  sessionId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

class ReasonDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}
```

## image

[Controller source](../src/modules/media/presentation/image.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| POST | `/api/v1/media/company/logo` | users.manage | `logo` |
| POST | `/api/v1/media/products/:id/photo` | products.manage | `photo` |
| GET | `/api/v1/media/products/:id/photo` | products.read | `latest` |
| GET | `/api/v1/media/images/:id` | Authentifié | `get` |

```typescript
logo(@CurrentUserId() actorId: string, @UploadedFile() file?: UploadedImage)
photo(@CurrentUserId() actorId: string, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: UploadedImage,)
latest(@CurrentUserId() actorId: string, @Param('id', ParseUUIDPipe) id: string)
get(@CurrentUserId() actorId: string, @Param('id', ParseUUIDPipe) id: string)
```

## notifications

[Controller source](../src/modules/notifications/presentation/notifications.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications` | Authentifié | `list` |
| GET (SSE) | `/api/v1/notifications/stream` | Authentifié | `stream` |
| POST | `/api/v1/notifications/read-all` | Authentifié | `readAll` |
| POST | `/api/v1/notifications/:id/read` | Authentifié | `read` |

```typescript
list(@CurrentUserId() actorId: string, @Query() query: NotificationQueryDto)
stream(@CurrentUserId() actorId: string, @Headers('authorization') header: string)
readAll(@CurrentUserId() actorId: string)
read(@CurrentUserId() actorId: string, @Param('id', ParseUUIDPipe) id: string)
```

DTO définis dans ce controller :

```typescript
class NotificationQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['true', 'false']) read?: string;
  @IsOptional() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @IsUUID() storeId?: string;
}
```

## company-settings

[Controller source](../src/modules/settings/presentation/company-settings.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/settings/company` | users.manage | `get` |
| PUT | `/api/v1/settings/company` | users.manage | `save` |

```typescript
get(@CurrentUserId() actorId: string)
save(@CurrentUserId() actorId: string, @Body() body: CompanySettingsDto)
```

DTO définis dans ce controller :

```typescript
class CompanySettingsDto implements CompanySettingsInput {
  @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number;
  @IsString() @MaxLength(180) legalName!: string;
  @IsString() @MaxLength(180) tradeName!: string;
  @IsString() @MaxLength(80) taxId!: string;
  @IsString() @MaxLength(100) registrationNumber!: string;
  @IsString() @MaxLength(100) legalForm!: string;
  @IsString() @MaxLength(500) address!: string;
  @IsString() @MaxLength(60) phone!: string;
  @IsString() @MaxLength(254) email!: string;
  @IsString() @MaxLength(300) website!: string;
  @IsString() @MaxLength(500) logoUrl!: string;
  @IsString() @MaxLength(180) bankName!: string;
  @IsString() @MaxLength(180) bankAccount!: string;
  @IsString() @MaxLength(500) documentFooter!: string;
  @IsOptional() @IsString() @MaxLength(80) timeZone?: string;
  @IsBoolean() notificationsEnabled!: boolean;
  @IsInt() @Min(0) @Max(1000000) lowStockThreshold!: number;
}
```

## treasury

[Controller source](../src/modules/treasury/presentation/treasury.controller.ts).

| Méthode | Route | Accès déclaré | Handler |
| --- | --- | --- | --- |
| GET | `/api/v1/treasury/registers` | sales.read | `list` |
| POST | `/api/v1/treasury/registers` | sales.manage | `create` |
| POST | `/api/v1/treasury/registers/:id/open` | sales.manage | `open` |
| POST | `/api/v1/treasury/sessions/:id/movements` | sales.manage | `move` |
| GET | `/api/v1/treasury/sessions/:id/summary` | sales.read | `summary` |
| POST | `/api/v1/treasury/sessions/:id/transfer` | sales.manage | `transfer` |
| POST | `/api/v1/treasury/movements/:id/reverse` | sales.manage | `reverse` |
| POST | `/api/v1/treasury/sessions/:id/reconcile` | sales.manage | `reconcile` |
| POST | `/api/v1/treasury/sessions/:id/close` | sales.manage | `close` |

```typescript
list(@CurrentUserId() actor: string)
create(@Body() dto: RegisterDto, @CurrentUserId() actor: string)
open(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AmountDto, @CurrentUserId() actor: string)
move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MovementDto, @CurrentUserId() actor: string)
summary(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string)
transfer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferDto, @CurrentUserId() actor: string)
reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseDto, @CurrentUserId() actor: string)
reconcile(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReconcileDto, @CurrentUserId() actor: string,)
close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AmountDto, @CurrentUserId() actor: string)
```

DTO définis dans ce controller :

```typescript
class RegisterDto {
  @IsUUID()
  storeId!: string;
  @IsString()
  @MaxLength(100)
  name!: string;
}

class AmountDto {
  @IsString()
  @MaxLength(20)
  amount!: string;
}

class MovementDto extends AmountDto {
  @IsString()
  @MaxLength(200)
  reason!: string;
  @IsUUID()
  operationKey!: string;
}

class OperationDto {
  @IsUUID()
  operationKey!: string;
}

class TransferDto extends AmountDto {
  @IsUUID()
  destinationId!: string;
  @IsUUID()
  operationKey!: string;
}

class ReverseDto extends OperationDto {
  @IsString()
  @MaxLength(200)
  reason!: string;
}

class ReconcileDto extends OperationDto {
  @IsUUID()
  paymentId!: string;
}
```

## DTO externes

Sources de validation complémentaires :

- [infrastructure/http/page-query.dto.ts](../src/infrastructure/http/page-query.dto.ts)

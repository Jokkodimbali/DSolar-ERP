import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { assertLocalIntegrationDatabase } from '../../../infrastructure/prisma/local-integration-database';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PaymentsService } from '../application/payments.service';
import { ProformasService } from '../application/proformas.service';
import { SalesDocumentsService } from '../application/sales-documents.service';
import { PrismaProformasRepository } from './prisma-proformas.repository';
import { PrismaOrdersRepository } from './prisma-orders.repository';
import { PrismaPaymentsRepository } from './prisma-payments.repository';
import { PrismaInvoicesRepository } from './prisma-invoices.repository';
import { PrismaDeliveriesRepository } from './prisma-deliveries.repository';
import { PrismaSalesDocumentsRepository } from './prisma-sales-documents.repository';
import { SalesPdfRenderer } from './sales-pdf.renderer';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;

integration('Parcours commercial réel PostgreSQL', () => {
  it('conserve les montants, le stock, les droits et les deux versements de bout en bout', async () => {
    assertLocalIntegrationDatabase(process.env);
    const prisma = new PrismaService();
    const suffix = randomUUID().slice(0, 8);
    try {
      const actor = await prisma.user.create({
        data: { email: suffix + '-sales@example.test', fullName: 'Vendeur CI', passwordHash: 'test' },
      });
      const outsider = await prisma.user.create({
        data: { email: suffix + '-outside@example.test', fullName: 'Autre CI', passwordHash: 'test' },
      });
      const store = await prisma.store.create({ data: { code: 'SALE-' + suffix, name: 'Magasin CI' } });
      await prisma.userStoreAccess.create({ data: { userId: actor.id, storeId: store.id } });
      const product = await prisma.product.create({
        data: { sku: 'SALE-' + suffix, name: 'Centrale CI', isSolarPlant: true },
      });
      await prisma.storeStock.create({
        data: { storeId: store.id, productId: product.id, quantity: '10.000' },
      });
      const customer = await prisma.customer.create({ data: { name: 'Client CI ' + suffix } });
      const proformas = new ProformasService(new PrismaProformasRepository(prisma));
      const orders = new PrismaOrdersRepository(prisma);
      const payments = new PaymentsService(new PrismaPaymentsRepository(prisma));
      const invoices = new PrismaInvoicesRepository(prisma);
      const deliveries = new PrismaDeliveriesRepository(prisma);
      const documents = new SalesDocumentsService(
        new PrismaSalesDocumentsRepository(prisma),
        new SalesPdfRenderer(),
      );
      await proformas.create(
        {
          number: 'PF-' + suffix,
          customerId: customer.id,
          lines: [
            {
              productId: product.id,
              storeId: store.id,
              quantity: 2,
              unitPrice: 100,
              discount: 10,
              taxRate: 18,
            },
          ],
        },
        actor.id,
      );
      const proforma = await prisma.proforma.findUniqueOrThrow({
        where: { number: 'PF-' + suffix.toUpperCase() },
      });
      expect(proforma.total.toFixed(2)).toBe('224.20');
      expect((await documents.download('PROFORMA', proforma.id, actor.id)).subarray(0, 8).toString()).toBe(
        '%PDF-1.4',
      );
      await expect(documents.download('PROFORMA', proforma.id, outsider.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await proformas.issue(proforma.id, actor.id);
      await proformas.accept(proforma.id, actor.id);
      const order = await orders.convert(proforma.id, actor.id);
      await orders.confirm(order.id, actor.id);
      const balance = () =>
        prisma.storeStock.findUniqueOrThrow({
          where: { storeId_productId: { storeId: store.id, productId: product.id } },
        });
      expect((await balance()).reserved.toFixed(3)).toBe('2.000');
      const first = { amount: '100.00', method: 'CASH' as const, idempotencyKey: randomUUID() };
      await payments.record(order.id, actor.id, first);
      await payments.record(order.id, actor.id, first);
      expect(await payments.summary(order.id, actor.id)).toMatchObject({
        paid: '100.00',
        remaining: '124.20',
        activeInstallments: 1,
        nextPaymentMustSettle: true,
        consistent: true,
      });
      await expect(
        payments.record(order.id, actor.id, {
          ...first,
          idempotencyKey: randomUUID(),
          amount: '1.00',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await payments.record(order.id, actor.id, { ...first, amount: '124.20', idempotencyKey: randomUUID() });
      expect(await payments.summary(order.id, actor.id)).toMatchObject({
        paid: '224.20',
        remaining: '0.00',
        activeInstallments: 2,
        consistent: true,
        canRecord: false,
      });
      const invoice = await invoices.createFromOrder(order.id, actor.id);
      await invoices.issue(invoice.id, actor.id);
      expect(invoice.totalHt.toFixed(2)).toBe('190.00');
      expect(invoice.totalTax.toFixed(2)).toBe('34.20');
      expect(invoice.totalTtc.toFixed(2)).toBe(order.total.toFixed(2));
      await expect(documents.download('INVOICE', invoice.id, outsider.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const note = await deliveries.create(order.id, actor.id, {
        lines: [{ storeId: store.id, productId: product.id, quantity: '2.000' }],
      });
      await deliveries.confirm(order.id, note.id, actor.id);
      expect((await balance()).quantity.toFixed(3)).toBe('8.000');
      expect((await balance()).reserved.toFixed(3)).toBe('0.000');
      expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
        'DELIVERED',
      );
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { idempotencyKey: first.idempotencyKey },
      });
      for (const [kind, id] of [
        ['DELIVERY', note.id],
        ['PAYMENT', payment.id],
      ] as const) {
        expect((await documents.download(kind, id, actor.id, order.id)).subarray(0, 8).toString()).toBe(
          '%PDF-1.4',
        );
        await expect(documents.download(kind, id, outsider.id, order.id)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        await expect(documents.download(kind, id, actor.id, randomUUID())).rejects.toBeInstanceOf(
          NotFoundException,
        );
      }
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
      expect(await prisma.stockMovement.count({ where: { referenceId: note.id } })).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  }, 60000);
});

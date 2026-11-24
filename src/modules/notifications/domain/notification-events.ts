export const STORE_EVENTS = {
  LOW_STOCK: 'Stock disponible sous le seuil d’alerte',
  GOODS_RECEIPT_CONFIRMED: 'Réception de marchandises confirmée',
  PAYMENT_RECEIVED: 'Règlement client enregistré',
  DELIVERY_CONFIRMED: 'Livraison confirmée',
  SALES_ORDER_CONFIRMED: 'Commande client confirmée',
  PAYMENT_REVERSED: 'Règlement contrepassé',
} as const;

export const ADMIN_EVENTS = {
  ...STORE_EVENTS,
  TRANSFER_APPROVED: 'Transfert approuvé',
  TRANSFER_SHIPPED: 'Transfert expédié',
  TRANSFER_RECEIVED: 'Transfert réceptionné',
  TRANSFER_CLOSED_WITH_DISCREPANCY: 'Écart constaté lors du transfert',
  EXPENSE_CREATED: 'Nouvelle dépense à traiter',
  LEDGER_ENTRY_REVERSED: 'Écriture comptable contrepassée',
} as const;

export function notificationTitle(action: string): string {
  return Object.entries(ADMIN_EVENTS).find(([key]) => key === action)?.[1] ?? 'Opération interne';
}

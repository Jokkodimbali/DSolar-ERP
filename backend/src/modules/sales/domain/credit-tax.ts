export interface CreditAllocation {
  invoiceLineId: string;
  netAmount: string;
}

interface HistoricalLine {
  id: string;
  total: string;
  tax: string;
  priorNet: string;
  priorTax: string;
}

function cents(value: string): bigint {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) throw new Error('Montant fiscal invalide.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function money(value: bigint): string {
  return (value / 100n).toString() + '.' + (value % 100n).toString().padStart(2, '0');
}

export function allocateCredit(lines: HistoricalLine[], allocations: CreditAllocation[], amount: string) {
  if (
    !allocations.length ||
    allocations.length > 100 ||
    new Set(allocations.map((line) => line.invoiceLineId)).size !== allocations.length
  )
    throw new Error('Ventilation des lignes invalide.');
  let totalNet = 0n;
  let totalTax = 0n;
  const detail = allocations.map((allocation) => {
    const line = lines.find((item) => item.id === allocation.invoiceLineId);
    if (!line) throw new Error('Ligne hors facture.');
    const tax = cents(line.tax);
    const net = cents(line.total) - tax;
    const previousNet = cents(line.priorNet);
    const previousTax = cents(line.priorTax);
    const requested = cents(allocation.netAmount);
    const cumulativeNet = previousNet + requested;
    if (net <= 0n || requested <= 0n || cumulativeNet > net || previousTax > tax)
      throw new Error('Avoir supérieur au montant restant de la ligne.');
    // Round the cumulative proportional amount half-up, then subtract tax already credited.
    const cumulativeTax = (2n * cumulativeNet * tax + net) / (2n * net);
    const currentTax = cumulativeTax - previousTax;
    if (currentTax < 0n || cumulativeTax > tax) throw new Error('Ventilation historique incohérente.');
    totalNet += requested;
    totalTax += currentTax;
    return {
      invoiceLineId: allocation.invoiceLineId,
      netAmount: money(requested),
      taxAmount: money(currentTax),
    };
  });
  if (totalNet + totalTax !== cents(amount))
    throw new Error('Montant TTC différent de la ventilation calculée.');
  return { netAmount: money(totalNet), taxAmount: money(totalTax), lines: detail };
}

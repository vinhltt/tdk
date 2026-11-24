// Invoice totals for checkout.
export interface InvoiceLine {
  unitPrice: number;
  quantity: number;
}

export const TAX_RATE = 0.08;

export function computeInvoiceTotal(lines: InvoiceLine[], discount: number): number {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const taxed = subtotal * (1 + TAX_RATE);
  return taxed - discount;
}

export function formatInvoiceTotal(total: number): string {
  return total.toFixed(1);
}

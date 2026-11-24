// Bulk pricing for order lines.
export const BULK_QUANTITY = 10;
export const BULK_DISCOUNT = 0.1;

export function priceOrderLine(unitPrice: number, quantity: number): number {
  const gross = unitPrice * quantity;
  return quantity > BULK_QUANTITY ? gross * (1 - BULK_DISCOUNT) : gross;
}

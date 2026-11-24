// Stock levels and reservations.
export interface StockLevel {
  sku: string;
  onHand: number;
}

export function reserveStock(stock: Map<string, StockLevel>, sku: string, quantity: number): StockLevel {
  const level = stock.get(sku) ?? { sku, onHand: 0 };
  const next = { sku, onHand: level.onHand - quantity };
  stock.set(sku, next);
  return next;
}

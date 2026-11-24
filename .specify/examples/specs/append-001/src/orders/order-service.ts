// Order placement. Stock is reserved separately, through the inventory module.
export interface OrderLine {
  sku: string;
  unitPrice: number;
  quantity: number;
}

export interface PlacedOrder {
  lines: OrderLine[];
  total: number;
}

export function placeOrder(lines: OrderLine[]): PlacedOrder {
  let total = 0;
  for (const line of lines) {
    total += line.unitPrice * line.quantity;
  }
  return { lines, total };
}

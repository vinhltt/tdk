// Product search over the in-memory catalog.
export interface Product {
  sku: string;
  name: string;
}

export function searchProducts(products: Product[], query: string): Product[] {
  const needle = query.trim();
  if (needle.length === 0) return [];
  return products.filter((product) => product.name.includes(needle));
}

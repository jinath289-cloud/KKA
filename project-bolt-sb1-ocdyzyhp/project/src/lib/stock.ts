import type { Role, StockItemType, StockMovementType } from '@/types';

export type StockDirection = 'in' | 'out';

const IN_TYPES: StockMovementType[] = [
  'opening',
  'purchase_in',
  'production_in',
  'return_in',
  'adjustment_in',
];
const OUT_TYPES: StockMovementType[] = [
  'production_out',
  'sale_out',
  'wastage',
  'adjustment_out',
];

export function movementTypesFor(
  role: Role,
  itemType: StockItemType,
  direction: StockDirection,
): StockMovementType[] {
  const candidates = direction === 'in' ? IN_TYPES : OUT_TYPES;
  if (role === 'admin') return candidates.filter((type) => type !== 'opening');
  if (role === 'purchase') {
    return itemType === 'raw_material' && direction === 'in' ? ['purchase_in'] : [];
  }
  if (role === 'store') {
    if (itemType === 'raw_material') return direction === 'in' ? ['purchase_in'] : ['production_out', 'wastage'];
    return direction === 'in' ? ['production_in'] : ['wastage'];
  }
  if (role === 'sales' && itemType === 'product') {
    return direction === 'in' ? ['return_in'] : ['sale_out'];
  }
  return [];
}

export function visibleMovementTypes(role: Role): StockMovementType[] {
  if (role === 'admin') {
    return ['opening', ...IN_TYPES.filter((type) => type !== 'opening'), ...OUT_TYPES];
  }
  if (role === 'purchase') return ['purchase_in'];
  if (role === 'store') return ['purchase_in', 'production_out', 'wastage', 'production_in'];
  return ['sale_out', 'return_in'];
}

export function movementDelta(type: StockMovementType, quantity: number): number {
  return ['opening', 'purchase_in', 'production_in', 'return_in', 'adjustment_in'].includes(type)
    ? quantity
    : -quantity;
}

export function movementLabelKey(type: StockMovementType): `stock_type_${StockMovementType}` {
  return `stock_type_${type}`;
}

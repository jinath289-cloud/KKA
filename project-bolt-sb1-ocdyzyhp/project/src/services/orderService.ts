import { supabase } from '@/lib/supabase';
import type {
  OrderItemRow,
  OrderProductOption,
  OrderRow,
  OrderStatus,
  PaymentRow,
  StockItemOption,
} from '@/types';

export interface OrderListFilters {
  status?: OrderStatus | '';
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | '';
  fromDate?: string;
  toDate?: string;
  search?: string;
  customerId?: string;
  from: number;
  pageSize: number;
}

export interface OrderDraftInput {
  orderId: string | null;
  customerId: string;
  items: Array<{ product_id: string; sale_type: 'retail' | 'wholesale'; quantity: number }>;
  discount: number;
  taxPercent: number;
  notes: string | null;
  orderDate: string;
}

function customerOrderQuery() {
  return supabase
    .from('orders')
    .select('id, order_number, customer_id, status, order_date, subtotal, discount_amount, tax_percent, tax_amount, total, paid_amount, payment_status, notes, cancelled_at, cancel_reason, confirmed_at, created_by, created_at, updated_at, customer:customers(id, name, phone, city_village, address, gstin)');
}

function normalizeCustomerRelation(row: OrderRow & { customer: NonNullable<OrderRow['customer']>[] | OrderRow['customer'] }): OrderRow {
  return {
    ...row,
    customer: Array.isArray(row.customer) ? row.customer[0] ?? null : row.customer,
  };
}

async function fetchMatchingOrders(
  filters: Omit<OrderListFilters, 'from' | 'pageSize' | 'search'>,
  searchTerm: string | undefined,
  customerIds?: string[],
  range?: { from: number; to: number },
): Promise<OrderRow[]> {
  let query = customerOrderQuery()
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
  if (filters.fromDate) query = query.gte('order_date', filters.fromDate);
  if (filters.toDate) query = query.lte('order_date', filters.toDate);
  if (filters.customerId) query = query.eq('customer_id', filters.customerId);
  if (searchTerm) query = query.ilike('order_number', `%${searchTerm}%`);
  if (customerIds) {
    if (customerIds.length === 0) return [];
    query = query.in('customer_id', customerIds);
  }
  if (range) query = query.range(range.from, range.to);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Array<OrderRow & { customer: NonNullable<OrderRow['customer']>[] | OrderRow['customer'] }>).map(normalizeCustomerRelation);
}

export async function listOrders(filters: OrderListFilters): Promise<{ rows: OrderRow[]; hasMore: boolean }> {
  const search = filters.search?.trim();
  const baseFilters = {
    status: filters.status,
    paymentStatus: filters.paymentStatus,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    customerId: filters.customerId,
  };
  let rows: OrderRow[];
  if (search) {
    const { data: matchingCustomers, error } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', `%${search}%`);
    if (error) throw error;
    const fetchAllMatching = async (term: string | undefined, customerIds?: string[]) => {
      const results: OrderRow[] = [];
      for (let from = 0; ; from += 500) {
        const batch = await fetchMatchingOrders(baseFilters, term, customerIds, { from, to: from + 499 });
        results.push(...batch);
        if (batch.length < 500) return results;
      }
    };
    const [orderNumberMatches, customerMatches] = await Promise.all([
      fetchAllMatching(search),
      fetchAllMatching(undefined, (matchingCustomers ?? []).map((customer) => customer.id)),
    ]);
    rows = [...new Map([...orderNumberMatches, ...customerMatches].map((row) => [row.id, row])).values()]
      .sort((a, b) =>
        b.order_date.localeCompare(a.order_date) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id),
      );
  } else {
    rows = await fetchMatchingOrders(baseFilters, undefined, undefined, {
      from: filters.from,
      to: filters.from + filters.pageSize,
    });
  }
  const page = search
    ? rows.slice(filters.from, filters.from + filters.pageSize + 1)
    : rows;
  return { rows: page.slice(0, filters.pageSize), hasMore: page.length > filters.pageSize };
}

export async function getOrder(id: string): Promise<OrderRow> {
  const { data, error } = await customerOrderQuery().eq('id', id).single();
  if (error) throw error;
  return normalizeCustomerRelation(data as OrderRow & { customer: NonNullable<OrderRow['customer']>[] | OrderRow['customer'] });
}

export async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select('id, order_id, product_id, sku, product_name, pack_size, pack_unit, sale_type, quantity, unit_price, line_total, kg_equivalent')
    .eq('order_id', orderId)
    .order('id');
  if (error) throw error;
  return (data ?? []) as OrderItemRow[];
}

export async function getOrderPayments(orderId: string): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, order_id, amount, method, reference, paid_on, voided_at, voided_by, void_reason, created_by, created_at')
    .eq('order_id', orderId)
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PaymentRow[];
}

export async function listOrderProducts(): Promise<OrderProductOption[]> {
  const [{ data: products, error: productError }, { data: stock, error: stockError }] = await Promise.all([
    supabase
      .from('products')
      .select('id, sku, name, image_path, pack_size, pack_unit, retail_price, wholesale_price, is_active')
      .eq('is_active', true)
      .order('name'),
    supabase.rpc('list_product_stock'),
  ]);
  if (productError) throw productError;
  if (stockError) throw stockError;
  const stockById = new Map(
    ((stock ?? []) as Array<Pick<StockItemOption, 'id' | 'stock_kg'>>).map((row) => [row.id, row.stock_kg]),
  );
  return ((products ?? []) as Omit<OrderProductOption, 'stock_kg'>[]).map((product) => ({
    ...product,
    stock_kg: stockById.get(product.id) ?? 0,
  }));
}

export async function saveOrderDraft(input: OrderDraftInput): Promise<OrderRow> {
  const { data, error } = await supabase.rpc('save_order_draft', {
    p_order_id: input.orderId,
    p_customer_id: input.customerId,
    p_items: input.items,
    p_discount: input.discount,
    p_tax_percent: input.taxPercent,
    p_notes: input.notes,
    p_order_date: input.orderDate,
  });
  if (error) throw error;
  return data as OrderRow;
}

export async function confirmOrder(id: string): Promise<OrderRow> {
  const { data, error } = await supabase.rpc('confirm_order', { p_order_id: id });
  if (error) throw error;
  return data as OrderRow;
}

export async function cancelOrder(id: string, reason: string): Promise<OrderRow> {
  const { data, error } = await supabase.rpc('cancel_order', { p_order_id: id, p_reason: reason });
  if (error) throw error;
  return data as OrderRow;
}

export async function recordOrderPayment(input: {
  orderId: string;
  amount: number;
  method: string;
  reference: string | null;
  paidOn: string;
}): Promise<PaymentRow> {
  const { data, error } = await supabase.rpc('record_payment', {
    p_order_id: input.orderId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference,
    p_paid_on: input.paidOn,
  });
  if (error) throw error;
  return data as PaymentRow;
}

export async function voidOrderPayment(id: string, reason: string): Promise<PaymentRow> {
  const { data, error } = await supabase.rpc('void_payment', { p_payment_id: id, p_reason: reason });
  if (error) throw error;
  return data as PaymentRow;
}

/*
  # Let staff update delivery status of online orders

  set_online_fulfilment_status(order_id, status): admin/sales only, order must be confirmed.
  The store's "Track order" page shows this status to the customer.
*/

CREATE OR REPLACE FUNCTION set_online_fulfilment_status(p_order_id uuid, p_status text)
RETURNS online_order_details
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_status text;
  v_old text;
  v_row online_order_details%ROWTYPE;
BEGIN
  IF current_app_role() IS NULL OR current_app_role() NOT IN ('admin', 'sales') THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('received', 'packed', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id;
  IF v_order_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'Confirm the order first' USING ERRCODE = '22023';
  END IF;

  SELECT fulfilment_status INTO v_old FROM online_order_details WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This is not an online order' USING ERRCODE = 'P0002';
  END IF;

  UPDATE online_order_details SET fulfilment_status = p_status WHERE order_id = p_order_id
  RETURNING * INTO v_row;

  INSERT INTO audit_log (action, entity, entity_id, old_values, new_values)
  VALUES ('online_fulfilment_status', 'order', p_order_id::text,
          jsonb_build_object('fulfilment_status', v_old),
          jsonb_build_object('fulfilment_status', p_status));

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_online_fulfilment_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_online_fulfilment_status(uuid, text) TO authenticated;

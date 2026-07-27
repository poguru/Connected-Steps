-- ============================================================
-- Connected Steps — Merchandise Stock RPC Functions
-- File: 20260728000004_merchandise_stock_rpcs.sql
-- ============================================================
-- Atomic stock management for merchandise_variants.
-- Called by the merchandise orders API to prevent overselling
-- via concurrent reservation races.
-- ============================================================

-- ── increment_variant_reserved ────────────────────────────────────────────────
-- Atomically reserves qty units of a variant when an order is placed.
-- Raises an exception (caught by the API try/catch) if stock is insufficient.

CREATE OR REPLACE FUNCTION public.increment_variant_reserved(
  v_id UUID,
  qty  INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  available INTEGER;
BEGIN
  -- Lock the row for update to prevent concurrent races
  SELECT (stock_qty - reserved_qty - sold_qty)
    INTO available
    FROM public.merchandise_variants
   WHERE id = v_id
     FOR UPDATE;

  IF available IS NULL THEN
    RAISE EXCEPTION 'Variant % not found', v_id;
  END IF;

  IF available < qty THEN
    RAISE EXCEPTION 'Insufficient stock: % available, % requested', available, qty;
  END IF;

  UPDATE public.merchandise_variants
     SET reserved_qty = reserved_qty + qty
   WHERE id = v_id;
END;
$$;

-- ── confirm_variant_sold ──────────────────────────────────────────────────────
-- Called when an order transitions to "delivered" + "paid".
-- Moves qty from reserved to sold (net-zero on available stock).

CREATE OR REPLACE FUNCTION public.confirm_variant_sold(
  v_id UUID,
  qty  INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.merchandise_variants
     SET reserved_qty = GREATEST(0, reserved_qty - qty),
         sold_qty     = sold_qty + qty
   WHERE id = v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant % not found', v_id;
  END IF;
END;
$$;

-- ── release_variant_reserved ──────────────────────────────────────────────────
-- Called when an order is cancelled — releases the reserved stock.

CREATE OR REPLACE FUNCTION public.release_variant_reserved(
  v_id UUID,
  qty  INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.merchandise_variants
     SET reserved_qty = GREATEST(0, reserved_qty - qty)
   WHERE id = v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant % not found', v_id;
  END IF;
END;
$$;

-- Grant execute to service_role only (API uses service role key)
REVOKE ALL ON FUNCTION public.increment_variant_reserved(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_variant_sold(UUID, INTEGER)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_variant_reserved(UUID, INTEGER)    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_variant_reserved(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_variant_sold(UUID, INTEGER)        TO service_role;
GRANT EXECUTE ON FUNCTION public.release_variant_reserved(UUID, INTEGER)    TO service_role;

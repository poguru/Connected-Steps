-- Bulk-update prev_month_rank for many users in a single SQL statement.
-- Called from the rank-snapshot cron job in chunks of 1000 instead of one
-- UPDATE per user. Uses unnest() to join two parallel arrays in one pass.
-- Returns the count of rows actually updated.

CREATE OR REPLACE FUNCTION public.set_prev_month_ranks(
  p_emails text[],
  p_ranks  int[]
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected int;
BEGIN
  UPDATE leaderboard
  SET    prev_month_rank = r.rank
  FROM   unnest(p_emails, p_ranks) AS r(email, rank)
  WHERE  leaderboard.user_email = r.email;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

-- Only the service-role key (used by the cron job) may call this function.
GRANT EXECUTE ON FUNCTION public.set_prev_month_ranks(text[], int[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.set_prev_month_ranks(text[], int[]) FROM PUBLIC;

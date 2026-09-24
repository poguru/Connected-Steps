-- Expand tshirt_size CHECK constraint to include child-specific sizes for the
-- Parent & Child Duo category. Adult sizes are unchanged.
--
-- Adult sizes (unchanged): XS, S, M, L, XL, XXL, 3XL
-- Child sizes (new):       5-6Y, 7-8Y, 9-10Y, 11-12Y, 13-14Y

ALTER TABLE public.it_run_participants
  DROP CONSTRAINT IF EXISTS it_run_participants_tshirt_size_check;

ALTER TABLE public.it_run_participants
  ADD CONSTRAINT it_run_participants_tshirt_size_check
  CHECK (tshirt_size IN (
    'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL',
    '5-6Y', '7-8Y', '9-10Y', '11-12Y', '13-14Y'
  ));

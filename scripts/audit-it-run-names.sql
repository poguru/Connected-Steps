-- READ-ONLY audit of participant names for The IT Run Sprint-2.
--
-- Lists existing participant records whose names contain characters the registration policy does not
-- allow (see lib/it-run-name-validation.ts). Nothing is changed here. Review each row, then have the
-- participant or an authorized admin correct it through the normal correction workflow.
--
-- Scope of this check: ASCII digits and symbols (for example @ / # $ & . , ! ?), and leading, trailing
-- or doubled spaces. Emojis and other non-letter Unicode symbols are not caught by SQL; the application
-- check in lib/it-run-name-validation.ts is the authority for those.
--
-- Note: some legitimate names contain a full stop (for example initials such as "R."). Review those
-- rows manually before correcting them.

SELECT
  r.registration_code,
  r.registration_status,
  r.payment_status,
  p.id              AS participant_id,
  p.first_name,
  p.last_name,
  p.bib_name,
  p.emergency_name,
  p.created_at
FROM public.it_run_participants p
JOIN public.it_run_registrations r ON r.id = p.registration_id
JOIN public.it_run_events e        ON e.id = p.event_id AND e.slug = 'sprint-2'
WHERE
     p.first_name     ~ '[\x00-\x1f\x21-\x26\x28-\x2c\x2e-\x40\x5b-\x60\x7b-\x7f]'
  OR p.last_name      ~ '[\x00-\x1f\x21-\x26\x28-\x2c\x2e-\x40\x5b-\x60\x7b-\x7f]'
  OR p.bib_name       ~ '[\x00-\x1f\x21-\x26\x28-\x2c\x2e-\x40\x5b-\x60\x7b-\x7f]'
  OR p.emergency_name ~ '[\x00-\x1f\x21-\x26\x28-\x2c\x2e-\x40\x5b-\x60\x7b-\x7f]'
  OR p.first_name     ~ '^\s|\s$|\s\s'
  OR p.last_name      ~ '^\s|\s$|\s\s'
  OR p.bib_name       ~ '^\s|\s$|\s\s'
ORDER BY r.registration_code, p.created_at;

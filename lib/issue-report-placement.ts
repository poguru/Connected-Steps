/**
 * Where the "Report an issue" control appears.
 *
 * The floating control is fixed to the bottom-left of every page. On the registration wizard that
 * spot is the Back button and the price bar, so there the floating control is hidden and the wizard
 * places a compact flag button inside its own bottom bar instead. Both open the same form.
 */

export const REGISTRATION_ROUTE_PREFIX = "/it-run/register";

export function floatingReportHidden(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === REGISTRATION_ROUTE_PREFIX || pathname.startsWith(`${REGISTRATION_ROUTE_PREFIX}/`);
}

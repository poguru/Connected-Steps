/**
 * Where the "Go home" button on error screens should lead.
 *
 * IT Run Sprint-2 pages return to the IT Run event page, where the participant can open
 * registration, categories, and their dashboard. Everything else goes to the Connected Steps homepage.
 *
 * Only these two fixed internal paths are ever returned, so no URL from the page can be injected
 * into the destination (no open redirect).
 *
 * Draft registrations are stored in localStorage, so returning through the event page and
 * opening registration again restores them. Nothing here changes registration or payment state.
 */

export const IT_RUN_EVENT_PATH = "/it-run";
export const SITE_HOME_PATH = "/";

export function errorHomeDestination(pathname: string | null | undefined): string {
  if (!pathname) return SITE_HOME_PATH;
  // Match the event page and everything under it, but not a lookalike such as /it-runner
  if (pathname === IT_RUN_EVENT_PATH || pathname.startsWith(`${IT_RUN_EVENT_PATH}/`)) {
    return IT_RUN_EVENT_PATH;
  }
  return SITE_HOME_PATH;
}

export function errorHomeLabel(pathname: string | null | undefined): string {
  return errorHomeDestination(pathname) === IT_RUN_EVENT_PATH ? "IT Run event page" : "Go home";
}

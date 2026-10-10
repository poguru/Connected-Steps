/**
 * Bottom bars that stay on screen (cookie notice, sticky call to action) publish their height as a CSS variable
 * on the document root. Anything else that sits at the bottom (the floating "Report an issue" button) adds those
 * variables to its own offset, so it stacks above the bars instead of covering them.
 *
 * Returns a cleanup that resets the variable to 0px.
 */
export function publishBottomBarHeight(el: HTMLElement | null, cssVar: string): () => void {
  const root = document.documentElement;
  if (!el) {
    root.style.setProperty(cssVar, "0px");
    return () => {};
  }
  const update = () => root.style.setProperty(cssVar, `${el.offsetHeight}px`);
  update();
  if (typeof ResizeObserver === "undefined") {
    return () => root.style.setProperty(cssVar, "0px");
  }
  const observer = new ResizeObserver(update);
  observer.observe(el);
  return () => {
    observer.disconnect();
    root.style.setProperty(cssVar, "0px");
  };
}

/** The offset a floating control needs to clear the bottom bars currently on screen. */
export const FLOATING_BOTTOM_OFFSET = "calc(env(safe-area-inset-bottom) + 20px + var(--cookie-banner-h, 0px) + var(--it-run-cta-h, 0px))";

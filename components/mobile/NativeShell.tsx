"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import BottomNav from "@/components/mobile/BottomNav";
import { isTokenValid } from "@/lib/client-auth";

// Only the home screen triggers the double-back-to-exit flow
const HOME = "/dashboard";

// Tab-level destinations: back button goes HOME, not browser-back (because
// the user may have visited multiple tabs in sequence — history.back() would
// return to the previous tab, not home, which is confusing).
// Keep this in sync with BottomNav.tsx TABS array.
const TAB_ROOTS = new Set(["/events", "/community", "/leaderboard", "/profile"]);

// Non-authed users are allowed on these routes without being redirected
const PUBLIC_PREFIX = ["/", "/auth", "/pricing", "/events", "/scan"];

function getCapNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

function showToast(msg: string) {
  const el = document.createElement("div");
  el.textContent = msg;
  Object.assign(el.style, {
    position:       "fixed",
    bottom:         "calc(80px + env(safe-area-inset-bottom, 0px))",
    left:           "50%",
    transform:      "translateX(-50%)",
    background:     "rgba(20,20,20,0.93)",
    color:          "#fff",
    padding:        "10px 22px",
    borderRadius:   "24px",
    fontSize:       "13.5px",
    fontWeight:     "600",
    zIndex:         "99999",
    pointerEvents:  "none",
    whiteSpace:     "nowrap",
    boxShadow:      "0 4px 24px rgba(0,0,0,0.5)",
    border:         "1px solid rgba(255,255,255,0.1)",
    transition:     "opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; }, 1700);
  setTimeout(() => { el.remove(); },             2000);
}

export default function NativeShell({ children }: { children: React.ReactNode }) {
  const pathname      = usePathname();
  const router        = useRouter();
  const pathnameRef   = useRef(pathname);
  const routerRef     = useRef(router);
  const lastBackPress = useRef(0);
  const [isNative,    setIsNative] = useState(false);

  // Keep refs in sync so the back-button closure always has the latest values
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!getCapNative()) return;

    setIsNative(true);
    document.body.classList.add("native-app");

    // ── Session check: redirect on startup ─────────────────────────────────
    // Validate against the embedded expiry in the token itself — NOT the cookie.
    // Android/iOS WebViews clear cookies under memory pressure while localStorage
    // survives, so cookie-based checks cause spurious logouts on mobile.
    const user  = localStorage.getItem("cs_user");
    const token = localStorage.getItem("cs_user_token");
    const path  = window.location.pathname;

    function clearAuthAndRedirect() {
      localStorage.removeItem("cs_user");
      localStorage.removeItem("cs_user_token");
      localStorage.removeItem("cs_strava");
      document.cookie = "cs_auth=; path=/; max-age=0; SameSite=Lax";
      if (path !== "/auth") router.replace("/auth");
    }

    if (user && isTokenValid(token)) {
      // Valid session — re-stamp the cookie in case the WebView cleared it
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `cs_auth=${token}; path=/; max-age=7776000; SameSite=Lax${secure}`;
      if (path === "/" || path === "/auth" || path === "") {
        router.replace("/dashboard");
      }
    } else if (user) {
      // User data present but token expired or missing → real expired session
      clearAuthAndRedirect();
    } else {
      // Unauthenticated → only allow public routes
      const isPublic = PUBLIC_PREFIX.some(p => path === p || path.startsWith(p + "/"));
      if (!isPublic) router.replace("/auth");
    }

    // ── Resume listener: re-check token when app comes back to foreground ──
    const resumePromise = App.addListener("resume", () => {
      const t   = localStorage.getItem("cs_user_token");
      const p   = window.location.pathname;
      const pub = PUBLIC_PREFIX.some(pre => p === pre || p.startsWith(pre + "/"));
      if (!pub && !isTokenValid(t)) {
        localStorage.removeItem("cs_user");
        localStorage.removeItem("cs_user_token");
        localStorage.removeItem("cs_strava");
        document.cookie = "cs_auth=; path=/; max-age=0; SameSite=Lax";
        routerRef.current.replace("/auth");
      }
    });

    // ── Back button ────────────────────────────────────────────────────────
    const listenerPromise = App.addListener("backButton", () => {
      const p = pathnameRef.current;

      if (p === HOME) {
        // Double-press to exit (only from Home)
        const now = Date.now();
        if (now - lastBackPress.current < 2000) {
          App.exitApp();
        } else {
          lastBackPress.current = now;
          showToast("Press back again to exit");
        }
      } else if (TAB_ROOTS.has(p)) {
        // Top-level tab → always go Home (not browser-back, which could
        // land on another tab if the user has been tab-hopping)
        routerRef.current.replace(HOME);
      } else {
        // Nested page → go up one level in history
        window.history.back();
      }
    });

    return () => {
      document.body.classList.remove("native-app");
      listenerPromise.then(l => l.remove());
      resumePromise.then(l => l.remove());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs exactly once on mount

  return (
    <>
      {children}
      {isNative && <BottomNav />}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import BottomNav from "@/components/mobile/BottomNav";
import { isTokenValid } from "@/lib/client-auth";

// Coach home — shown instead of /dashboard when role=coach
const COACH_HOME = "/coach";

// Only the home screen triggers the double-back-to-exit flow
const HOME = "/dashboard";

// Tab-level destinations: back button goes HOME, not browser-back
// For coaches /coach is their home — back from /coach tabs goes to /coach
const TAB_ROOTS = new Set(["/events", "/community", "/leaderboard", "/profile", "/coach"]);

// Non-authed users are allowed on these routes without being redirected
const PUBLIC_PREFIX = ["/", "/auth", "/pricing", "/events", "/scan", "/coach/login"];

// Returns the correct home for the current user based on role
function getHomeForRole(): string {
  try {
    const stored = localStorage.getItem("cs_user");
    if (stored) {
      const u = JSON.parse(stored);
      if (u.role === "coach") return COACH_HOME;
    }
  } catch { /* ignore */ }
  return HOME;
}

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

    // Parse role once — coaches use cookie-based auth (cs_coach_session),
    // not the localStorage token, so they need a different check path.
    let parsedRole: string | null = null;
    try {
      if (user) parsedRole = (JSON.parse(user) as { role?: string }).role ?? null;
    } catch { /* ignore */ }
    const isCoach = parsedRole === "coach";

    function clearAuthAndRedirect() {
      localStorage.removeItem("cs_user");
      localStorage.removeItem("cs_user_token");
      localStorage.removeItem("cs_strava");
      document.cookie = "cs_auth=; path=/; max-age=0; SameSite=Lax";
      if (path !== "/auth") router.replace("/auth");
    }

    if (isCoach) {
      // ── Coach session ─────────────────────────────────────────────────────
      // Coach auth relies on the cs_coach_session HTTP-only cookie, not on
      // cs_user_token.  isTokenValid() would return false (no token stored),
      // which previously caused clearAuthAndRedirect() to fire and log the
      // coach out immediately after every app open — the root cause of the
      // "can't stay logged in" bug.
      //
      // We trust the localStorage marker (set by /coach/login on success) and
      // let the /coach page itself handle an expired cookie by redirecting to
      // /coach/login if API calls fail with 401.
      if (path === "/" || path === "/auth" || path === "" || path === "/coach/login") {
        router.replace(COACH_HOME);
      }
      // No cookie re-stamp needed — the server sets cs_coach_session.
    } else if (user && isTokenValid(token)) {
      // ── Regular user session ───────────────────────────────────────────────
      // Valid JWT in localStorage — re-stamp the cookie in case the WebView
      // cleared it under memory pressure.
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `cs_auth=${token}; path=/; max-age=7776000; SameSite=Lax${secure}`;
      if (path === "/" || path === "/auth" || path === "") {
        router.replace(getHomeForRole());
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
      const storedUser = localStorage.getItem("cs_user");
      let resumeRole: string | null = null;
      try { resumeRole = storedUser ? (JSON.parse(storedUser) as { role?: string }).role ?? null : null; } catch { /* */ }

      // Coaches use HTTP-only cookie auth — token validation doesn't apply.
      if (resumeRole === "coach") return;

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

      const roleHome = getHomeForRole();
      if (p === HOME || p === COACH_HOME) {
        // Double-press to exit (only from role home)
        const now = Date.now();
        if (now - lastBackPress.current < 2000) {
          App.exitApp();
        } else {
          lastBackPress.current = now;
          showToast("Press back again to exit");
        }
      } else if (TAB_ROOTS.has(p)) {
        // Top-level tab → go to role-appropriate home
        routerRef.current.replace(roleHome);
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

  // Determine role for BottomNav
  const [userRole, setUserRole] = useState<"user" | "coach">("user");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cs_user");
      if (stored) {
        const u = JSON.parse(stored);
        if (u.role === "coach") setUserRole("coach");
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <>
      {children}
      {isNative && <BottomNav role={userRole} />}
    </>
  );
}

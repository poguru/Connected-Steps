"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import BottomNav from "@/components/mobile/BottomNav";

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
    bottom:         "90px",
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
    const user = localStorage.getItem("cs_user");
    const path = window.location.pathname;

    if (user) {
      // Authenticated user landed on marketing or auth page → send to dashboard
      if (path === "/" || path === "/auth" || path === "") {
        router.replace("/dashboard");
      }
    } else {
      // Unauthenticated → only allow public routes
      const isPublic = PUBLIC_PREFIX.some(p => path === p || path.startsWith(p + "/"));
      if (!isPublic) {
        router.replace("/auth");
      }
    }

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

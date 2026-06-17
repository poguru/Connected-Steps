"use client";
import { useEffect } from "react";
import { useIsNative } from "@/hooks/useIsNative";
import BottomNav from "@/components/mobile/BottomNav";

export default function NativeShell({ children }: { children: React.ReactNode }) {
  const isNative = useIsNative();

  useEffect(() => {
    if (!isNative) return;

    document.body.classList.add("native-app");

    // Android back button — navigate back through history
    const handleBack = () => {
      if (window.history.length > 1) {
        window.history.back();
      }
    };

    // Capacitor App plugin back button (if available at runtime)
    type CapApp = { addListener: (event: string, cb: () => void) => { remove: () => void } };
    const cap = (window as unknown as { Capacitor?: { Plugins?: { App?: CapApp } } }).Capacitor;
    let listener: { remove: () => void } | null = null;
    if (cap?.Plugins?.App) {
      listener = cap.Plugins.App.addListener("backButton", handleBack);
    }

    return () => {
      document.body.classList.remove("native-app");
      listener?.remove();
    };
  }, [isNative]);

  return (
    <>
      {children}
      {isNative && <BottomNav />}
    </>
  );
}

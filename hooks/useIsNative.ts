"use client";
import { useEffect, useState } from "react";

export function useIsNative(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    // Capacitor sets window.Capacitor synchronously before any JS runs
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) setNative(true);
  }, []);
  return native;
}

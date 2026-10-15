"use client";

import { useEffect, useState } from "react";

/** True on phone-width screens. False on the server and until the browser has measured the screen. */
export function useIsPhone(maxWidth = 640): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setPhone(query.matches);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the screen width is only known in the browser
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [maxWidth]);
  return phone;
}

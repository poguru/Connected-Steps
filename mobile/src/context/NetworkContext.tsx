import React, { createContext, useContext, useEffect, useState } from "react";

interface NetworkState {
  isConnected:      boolean;
  isChecking:       boolean;
}

const NetworkContext = createContext<NetworkState>({ isConnected: true, isChecking: false });

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [isChecking,  setIsChecking]  = useState(false);

  useEffect(() => {
    let mounted = true;

    async function check() {
      if (!mounted) return;
      setIsChecking(true);
      try {
        // Dynamic import so this works even if expo-network isn't installed yet
        const Network = await import("expo-network").catch(() => null);
        if (!Network || !mounted) return;
        const state = await Network.getNetworkStateAsync();
        if (mounted) {
          setIsConnected(!!(state.isConnected && state.isInternetReachable));
        }
      } catch {
        // Assume connected on error — safer for UX
        if (mounted) setIsConnected(true);
      } finally {
        if (mounted) setIsChecking(false);
      }
    }

    check();
    const interval = setInterval(check, 10_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected, isChecking }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}

import React, { createContext, useContext, useState, useCallback } from "react";
import type { CSUser, OpsSession } from "../types";

interface UserContextType {
  user:        CSUser | null;
  setUser:     (user: CSUser | null) => void;
  opsSession:  OpsSession | null;
  setOpsSession: (session: OpsSession | null) => void;
  clearOpsSession: () => void;
}

const UserContext = createContext<UserContextType>({
  user:           null,
  setUser:        () => {},
  opsSession:     null,
  setOpsSession:  () => {},
  clearOpsSession:() => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user,       setUserState]       = useState<CSUser | null>(null);
  const [opsSession, setOpsSessionState] = useState<OpsSession | null>(null);

  const setUser = useCallback((u: CSUser | null) => {
    setUserState(u);
  }, []);

  const setOpsSession = useCallback((s: OpsSession | null) => {
    setOpsSessionState(s);
  }, []);

  const clearOpsSession = useCallback(() => {
    setOpsSessionState(null);
    // Persist expiry via SecureStore is handled in the service layer
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, opsSession, setOpsSession, clearOpsSession }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

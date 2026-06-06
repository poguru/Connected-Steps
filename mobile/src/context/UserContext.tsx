import React, { createContext, useContext, useState } from "react";
import type { CSUser } from "../types";

interface UserContextType {
  user:    CSUser | null;
  setUser: (user: CSUser | null) => void;
}

const UserContext = createContext<UserContextType>({ user: null, setUser: () => {} });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CSUser | null>(null);
  return <UserContext.Provider value={{ user, setUser }}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}

import React, { useEffect, useState } from "react";
import { NavigationContainer }          from "@react-navigation/native";
import { createNativeStackNavigator }   from "@react-navigation/native-stack";
import { StatusBar }                    from "expo-status-bar";
import { View, ActivityIndicator }      from "react-native";
import AsyncStorage                     from "@react-native-async-storage/async-storage";
import { SafeAreaProvider }             from "react-native-safe-area-context";
import LoginScreen                      from "./src/screens/LoginScreen";
import HealthSyncScreen                 from "./src/screens/HealthSyncScreen";
import { STORAGE_KEY_USER }             from "./src/config";
import type { CSUser }                  from "./src/types";

// ── Navigation types ──────────────────────────────────────────────────────────

export type RootStackParamList = {
  Login:      undefined;
  HealthSync: { user: CSUser };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [loading,      setLoading]      = useState(true);
  const [initialRoute, setInitialRoute] = useState<"Login" | "HealthSync">("Login");
  const [savedUser,    setSavedUser]    = useState<CSUser | null>(null);

  // Restore session on launch
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_USER).then(raw => {
      if (raw) {
        try {
          const user: CSUser = JSON.parse(raw);
          setSavedUser(user);
          setInitialRoute("HealthSync");
        } catch { /* invalid stored data — go to login */ }
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#e8620a" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0a0a0a" />
      <NavigationContainer theme={{ dark: true, colors: { background: "#0a0a0a", card: "#141414", text: "#f0f0f0", border: "#222", primary: "#e8620a", notification: "#e8620a" }, fonts: { regular: { fontFamily: "System", fontWeight: "400" }, medium: { fontFamily: "System", fontWeight: "500" }, bold: { fontFamily: "System", fontWeight: "700" }, heavy: { fontFamily: "System", fontWeight: "800" } } }}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerStyle:         { backgroundColor: "#141414" },
            headerTintColor:     "#f0f0f0",
            headerTitleStyle:    { fontWeight: "700" },
            headerShadowVisible: false,
            animation:           "slide_from_right",
          }}
        >
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="HealthSync"
            component={HealthSyncScreen}
            initialParams={savedUser ? { user: savedUser } : undefined}
            options={{
              title:            "Health Sync",
              headerBackVisible: false,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

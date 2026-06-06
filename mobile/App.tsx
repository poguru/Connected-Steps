import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { NavigationContainer }        from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar }                  from "expo-status-bar";
import { View, ActivityIndicator }    from "react-native";
import AsyncStorage                   from "@react-native-async-storage/async-storage";
import { SafeAreaProvider }           from "react-native-safe-area-context";

import { UserProvider, useUser } from "./src/context/UserContext";
import LoginScreen               from "./src/screens/LoginScreen";
import TabNavigator              from "./src/navigation/TabNavigator";
import { STORAGE_KEY_USER }      from "./src/config";
import type { CSUser }           from "./src/types";

export type RootStackParamList = {
  Login:    undefined;
  MainTabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const NAV_THEME = {
  dark: true,
  colors: {
    background:   "#0a0a0a",
    card:         "#141414",
    text:         "#f0f0f0",
    border:       "#222222",
    primary:      "#e8620a",
    notification: "#e8620a",
  },
  fonts: {
    regular: { fontFamily: "System", fontWeight: "400"  as const },
    medium:  { fontFamily: "System", fontWeight: "500"  as const },
    bold:    { fontFamily: "System", fontWeight: "700"  as const },
    heavy:   { fontFamily: "System", fontWeight: "800"  as const },
  },
};

function RootNav() {
  const { setUser }                     = useUser();
  const [loading,      setLoading]      = useState(true);
  const [initialRoute, setInitialRoute] = useState<"Login" | "MainTabs">("Login");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_USER).then(raw => {
      if (raw) {
        try {
          const user: CSUser = JSON.parse(raw);
          setUser(user);
          setInitialRoute("MainTabs");
        } catch { /* corrupted data — go to login */ }
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
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false, animation: "fade" }}
    >
      <Stack.Screen name="Login"    component={LoginScreen}  />
      <Stack.Screen name="MainTabs" component={TabNavigator} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0a0a0a" />
      <UserProvider>
        <NavigationContainer theme={NAV_THEME}>
          <RootNav />
        </NavigationContainer>
      </UserProvider>
    </SafeAreaProvider>
  );
}

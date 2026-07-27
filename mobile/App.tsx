import React, { useEffect, useRef, useState } from "react";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar }                  from "expo-status-bar";
import { View, ActivityIndicator }    from "react-native";
import AsyncStorage                   from "@react-native-async-storage/async-storage";
import { SafeAreaProvider }           from "react-native-safe-area-context";

import { UserProvider, useUser }   from "./src/context/UserContext";
import { NetworkProvider }         from "./src/context/NetworkContext";
import LoginScreen                 from "./src/screens/LoginScreen";
import TabNavigator                from "./src/navigation/TabNavigator";
import ConversationScreen          from "./src/screens/ConversationScreen";
import AdminHomeScreen             from "./src/screens/admin/AdminHomeScreen";
import AdminSessionsScreen         from "./src/screens/admin/AdminSessionsScreen";
import AdminAttendanceScreen       from "./src/screens/admin/AdminAttendanceScreen";
import AdminMembersScreen          from "./src/screens/admin/AdminMembersScreen";
import AdminQuestionsScreen        from "./src/screens/admin/AdminQuestionsScreen";
import AdminTrainingScreen         from "./src/screens/admin/AdminTrainingScreen";
import AdminScoringAuditScreen     from "./src/screens/admin/AdminScoringAuditScreen";
import EventPassScreen             from "./src/screens/EventPassScreen";
import LiveEventScreen             from "./src/screens/LiveEventScreen";
import TrackerScreen               from "./src/screens/TrackerScreen";
import OrganizerScreen             from "./src/screens/OrganizerScreen";
import { STORAGE_KEY_USER, CS_API_BASE } from "./src/config";
import { registerPushToken }       from "./src/services/api";
import { setupNotificationListeners, setNotificationTapHandler } from "./src/services/push";
import type { CSUser }             from "./src/types";

export type RootStackParamList = {
  Login:           undefined;
  MainTabs:        undefined;
  Conversation:    { conversationId: string; coachName: string; senderType: "user" | "coach" };
  AdminSessions:   undefined;
  AdminAttendance: { sessionId: string; sessionTitle: string };
  AdminMembers:    undefined;
  AdminQuestions:  undefined;
  AdminTraining:   undefined;
  AdminScoringAudit: undefined;
  // Phase 4 & 5 — deep-link targets
  EventPass:       { registrationCode: string };
  LiveEvent:       { registrationCode: string };
  // Phase 6 & 7 — stack screens accessible from Profile / Scan
  Tracker:         undefined;
  Organizer:       undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navRef  = React.createRef<NavigationContainerRef<RootStackParamList>>();

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

async function setupPushNotifications(userEmail: string) {
  try {
    // Dynamic import so the app doesn't crash if expo-notifications isn't installed yet
    const Notifications = await import("expo-notifications").catch(() => null);
    if (!Notifications) return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    await registerPushToken(userEmail, tokenData.data, "expo");
  } catch { /* notifications unavailable in current environment */ }
}

// Route notification taps to the relevant screen
setNotificationTapHandler((data) => {
  const nav = navRef.current;
  if (!nav) return;
  if (data.registrationCode) {
    nav.navigate("EventPass", { registrationCode: data.registrationCode });
  }
});

function RootNav() {
  const { user, setUser }               = useUser();
  const [loading,      setLoading]      = useState(true);
  const [initialRoute, setInitialRoute] = useState<"Login" | "MainTabs">("Login");
  const notifCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Set up push notification listeners once
    notifCleanup.current = setupNotificationListeners();
    return () => { notifCleanup.current?.(); };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_USER).then(async raw => {
      if (raw) {
        try {
          const stored: CSUser = JSON.parse(raw);

          // Always refresh role from server — ensures coach tab appears
          // even if the user was cached before the role system existed
          try {
            const res  = await fetch(`${CS_API_BASE}/api/auth/role?email=${encodeURIComponent(stored.email)}`);
            const data = await res.json();
            stored.role       = data.role       ?? stored.role ?? "user";
            stored.coachToken = data.coachToken ?? stored.coachToken;
            await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(stored));
          } catch { /* network offline — use cached role */ }

          setUser(stored);
          setInitialRoute("MainTabs");
          setupPushNotifications(stored.email);
        } catch { /* corrupted — fall through to login */ }
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
      <Stack.Screen name="Login"        component={LoginScreen}          />
      <Stack.Screen name="MainTabs"     component={TabNavigator}         />
      <Stack.Screen name="Conversation"    component={ConversationScreen}    options={{ animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="AdminSessions"   component={AdminSessionsScreen}   options={{ animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="AdminAttendance" component={AdminAttendanceScreen} options={{ animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="AdminMembers"    component={AdminMembersScreen}    options={{ animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="AdminQuestions"  component={AdminQuestionsScreen}  options={{ animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="AdminTraining"      component={AdminTrainingScreen}      options={{ animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="AdminScoringAudit" component={AdminScoringAuditScreen}  options={{ animation: "slide_from_right", gestureEnabled: true }} />
      {/* Phase 4–7 deep-link screens */}
      <Stack.Screen name="EventPass"  component={EventPassScreen}    options={{ animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="LiveEvent"  component={LiveEventScreen}    options={{ animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="Tracker"    component={TrackerScreen}      options={{ animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="Organizer"  component={OrganizerScreen}    options={{ animation: "slide_from_right", gestureEnabled: true }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0a0a0a" />
      <NetworkProvider>
        <UserProvider>
          <NavigationContainer ref={navRef} theme={NAV_THEME}>
            <RootNav />
          </NavigationContainer>
        </UserProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}

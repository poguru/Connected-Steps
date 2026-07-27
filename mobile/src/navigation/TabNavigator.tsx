import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useUser }              from "../context/UserContext";
import { useNetwork }           from "../context/NetworkContext";
import HomeScreen               from "../screens/HomeScreen";
import TrainingScreen           from "../screens/TrainingScreen";
import CommunityScreen          from "../screens/CommunityScreen";
import LeaderboardScreen        from "../screens/LeaderboardScreen";
import MessagesScreen           from "../screens/MessagesScreen";
import ProfileScreen            from "../screens/ProfileScreen";
import AdminHomeScreen          from "../screens/admin/AdminHomeScreen";
import EventWalletScreen        from "../screens/EventWalletScreen";
import VolunteerScreen          from "../screens/VolunteerScreen";
import NotificationsScreen      from "../screens/NotificationsScreen";
import { getNotifications }     from "../services/api";

export type TabParamList = {
  Home:          undefined;
  Training:      undefined;
  Community:     undefined;
  Leaderboard:   undefined;
  Messages:      undefined;
  Events:        undefined;
  Scan:          undefined;
  Alerts:        undefined;
  Admin:         undefined;
  Profile:       undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<string, string> = {
  Home:        "🏠",
  Training:    "🏃",
  Community:   "👥",
  Leaderboard: "🏆",
  Messages:    "💬",
  Events:      "🎟️",
  Scan:        "📷",
  Alerts:      "🔔",
  Admin:       "⚙️",
  Profile:     "👤",
};

function TabIcon({ name, focused, unread = 0 }: { name: string; focused: boolean; unread?: number }) {
  return (
    <View style={{ position: "relative", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{ICONS[name]}</Text>
      {unread > 0 && (
        <View style={{
          position: "absolute", top: -4, right: -8,
          backgroundColor: "#e8620a", borderRadius: 8,
          minWidth: 16, height: 16, alignItems: "center", justifyContent: "center",
          paddingHorizontal: 3,
        }}>
          <Text style={{ fontSize: 9, color: "#fff", fontWeight: "800" }}>
            {unread > 99 ? "99+" : String(unread)}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function TabNavigator() {
  const { user, opsSession } = useUser();
  const { isConnected }      = useNetwork();
  const isCoach  = user?.role === "coach";
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll unread notifications count
  useEffect(() => {
    if (!user?.userToken || !isConnected) return;
    let alive = true;

    async function fetchUnread() {
      try {
        const notifs = await getNotifications(user!.userToken!);
        if (alive && Array.isArray(notifs)) {
          setUnreadCount(notifs.filter((n: { read: boolean }) => !n.read).length);
        }
      } catch { /* ignore */ }
    }

    fetchUnread();
    const id = setInterval(fetchUnread, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [user?.userToken, isConnected]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon
            name={route.name}
            focused={focused}
            unread={route.name === "Alerts" ? unreadCount : 0}
          />
        ),
        tabBarStyle: {
          backgroundColor:  "#0f0f0f",
          borderTopWidth:   1,
          borderTopColor:   "#1a1a1a",
          height:           62,
          paddingBottom:    10,
          paddingTop:       6,
        },
        tabBarLabelStyle: {
          fontSize:      10,
          fontWeight:    "600",
          letterSpacing: 0.2,
        },
        tabBarActiveTintColor:   "#e8620a",
        tabBarInactiveTintColor: "#444444",
      })}
    >
      <Tab.Screen name="Home"        component={HomeScreen}          options={{ title: "Home"      }} />
      <Tab.Screen name="Events"      component={EventWalletScreen}   options={{ title: "Events"    }} />
      <Tab.Screen name="Scan"        component={VolunteerScreen}     options={{ title: "Scan"      }} />
      <Tab.Screen name="Alerts"      component={NotificationsScreen} options={{ title: "Alerts"    }} />
      <Tab.Screen name="Training"    component={TrainingScreen}      options={{ title: "Training"  }} />
      <Tab.Screen name="Community"   component={CommunityScreen}     options={{ title: "Community" }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen}   options={{ title: "Boards"    }} />
      <Tab.Screen name="Messages"    component={MessagesScreen}      options={{ title: "Messages"  }} />
      {isCoach && (
        <Tab.Screen name="Admin" component={AdminHomeScreen} options={{ title: "Admin" }} />
      )}
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}

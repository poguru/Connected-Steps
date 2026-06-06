import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useUser }         from "../context/UserContext";
import HomeScreen          from "../screens/HomeScreen";
import TrainingScreen      from "../screens/TrainingScreen";
import CommunityScreen     from "../screens/CommunityScreen";
import LeaderboardScreen   from "../screens/LeaderboardScreen";
import MessagesScreen      from "../screens/MessagesScreen";
import ProfileScreen       from "../screens/ProfileScreen";
import AdminHomeScreen     from "../screens/admin/AdminHomeScreen";

export type TabParamList = {
  Home:        undefined;
  Training:    undefined;
  Community:   undefined;
  Leaderboard: undefined;
  Messages:    undefined;
  Admin:       undefined;
  Profile:     undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<string, string> = {
  Home:        "🏠",
  Training:    "🏃",
  Community:   "👥",
  Leaderboard: "🏆",
  Messages:    "💬",
  Admin:       "⚙️",
  Profile:     "👤",
};

export default function TabNavigator() {
  const { user } = useUser();
  const isCoach  = user?.role === "coach";

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>
            {ICONS[route.name]}
          </Text>
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
      <Tab.Screen name="Home"        component={HomeScreen}        options={{ title: "Home"        }} />
      <Tab.Screen name="Training"    component={TrainingScreen}    options={{ title: "Training"    }} />
      <Tab.Screen name="Community"   component={CommunityScreen}   options={{ title: "Community"   }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: "Leaderboard" }} />
      <Tab.Screen name="Messages"    component={MessagesScreen}    options={{ title: "Messages"    }} />
      {isCoach && (
        <Tab.Screen name="Admin" component={AdminHomeScreen} options={{ title: "Admin" }} />
      )}
      <Tab.Screen name="Profile"     component={ProfileScreen}     options={{ title: "Profile"     }} />
    </Tab.Navigator>
  );
}

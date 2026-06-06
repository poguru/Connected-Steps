import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import HomeScreen        from "../screens/HomeScreen";
import TrainingScreen    from "../screens/TrainingScreen";
import CommunityScreen   from "../screens/CommunityScreen";
import LeaderboardScreen from "../screens/LeaderboardScreen";
import ProfileScreen     from "../screens/ProfileScreen";

export type TabParamList = {
  Home:        undefined;
  Training:    undefined;
  Community:   undefined;
  Leaderboard: undefined;
  Profile:     undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<string, { active: string; inactive: string }> = {
  Home:        { active: "🏠", inactive: "🏠" },
  Training:    { active: "🏃", inactive: "🏃" },
  Community:   { active: "👥", inactive: "👥" },
  Leaderboard: { active: "🏆", inactive: "🏆" },
  Profile:     { active: "👤", inactive: "👤" },
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>
            {focused ? ICONS[route.name].active : ICONS[route.name].inactive}
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
          fontSize:   10,
          fontWeight: "600",
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
      <Tab.Screen name="Profile"     component={ProfileScreen}     options={{ title: "Profile"     }} />
    </Tab.Navigator>
  );
}

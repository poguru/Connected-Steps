import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { LevelInfo } from "../utils/xp";

interface Props {
  info:   LevelInfo;
  size?:  "sm" | "md" | "lg";
}

export default function LevelBadge({ info, size = "md" }: Props) {
  const s = SIZE[size];
  return (
    <View style={[styles.badge, { paddingHorizontal: s.px, paddingVertical: s.py }]}>
      <Text style={[styles.lv, { fontSize: s.lvFs }]}>LV</Text>
      <Text style={[styles.num, { fontSize: s.numFs }]}>{info.level}</Text>
    </View>
  );
}

const SIZE = {
  sm: { px: 6,  py: 2, lvFs: 7,  numFs: 11 },
  md: { px: 8,  py: 3, lvFs: 8,  numFs: 14 },
  lg: { px: 11, py: 5, lvFs: 10, numFs: 18 },
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: "rgba(232,98,10,0.15)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(232,98,10,0.35)",
    flexDirection: "row",
    alignItems: "baseline",
    gap: 1,
    alignSelf: "flex-start",
  },
  lv:  { color: "rgba(232,98,10,0.7)", fontWeight: "800", letterSpacing: 0.5 },
  num: { color: "#e8620a", fontWeight: "800", letterSpacing: -0.3 },
});

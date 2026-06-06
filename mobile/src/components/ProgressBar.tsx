import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";

interface Props {
  progress: number;   // 0–1
  color?:   string;
  height?:  number;
  delay?:   number;
  radius?:  number;
}

export default function ProgressBar({
  progress, color = "#e8620a", height = 5, delay = 0, radius = 4,
}: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue:         Math.min(1, Math.max(0, progress)),
      duration:        700,
      delay,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  return (
    <View style={[S.track, { height, borderRadius: radius }]}>
      <Animated.View
        style={[
          S.fill,
          {
            backgroundColor: color,
            borderRadius:     radius,
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          },
        ]}
      />
    </View>
  );
}

const S = StyleSheet.create({
  track: { backgroundColor: "#222222", overflow: "hidden" },
  fill:  { height: "100%" },
});

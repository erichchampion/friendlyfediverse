import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { RetryableImage as Image } from "../media/RetryableImage";
import { useTheme } from "@contexts/ThemeContext";

/**
 * Avatar Component
 * Phase 1.4: Design System
 * Enhanced with optional badge overlay support
 */

interface AvatarProps {
  uri: string;
  size?: number;
  style?: ViewStyle;
  badge?: string; // Optional emoji badge to display in lower-right corner
}

export function Avatar({ uri, size = 40, style, badge }: AvatarProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.border,
        },
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        resizeMode="cover"
      />
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "visible", // Changed to visible to show badge
    position: "relative",
  },
  image: {
    backgroundColor: "transparent",
  },
  badge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
});

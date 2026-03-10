import { View, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { useEffect, useRef } from "react";
import { useTheme } from "@contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";

/**
 * Floating Action Buttons Component
 * Displays floating buttons at the bottom of the screen
 * Grid/List toggle and Reload buttons
 */

interface FloatingButtonsProps {
  onGridToggle: () => void;
  onReload: () => void;
  isGridView: boolean;
  isLoading?: boolean;
  hideToggle?: boolean;
}

export function FloatingButtons({
  onGridToggle,
  onReload,
  isGridView,
  isLoading = false,
  hideToggle = false,
}: FloatingButtonsProps) {
  const { colors } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      rotateAnim.setValue(0);
    }
  }, [isLoading, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      {/* Grid/List Toggle Button */}
      {!hideToggle ? (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={onGridToggle}
          activeOpacity={0.8}
          disabled={isLoading}
        >
          <Ionicons
            name={isGridView ? "list" : "grid"}
            size={24}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.spacer} />
      )}

      {/* Reload Button */}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={onReload}
        activeOpacity={0.8}
        disabled={isLoading}
      >
        <Animated.View
          style={{
            transform: [{ rotate: isLoading ? spin : "0deg" }],
          }}
        >
          <Ionicons name="reload" size={24} color="#FFFFFF" />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  spacer: {
    width: 56,
    height: 56,
  },
});

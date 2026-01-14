import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTheme } from "@contexts/ThemeContext";
import { useAuth } from "@contexts/AuthContext";

/**
 * Feed layout
 * Simple stack navigation for feed screens
 * Feed selection is handled by the FeedSelector dropdown in the main header
 * Protected: Redirects to login if user is not authenticated
 */
export default function FeedLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login if not authenticated
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading indicator while checking authentication
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Don't render feed if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[id]" />
      <Stack.Screen name="account/[id]" />
      <Stack.Screen name="hashtag/[id]" />
      <Stack.Screen name="list/[id]" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

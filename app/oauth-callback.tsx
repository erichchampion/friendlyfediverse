import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@contexts/AuthContext";

/**
 * OAuth callback handler page
 * This page is loaded when returning from OAuth authorization on web.
 * The actual callback handling is done in AuthContext, this page just shows
 * a loading state while that happens.
 */
export default function OAuthCallback() {
  const router = useRouter();
  const { isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    // AuthContext handles the OAuth callback automatically on mount
    // Once authentication completes, redirect appropriately
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace("/(tabs)/feed/home");
      } else if (error) {
        // If there's an error, go to login page
        router.replace("/(auth)/login");
      }
      // If not authenticated and no error, AuthContext is still processing
    }
  }, [isAuthenticated, isLoading, error, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Friendly Fediverse</Text>
      <ActivityIndicator size="large" color="#6364FF" />
      <Text style={styles.subtitle}>
        {error ? "Authentication failed..." : "Completing login..."}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#6364FF",
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: "#666666",
    marginTop: 20,
  },
  error: {
    fontSize: 14,
    color: "#dc2626",
    marginTop: 10,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});

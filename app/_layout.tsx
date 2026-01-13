// Import polyfills first, before anything else
import "@polyfills/abortSignal";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { View, Platform, StyleSheet } from "react-native";
import { AuthProvider } from "@contexts/AuthContext";
import { ThemeProvider } from "@contexts/ThemeContext";
import { TimelinesProvider } from "@contexts/TimelinesContext";
import { CACHE_EXPIRATION } from "@lib/storage/constants";

// Conditionally import Vercel Analytics only for web
let Analytics: React.ComponentType | null = null;
if (Platform.OS === "web") {
  try {
    // Dynamic import for web only - using Next.js Analytics component
    const AnalyticsModule = require("@vercel/analytics/next");
    Analytics = AnalyticsModule.Analytics;
  } catch (e) {
    // Analytics not available, continue without it
    console.warn("Vercel Analytics not available:", e);
  }
}

// Create a client with optimized caching to reduce API requests
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: CACHE_EXPIRATION.STALE_TIME, // 5 minutes - refetch in background after this
      gcTime: CACHE_EXPIRATION.FEED, // 60 minutes - keep data in cache
      refetchOnWindowFocus: false, // Don't refetch when app comes back to foreground
      refetchOnReconnect: true, // Do refetch on network reconnect
      refetchOnMount: false, // Don't refetch on component mount if data exists
    },
    mutations: {
      retry: 1, // Only retry mutations once to avoid rate limiting
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ActionSheetProvider>
            <ThemeProvider>
              <AuthProvider>
                <TimelinesProvider>
                  <View style={styles.webContainer}>
                    <View style={styles.contentContainer}>
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: { backgroundColor: "transparent" },
                        }}
                      >
                        <Stack.Screen name="index" />
                        <Stack.Screen name="(auth)" />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen name="(modals)" />
                        <Stack.Screen
                          name="modals/compose"
                          options={{
                            presentation: "modal",
                            headerShown: false,
                          }}
                        />
                        <Stack.Screen
                          name="modals/image-viewer"
                          options={{
                            presentation: "fullScreenModal",
                            headerShown: false,
                          }}
                        />
                      </Stack>
                      <StatusBar style="auto" />
                    </View>
                  </View>
                  {Platform.OS === "web" && Analytics && <Analytics />}
                </TimelinesProvider>
              </AuthProvider>
            </ThemeProvider>
          </ActionSheetProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    ...(Platform.OS === "web" && {
      alignItems: "center",
    }),
  },
  contentContainer: {
    flex: 1,
    width: "100%",
    ...(Platform.OS === "web" && {
      maxWidth: 1024,
    }),
  },
});

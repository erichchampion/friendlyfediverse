import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@contexts/AuthContext";
import { useTheme } from "@contexts/ThemeContext";
import { Input, Card, Spinner } from "@components/base";
import {
  POPULAR_INSTANCES,
  INSTANCE_CATEGORIES,
  PopularInstance,
} from "@lib/instances";
import { validateInstance, getInstanceInfo } from "@lib/api/instance";
import { normalizeInstanceUrl } from "@lib/api/auth";

/**
 * Instance selector screen
 * Phase 2.1: Full implementation
 */
export default function InstanceSelectorScreen() {
  const router = useRouter();
  const { login, isLoading, isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [validatingInstance, setValidatingInstance] = useState<string | null>(
    null,
  );
  const wasLoadingRef = useRef(isLoading);

  // Navigate to home feed when login completes successfully
  // This handles both:
  // 1. First-time login (isAuthenticated becomes true)
  // 2. Adding another account (isLoading goes from true to false while already authenticated)
  useEffect(() => {
    // Check if login just completed (isLoading went from true to false)
    const loginJustCompleted =
      wasLoadingRef.current && !isLoading && isAuthenticated;
    
    // Update ref for next check (must be after the check above)
    wasLoadingRef.current = isLoading;

    if (loginJustCompleted) {
      router.replace("/(tabs)/feed/home");
    }
  }, [isAuthenticated, isLoading, router]);

  // Check if search query looks like a custom hostname (not in the list)
  const isCustomHostname = useMemo(() => {
    if (!searchQuery.trim()) {
      return false;
    }
    
    // Remove protocol and trailing slash if present
    const cleanQuery = searchQuery.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    
    // Must have at least one character
    if (cleanQuery.length === 0) {
      return false;
    }
    
    // Check if it exactly matches any instance domain in the list
    const matchesAnyInstance = POPULAR_INSTANCES.some(
      (i) => i.domain.toLowerCase() === cleanQuery
    );
    
    // If it doesn't exactly match, treat it as a custom hostname
    // The validation will happen when the user tries to connect
    return !matchesAnyInstance;
  }, [searchQuery]);

  // Filter instances based on search and category
  const filteredInstances = useMemo(() => {
    let instances = POPULAR_INSTANCES;

    // Filter by category
    if (selectedCategory) {
      instances = instances.filter((i) => i.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      instances = instances.filter(
        (i) =>
          i.domain.toLowerCase().includes(query) ||
          i.name.toLowerCase().includes(query) ||
          i.description.toLowerCase().includes(query),
      );
    }

    return instances;
  }, [searchQuery, selectedCategory]);

  const handleSelectInstance = async (domain: string) => {
    try {
      setValidatingInstance(domain);

      // Normalize the URL - automatically adds https:// if missing
      const normalizedUrl = normalizeInstanceUrl(domain);

      // Validate instance
      const isValid = await validateInstance(normalizedUrl);
      if (!isValid) {
        Alert.alert(
          "Invalid Instance",
          "This does not appear to be a valid Mastodon instance.",
        );
        return;
      }

      // Get instance info
      const info = await getInstanceInfo(normalizedUrl);
      if (info && !info.registrations) {
        // Stop the validating state while awaiting user choice
        setValidatingInstance(null);
        Alert.alert(
          "Registrations Closed",
          "This instance is not currently accepting new registrations.",
          [
            { text: "Choose Another", style: "cancel" },
            {
              text: "Try Anyway",
              onPress: () => {
                // Ensure the spinner shows while we attempt login
                proceedWithLogin(normalizedUrl);
              },
            },
          ],
        );
        return;
      }

      await proceedWithLogin(normalizedUrl);
    } catch (error) {
      Alert.alert("Error", "Failed to connect to instance. Please try again.");
    } finally {
      setValidatingInstance(null);
    }
  };

  const proceedWithLogin = async (domain: string) => {
    try {
      setValidatingInstance(domain);
      // Domain is already normalized at this point, but normalize again for safety
      const normalizedUrl = normalizeInstanceUrl(domain);
      await login(normalizedUrl);
      // Navigation will happen automatically via useEffect when isAuthenticated becomes true
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Login failed";
      Alert.alert("Login Failed", errorMessage);
    } finally {
      setValidatingInstance(null);
    }
  };

  const renderCategory = ({
    item,
  }: {
    item: (typeof INSTANCE_CATEGORIES)[number];
  }) => {
    const isSelected = selectedCategory === item.key;
    return (
      <TouchableOpacity
        style={[
          styles.categoryChip,
          {
            backgroundColor: isSelected ? colors.primary : colors.card,
            borderColor: isSelected ? colors.primary : colors.border,
          },
        ]}
        onPress={() => setSelectedCategory(isSelected ? null : item.key)}
      >
        <Text style={styles.categoryIcon}>{item.icon}</Text>
        <Text
          style={[
            styles.categoryLabel,
            { color: isSelected ? "#FFFFFF" : colors.text },
          ]}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderInstance = ({ item }: { item: PopularInstance }) => {
    const isValidating = validatingInstance === item.domain;

    return (
      <TouchableOpacity
        disabled={isLoading || isValidating}
        onPress={() => handleSelectInstance(item.domain)}
      >
        <Card style={styles.instanceCard}>
          <View style={styles.instanceHeader}>
            <View style={styles.instanceInfo}>
              <Text style={[styles.instanceName, { color: colors.text }]}>
                {item.name}
              </Text>
              <Text
                style={[styles.instanceDomain, { color: colors.textSecondary }]}
              >
                {item.domain}
              </Text>
            </View>
            {isValidating && (
              <ActivityIndicator
                color={colors.primary}
                testID={`instance-loading-${item.domain}`}
              />
            )}
          </View>

          <Text
            style={[
              styles.instanceDescription,
              { color: colors.textSecondary },
            ]}
            numberOfLines={2}
          >
            {item.description}
          </Text>

          <View style={styles.instanceMeta}>
            {item.userCount && (
              <View style={styles.metaItem}>
                <Text
                  style={[styles.metaText, { color: colors.textSecondary }]}
                >
                  👥 {item.userCount}
                </Text>
              </View>
            )}
            {item.openRegistrations && (
              <View style={styles.metaItem}>
                <Text style={[styles.metaText, { color: colors.success }]}>
                  ✓ Open
                </Text>
              </View>
            )}
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          Choose a Server
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Select from suggested servers or enter any Mastodon-compatible server
        </Text>
      </View>

      <View style={styles.searchSection}>
        <Input
          placeholder="Search servers or enter a hostname (e.g., loops.video)"
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.categoriesWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={INSTANCE_CATEGORIES}
          renderItem={renderCategory}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.categoriesList}
          style={styles.categoriesContainer}
        />
      </View>

      <FlatList
        data={filteredInstances}
        renderItem={renderInstance}
        keyExtractor={(item) => item.domain}
        contentContainerStyle={styles.instancesList}
        ListHeaderComponent={
          isCustomHostname ? (() => {
            const cleanHostname = searchQuery.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
            const isValidating = validatingInstance === cleanHostname;
            return (
              <TouchableOpacity
                disabled={isLoading || isValidating}
                onPress={() => {
                  handleSelectInstance(cleanHostname);
                }}
              >
                <Card style={[
                  styles.instanceCard,
                  styles.customInstanceCard,
                  { borderColor: colors.border }
                ]}>
                  <View style={styles.instanceHeader}>
                    <View style={styles.instanceInfo}>
                      <Text style={[styles.instanceName, { color: colors.text }]}>
                        Connect to Custom Server
                      </Text>
                      <Text
                        style={[styles.instanceDomain, { color: colors.primary }]}
                      >
                        {cleanHostname}
                      </Text>
                    </View>
                    {isValidating && (
                      <ActivityIndicator
                        color={colors.primary}
                        testID="custom-instance-loading"
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.instanceDescription,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Connect to this server if it's not in the list above
                  </Text>
                </Card>
              </TouchableOpacity>
            );
          })() : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {searchQuery.trim() && !isCustomHostname
                ? "No instances found matching your search"
                : "No instances in this category"}
            </Text>
          </View>
        }
      />

      {(isLoading || validatingInstance) && (
        <View style={styles.loadingOverlay}>
          <Spinner size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  searchSection: {
    paddingHorizontal: 20,
  },
  searchInput: {
    marginBottom: 0,
  },
  categoriesWrapper: {
    marginTop: 16,
    marginBottom: 20,
    zIndex: 10,
  },
  categoriesContainer: {
    flexGrow: 0,
  },
  categoriesList: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  instancesList: {
    padding: 20,
    paddingTop: 8,
  },
  instanceCard: {
    marginBottom: 12,
    padding: 16,
  },
  customInstanceCard: {
    borderWidth: 2,
    borderStyle: "dashed",
  },
  instanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  instanceInfo: {
    flex: 1,
  },
  instanceName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  instanceDomain: {
    fontSize: 14,
  },
  instanceDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  instanceMeta: {
    flexDirection: "row",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
});

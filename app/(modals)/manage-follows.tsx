import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  TextInput,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@contexts/ThemeContext";
import { useAuth } from "@contexts/AuthContext";
import { getActiveClient } from "@lib/api/client";
import {
  getFollowedAccounts,
  getFollowedHashtags,
  getSuggestions,
  followAccountByAcct,
  followHashtagByName,
} from "@lib/api/mastodonRequests";
import { Follow } from "@components/base/Follow";
import type { mastodon } from "masto";

type TabType = "accounts" | "hashtags" | "suggestions";

/**
 * Manage Follows Modal
 * Displays followed accounts, hashtags, and account suggestions
 */
export default function ManageFollowsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();

  // Initialize tab from route params or default to 'accounts'
  const initialTab = (params.tab as TabType) || "accounts";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [isLoading, setIsLoading] = useState(true);

  // Data states
  const [accounts, setAccounts] = useState<mastodon.v1.Account[]>([]);
  const [hashtags, setHashtags] = useState<mastodon.v1.Tag[]>([]);
  const [suggestions, setSuggestions] = useState<mastodon.v1.Account[]>([]);

  // Input states
  const [followInput, setFollowInput] = useState("");
  const [isSubmittingFollow, setIsSubmittingFollow] = useState(false);

  // Fetch data based on active tab
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const activeClient = await getActiveClient();
        if (!activeClient) {
          throw new Error("No active client");
        }

        if (activeTab === "accounts") {
          const followedAccounts = await getFollowedAccounts(
            activeClient.client,
          );
          setAccounts(followedAccounts);
        } else if (activeTab === "hashtags") {
          const followedHashtags = await getFollowedHashtags(
            activeClient.client,
          );
          setHashtags(followedHashtags);
        } else if (activeTab === "suggestions") {
          const accountSuggestions = await getSuggestions(
            activeClient.client,
            20,
          );
          setSuggestions(accountSuggestions);
        }

        setIsLoading(false);
      } catch (error) {
        console.error("[ManageFollows] Error fetching data:", error);
        setIsLoading(false);
        Alert.alert("Error", "Failed to load data. Please try again.");
      }
    };

    fetchData();
  }, [activeTab]);

  const handleAddFollow = async () => {
    if (!followInput.trim() || isSubmittingFollow) return;

    try {
      setIsSubmittingFollow(true);
      const activeClient = await getActiveClient();
      if (!activeClient) {
        throw new Error("No active client");
      }

      if (activeTab === "accounts") {
        await followAccountByAcct(activeClient.client, followInput);
        Alert.alert("Success", "Account followed successfully!");
        // Refresh the list
        const followedAccounts = await getFollowedAccounts(activeClient.client);
        setAccounts(followedAccounts);
      } else if (activeTab === "hashtags") {
        await followHashtagByName(activeClient.client, followInput);
        Alert.alert("Success", "Hashtag followed successfully!");
        // Refresh the list
        const followedHashtags = await getFollowedHashtags(activeClient.client);
        setHashtags(followedHashtags);
      }

      setFollowInput("");
    } catch (error) {
      console.error("[ManageFollows] Error adding follow:", error);
      Alert.alert(
        "Error",
        `Failed to follow ${activeTab === "accounts" ? "account" : "hashtag"}. Please check the input and try again.`,
      );
    } finally {
      setIsSubmittingFollow(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

  const handleAccountPress = (accountId: string) => {
    router.back();
    router.push(`/(tabs)/feed/account/${accountId}` as any);
  };

  const handleHashtagPress = (hashtag: string) => {
    router.back();
    router.push(`/(tabs)/feed/hashtag/${hashtag}` as any);
  };

  const stripHtml = (html: string) => {
    return html.replace(/<[^>]*>/g, "");
  };

  const renderTabButton = (tab: TabType, label: string, icon: string) => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        key={tab}
        style={[
          styles.tabButton,
          isActive && {
            borderBottomColor: colors.primary,
            borderBottomWidth: 2,
          },
        ]}
        onPress={() => setActiveTab(tab)}
      >
        <Text style={[styles.tabIcon, { opacity: isActive ? 1 : 0.5 }]}>
          {icon}
        </Text>
        <Text
          style={[
            styles.tabLabel,
            { color: isActive ? colors.text : colors.textSecondary },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderAccounts = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading accounts...
          </Text>
        </View>
      );
    }

    if (accounts.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyIcon, { color: colors.textSecondary }]}>
            👥
          </Text>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            No followed accounts
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Accounts you follow will appear here
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {accounts.map((account) => (
          <TouchableOpacity
            key={account.id}
            style={[styles.accountItem, { backgroundColor: colors.card }]}
            onPress={() => handleAccountPress(account.id)}
          >
            <Image source={{ uri: account.avatar }} style={styles.avatar} />
            <View style={styles.accountInfo}>
              <Text style={[styles.displayName, { color: colors.text }]}>
                {account.displayName || account.username}
              </Text>
              <Text style={[styles.username, { color: colors.textSecondary }]}>
                @{account.acct}
              </Text>
            </View>
            <Follow accountId={account.id} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderHashtags = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading hashtags...
          </Text>
        </View>
      );
    }

    if (hashtags.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyIcon, { color: colors.textSecondary }]}>
            🏷️
          </Text>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            No followed hashtags
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Hashtags you follow will appear here
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {hashtags.map((tag) => (
          <TouchableOpacity
            key={tag.name}
            style={[styles.hashtagItem, { backgroundColor: colors.card }]}
            onPress={() => handleHashtagPress(tag.name)}
          >
            <View style={styles.hashtagInfo}>
              <Text style={[styles.hashtagName, { color: colors.text }]}>
                #{tag.name}
              </Text>
              {tag.history && tag.history.length > 0 && (
                <Text
                  style={[styles.hashtagStats, { color: colors.textSecondary }]}
                >
                  {tag.history[0].uses} uses today
                </Text>
              )}
            </View>
            <Follow hashtagName={tag.name} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderSuggestions = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading suggestions...
          </Text>
        </View>
      );
    }

    if (suggestions.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyIcon, { color: colors.textSecondary }]}>
            💡
          </Text>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            No suggestions available
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Check back later for account suggestions
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {suggestions
          .filter((suggestion) => {
            // Suggestions are Account objects, not wrapped in Suggestion
            return suggestion && suggestion.id;
          })
          .map((suggestion) => {
            // API returns Account objects directly
            const account = suggestion;
            return (
              <TouchableOpacity
                key={account.id}
                style={[
                  styles.suggestionItem,
                  { backgroundColor: colors.card },
                ]}
                onPress={() => handleAccountPress(account.id)}
              >
                <Image source={{ uri: account.avatar }} style={styles.avatar} />
                <View style={styles.suggestionInfo}>
                  <Text style={[styles.displayName, { color: colors.text }]}>
                    {account.displayName || account.username}
                  </Text>
                  <Text
                    style={[styles.username, { color: colors.textSecondary }]}
                  >
                    @{account.acct}
                  </Text>
                  {account.note && (
                    <Text
                      style={[styles.bio, { color: colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      {stripHtml(account.note)}
                    </Text>
                  )}
                  <View style={styles.suggestionStats}>
                    <Text
                      style={[styles.statText, { color: colors.textSecondary }]}
                    >
                      {account.followersCount} followers
                    </Text>
                    <Text
                      style={[
                        styles.statDivider,
                        { color: colors.textSecondary },
                      ]}
                    >
                      •
                    </Text>
                    <Text
                      style={[styles.statText, { color: colors.textSecondary }]}
                    >
                      {account.statusesCount} posts
                    </Text>
                  </View>
                </View>
                <Follow accountId={account.id} />
              </TouchableOpacity>
            );
          })}
      </ScrollView>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "accounts":
        return renderAccounts();
      case "hashtags":
        return renderHashtags();
      case "suggestions":
        return renderSuggestions();
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 20, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>Follow</Text>
        <TouchableOpacity onPress={handleClose}>
          <Text style={[styles.closeButton, { color: colors.primary }]}>
            Done
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View style={[styles.tabContainer, { borderBottomColor: colors.border }]}>
        {renderTabButton("accounts", "Accounts", "👥")}
        {renderTabButton("hashtags", "Hashtags", "🏷️")}
        {renderTabButton("suggestions", "Suggestions", "💡")}
      </View>

      {/* Add Follow Input */}
      {(activeTab === "accounts" || activeTab === "hashtags") && (
        <View
          style={[
            styles.addFollowContainer,
            { borderBottomColor: colors.border },
          ]}
        >
          <TextInput
            style={[
              styles.addFollowInput,
              {
                backgroundColor: colors.card,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder={
              activeTab === "accounts"
                ? "Add account (e.g. user@domain)"
                : "Add hashtag (e.g. kittens)"
            }
            placeholderTextColor={colors.textSecondary}
            value={followInput}
            onChangeText={setFollowInput}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleAddFollow}
            returnKeyType="done"
            editable={!isSubmittingFollow}
          />
          <TouchableOpacity
            style={[
              styles.addFollowButton,
              { backgroundColor: colors.primary },
              (!followInput.trim() || isSubmittingFollow) && { opacity: 0.5 },
            ]}
            onPress={handleAddFollow}
            disabled={!followInput.trim() || isSubmittingFollow}
          >
            {isSubmittingFollow ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.addFollowButtonText}>Follow</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  closeButton: {
    fontSize: 16,
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 20,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 6,
  },
  tabIcon: {
    fontSize: 16,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  addFollowContainer: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  addFollowInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  addFollowButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  addFollowButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  accountItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  accountInfo: {
    flex: 1,
    marginLeft: 12,
  },
  displayName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
  },
  hashtagItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  hashtagInfo: {
    flex: 1,
  },
  hashtagName: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  hashtagStats: {
    fontSize: 13,
  },
  suggestionItem: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  suggestionInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  bio: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  suggestionStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  statText: {
    fontSize: 12,
  },
  statDivider: {
    fontSize: 12,
  },
});

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { useState, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@contexts/ThemeContext";
import { useAuth } from "@contexts/AuthContext";
import { useTimelines } from "@contexts/TimelinesContext";
import { getActiveClient } from "@lib/api/client";
import type { User } from "@types";

/**
 * Current User Profile Modal
 * Displays the authenticated user's profile with account settings
 */
export default function CurrentUserProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: authUser, instance, isLoading: authLoading } = useAuth();
  const { addAccountFeed } = useTimelines();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleClose = () => {
    router.back();
  };

  const handleEditProfile = () => {
    router.push("/(modals)/edit-profile" as any);
  };

  const handleAccountSettings = () => {
    router.push("/(modals)/account-settings" as any);
  };

  const handleManageFollows = () => {
    router.push("/(modals)/manage-follows" as any);
  };

  const handleViewFeed = () => {
    if (!user) return;

    // Add account feed and navigate to it
    addAccountFeed(user.id, user.displayName);
    router.back();
    router.push(`/(tabs)/feed/account/${user.id}` as any);
  };

  // Fetch full account details with statistics
  useEffect(() => {
    const fetchCurrentUserProfile = async () => {
      // Wait for auth to be ready
      if (authLoading) {
        return;
      }

      if (!authUser) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const activeClient = await getActiveClient();
        if (!activeClient) {
          throw new Error("No active client");
        }

        // Fetch full account details for the current user
        const account =
          await activeClient.client.v1.accounts.verifyCredentials();

        // Transform to User type
        const transformedUser: User = {
          id: account.id,
          username: account.username,
          displayName: account.displayName || account.username,
          avatar: account.avatar,
          header: account.header || "",
          followersCount: account.followersCount || 0,
          followingCount: account.followingCount || 0,
          statusesCount: account.statusesCount || 0,
          note: account.note || "",
          url: account.url || "",
          acct: account.acct,
          locked: account.locked || false,
          bot: account.bot || false,
          createdAt: account.createdAt,
          fields: account.fields || [],
          emojis: account.emojis || [],
        };

        setUser(transformedUser);
      } catch (err) {
        console.error("[CurrentUserProfile] Error fetching user:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUserProfile();
  }, [authUser, authLoading]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading profile...
          </Text>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorIcon, { color: colors.error }]}>⚠️</Text>
          <Text style={[styles.errorText, { color: colors.text }]}>
            Not logged in
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={handleClose}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Strip HTML from note
  const stripHtml = (html: string) => {
    return html.replace(/<[^>]*>/g, "");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Image - Absolutely positioned behind everything */}
      {user.header && (
        <Image
          source={{ uri: user.header }}
          style={[styles.headerImage, { height: 150 + insets.top }]}
          resizeMode="cover"
        />
      )}

      {/* ScrollView with content - This will render on top of header image */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={
          user.header
            ? {
                paddingTop: 150 + insets.top - 40,
                paddingBottom: insets.bottom + 20,
              }
            : { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }
        }
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <Image
            source={{ uri: user.avatar }}
            style={[styles.avatar, { borderColor: colors.background }]}
          />
          {user.bot && (
            <View
              style={[styles.botBadge, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.botBadgeText}>🤖 BOT</Text>
            </View>
          )}
        </View>

        {/* User Info */}
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.text }]}>
              {user.displayName}
            </Text>
            {user.locked && <Text style={styles.lockIcon}>🔒</Text>}
          </View>
          <Text style={[styles.username, { color: colors.textSecondary }]}>
            @{user.acct}
          </Text>

          {/* Bio */}
          {user.note && (
            <Text style={[styles.bio, { color: colors.text }]}>
              {stripHtml(user.note)}
            </Text>
          )}

          {/* Stats */}
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {user.statusesCount.toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Posts
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {user.followingCount.toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Following
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {user.followersCount.toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Followers
              </Text>
            </View>
          </View>

          {/* View Feed Button */}
          <TouchableOpacity
            style={[styles.viewFeedButton, { backgroundColor: colors.primary }]}
            onPress={handleViewFeed}
          >
            <Text style={styles.buttonText}>View Feed</Text>
          </TouchableOpacity>

          {/* Account Section */}
          <View style={styles.accountSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Account
            </Text>

            <View
              style={[styles.accountCard, { backgroundColor: colors.card }]}
            >
              <TouchableOpacity
                style={[
                  styles.accountItem,
                  { borderBottomColor: colors.border },
                ]}
                onPress={handleManageFollows}
              >
                <Text style={[styles.accountItemText, { color: colors.text }]}>
                  Follow
                </Text>
                <Text
                  style={[
                    styles.accountItemIcon,
                    { color: colors.textSecondary },
                  ]}
                >
                  →
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.accountItem,
                  { borderBottomColor: colors.border },
                ]}
                onPress={handleEditProfile}
              >
                <Text style={[styles.accountItemText, { color: colors.text }]}>
                  Edit Profile
                </Text>
                <Text
                  style={[
                    styles.accountItemIcon,
                    { color: colors.textSecondary },
                  ]}
                >
                  →
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.accountItem}
                onPress={handleAccountSettings}
              >
                <Text style={[styles.accountItemText, { color: colors.text }]}>
                  Account Settings
                </Text>
                <Text
                  style={[
                    styles.accountItemIcon,
                    { color: colors.textSecondary },
                  ]}
                >
                  →
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Fields */}
          {user.fields && user.fields.length > 0 && (
            <View style={styles.fields}>
              {user.fields.map((field, index) => (
                <View
                  key={index}
                  style={[styles.field, { borderBottomColor: colors.border }]}
                >
                  <Text
                    style={[styles.fieldName, { color: colors.textSecondary }]}
                  >
                    {field.name}
                  </Text>
                  <Text style={[styles.fieldValue, { color: colors.text }]}>
                    {stripHtml(field.value)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Close button - Absolutely positioned on top (no menu button for current user) */}
      <View style={[styles.headerButtons, { top: insets.top + 16 }]}>
        <TouchableOpacity
          style={[styles.headerButton, { backgroundColor: colors.card }]}
          onPress={handleClose}
        >
          <Text style={[styles.headerButtonText, { color: colors.text }]}>
            ✕
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 24,
  },
  headerImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: "100%",
    height: 150,
    zIndex: 0,
  },
  headerButtons: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 10,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  headerButtonText: {
    fontSize: 20,
    fontWeight: "300",
  },
  content: {
    flex: 1,
  },
  avatarContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
  },
  botBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  botBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  userInfo: {
    paddingHorizontal: 16,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  displayName: {
    fontSize: 24,
    fontWeight: "bold",
  },
  lockIcon: {
    fontSize: 16,
  },
  username: {
    fontSize: 15,
    marginTop: 4,
    marginBottom: 16,
  },
  bio: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  stats: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 20,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  viewFeedButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  accountSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  accountCard: {
    borderRadius: 8,
    overflow: "hidden",
  },
  accountItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  accountItemText: {
    fontSize: 16,
  },
  accountItemIcon: {
    fontSize: 20,
  },
  fields: {
    marginTop: 8,
  },
  field: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  fieldName: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 14,
    lineHeight: 20,
  },
});

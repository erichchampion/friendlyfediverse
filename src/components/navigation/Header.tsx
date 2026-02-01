import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@contexts/AuthContext";
import { useTheme } from "@contexts/ThemeContext";
import { FeedSelector } from "./FeedSelector";

interface HeaderProps {
  title?: string;
  showUserInfo?: boolean;
  onMenuPress?: () => void;
  onNewPostPress?: () => void;
}

/**
 * Global Header Component
 * Matches the web app's header design with user info, navigation, and actions
 * Includes safe area support for notched devices
 */
export function Header({
  title,
  showUserInfo = true,
  onMenuPress,
  onNewPostPress,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { instance, user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const getInstanceHostname = () => {
    if (!instance?.url) return "";
    try {
      const url = new URL(instance.url);
      return url.hostname;
    } catch {
      return "";
    }
  };

  return (
    <View
      style={[
        styles.wrapper,
        { paddingTop: insets.top, backgroundColor: colors.card },
      ]}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        {/* Left side - User avatar and info */}
        <View style={styles.leftSection}>
          {showUserInfo && user ? (
            <>
              <TouchableOpacity
                onPress={() => router.push("/(modals)/current-user-profile")}
              >
                <Image
                  source={{
                    uri: user.avatar || "https://via.placeholder.com/32",
                  }}
                  style={styles.avatar}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/(modals)/current-user-profile")}
                style={styles.userInfo}
              >
                <Text
                  style={[styles.displayName, { color: colors.text }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {user.displayName?.trim() || user.username}
                </Text>
                <Text
                  style={[styles.username, { color: colors.textSecondary }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  @{user.username}@{getInstanceHostname()}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[styles.title, { color: colors.text }]}>
              {title || "Friendly Fediverse"}
            </Text>
          )}
        </View>

        {/* Center - Feed selector */}
        <View style={styles.centerSection}>
          <FeedSelector />
        </View>

        {/* Right side - Action buttons */}
        <View style={styles.rightSection}>
          {onNewPostPress && (
            <TouchableOpacity
              onPress={onNewPostPress}
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="create" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          {onMenuPress && (
            <TouchableOpacity
              onPress={onMenuPress}
              style={[styles.iconButton, { backgroundColor: colors.card }]}
            >
              <Text style={[styles.iconText, { color: colors.text }]}>☰</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    height: 60,
  },
  leftSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  centerSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 400,
    marginHorizontal: 8,
  },
  rightSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  userInfo: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  displayName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  username: {
    fontSize: 12,
    fontWeight: "400",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
});

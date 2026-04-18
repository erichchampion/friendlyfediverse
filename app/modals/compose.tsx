import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useActionSheet } from "@expo/react-native-action-sheet";
import { useTheme } from "@contexts/ThemeContext";
import { useAuth } from "@contexts/AuthContext";
import { useSettings } from "@hooks/useSettings";
import { getActiveClient } from "@lib/api/client";
import { Avatar, Button } from "@components/base";

/**
 * Compose post modal
 * Phase 5: Full implementation
 */

type Visibility = "public" | "unlisted" | "private" | "direct";

interface MediaAttachment {
  uri: string;
  type: string;
  fileName: string;
}

export default function ComposeModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    replyToId?: string;
    replyToUsername?: string;
    replyToContent?: string;
  }>();
  const { showActionSheetWithOptions } = useActionSheet();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { highQualityUploads } = useSettings();

  const isReply = !!params.replyToId;

  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [showCW, setShowCW] = useState(false);
  const [cwText, setCwText] = useState("");
  const [mediaAttachments, setMediaAttachments] = useState<MediaAttachment[]>(
    [],
  );
  const [isPosting, setIsPosting] = useState(false);

  // Pre-fill content with @username when replying
  useEffect(() => {
    if (params.replyToUsername && !content) {
      setContent(`@${params.replyToUsername} `);
    }
  }, [params.replyToUsername]);

  const CHARACTER_LIMIT = 500;
  const remainingChars = CHARACTER_LIMIT - content.length;

  const handleClose = () => {
    const dismiss = () => {
      try {
        const canGoBack =
          typeof router.canGoBack === "function"
            ? router.canGoBack()
            : true;
        if (canGoBack) {
          router.back();
        } else {
          router.replace("/(tabs)/feed/home");
        }
      } catch (e) {
        router.replace("/(tabs)/feed/home");
      }
    };

    if (content.trim() || mediaAttachments.length > 0) {
      showActionSheetWithOptions(
        {
          title: "Discard Post?",
          message: "Are you sure you want to discard this post?",
          options: ["Cancel", "Discard"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            dismiss();
          }
        },
      );
    } else {
      dismiss();
    }
  };

  const handlePickImage = async () => {
    if (mediaAttachments.length >= 4) {
      Alert.alert("Limit Reached", "You can attach up to 4 media files");
      return;
    }

    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permission Required",
          "Permission to access media library is required",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: false,
        quality: highQualityUploads ? 1.0 : 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setMediaAttachments([
          ...mediaAttachments,
          {
            uri: asset.uri,
            type: asset.type || "image",
            fileName: asset.fileName || "upload.jpg",
          },
        ]);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick media");
    }
  };

  const handleRemoveMedia = (index: number) => {
    setMediaAttachments(mediaAttachments.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!content.trim() && mediaAttachments.length === 0) {
      Alert.alert("Empty Post", "Please add some content or media");
      return;
    }

    try {
      setIsPosting(true);

      const activeClient = await getActiveClient();
      if (!activeClient) {
        throw new Error("No active client");
      }

      const { client } = activeClient;

      // Note: Media upload would need special handling for React Native
      // For now, we'll post text-only
      // Full media upload implementation would require FormData and file handling

      await client.v1.statuses.create({
        status: content,
        visibility,
        spoilerText: showCW ? cwText : undefined,
        inReplyToId: params.replyToId || undefined,
        // mediaIds: uploadedMediaIds, // Would be added after media upload
      });

      Alert.alert("Success", "Post published successfully");
      router.back();
    } catch (error) {
      console.error("Error posting:", error);
      Alert.alert("Error", "Failed to publish post. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

  const visibilityOptions = [
    { value: "public" as Visibility, label: "Public", icon: "🌍" },
    { value: "unlisted" as Visibility, label: "Unlisted", icon: "🔓" },
    { value: "private" as Visibility, label: "Followers", icon: "🔒" },
    { value: "direct" as Visibility, label: "Direct", icon: "✉️" },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, paddingTop: insets.top + 12 },
        ]}
      >
        <TouchableOpacity onPress={handleClose} disabled={isPosting}>
          <Text style={[styles.headerButton, { color: colors.text }]}>
            Cancel
          </Text>
        </TouchableOpacity>

        <Button
          title={isPosting ? "Posting..." : "Post"}
          onPress={handlePost}
          disabled={
            isPosting || (!content.trim() && mediaAttachments.length === 0)
          }
          loading={isPosting}
          variant="primary"
          size="small"
        />
      </View>

      <ScrollView style={styles.content}>
        {/* User info */}
        {user && (
          <View style={styles.userInfo}>
            <Avatar uri={user.avatar} size={48} />
            <View style={styles.userMeta}>
              <Text style={[styles.displayName, { color: colors.text }]}>
                {user.displayName}
              </Text>
              <Text style={[styles.username, { color: colors.textSecondary }]}>
                @{user.username}
              </Text>
            </View>
          </View>
        )}

        {/* Reply context indicator */}
        {isReply && params.replyToUsername && (
          <View
            style={[
              styles.replyContext,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.replyText, { color: colors.textSecondary }]}>
              Replying to @{params.replyToUsername}
            </Text>
            {params.replyToContent && (
              <Text
                style={[styles.replyContent, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {params.replyToContent.replace(/<[^>]*>/g, "")}
              </Text>
            )}
          </View>
        )}

        {/* Content Warning */}
        {showCW && (
          <View style={styles.cwContainer}>
            <TextInput
              style={[
                styles.cwInput,
                { color: colors.text, borderColor: colors.border },
              ]}
              placeholder="Content warning"
              placeholderTextColor={colors.textSecondary}
              value={cwText}
              onChangeText={setCwText}
              editable={!isPosting}
            />
          </View>
        )}

        {/* Text input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.textInput, { color: colors.text }]}
            placeholder="What's on your mind?"
            placeholderTextColor={colors.textSecondary}
            multiline
            value={content}
            onChangeText={setContent}
            editable={!isPosting}
            autoFocus
          />
        </View>

        {/* Media preview */}
        {mediaAttachments.length > 0 && (
          <View style={styles.mediaContainer}>
            {mediaAttachments.map((media, index) => (
              <View key={index} style={styles.mediaItem}>
                <Image source={{ uri: media.uri }} style={styles.mediaImage} />
                <TouchableOpacity
                  style={styles.removeMediaButton}
                  onPress={() => handleRemoveMedia(index)}
                  disabled={isPosting}
                >
                  <Text style={styles.removeMediaText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View
        style={[
          styles.footer,
          { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 },
        ]}
      >
        {/* Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={handlePickImage}
            disabled={isPosting || mediaAttachments.length >= 4}
          >
            <Text style={styles.toolIcon}>📷</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => setShowCW(!showCW)}
            disabled={isPosting}
          >
            <Text style={styles.toolIcon}>{showCW ? "⚠️" : "CW"}</Text>
          </TouchableOpacity>

          {/* Visibility selector */}
          <View style={styles.visibilitySelector}>
            {visibilityOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.visibilityButton,
                  visibility === option.value && {
                    backgroundColor: colors.primary + "20",
                  },
                ]}
                onPress={() => setVisibility(option.value)}
                disabled={isPosting}
              >
                <Text style={styles.visibilityIcon}>{option.icon}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Character count */}
        <View style={styles.charCount}>
          <Text
            style={[
              styles.charCountText,
              {
                color:
                  remainingChars < 0
                    ? colors.error
                    : remainingChars < 50
                      ? colors.warning
                      : colors.textSecondary,
              },
            ]}
          >
            {remainingChars}
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    flexGrow: 1,
  },
  userInfo: {
    flexDirection: "row",
    padding: 16,
    alignItems: "center",
  },
  userMeta: {
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
  replyContext: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  replyText: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  replyContent: {
    fontSize: 13,
    lineHeight: 18,
  },
  cwContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  cwInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  inputContainer: {
    paddingHorizontal: 16,
    flex: 1,
    minHeight: 200,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: "top",
    flex: 1,
    minHeight: 180,
  },
  mediaContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 16,
  },
  mediaItem: {
    width: 100,
    height: 100,
    position: "relative",
  },
  mediaImage: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  removeMediaButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  removeMediaText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  toolButton: {
    padding: 8,
  },
  toolIcon: {
    fontSize: 20,
  },
  visibilitySelector: {
    flexDirection: "row",
    marginLeft: "auto",
    gap: 4,
  },
  visibilityButton: {
    padding: 8,
    borderRadius: 8,
  },
  visibilityIcon: {
    fontSize: 18,
  },
  charCount: {
    alignItems: "flex-end",
  },
  charCountText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
} from "react-native";
import { memo, useCallback, useState, useRef } from "react";
import { useRouter } from "expo-router";
import type { Post } from "@types";
import { RichText } from "@components/base";
import { MediaGrid } from "@components/media";
import { useTheme } from "@contexts/ThemeContext";
import { getPlainTextContent, stripHtml } from "@lib/api/timeline";
import { LinkCard } from "./LinkCard";
import { useDelayedClick } from "@hooks/useDelayedClick";
import { haveMediaAttachmentsChanged } from "@lib/utils/postComparison";

/**
 * Post Content Component
 * Displays the main post content, media, and link cards
 * Extracted from PostCard to support sticky headers
 */

interface PostContentProps {
  post: Post;
  onPress?: (post: Post) => void;
  onDoubleClick?: () => void;
  isDoubleTapLiking?: boolean;
  heartPosition?: Animated.Value;
  heartOpacity?: Animated.Value;
  isVisible?: boolean;
}

// Comparison function for PostContent memoization
const arePostContentPropsEqual = (
  prevProps: PostContentProps,
  nextProps: PostContentProps,
) => {
  // Check if media attachments changed using shared utility
  const mediaChanged = haveMediaAttachmentsChanged(
    prevProps.post.mediaAttachments,
    nextProps.post.mediaAttachments,
  );

  // Only re-render if post ID, content, media, or interactive state has changed
  return (
    prevProps.post.id === nextProps.post.id &&
    prevProps.post.content === nextProps.post.content &&
    prevProps.post.spoilerText === nextProps.post.spoilerText &&
    prevProps.post.sensitive === nextProps.post.sensitive &&
    !mediaChanged &&
    prevProps.post.card === nextProps.post.card &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.onDoubleClick === nextProps.onDoubleClick &&
    prevProps.isDoubleTapLiking === nextProps.isDoubleTapLiking &&
    prevProps.isVisible === nextProps.isVisible &&
    // Animated values are object references, so just check if they exist
    prevProps.heartPosition === nextProps.heartPosition &&
    prevProps.heartOpacity === nextProps.heartOpacity
  );
};

export const PostContent = memo<PostContentProps>(function PostContent({
  post,
  onPress,
  onDoubleClick,
  isDoubleTapLiking,
  heartPosition,
  heartOpacity,
  isVisible = true,
}) {
  const router = useRouter();
  const { colors } = useTheme();

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress(post);
    }
    // TODO: Implement post detail screen navigation
  }, [onPress, post]);

  const handleDelayedClick = useDelayedClick({
    onSingleClick: handlePress,
    onDoubleClick: onDoubleClick || (() => {}),
  });

  const createDelayedHandler = useCallback(
    (singleAction: () => void, key: string = post.id) => {
      return () =>
        handleDelayedClick(key, {
          onSingleClick: singleAction,
          onDoubleClick: onDoubleClick || (() => {}),
        });
    },
    [handleDelayedClick, onDoubleClick],
  );

  const handleLinkPress = useCallback(
    (url: string) =>
      createDelayedHandler(
        () =>
          Linking.openURL(url).catch((error) => {
            console.error("Error opening link:", error);
          }),
        post.id,
      ),
    [createDelayedHandler, post.id],
  );

  // Get plain text content
  const content = getPlainTextContent(post);

  return (
    <TouchableOpacity
      style={styles.content}
      onPress={createDelayedHandler(handlePress)}
      activeOpacity={0.7}
      testID="post-content"
    >
      {/* Content Warning */}
      {post.spoilerText && (
        <View
          style={[
            styles.contentWarning,
            { backgroundColor: colors.background },
          ]}
        >
          <Text style={[styles.contentWarningText, { color: colors.text }]}>
            CW: {stripHtml(post.spoilerText)}
          </Text>
        </View>
      )}

      {/* Post content */}
      <View style={styles.body}>
        <RichText post={post} content={content} />
      </View>

      {/* Media attachments */}
      {post.mediaAttachments.length > 0 && (
        <View testID="media-container" style={styles.mediaContainer}>
          <MediaGrid
            media={post.mediaAttachments}
            sensitive={post.sensitive}
            mode="list"
            isVisible={isVisible}
            onDoubleClick={onDoubleClick}
          />

          {/* Animated heart overlay for double-tap like */}
          {isDoubleTapLiking && heartPosition && heartOpacity && (
            <Animated.View
              testID="double-tap-heart"
              style={[
                styles.heartOverlay,
                {
                  transform: [
                    {
                      translateY: heartPosition.interpolate({
                        inputRange: [0, 100],
                        outputRange: ["0%", "100%"],
                      }),
                    },
                  ],
                  opacity: heartOpacity,
                },
              ]}
            >
              <Text style={styles.heartEmoji}>❤️</Text>
            </Animated.View>
          )}
        </View>
      )}

      {/* Link preview card */}
      {post.card && post.mediaAttachments.length === 0 && (
        <LinkCard card={post.card} onPress={handleLinkPress(post.card.url)} />
      )}
    </TouchableOpacity>
  );
}, arePostContentPropsEqual);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  contentWarning: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  contentWarningText: {
    fontSize: 14,
    fontWeight: "500",
  },
  body: {
    marginBottom: 12,
  },
  mediaContainer: {
    position: "relative",
    marginBottom: 12,
  },
  heartOverlay: {
    position: "absolute",
    left: "50%",
    marginLeft: -32, // Half of heart emoji size to center
    zIndex: 1000,
    pointerEvents: "none",
  },
  heartEmoji: {
    fontSize: 64,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
});

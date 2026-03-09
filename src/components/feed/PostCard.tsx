import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { memo, useCallback, useState, useRef } from "react";
import { useRouter } from "expo-router";
import type { Post } from "@types";
import { RichText } from "@components/base";
import { MediaGrid } from "@components/media";
import { useTheme } from "@contexts/ThemeContext";
import { useAuth } from "@contexts/AuthContext";
import { usePostInteractions } from "@hooks/usePostInteractions";
import { useRelationship } from "@hooks/useRelationship";
import { PostHeader } from "./PostHeader";
import { LinkCard } from "./LinkCard";
import { CommentsSection } from "./CommentsSection";
import {
  getDisplayPost,
  getPlainTextContent,
  stripHtml,
} from "@lib/api/timeline";
import { STYLE_CONSTANTS } from "@lib/styleConstants";

/**
 * Post Card Component
 * Phase 3: Feed System
 * Phase 4: Enhanced with media display
 * Phase 5: Interactive buttons
 * Phase 7: Performance optimized with memo
 * Phase 8: Added double-tap to like with animated feedback
 */

interface PostCardProps {
  post: Post;
  onPress?: (post: Post) => void;
  onUpdate?: (updatedPost: Post) => void;
  isVisible?: boolean;
}

// Custom comparison function for memo to prevent unnecessary re-renders
const arePostsEqual = (prevProps: PostCardProps, nextProps: PostCardProps) => {
  // Only re-render if the post ID or interactive state has changed
  return (
    prevProps.post.id === nextProps.post.id &&
    prevProps.post.favourited === nextProps.post.favourited &&
    prevProps.post.reblogged === nextProps.post.reblogged &&
    prevProps.post.bookmarked === nextProps.post.bookmarked &&
    prevProps.post.favouritesCount === nextProps.post.favouritesCount &&
    prevProps.post.reblogsCount === nextProps.post.reblogsCount &&
    prevProps.post.repliesCount === nextProps.post.repliesCount &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.onUpdate === nextProps.onUpdate &&
    prevProps.isVisible === nextProps.isVisible
  );
};

export const PostCard = memo<PostCardProps>(function PostCard({
  post,
  onPress,
  onUpdate,
  isVisible = true,
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();

  // Defensive check: bail out if post data is invalid
  if (!post || !post.id) {
    console.warn("[PostCard] Invalid post data received");
    return null;
  }

  // Double-click state
  const [isDoubleTapLiking, setIsDoubleTapLiking] = useState(false);
  const [localFavourited, setLocalFavourited] = useState(
    post.favourited || false,
  );
  const heartPosition = useRef(new Animated.Value(100)).current; // Start from bottom (100%)
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const isProcessingDoubleLike = useRef(false);

  // Callback for when post is deleted
  const handlePostDelete = useCallback(
    (postId: string) => {
      // Post was deleted successfully
      // Parent component should handle removing it from the list
      onUpdate?.(post); // Trigger parent update to refresh
    },
    [post, onUpdate],
  );

  // Post interactions
  const {
    post: interactivePost,
    isProcessing,
    toggleFavorite,
    toggleBoost,
    toggleBookmark,
    reply,
    share,
    deletePost,
  } = usePostInteractions({ post, onUpdate, onDelete: handlePostDelete });

  // Handle boosts - get the actual post to display
  const displayPost = getDisplayPost(interactivePost);

  // Query relationship status for the post author
  const { isFollowing } = useRelationship({
    accountId: displayPost?.account?.id,
  });

  // Defensive check: ensure displayPost and account exist
  if (
    !displayPost ||
    !displayPost.id ||
    !displayPost.account ||
    !displayPost.account.id
  ) {
    console.warn("[PostCard] Invalid displayPost or account data");
    return null;
  }

  const isBoost = post.reblog !== null && post.reblog !== undefined;

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress(post);
    }
    // TODO: Implement post detail screen navigation
  }, [onPress, post, displayPost.id]);

  const handleProfilePress = useCallback(
    (accountId: string) => {
      // Navigate to profile (Phase 6)
      router.push(`/(modals)/user-profile?accountId=${accountId}`);
    },
    [router, displayPost.account.id],
  );

  const handleReply = useCallback(() => {
    // Navigate to compose modal with reply context
    const replyParams = new URLSearchParams({
      replyToId: displayPost.id,
      replyToUsername: displayPost.account.username,
      replyToContent: stripHtml(displayPost.content),
    });
    router.push(`/modals/compose?${replyParams.toString()}`);
  }, [
    router,
    displayPost.id,
    displayPost.account.username,
    displayPost.content,
  ]);

  // Handle double-click to like
  // This is called by MediaGrid when a double-click is detected
  const handleDoubleClick = useCallback(() => {
    // Don't process if currently processing (prevent multiple simultaneous toggles)
    if (isProcessingDoubleLike.current) {
      return;
    }

    isProcessingDoubleLike.current = true;

    // Optimistically set local liked state (toggle from current state)
    const newFavouritedState = !localFavourited;
    setLocalFavourited(newFavouritedState);
    setIsDoubleTapLiking(true);

    // Animate heart from bottom to top
    heartPosition.setValue(100);
    heartOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(heartPosition, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(heartOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(600),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setIsDoubleTapLiking(false);
      isProcessingDoubleLike.current = false;
    });

    // Actually toggle favorite
    toggleFavorite();
  }, [toggleFavorite, heartPosition, heartOpacity]);

  // Get plain text content
  const content = getPlainTextContent(displayPost);

  // Check if this is the user's own post
  const isOwnPost = user?.id === displayPost.account.id;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.card, borderBottomColor: colors.border },
      ]}
    >
      {/* Header */}
      <PostHeader
        account={displayPost.account}
        createdAt={displayPost.createdAt}
        boostedBy={isBoost ? post.account : undefined}
        onAccountClick={handleProfilePress}
        postId={displayPost.id}
        postUrl={displayPost.url}
        isOwnPost={isOwnPost}
        onDeletePost={deletePost}
        onReply={handleReply}
        onToggleBoost={toggleBoost}
        onToggleFavorite={toggleFavorite}
        onToggleBookmark={toggleBookmark}
        onShare={share}
        repliesCount={interactivePost.repliesCount}
        reblogsCount={interactivePost.reblogsCount}
        favouritesCount={interactivePost.favouritesCount}
        reblogged={interactivePost.reblogged}
        favourited={interactivePost.favourited}
        bookmarked={interactivePost.bookmarked}
        isFollowing={isFollowing}
      />

      {/* Main content */}
      <TouchableOpacity
        style={styles.content}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {/* Content Warning */}
        {displayPost.spoilerText && (
          <View
            style={[
              styles.contentWarning,
              { backgroundColor: colors.background },
            ]}
          >
            <Text style={[styles.contentWarningText, { color: colors.text }]}>
              CW: {stripHtml(displayPost.spoilerText)}
            </Text>
          </View>
        )}

        {/* Post content */}
        <View style={styles.body}>
          <RichText post={displayPost} content={content} />
        </View>

        {/* Media attachments */}
        {displayPost.mediaAttachments.length > 0 && (
          <View testID="media-container" style={styles.mediaContainer}>
            <MediaGrid
              media={displayPost.mediaAttachments}
              sensitive={displayPost.sensitive}
              mode="list"
              isVisible={isVisible}
              onDoubleClick={handleDoubleClick}
            />

            {/* Animated heart overlay for double-tap like */}
            {isDoubleTapLiking && (
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
        {displayPost.card && displayPost.mediaAttachments.length === 0 && (
          <LinkCard card={displayPost.card} />
        )}
      </TouchableOpacity>

      {/* Comments Section */}
      <CommentsSection
        postId={displayPost.id}
        repliesCount={interactivePost.repliesCount}
        onCommentCountUpdate={(count) => {
          // Update the interactive post's replies count if needed
          if (onUpdate) {
            onUpdate({
              ...interactivePost,
              repliesCount: count,
            });
          }
        }}
      />
    </View>
  );
}, arePostsEqual);

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
  },
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
  contentText: {
    fontSize: 15,
    lineHeight: 22,
  },
  mediaContainer: {
    position: "relative",
    marginBottom: 12,
    width: STYLE_CONSTANTS.FULL_WIDTH,
    maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
    minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
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

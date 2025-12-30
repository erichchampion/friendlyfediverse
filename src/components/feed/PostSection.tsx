import { View, StyleSheet } from "react-native";
import { memo, useCallback, useState, useRef } from "react";
import { Animated } from "react-native";
import { useRouter } from "expo-router";
import type { Post } from "@types";
import { useTheme } from "@contexts/ThemeContext";
import { useAuth } from "@contexts/AuthContext";
import { usePostInteractions } from "@hooks/usePostInteractions";
import { useRelationship } from "@hooks/useRelationship";
import { PostHeader } from "./PostHeader";
import { PostContent } from "./PostContent";
import { CommentsSection } from "./CommentsSection";
import { getDisplayPost, stripHtml } from "@lib/api/timeline";
import { haveMediaAttachmentsChanged } from "@lib/utils/postComparison";

/**
 * Post Section Component
 * Complete post with header and content separated for SectionList sticky headers
 */

export interface PostSectionData {
  post: Post;
  onPress?: (post: Post) => void;
  onUpdate?: (updatedPost: Post) => void;
  onDelete?: (postId: string) => void;
  isVisible?: boolean;
}

// Comparison function for PostSectionHeader memoization
const areHeaderPropsEqual = (
  prevProps: PostSectionData,
  nextProps: PostSectionData,
) => {
  // Only re-render if post ID or interactive state has changed
  return (
    prevProps.post.id === nextProps.post.id &&
    prevProps.post.favourited === nextProps.post.favourited &&
    prevProps.post.reblogged === nextProps.post.reblogged &&
    prevProps.post.bookmarked === nextProps.post.bookmarked &&
    prevProps.post.favouritesCount === nextProps.post.favouritesCount &&
    prevProps.post.reblogsCount === nextProps.post.reblogsCount &&
    prevProps.post.repliesCount === nextProps.post.repliesCount &&
    prevProps.onUpdate === nextProps.onUpdate &&
    prevProps.onDelete === nextProps.onDelete
  );
};

// Header component for sticky headers
export const PostSectionHeader = memo<PostSectionData>(
  function PostSectionHeader({ post, onUpdate, onDelete }) {
    const router = useRouter();
    const { colors } = useTheme();
    const { user } = useAuth();

    // Defensive check: bail out if post data is invalid
    if (!post || !post.id) {
      console.warn("[PostSectionHeader] Invalid post data received");
      return null;
    }

    const handlePostDelete = useCallback(
      (postId: string) => {
        console.log("[PostSectionHeader] Post deleted:", postId);
        onDelete?.(postId);
      },
      [onDelete],
    );

    const {
      post: interactivePost,
      toggleFavorite,
      toggleBoost,
      toggleBookmark,
      share,
      deletePost,
    } = usePostInteractions({ post, onUpdate, onDelete: handlePostDelete });

    const displayPost = getDisplayPost(interactivePost);

    // Defensive check: ensure displayPost and account exist
    if (
      !displayPost ||
      !displayPost.id ||
      !displayPost.account ||
      !displayPost.account.id
    ) {
      console.warn("[PostSectionHeader] Invalid displayPost or account data");
      return null;
    }

    // Query relationship status for the post author
    const { isFollowing } = useRelationship({
      accountId: displayPost.account.id,
    });

    const isBoost = post.reblog !== null && post.reblog !== undefined;
    const isOwnPost = user?.id === displayPost.account.id;

    const handleProfilePress = useCallback(
      (accountId: string) => {
        router.push(`/(modals)/user-profile?accountId=${accountId}`);
      },
      [router],
    );

    const handleReply = useCallback(() => {
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

    return (
      <View style={[styles.headerContainer, { backgroundColor: colors.card }]}>
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
      </View>
    );
  },
  areHeaderPropsEqual,
);

// Comparison function for PostSectionContent memoization
const areContentPropsEqual = (
  prevProps: PostSectionData,
  nextProps: PostSectionData,
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
    !mediaChanged &&
    prevProps.post.favourited === nextProps.post.favourited &&
    prevProps.post.reblogged === nextProps.post.reblogged &&
    prevProps.post.bookmarked === nextProps.post.bookmarked &&
    prevProps.post.favouritesCount === nextProps.post.favouritesCount &&
    prevProps.post.reblogsCount === nextProps.post.reblogsCount &&
    prevProps.post.repliesCount === nextProps.post.repliesCount &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.onUpdate === nextProps.onUpdate &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isVisible === nextProps.isVisible
  );
};

// Content component for section items
export const PostSectionContent = memo<PostSectionData>(
  function PostSectionContent({
    post,
    onPress,
    onUpdate,
    onDelete,
    isVisible = true,
  }) {
    const { colors } = useTheme();

    // Defensive check: bail out if post data is invalid
    if (!post || !post.id) {
      console.warn("[PostSectionContent] Invalid post data received");
      return null;
    }

    const [isDoubleTapLiking, setIsDoubleTapLiking] = useState(false);
    const [localFavourited, setLocalFavourited] = useState(
      post.favourited || false,
    );
    const heartPosition = useRef(new Animated.Value(100)).current;
    const heartOpacity = useRef(new Animated.Value(0)).current;
    const isProcessingDoubleLike = useRef(false);

    const handlePostDelete = useCallback(
      (postId: string) => {
        console.log("[PostSectionContent] Post deleted:", postId);
        onDelete?.(postId);
      },
      [onDelete],
    );

    const { post: interactivePost, toggleFavorite } = usePostInteractions({
      post,
      onUpdate,
      onDelete: handlePostDelete,
    });

    const displayPost = getDisplayPost(interactivePost);

    // Defensive check: ensure displayPost exists
    if (!displayPost || !displayPost.id) {
      console.warn("[PostSectionContent] Invalid displayPost data");
      return null;
    }

    const handleDoubleClick = useCallback(() => {
      if (isProcessingDoubleLike.current) {
        return;
      }

      isProcessingDoubleLike.current = true;
      const newFavouritedState = !localFavourited;
      setLocalFavourited(newFavouritedState);
      setIsDoubleTapLiking(true);

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

      toggleFavorite();
    }, [localFavourited, toggleFavorite, heartPosition, heartOpacity]);

    return (
      <View
        style={[
          styles.contentContainer,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <PostContent
          post={displayPost}
          onPress={onPress}
          onDoubleClick={handleDoubleClick}
          isDoubleTapLiking={isDoubleTapLiking}
          heartPosition={heartPosition}
          heartOpacity={heartOpacity}
          isVisible={isVisible}
        />
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
  },
  areContentPropsEqual,
);

const styles = StyleSheet.create({
  headerContainer: {
    // Header will stick to top with FlashList stickyHeaderIndices
    zIndex: 10, // Above content but below modals
    elevation: 2, // Android shadow when sticky
    shadowColor: "#000", // iOS shadow when sticky
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  contentContainer: {
    borderBottomWidth: 1,
  },
});

import { Text, StyleSheet, Linking } from "react-native";
import { useMemo } from "react";
import { useRouter } from "expo-router";
import { useTimelines } from "@contexts/TimelinesContext";
import { useTheme } from "@contexts/ThemeContext";
import type { Post } from "@types";

/**
 * RichText Component
 * Renders post content with clickable hashtags, mentions, and links
 */

interface RichTextProps {
  post: Post;
  content: string;
  maxLines?: number;
}

export function RichText({ post, content, maxLines }: RichTextProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { addHashtagFeed, addAccountFeed } = useTimelines();

  const handleHashtagPress = (hashtag: string) => {
    // Add hashtag feed and navigate to it
    addHashtagFeed(hashtag);
    router.push(`/(tabs)/feed/hashtag/${hashtag}` as any);
  };

  const handleMentionPress = (mention: { id: string; username: string }) => {
    // Add account feed and navigate to it
    addAccountFeed(mention.id, `@${mention.username}`);
    router.push(`/(tabs)/feed/account/${mention.id}` as any);
  };

  const handleUrlPress = async (url: string) => {
    // Open URL in default browser
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        console.warn("Cannot open URL:", url);
      }
    } catch (error) {
      console.error("Error opening URL:", error);
    }
  };

  // Parse content into segments (text, hashtags, mentions, links)
  // Memoize parsing to avoid expensive regex operations on every render
  const segments = useMemo(() => {
    const parsedSegments: {
      type: "text" | "hashtag" | "mention" | "link";
      content: string;
      data?: any;
    }[] = [];

    // Ensure tags and mentions arrays exist
    const tags = post.tags || [];
    const mentions = post.mentions || [];

    // Simple parser - split by hashtags and mentions
    // This is a basic implementation - could be enhanced with proper HTML parsing
    const hashtagPattern = /#(\w+)/g;
    const mentionPattern = /@(\w+)/g;
    const urlPattern = /(https?:\/\/[^\s]+)/g;

    let lastIndex = 0;
    const matches: {
      index: number;
      length: number;
      type: string;
      data: any;
    }[] = [];

    // Find all hashtags
    let match: RegExpExecArray | null;
    while ((match = hashtagPattern.exec(content)) !== null) {
      const tag = tags.find(
        (t) => t.name.toLowerCase() === match![1].toLowerCase(),
      );
      if (tag) {
        matches.push({
          index: match.index,
          length: match[0].length,
          type: "hashtag",
          data: tag,
        });
      }
    }

    // Find all mentions
    while ((match = mentionPattern.exec(content)) !== null) {
      const mention = mentions.find(
        (m) => m.username.toLowerCase() === match![1].toLowerCase(),
      );
      if (mention) {
        matches.push({
          index: match.index,
          length: match[0].length,
          type: "mention",
          data: mention,
        });
      }
    }

    // Find all URLs (trim trailing closing delimiter when preceded by matching opener, e.g. (https://example.com) )
    const closingPairs: Record<string, string> = {
      "(": ")",
      "[": "]",
      "{": "}",
    };
    while ((match = urlPattern.exec(content)) !== null) {
      let url = match[0];
      let length = match[0].length;
      const charBefore = match.index > 0 ? content[match.index - 1] : "";
      const closing = closingPairs[charBefore];
      if (closing && url.endsWith(closing)) {
        url = url.slice(0, -1);
        length -= 1;
      } else if (
        (charBefore === '"' || charBefore === "'") &&
        url.endsWith(charBefore)
      ) {
        url = url.slice(0, -1);
        length -= 1;
      }
      matches.push({
        index: match.index,
        length,
        type: "link",
        data: { url },
      });
    }

    // Sort matches by index
    matches.sort((a, b) => a.index - b.index);

    // Build segments
    matches.forEach((m) => {
      // Add text before match (only if non-empty)
      if (m.index > lastIndex) {
        const textBefore = content.substring(lastIndex, m.index);
        if (textBefore.trim()) {
          parsedSegments.push({
            type: "text",
            content: textBefore,
          });
        }
      }

      // Add match
      parsedSegments.push({
        type: m.type as any,
        content: content.substring(m.index, m.index + m.length),
        data: m.data,
      });

      lastIndex = m.index + m.length;
    });

    // Add remaining text (only if non-empty)
    if (lastIndex < content.length) {
      const remainingText = content.substring(lastIndex);
      if (remainingText.trim()) {
        parsedSegments.push({
          type: "text",
          content: remainingText,
        });
      }
    }

    // If no matches, return entire content as text
    if (parsedSegments.length === 0) {
      parsedSegments.push({
        type: "text",
        content,
      });
    }

    return parsedSegments;
  }, [content, post.tags, post.mentions]);

  return (
    <Text
      style={[styles.content, { color: colors.text }]}
      numberOfLines={maxLines}
    >
      {segments.map((segment, index) => {
        switch (segment.type) {
          case "hashtag":
            return (
              <Text
                key={`${segment.type}-${index}`}
                style={[styles.link, { color: colors.primary }]}
                onPress={() => handleHashtagPress(segment.data.name)}
              >
                {segment.content}
              </Text>
            );

          case "mention":
            return (
              <Text
                key={`${segment.type}-${index}`}
                style={[styles.link, { color: colors.primary }]}
                onPress={() => handleMentionPress(segment.data)}
              >
                {segment.content}
              </Text>
            );

          case "link":
            return (
              <Text
                key={`${segment.type}-${index}`}
                style={[styles.link, { color: colors.primary }]}
                onPress={() => handleUrlPress(segment.data.url)}
              >
                {segment.content}
              </Text>
            );

          default:
            // Only render non-empty text segments to avoid React Native Web errors
            if (!segment.content || segment.content.trim() === "") {
              return null;
            }
            return <Text key={`text-${index}`}>{segment.content}</Text>;
        }
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  content: {
    fontSize: 15,
    lineHeight: 20,
  },
  link: {
    fontWeight: "600",
  },
});

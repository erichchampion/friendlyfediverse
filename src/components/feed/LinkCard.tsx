import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from "react-native";
import { RetryableImage as Image } from "../media/RetryableImage";
import { memo, useCallback } from "react";
import type { Card } from "@types";
import { useTheme } from "@contexts/ThemeContext";
import { STYLE_CONSTANTS, ASPECT_RATIOS } from "@lib/styleConstants";
import { fullSizeConstraints } from "@lib/styleHelpers";

/**
 * Link Card Component
 * Displays link preview cards for posts with URLs
 * Matches web app link preview functionality
 */

export interface LinkCardProps {
  card: Card;
  onPress?: () => void;
}

export const LinkCard = memo<LinkCardProps>(function LinkCard({
  card,
  onPress,
}) {
  const { colors } = useTheme();

  const handlePress = useCallback(() => {
    Linking.openURL(card.url).catch((error) => {
      console.error("Error opening link:", error);
    });
  }, [card.url]);

  // Extract domain from URL for fallback provider name
  const getDomain = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  const provider = card.providerName || getDomain(card.url);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      onPress={onPress || handlePress}
      activeOpacity={0.7}
      testID="link-card"
      accessibilityRole="button"
      accessibilityLabel={`Link to ${card.title}. Tap to open.`}
      accessibilityHint="Opens link in browser"
    >
      {/* Preview Image */}
      {card.image && (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: card.image }}
            style={styles.image}
            resizeMode="cover"
            testID="link-card-image"
          />
        </View>
      )}

      {/* Card Content */}
      <View style={styles.content}>
        {/* Provider */}
        <Text
          style={[styles.provider, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {provider}
        </Text>

        {/* Title */}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {card.title}
        </Text>

        {/* Description */}
        {card.description && (
          <Text
            style={[styles.description, { color: colors.textSecondary }]}
            numberOfLines={3}
          >
            {card.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 12,
    maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
  },
  imageContainer: {
    width: STYLE_CONSTANTS.FULL_WIDTH,
    aspectRatio: ASPECT_RATIOS.LINK_CARD,
    backgroundColor: "#E0E0E0",
    ...fullSizeConstraints,
  },
  image: {
    width: STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
    ...fullSizeConstraints,
  },
  content: {
    padding: 12,
  },
  provider: {
    fontSize: 13,
    marginBottom: 4,
    textTransform: "uppercase",
    fontWeight: "500",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
    lineHeight: 22,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
});

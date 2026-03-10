import { Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useTheme } from "@contexts/ThemeContext";

/**
 * About Page
 * Information about friendlyfediverse.com
 */
export default function AboutPage() {
  const { colors } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        About friendlyfediverse.com
      </Text>

      <Text style={[styles.paragraph, { color: colors.text }]}>
        friendlyfediverse.com is a Mastodon client focused on providing an
        excellent video viewing experience.
      </Text>

      <Text style={[styles.paragraph, { color: colors.text }]}>
        Built with React Native and Expo, friendlyfediverse.com brings the power
        of the fediverse to your mobile device.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Features
      </Text>

      <Text style={[styles.paragraph, { color: colors.text }]}>
        • Beautiful timeline with media-first design{"\n"}• Full support for
        images, videos, and carousels{"\n"}• Rich link previews{"\n"}• User
        interactions: like, boost, bookmark, share{"\n"}• User moderation:
        block, mute, report{"\n"}• Multi-account support{"\n"}• Dark/light theme
        support
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Open Source
      </Text>

      <Text style={[styles.paragraph, { color: colors.text }]}>
        friendlyfediverse.com is open source and built by the community.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Support & Policies
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        Need help or want to review our policies? Visit the links below:
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          Linking.openURL("https://www.friendlyfediverse.com/support")
        }
      >
        <Text style={[styles.link, { color: colors.accent }]}>
          Support: friendlyfediverse.com/support
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          Linking.openURL("https://www.friendlyfediverse.com/privacy")
        }
      >
        <Text style={[styles.link, { color: colors.accent }]}>
          Privacy Policy: friendlyfediverse.com/privacy
        </Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Acknowledgements
      </Text>

      <Text style={[styles.paragraph, { color: colors.text }]}>
        Special thanks to the masto.js team for their excellent Mastodon API
        client library, which powers the API communication in this app.{"\n"}
        {"\n"}
        Learn more at: https://github.com/neet/masto.js
      </Text>

      <Text style={[styles.footer, { color: colors.textSecondary }]}>
        © {new Date().getFullYear()} friendlyfediverse.com
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  link: {
    fontSize: 16,
    marginBottom: 12,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  footer: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 32,
  },
});

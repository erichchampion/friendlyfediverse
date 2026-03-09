import { Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useTheme } from "@contexts/ThemeContext";

/**
 * Privacy Policy Page
 */
export default function PrivacyPage() {
  const { colors } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.text }]}>Privacy Policy</Text>

      <Pressable
        accessibilityRole="link"
        onPress={() =>
          Linking.openURL("https://www.friendlyfediverse.com/privacy")
        }
      >
        <Text style={[styles.link, { color: colors.accent }]}>
          View the full policy at friendlyfediverse.com/privacy
        </Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Data Collection
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        friendlyfediverse.com is a client application that connects to Mastodon
        servers. We do not collect, store, or process your personal data on our
        servers.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Local Storage
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        The app stores authentication tokens and preferences locally on your
        device. This data is only used to:
        {"\n\n"}• Authenticate with your chosen Mastodon server{"\n"}• Remember
        your preferences and settings{"\n"}• Cache posts for better performance
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Third-Party Services
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        When you use friendlyfediverse.com, you connect directly to Mastodon
        servers operated by third parties. Please review the privacy policy of
        your Mastodon server for information about how they handle your data.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Data Security
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        All communication with Mastodon servers is encrypted using HTTPS.
        Authentication tokens are stored securely on your device.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Your Rights
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        You can delete all locally stored data at any time by signing out of the
        app or uninstalling it.
      </Text>

      <Text style={[styles.footer, { color: colors.textSecondary }]}>
        Last updated: {new Date().toLocaleDateString()}
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
  footer: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 32,
  },
  link: {
    fontSize: 16,
    marginBottom: 16,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});

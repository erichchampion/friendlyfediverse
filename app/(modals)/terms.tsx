import { Text, StyleSheet, ScrollView } from "react-native";
import { useTheme } from "@contexts/ThemeContext";

/**
 * Terms of Use Page
 */
export default function TermsPage() {
  const { colors } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.text }]}>Terms of Use</Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Acceptance of Terms
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        By using friendlyfediverse.com, you agree to these terms of use. If you
        do not agree with any part of these terms, please do not use the app.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>License</Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        friendlyfediverse.com is provided as open-source software. You may use,
        modify, and distribute the app in accordance with its license.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Third-Party Services
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        friendlyfediverse.com connects to Mastodon servers operated by third
        parties. You are responsible for complying with the terms of service of
        the Mastodon servers you connect to.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        User Conduct
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        You agree to use friendlyfediverse.com in compliance with all applicable
        laws and regulations. You are responsible for your conduct and content
        while using the app.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Disclaimer of Warranties
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        friendlyfediverse.com is provided "as is" without warranty of any kind,
        either express or implied. We do not guarantee that the app will be
        error-free or uninterrupted.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Limitation of Liability
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        In no event shall friendlyfediverse.com be liable for any damages
        arising from the use or inability to use the app.
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Changes to Terms
      </Text>
      <Text style={[styles.paragraph, { color: colors.text }]}>
        We reserve the right to modify these terms at any time. Continued use of
        the app constitutes acceptance of modified terms.
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
});

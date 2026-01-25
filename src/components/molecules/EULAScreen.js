import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Linking,
} from 'react-native';
import PropTypes from 'prop-types';

const EULAScreen = ({ onAccept }) => {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const handleScroll = (event) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 50;
    if (isCloseToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const openFullTerms = () => {
    Linking.openURL('https://mikedafi.github.io/Up/terms.html');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.subtitle}>Please read and accept to continue</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <Text style={styles.sectionTitle}>Welcome to Splytt</Text>
        <Text style={styles.paragraph}>
          By using Splytt, you agree to these Terms of Service. Please read them carefully.
        </Text>

        <Text style={styles.sectionTitle}>Community Guidelines</Text>
        <Text style={styles.paragraph}>
          Splytt is committed to maintaining a safe and respectful community. By using our app, you agree to:
        </Text>
        <Text style={styles.bulletPoint}>• Not upload, share, or promote content that is illegal, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable</Text>
        <Text style={styles.bulletPoint}>• Not upload content that exploits minors in any way</Text>
        <Text style={styles.bulletPoint}>• Not upload content that promotes violence, discrimination, or hate speech</Text>
        <Text style={styles.bulletPoint}>• Not upload content that infringes on intellectual property rights</Text>
        <Text style={styles.bulletPoint}>• Not engage in harassment, bullying, or abusive behavior toward other users</Text>
        <Text style={styles.bulletPoint}>• Not use the app for spam, scams, or fraudulent activities</Text>

        <Text style={styles.sectionTitle}>Zero Tolerance Policy</Text>
        <Text style={styles.paragraph}>
          We have a zero tolerance policy for objectionable content and abusive users. Violations may result in:
        </Text>
        <Text style={styles.bulletPoint}>• Immediate removal of offending content</Text>
        <Text style={styles.bulletPoint}>• Temporary or permanent account suspension</Text>
        <Text style={styles.bulletPoint}>• Reporting to law enforcement when required</Text>

        <Text style={styles.sectionTitle}>Content Moderation</Text>
        <Text style={styles.paragraph}>
          All user-generated content is subject to review. We reserve the right to remove any content that violates these terms without prior notice. Reports of objectionable content are reviewed within 24 hours.
        </Text>

        <Text style={styles.sectionTitle}>Reporting & Blocking</Text>
        <Text style={styles.paragraph}>
          If you encounter objectionable content or abusive users, please use the in-app reporting feature. You can also block users to prevent seeing their content. We take all reports seriously and act promptly.
        </Text>

        <Text style={styles.sectionTitle}>Your Content</Text>
        <Text style={styles.paragraph}>
          You retain ownership of content you upload, but grant Splytt a license to display, distribute, and promote your content within the app. You are solely responsible for the content you upload.
        </Text>

        <Text style={styles.sectionTitle}>Privacy</Text>
        <Text style={styles.paragraph}>
          Your privacy is important to us. Please review our Privacy Policy for information on how we collect, use, and protect your data.
        </Text>

        <Text style={styles.sectionTitle}>Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We may update these terms from time to time. Continued use of the app constitutes acceptance of any changes.
        </Text>

        <TouchableOpacity onPress={openFullTerms} style={styles.linkContainer}>
          <Text style={styles.link}>View Full Terms of Service →</Text>
        </TouchableOpacity>

        <View style={styles.spacer} />
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {hasScrolledToBottom
            ? 'By tapping "I Agree", you accept these Terms of Service'
            : 'Please scroll to read the full terms'}
        </Text>
        <TouchableOpacity
          style={[styles.acceptButton, !hasScrolledToBottom && styles.acceptButtonDisabled]}
          onPress={onAccept}
          disabled={!hasScrolledToBottom}
        >
          <Text style={[styles.acceptButtonText, !hasScrolledToBottom && styles.acceptButtonTextDisabled]}>
            I Agree
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    padding: 24,
    paddingTop: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 24,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 15,
    color: '#aaa',
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 15,
    color: '#aaa',
    lineHeight: 22,
    marginBottom: 8,
    paddingLeft: 8,
  },
  linkContainer: {
    marginTop: 24,
    marginBottom: 16,
  },
  link: {
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '500',
  },
  spacer: {
    height: 40,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#0a0a0f',
  },
  footerText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  acceptButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: '#333',
  },
  acceptButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  acceptButtonTextDisabled: {
    color: '#666',
  },
});

EULAScreen.propTypes = {
  onAccept: PropTypes.func.isRequired,
};

export default EULAScreen;


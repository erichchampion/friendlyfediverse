# Friendly Fediverse - Release Preparation Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-08
**Target Platform**: iOS (React Native)

---

## Overview

This document outlines the steps required to prepare and release the Friendly Fediverse React Native application to the App Store.

---

## Pre-Release Checklist

### Code Quality

- [x] All phases (0-7) completed
- [x] No TypeScript errors
- [x] All linting rules pass
- [x] Code follows project conventions
- [ ] No console.log statements in production
- [ ] No commented-out code
- [ ] All TODOs addressed or documented

### Testing

- [ ] Manual testing checklist completed
- [ ] All critical bugs fixed
- [ ] Performance targets met
- [ ] Accessibility audit passed
- [ ] Test coverage acceptable (>70% for critical paths)
- [ ] No regressions from previous version

### Dependencies

- [ ] All dependencies up to date
- [ ] No security vulnerabilities (`npm audit`)
- [ ] Unused dependencies removed
- [ ] License compatibility verified

### Performance

- [x] Feed scrolls at 60 FPS
- [x] App launch < 2 seconds
- [x] Memory usage < 200MB
- [ ] Bundle size optimized
- [ ] Images optimized
- [ ] Cache strategy working

---

## Version Management

### Versioning Strategy

- Follow Semantic Versioning (SemVer): `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Current Version

- **Version**: 1.0.0
- **Build Number**: 1

### Update Version

```bash
# Update version in package.json
npm version [major|minor|patch]

# Update version in app.json
# Update CFBundleShortVersionString in Info.plist
# Update CFBundleVersion in Info.plist
```

---

## Build Configuration

### Environment Setup

```bash
# Install dependencies
npm install

# Clear cache if needed
npx expo start -c

# Run on iOS simulator
npm run ios
```

### Production Build

```bash
# Create production build
eas build --platform ios --profile production

# Or using Xcode
npx expo prebuild
# Then open in Xcode and archive
```

### Build Profiles (eas.json)

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "ios": {
        "bundler": "metro"
      }
    }
  }
}
```

---

## App Store Assets

### Required Assets

#### App Icon

- **Sizes**: 1024x1024 (App Store), 180x180 (iPhone), 167x167 (iPad)
- **Format**: PNG, no transparency
- **Location**: `assets/images/icon.png`

#### Splash Screen

- **Sizes**: Various for different devices
- **Format**: PNG
- **Location**: `assets/images/splash.png`

#### Screenshots

- **Required Devices**:
  - iPhone 6.7" (iPhone 14 Pro Max)
  - iPhone 6.5" (iPhone 11 Pro Max)
  - iPhone 5.5" (iPhone 8 Plus)
  - iPad Pro 12.9" (if iPad supported)

- **Count**: 3-10 screenshots per device size
- **Format**: PNG or JPEG
- **Recommendations**:
  1. Home feed with posts
  2. Post detail with interactions
  3. Search screen
  4. User profile
  5. Compose screen
  6. Settings screen

#### App Preview Video (Optional)

- **Duration**: 15-30 seconds
- **Format**: MP4 or MOV
- **Orientation**: Portrait

---

## App Store Listing

### App Name

**Friendly Fediverse**

### Subtitle (30 characters)

**Video-focused Mastodon client**

### Description

```
Friendly Fediverse is a fast, native Mastodon client optimized for video content.

FEATURES:
• Beautiful, native iOS interface
• Smooth video playback
• Multiple account support
• Search accounts, posts, and hashtags
• Follow/unfollow users
• Like, boost, and bookmark posts
• Compose posts with media
• Light and dark themes
• Accessibility support

OPTIMIZED FOR PERFORMANCE:
• 60 FPS smooth scrolling
• Instant loading with caching
• Optimized for battery life
• Minimal data usage

PRIVACY FOCUSED:
• No tracking or analytics
• Your data stays on your Mastodon instance
• Open source and transparent

ACCESSIBILITY:
• Full VoiceOver support
• Dynamic Type support
• High contrast modes

Join the federated social web with Friendly Fediverse!
```

### Keywords (100 characters)

```
mastodon,social,video,fediverse,decentralized,open source,twitter,social network
```

### Support URL

```
https://github.com/[your-org]/friendlyfediverse.com
```

### Privacy Policy URL

```
https://[your-domain]/privacy-policy
```

### Category

**Primary**: Social Networking
**Secondary**: Photo & Video

### Content Rating

**4+** (No objectionable content - content depends on instance)

---

## Privacy & Compliance

### Privacy Policy Required Information

- What data is collected
- How data is used
- How data is stored
- Third-party services (if any)
- User rights (GDPR, CCPA)
- Contact information

### App Store Privacy Labels

- **Data Collected**:
  - User authentication token (linked to user)
  - Instance URL (linked to user)
  - Cached posts (not linked to user)

- **Data Not Collected**:
  - No analytics
  - No advertising data
  - No location data
  - No crash reports (unless implemented)

---

## TestFlight Beta Testing

### Beta Testing Strategy

#### Internal Testing

1. **Testers**: Development team (5-10 people)
2. **Duration**: 1 week
3. **Focus**: Critical bugs, crashes

#### External Testing

1. **Testers**: Power users (50-100 people)
2. **Duration**: 2-4 weeks
3. **Focus**: User experience, feature requests

### TestFlight Setup

```bash
# Build for TestFlight
eas build --platform ios --profile production

# Upload to TestFlight via EAS
eas submit --platform ios

# Or upload via Xcode
# Upload archive to App Store Connect
```

### Beta Tester Instructions

```
Welcome to the Friendly Fediverse beta!

WHAT TO TEST:
1. Authentication with your Mastodon instance
2. Browsing home, local, and public timelines
3. Liking, boosting, and bookmarking posts
4. Creating new posts with media
5. Searching for accounts and posts
6. Following/unfollowing users
7. App performance and stability

HOW TO REPORT ISSUES:
- Use TestFlight's screenshot feedback
- Email: support@[your-domain]
- Include: device model, iOS version, steps to reproduce

KNOWN ISSUES:
- [List any known issues]

Thank you for testing!
```

---

## App Store Submission

### Submission Checklist

- [ ] Build uploaded to App Store Connect
- [ ] Version number correct
- [ ] Build number incremented
- [ ] All required metadata filled
- [ ] Screenshots uploaded (all required sizes)
- [ ] App icon uploaded
- [ ] Privacy policy URL provided
- [ ] Support URL provided
- [ ] Description written
- [ ] Keywords added
- [ ] Category selected
- [ ] Content rating completed
- [ ] Export compliance answered
- [ ] Pricing and availability set

### Export Compliance

**Question**: Does your app use encryption?

**Answer**: Yes (for HTTPS network requests)

**Follow-up**: Does your app qualify for exemption?

**Answer**: Yes (Standard encryption for HTTPS)

---

## Release Notes Template

### Version 1.0.0

```
Initial release of Friendly Fediverse!

✨ NEW FEATURES:
• Native iOS Mastodon client
• Beautiful video playback
• Multiple account support
• Search functionality
• User profiles with follow/unfollow
• Post interactions (like, boost, bookmark)
• Compose posts with media upload
• Light and dark themes

🚀 PERFORMANCE:
• Smooth 60 FPS scrolling
• Instant loading with smart caching
• Optimized for battery life

♿ ACCESSIBILITY:
• Full VoiceOver support
• Dynamic Type support
• High contrast modes

Join the federated social web today!
```

---

## Post-Release

### Monitoring

- [ ] Monitor crash reports (if crash reporting implemented)
- [ ] Check App Store reviews
- [ ] Monitor user feedback
- [ ] Track performance metrics
- [ ] Watch for critical bugs

### Response Plan

#### Critical Bugs (Crashes, Data Loss)

1. Acknowledge issue within 24 hours
2. Create hotfix branch
3. Fix and test
4. Submit emergency update
5. Timeline: 24-48 hours

#### High Priority Bugs (Major Features Broken)

1. Acknowledge issue within 48 hours
2. Include in next patch release
3. Timeline: 1-2 weeks

#### Medium/Low Priority

1. Collect feedback
2. Prioritize for next minor release
3. Timeline: 4-6 weeks

---

## App Store Review Guidelines

### Common Rejection Reasons

1. **Crashes**: App must not crash
2. **Broken features**: All advertised features must work
3. **Privacy**: Privacy policy must be accurate
4. **Content**: Must handle objectionable content (user-generated)
5. **Metadata**: Screenshots and description must be accurate

### Preparation

- Test on real devices
- Test all advertised features
- Review App Store guidelines
- Prepare for questions from reviewers
- Have contact information ready

---

## Marketing & Launch

### Pre-Launch (1-2 weeks before)

- [ ] Create landing page
- [ ] Prepare social media accounts
- [ ] Write blog post
- [ ] Create promotional materials
- [ ] Contact tech press/bloggers
- [ ] Prepare demo video

### Launch Day

- [ ] Publish blog post
- [ ] Post on social media
- [ ] Submit to Product Hunt
- [ ] Post in Mastodon communities
- [ ] Send to press contacts
- [ ] Update website

### Post-Launch (1 week after)

- [ ] Respond to reviews
- [ ] Collect feedback
- [ ] Monitor metrics
- [ ] Thank beta testers
- [ ] Plan next update

---

## Update Strategy

### Patch Releases (1.0.x)

- **Frequency**: As needed for critical bugs
- **Changes**: Bug fixes only
- **Testing**: Regression testing
- **Timeline**: 1-2 weeks

### Minor Releases (1.x.0)

- **Frequency**: Monthly
- **Changes**: New features, improvements
- **Testing**: Full testing suite
- **Timeline**: 4-6 weeks

### Major Releases (x.0.0)

- **Frequency**: Yearly
- **Changes**: Major features, redesigns
- **Testing**: Comprehensive testing
- **Timeline**: 3-6 months

---

## Emergency Procedures

### App Store Removal Request

If critical security issue or data breach:

1. Contact Apple immediately
2. Request app removal
3. Fix issue
4. Communicate with users
5. Re-submit when fixed

### Critical Bug Hotfix

1. Create hotfix branch from production
2. Fix bug with minimal changes
3. Test thoroughly
4. Fast-track review (if eligible)
5. Submit as emergency update

---

## Rollback Procedure

If new version has critical issues:

1. Identify issue scope
2. Remove problematic version if possible
3. Revert to previous stable version
4. Communicate with users
5. Fix and re-release

---

## Success Metrics

### Key Performance Indicators (KPIs)

- **Downloads**: Track daily/weekly/monthly
- **Active Users**: Daily and monthly active users
- **Retention**: Day 1, Day 7, Day 30 retention
- **Crashes**: Crash-free sessions percentage
- **Reviews**: Average rating and review count
- **Performance**: App Store search ranking

### Targets (First 3 Months)

- **Downloads**: 1,000+
- **DAU/MAU Ratio**: >20%
- **Day 7 Retention**: >30%
- **Crash-free Sessions**: >99.5%
- **Average Rating**: >4.0 stars
- **Review Response Time**: <48 hours

---

## Contact Information

### Support Channels

- **Email**: support@[your-domain]
- **Twitter**: @mastodonvideo
- **GitHub**: github.com/[your-org]/friendlyfediverse.com
- **Mastodon**: @mastodonvideo@mastodon.social

### Team Contacts

- **Project Lead**: [Name]
- **Development**: [Name]
- **Support**: [Name]
- **Marketing**: [Name]

---

## Resources

### Apple Developer

- App Store Connect: https://appstoreconnect.apple.com
- Developer Portal: https://developer.apple.com
- Guidelines: https://developer.apple.com/app-store/review/guidelines/

### Documentation

- Expo: https://docs.expo.dev
- React Native: https://reactnative.dev
- TestFlight: https://developer.apple.com/testflight/

---

**Document Version**: 1.0
**Last Updated**: 2025-11-08
**Next Review**: Before each release

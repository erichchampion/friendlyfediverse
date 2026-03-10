# Friendly Fediverse - Testing Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-08
**Status**: Phase 8 - Testing & Release

---

## Overview

This document provides comprehensive testing guidelines for the Friendly Fediverse React Native application. It covers manual testing, automated testing strategies, and quality assurance procedures.

---

## Manual Testing Checklist

### Authentication & Onboarding

#### Instance Selection

- [ ] App launches successfully
- [ ] Instance selection screen displays
- [ ] Can enter custom instance URL
- [ ] Instance validation works correctly
- [ ] Invalid instances show error message
- [ ] Can proceed to login with valid instance

#### OAuth Flow

- [ ] OAuth authorization opens in browser
- [ ] Can authorize application
- [ ] Callback redirect works correctly
- [ ] Token is stored securely
- [ ] User is redirected to home feed
- [ ] Login persists after app restart
- [ ] Token refresh works automatically

#### Multi-Account

- [ ] Can add multiple accounts
- [ ] Account switcher shows all accounts
- [ ] Can switch between accounts
- [ ] Active account is highlighted
- [ ] Can remove inactive accounts
- [ ] Cannot remove active account without confirmation
- [ ] Each account maintains separate state

---

### Feed System

#### Home Timeline

- [ ] Feed loads on first launch
- [ ] Skeleton screens show while loading
- [ ] Posts display correctly
- [ ] Scroll is smooth (60 FPS)
- [ ] Pull to refresh works
- [ ] Infinite scroll loads more posts
- [ ] Loading indicator shows at bottom
- [ ] Cache loads instantly on return
- [ ] New posts load in background

#### Feed Types

- [ ] Can switch to Local timeline
- [ ] Can switch to Public timeline
- [ ] Each feed type loads correct data
- [ ] Feed type persists on app restart
- [ ] Tab indicator shows active feed

#### Post Display

- [ ] User avatar displays
- [ ] Display name shows correctly
- [ ] Username shows correctly
- [ ] Timestamp displays (5m, 2h, 3d format)
- [ ] Post content renders properly
- [ ] HTML content is stripped correctly
- [ ] Links are clickable (when implemented)
- [ ] Hashtags are highlighted (when implemented)
- [ ] Mentions are highlighted (when implemented)

#### Boosts/Reblogs

- [ ] Boost indicator shows
- [ ] Boosted by user name displays
- [ ] Boosted content displays correctly
- [ ] Original author information preserved

#### Content Warnings

- [ ] CW badge displays
- [ ] CW text shows correctly
- [ ] Content is hidden by default
- [ ] Can tap to reveal content

---

### Media Handling

#### Images

- [ ] Single images display
- [ ] Multiple images show in grid
- [ ] Images load with placeholder
- [ ] Image caching works
- [ ] Tap image opens full screen viewer
- [ ] Pinch to zoom works in viewer
- [ ] Swipe between images works
- [ ] Close button works in viewer
- [ ] Image descriptions display

#### Videos

- [ ] Videos play inline
- [ ] Play/pause controls work
- [ ] Video starts when in viewport
- [ ] Video pauses when scrolled away
- [ ] Mute/unmute works
- [ ] Progress bar displays
- [ ] Fullscreen option works
- [ ] Video caching works

#### GIFs

- [ ] GIFs auto-play
- [ ] GIFs loop correctly
- [ ] GIF playback is smooth

#### Sensitive Content

- [ ] Sensitive media is blurred
- [ ] Tap to reveal works
- [ ] Warning message displays
- [ ] Setting persists preference

---

### Interactions

#### Like/Favorite

- [ ] Tap star to favorite
- [ ] Star turns red when favorited
- [ ] Count increases immediately
- [ ] Animation plays smoothly
- [ ] Unfavorite works correctly
- [ ] Optimistic update rolls back on error
- [ ] State persists after navigation

#### Boost/Reblog

- [ ] Tap boost button
- [ ] Icon turns green when boosted
- [ ] Count increases immediately
- [ ] Animation plays smoothly
- [ ] Unboost works correctly
- [ ] Confirmation dialog shows (optional)
- [ ] Optimistic update rolls back on error

#### Bookmark

- [ ] Tap bookmark button
- [ ] Icon changes color when bookmarked
- [ ] Animation plays smoothly
- [ ] Remove bookmark works
- [ ] Optimistic update rolls back on error

#### Reply

- [ ] Tap reply button
- [ ] Compose modal opens
- [ ] Reply count displays correctly

#### Share

- [ ] Tap share button
- [ ] Native share sheet opens
- [ ] Post URL is shared
- [ ] Share to other apps works

---

### Compose

#### Text Composition

- [ ] Compose modal opens
- [ ] Text input is focused
- [ ] Keyboard appears
- [ ] Can type text
- [ ] Character counter updates
- [ ] Counter turns red when over limit
- [ ] Post button disabled when over limit
- [ ] Post button disabled when empty

#### Media Upload

- [ ] Can tap media button
- [ ] Photo picker opens
- [ ] Can select photo
- [ ] Photo preview shows
- [ ] Can select video
- [ ] Video preview shows
- [ ] Can select up to 4 media
- [ ] Limit is enforced
- [ ] Can remove media
- [ ] Remove button works

#### Advanced Features

- [ ] Can toggle content warning
- [ ] CW text input shows
- [ ] Can set visibility (public, unlisted, followers, direct)
- [ ] Selected visibility highlighted
- [ ] Visibility persists during composition

#### Posting

- [ ] Post button works
- [ ] Loading state shows
- [ ] Success message displays
- [ ] Modal closes on success
- [ ] Error message shows on failure
- [ ] Can retry after error

#### Draft Management

- [ ] Cancel shows confirmation if content exists
- [ ] No confirmation if empty
- [ ] Discard works correctly

---

### Search

#### Search Input

- [ ] Search bar accepts text
- [ ] Clear button appears
- [ ] Clear button works
- [ ] Search executes on submit

#### Results

- [ ] Account results display
- [ ] Post results display
- [ ] Hashtag results display
- [ ] Tab badges show counts
- [ ] Can switch between tabs
- [ ] Empty states show correctly

#### Navigation

- [ ] Tap account opens profile
- [ ] Tap post works (when implemented)
- [ ] Tap hashtag works (when implemented)

---

### User Profiles

#### Profile Display

- [ ] Profile loads correctly
- [ ] Header/banner image displays
- [ ] Avatar displays
- [ ] Display name shows
- [ ] Username shows
- [ ] Stats display (posts, following, followers)

#### Follow/Unfollow

- [ ] Follow button works
- [ ] Button changes to Unfollow
- [ ] Follower count updates
- [ ] Unfollow button works
- [ ] Count decreases correctly
- [ ] Optimistic update works

#### Relationship Info

- [ ] "Follows you" badge shows when applicable
- [ ] Relationship status loads

#### User Posts

- [ ] Posts tab loads user's posts
- [ ] Media tab shows only media posts
- [ ] Can switch between tabs
- [ ] Empty states show correctly
- [ ] All post features work in profile

#### Own Profile

- [ ] Stats display correctly
- [ ] "View My Posts" toggle works
- [ ] Posts load on demand
- [ ] Recent 10 posts show

---

### Settings

#### Appearance

- [ ] Light mode switch works
- [ ] Dark mode switch works
- [ ] Auto mode follows system
- [ ] Theme changes apply immediately
- [ ] Theme persists after restart

#### Media & Playback

- [ ] Auto-play videos toggle works
- [ ] Auto-play GIFs toggle works
- [ ] Show sensitive media toggle works
- [ ] High quality uploads toggle works
- [ ] Settings persist

#### Data & Storage

- [ ] Cache images toggle works
- [ ] Clear cache button works
- [ ] Confirmation dialog shows
- [ ] Success message displays
- [ ] Cache is actually cleared

#### Account Management

- [ ] Edit profile button shows (placeholder)
- [ ] Account settings button shows (placeholder)
- [ ] Switch account opens modal
- [ ] Sign out shows confirmation
- [ ] Sign out works correctly

---

### Performance

#### Scroll Performance

- [ ] Feed scrolls at 60 FPS
- [ ] No jank during scroll
- [ ] Images load smoothly
- [ ] Videos don't cause lag
- [ ] Skeleton screens are smooth

#### Memory

- [ ] Memory usage stays reasonable
- [ ] No memory leaks
- [ ] Cache doesn't grow indefinitely
- [ ] Videos are cleaned up

#### Network

- [ ] Requests are batched appropriately
- [ ] Rate limiting works
- [ ] Offline mode shows appropriate messages
- [ ] Network errors are handled

---

### Accessibility

#### Screen Reader (VoiceOver)

- [ ] All interactive elements focusable
- [ ] Button labels are descriptive
- [ ] State changes announced
- [ ] Hints provide context
- [ ] Count information included
- [ ] Navigation is logical

#### Visual

- [ ] Text is readable
- [ ] Color contrast is sufficient
- [ ] Touch targets are large enough (44x44pt minimum)
- [ ] Icons have text alternatives

---

### Error Handling

#### Network Errors

- [ ] No connection shows error
- [ ] Timeout shows error
- [ ] Can retry failed requests
- [ ] Error messages are clear

#### API Errors

- [ ] 401/403 handled correctly
- [ ] 404 shows not found
- [ ] 500 shows server error
- [ ] Rate limit shows appropriate message

#### App Errors

- [ ] Error boundary catches errors
- [ ] Fallback UI displays
- [ ] Try Again button works
- [ ] App doesn't crash

---

### Edge Cases

#### Empty States

- [ ] Empty feed shows message
- [ ] No search results shows message
- [ ] No followers shows message
- [ ] All empty states helpful

#### Long Content

- [ ] Very long posts display correctly
- [ ] Many images handled properly
- [ ] Long usernames truncate
- [ ] Long display names truncate

#### Special Characters

- [ ] Emoji display correctly
- [ ] Unicode characters work
- [ ] Special characters in posts work
- [ ] Special characters in usernames work

---

## Device Testing Matrix

### iOS Versions

- [ ] iOS 15
- [ ] iOS 16
- [ ] iOS 17
- [ ] iOS 18 (latest)

### Device Sizes

- [ ] iPhone SE (small)
- [ ] iPhone 14 Pro (standard)
- [ ] iPhone 14 Pro Max (large)
- [ ] iPad (tablet - if supported)

### Orientations

- [ ] Portrait mode
- [ ] Landscape mode (if supported)

---

## Performance Benchmarks

### Target Metrics

- **App Launch Time**: < 2 seconds
- **Feed Load Time**: < 1 second (cached)
- **Feed Load Time**: < 3 seconds (network)
- **Scroll FPS**: 60 FPS minimum
- **Memory Usage**: < 200MB typical
- **Crash Rate**: < 0.1%

### Measurement Tools

- Xcode Instruments
- React DevTools Profiler
- FPS Monitor
- Memory Profiler

---

## Automated Testing Strategy

### Unit Tests

- API client functions
- Data transformers
- Utility functions
- Custom hooks
- Storage service

### Integration Tests

- OAuth flow
- Feed loading
- Post interactions
- Search functionality

### E2E Tests (Detox/Maestro)

- Complete user flows
- Critical paths
- Edge cases

---

## Release Checklist

### Pre-Release

- [ ] All manual tests pass
- [ ] No known critical bugs
- [ ] Performance meets targets
- [ ] Accessibility audit passed
- [ ] All dependencies updated
- [ ] No security vulnerabilities
- [ ] Privacy policy updated
- [ ] Terms of service updated

### Build Preparation

- [ ] Version number incremented
- [ ] Build number incremented
- [ ] Release notes prepared
- [ ] Screenshots updated
- [ ] App icons finalized
- [ ] Splash screen finalized

### App Store Submission

- [ ] Build uploaded to TestFlight
- [ ] TestFlight beta tested
- [ ] Feedback incorporated
- [ ] Final build created
- [ ] Submitted for review
- [ ] Review feedback addressed

---

## Bug Reporting Template

```
**Title**: Brief description of the issue

**Severity**: Critical | High | Medium | Low

**Platform**: iOS [version]

**Device**: [device model]

**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Expected Behavior**:
What should happen

**Actual Behavior**:
What actually happens

**Screenshots/Video**:
[Attach if applicable]

**Logs**:
[Attach console logs if applicable]

**Additional Context**:
Any other relevant information
```

---

## Quality Gates

### Must Pass Before Release

1. ✅ All critical functionality works
2. ✅ No crash bugs
3. ✅ Performance meets targets
4. ✅ Accessibility compliance
5. ✅ Security audit passed
6. ✅ Privacy compliance

### Should Pass Before Release

1. ⚠️ All medium priority bugs fixed
2. ⚠️ UI polish complete
3. ⚠️ All animations smooth
4. ⚠️ Error messages helpful

---

## Testing Sign-Off

**Tested By**: ********\_********

**Date**: ********\_********

**Platform**: iOS [version]

**Device**: ********\_********

**Status**: ☐ Pass ☐ Fail

**Notes**:

---

---

---

---

**Document Version**: 1.0
**Last Updated**: 2025-11-08
**Next Review**: Before each release

# Xcode Integration Guide - React Native Migration

**Date**: 2025-11-08
**Status**: Integration Instructions
**Goal**: Package React Native app for iOS release

---

## Overview

This guide explains how to integrate the completed React Native Mastodon app (in `ios/mastodon-rn/`) with the existing iOS Xcode project (in `ios/mastodon/`) for App Store release.

---

## Integration Approaches

### Approach 1: Use Expo-Generated Project (RECOMMENDED)

This is the cleanest and most maintainable approach for Expo-based React Native apps.

#### Steps:

1. **Generate Native iOS Project**

   ```bash
   cd ios/mastodon-rn
   npx expo prebuild --platform ios
   ```

2. **Result**
   - Creates `ios/mastodon-rn/ios/` directory
   - Contains complete Xcode project: `mastodonvideo.xcodeproj`
   - Includes all React Native dependencies configured
   - Has proper build phases for Metro bundler

3. **Build and Release**

   ```bash
   # Development build
   npx expo run:ios

   # Production build with EAS
   eas build --platform ios --profile production

   # Or open in Xcode
   open ios/mastodonvideo.xcodeproj
   ```

4. **Advantages**
   - ✅ Fully automated configuration
   - ✅ All React Native dependencies handled
   - ✅ Metro bundler properly configured
   - ✅ Easy to update when Expo/RN versions change
   - ✅ Recommended by Expo for production apps

5. **Maintenance**
   - Keep `app.json` as source of truth
   - Regenerate with `npx expo prebuild --clean` when needed
   - Use `expo-build-properties` plugin for custom settings

---

### Approach 2: Integrate into Existing XcodeGen Project

If you need to keep the existing `ios/mastodon/project.yml` structure, you can integrate React Native manually.

#### Prerequisites:

1. **Run Expo Prebuild First**

   ```bash
   cd ios/mastodon-rn
   npx expo prebuild --platform ios
   ```

   This generates the native modules needed.

2. **Install CocoaPods Dependencies**
   ```bash
   cd ios/mastodon-rn/ios
   pod install
   ```

#### Updated project.yml

See `ios/mastodon/project-rn.yml` for the complete updated configuration.

**Key Changes Required:**

1. **Add React Native Framework Search Paths**

   ```yaml
   FRAMEWORK_SEARCH_PATHS:
     - $(inherited)
     - $(PODS_ROOT)/Folly
     - $(PODS_ROOT)/DoubleConversion
   ```

2. **Add Metro Bundler Script**

   ```bash
   # Bundle React Native JavaScript
   export NODE_BINARY=node
   export BUNDLE_COMMAND=bundle
   cd "${SRCROOT}/../mastodon-rn"
   ../../../node_modules/react-native/scripts/react-native-xcode.sh
   ```

3. **Add React Native Dependencies**
   - Link all Pods from mastodon-rn/ios/Podfile
   - Include expo-modules-core
   - Include react-native-reanimated, MMKV, etc.

4. **Copy React Native Bundle**
   ```bash
   # Copy JavaScript bundle and assets
   if [ -f "${SRCROOT}/../mastodon-rn/ios/build/main.jsbundle" ]; then
     cp "${SRCROOT}/../mastodon-rn/ios/build/main.jsbundle" "${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}/"
   fi
   ```

#### Detailed Steps:

1. **Update project.yml** (see project-rn.yml)

2. **Generate Xcode project**

   ```bash
   cd ios/mastodon
   xcodegen generate
   ```

3. **Configure CocoaPods**

   Create or update `ios/mastodon/Podfile`:

   ```ruby
   platform :ios, '18.5'

   target 'mastodon' do
     use_frameworks!

     # React Native & Expo
     pod 'React', :path => '../mastodon-rn/node_modules/react-native'
     pod 'React-Core', :path => '../mastodon-rn/node_modules/react-native/React'
     pod 'React-RCTText', :path => '../mastodon-rn/node_modules/react-native/Libraries/Text'
     pod 'React-RCTNetwork', :path => '../mastodon-rn/node_modules/react-native/Libraries/Network'
     pod 'React-RCTImage', :path => '../mastodon-rn/node_modules/react-native/Libraries/Image'

     # Expo modules
     pod 'ExpoModulesCore', :path => '../mastodon-rn/node_modules/expo-modules-core'

     # Additional dependencies
     pod 'react-native-mmkv', :path => '../mastodon-rn/node_modules/react-native-mmkv'
     pod 'RNReanimated', :path => '../mastodon-rn/node_modules/react-native-reanimated'
     pod 'react-native-video', :path => '../mastodon-rn/node_modules/react-native-video'
   end
   ```

4. **Install Pods**

   ```bash
   cd ios/mastodon
   pod install
   ```

5. **Build with Xcode**
   ```bash
   open ios/mastodon/mastodon.xcworkspace
   ```

#### Challenges with Approach 2:

- ⚠️ Complex manual configuration
- ⚠️ Need to maintain Podfile manually
- ⚠️ React Native version updates require reconfiguration
- ⚠️ Build phases must be carefully ordered
- ⚠️ Easier to break with updates

---

## Recommendation

**Use Approach 1** - Expo-generated project.

### Why?

1. **Production Ready**: The generated project is exactly what Expo apps use in production
2. **Fully Tested**: Millions of apps use this approach
3. **Maintainable**: Easy to update and regenerate
4. **Complete**: All dependencies and build configurations handled automatically
5. **Supported**: Expo team maintains the prebuild system

### Migration Path:

```bash
# 1. Generate native project
cd ios/mastodon-rn
npx expo prebuild --platform ios --clean

# 2. Build for testing
npx expo run:ios

# 3. Test thoroughly
# [Manual testing per TESTING_GUIDE.md]

# 4. Build for production
eas build --platform ios --profile production

# 5. Submit to App Store
eas submit --platform ios
```

---

## Production Build Configuration

### Using EAS Build (Recommended)

1. **Configure EAS**

   Already configured in `ios/mastodon-rn/app.json`:

   ```json
   {
     "expo": {
       "ios": {
         "bundleIdentifier": "com.friendlyfediverse"
       }
     }
   }
   ```

2. **Create EAS Build Profile**

   Create `ios/mastodon-rn/eas.json`:

   ```json
   {
     "build": {
       "production": {
         "ios": {
           "releaseChannel": "production",
           "distribution": "store",
           "autoIncrement": true
         }
       },
       "preview": {
         "ios": {
           "distribution": "internal",
           "simulator": true
         }
       }
     }
   }
   ```

3. **Build Commands**

   ```bash
   # Preview build (for testing)
   eas build --platform ios --profile preview

   # Production build (for App Store)
   eas build --platform ios --profile production
   ```

### Using Xcode (Alternative)

1. **Generate project**

   ```bash
   npx expo prebuild --platform ios
   ```

2. **Open in Xcode**

   ```bash
   cd ios/mastodon-rn/ios
   open mastodonvideo.xcworkspace
   ```

3. **Configure signing**
   - Select target > Signing & Capabilities
   - Set Team: KA5A6NN3PD (from existing project.yml)
   - Verify Bundle Identifier: com.friendlyfediverse

4. **Archive for release**
   - Product > Archive
   - Upload to App Store Connect

---

## File Structure After Integration

### Approach 1 (Expo-generated):

```
friendlyfediverse.com/
├── ios/
│   ├── mastodon/              # Old WebView project (can archive)
│   │   ├── project.yml
│   │   └── ...
│   └── mastodon-rn/           # React Native app
│       ├── app/               # React Native code
│       ├── src/               # React Native code
│       ├── ios/               # Generated iOS project ⭐
│       │   ├── mastodonvideo.xcodeproj
│       │   ├── mastodonvideo.xcworkspace
│       │   ├── Podfile
│       │   └── Pods/
│       ├── app.json
│       └── package.json
```

### Approach 2 (Manual integration):

```
friendlyfediverse.com/
├── ios/
│   ├── mastodon/              # Updated XcodeGen project
│   │   ├── project-rn.yml     # Updated configuration ⭐
│   │   ├── Podfile            # New - RN dependencies ⭐
│   │   ├── mastodon.xcworkspace
│   │   └── Pods/
│   └── mastodon-rn/           # React Native source
│       ├── app/
│       ├── src/
│       ├── ios/               # Generated modules only
│       │   └── Pods/
│       └── ...
```

---

## Testing the Integration

Follow the testing guide: `ios/mastodon-rn/TESTING_GUIDE.md`

### Critical Tests:

1. **Build succeeds**

   ```bash
   npx expo run:ios
   # Should launch app successfully
   ```

2. **All features work**
   - Authentication flow
   - Feed loading and scrolling
   - Media playback
   - Post interactions
   - Compose functionality
   - Search
   - Settings

3. **Performance meets targets**
   - 60 FPS scrolling ✅
   - < 2s app launch ✅
   - < 200MB memory ✅

4. **No crashes**
   - Test all flows in TESTING_GUIDE.md
   - Test on multiple iOS versions (15-18)
   - Test on different device sizes

---

## Troubleshooting

### Common Issues:

**1. "Command PhaseScriptExecution failed"**

- Ensure Node.js is installed and in PATH
- Run `npm install` in mastodon-rn/
- Clear build folder and retry

**2. "CocoaPods could not find compatible versions"**

- Run `cd ios && pod repo update`
- Delete Podfile.lock and retry
- Ensure iOS deployment target matches (18.5)

**3. "Bundle identifier mismatch"**

- Ensure app.json has `"bundleIdentifier": "com.friendlyfediverse"`
- Run `npx expo prebuild --clean` to regenerate

**4. "React Native dependency not found"**

- Run `npx expo install --fix`
- Verify all packages in package.json are installed
- Run `npm install` again

---

## Migration Checklist

- [ ] Backup existing ios/mastodon/ project
- [ ] Decide on Approach 1 (Expo) or Approach 2 (Manual)
- [ ] Run `npx expo prebuild` in mastodon-rn/
- [ ] Configure code signing (Team ID: KA5A6NN3PD)
- [ ] Test build locally with `npx expo run:ios`
- [ ] Run full manual testing suite (TESTING_GUIDE.md)
- [ ] Configure EAS Build (if using Approach 1)
- [ ] Create production build
- [ ] Test production build on real devices
- [ ] Submit to TestFlight for beta testing
- [ ] Collect feedback from beta testers
- [ ] Submit to App Store for review

---

## Additional Resources

- **Expo Prebuild**: https://docs.expo.dev/workflow/prebuild/
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **React Native iOS Setup**: https://reactnative.dev/docs/environment-setup
- **XcodeGen**: https://github.com/yonaskolb/XcodeGen

---

## Next Steps

1. **Immediate**: Choose integration approach (recommend Approach 1)
2. **Generate**: Run `npx expo prebuild --platform ios`
3. **Test**: Build and test locally
4. **Release**: Follow RELEASE_GUIDE.md for App Store submission

---

**Document Version**: 1.0
**Last Updated**: 2025-11-08
**Status**: Ready for implementation

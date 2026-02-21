# Building from Xcode

If `npx expo run:ios` works but opening the project in Xcode shows errors like:

- **No such module 'Expo'**
- **module map file '.../Debug-iphoneos/Expo/Expo.modulemap' not found**
- **SwiftGeneratePch / PrecompileSwiftBridgingHeader emitted errors**

follow these steps.

## 1. Open the workspace, not the project

CocoaPods generates a **workspace** that includes your app and all pods (including Expo). Always open that:

```bash
# From project root, install pods then open the workspace
cd ios
pod install
cd ..
open ios/FriendlyFediverse.xcworkspace
```

**Do not** open `FriendlyFediverse.xcodeproj` by itself. Use **`FriendlyFediverse.xcworkspace`** so Xcode sees the Pods and can find the Expo modules.

## 2. Use a simulator as the run destination

The errors reference **Debug-iphoneos** (physical device). When you run `npx expo run:ios`, it builds for the **simulator** (Debug-iphonesimulator), so the Expo pod artifacts exist only for the simulator. If Xcode’s run destination is “Any iOS Device” or a connected device, it will try to build for device and the Expo module maps won’t be there.

**In Xcode:**

1. In the toolbar, click the scheme/destination dropdown (next to the Run button).
2. Under **iOS Simulators**, pick a simulator (e.g. **iPhone 16**).
3. Build and run (⌘R).

After that, Xcode uses the same simulator build that `expo run:ios` uses, and the “module map not found” / “No such module 'Expo'” errors should go away.

## 3. If you need to run on a physical device from Xcode

1. Open **`ios/FriendlyFediverse.xcworkspace`** (after `pod install`).
2. Select your **connected device** (or “Any iOS Device”) as the run destination.
3. **Product → Clean Build Folder** (⇧⌘K).
4. Build (⌘B). The first device build may take longer while CocoaPods build Expo (and other pods) for **iphoneos**.

## 4. If errors persist: reset DerivedData

Stale build products can keep the wrong paths around:

```bash
# Remove DerivedData for this project only
rm -rf ~/Library/Developer/Xcode/DerivedData/FriendlyFediverse-*

# Or clear all DerivedData (slower next build for every project)
# rm -rf ~/Library/Developer/Xcode/DerivedData
```

Then open **`ios/FriendlyFediverse.xcworkspace`**, choose a **simulator** as destination, and build again.

## Summary

| Step | Action |
|------|--------|
| Open | `ios/FriendlyFediverse.xcworkspace` (not `.xcodeproj`) |
| Destination | A **simulator** (e.g. iPhone 16) so the build is Debug-iphonesimulator |
| If needed | `cd ios && pod install`; clean build folder; clear DerivedData |

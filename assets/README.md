# Assets Directory

This directory contains the app icons and splash screen required by Expo.

## Current Assets

### icon.png (1024x1024)

- **Source**: Copied from `ios/mastodon/mastodon/Assets.xcassets/AppIcon.appiconset/mastodon-1024x1024.png`
- **Purpose**: Main app icon used by Expo to generate all required iOS app icon sizes
- **Format**: PNG, 1024x1024px
- **Status**: ✅ Production ready

### splash.png (1024x1024)

- **Source**: Temporary - copied from icon.png
- **Purpose**: Splash screen shown when app launches
- **Format**: PNG, 1024x1024px
- **Status**: ⚠️ **Needs improvement** (see below)

### favicon.png (1024x1024)

- **Source**: Copied from icon.png
- **Purpose**: Web favicon (for Expo web builds)
- **Format**: PNG, 1024x1024px
- **Status**: ✅ Production ready

---

## Improving the Splash Screen

The current splash screen is just a copy of the app icon. For a better user experience, you should create a proper splash screen.

### Recommended Splash Screen Specs

- **Size**: 1284x2778 pixels (iPhone 14 Pro Max)
- **Background**: Solid color (#6364FF - the app's accent color)
- **Icon**: Centered app icon (512x512 or similar)
- **Format**: PNG

### Option 1: Create with Design Tool

Use Figma, Sketch, or Photoshop:

1. Create 1284x2778px canvas
2. Fill with background color: #6364FF
3. Place app icon (512x512) centered
4. Export as `splash.png`
5. Replace the file in this directory

### Option 2: Use Online Generator

- [Appicon.co](https://appicon.co/) - Generate splash screens
- [MakeAppIcon](https://makeappicon.com/) - App icon and splash generator
- [Expo Splash Screen Generator](https://docs.expo.dev/guides/splash-screens/)

### Option 3: Use ImageMagick (if available)

```bash
# Create 1284x2778 splash with centered icon
convert -size 1284x2778 xc:'#6364FF' \
  icon.png -resize 512x512 \
  -gravity center -composite \
  splash.png
```

### Option 4: Use Expo's Splash Screen API

You can also handle splash screens programmatically with `expo-splash-screen`:

```typescript
import * as SplashScreen from "expo-splash-screen";

// Keep splash visible while loading
SplashScreen.preventAutoHideAsync();

// Hide when ready
await SplashScreen.hideAsync();
```

---

## Adaptive Icons (Future Enhancement)

For Android, you may want to create adaptive icons:

- **adaptive-icon.png**: 1024x1024px with safe zone
- Foreground and background layers
- See: https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/

---

## Do Not Delete

These assets are **required** for Expo prebuild to work. If they're missing, you'll get:

```
Error: [ios.dangerous]: withIosDangerousBaseMod: ENOENT: no such file or directory, open './assets/icon.png'
```

Keep this directory and all PNG files committed to git.

---

**Last Updated**: 2025-11-08
**Status**: Basic assets ready, splash screen should be improved before production release

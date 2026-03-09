# Setup Guide - Friendly Fediverse React Native

## Quick Start

### 1. Install Dependencies

```bash
cd ios/mastodon-rn
npm install
```

### 2. Start Development Server

```bash
npm start
```

Then press `i` to open iOS simulator.

## Detailed Setup

### Prerequisites

1. **Node.js 20.x LTS**

   ```bash
   node --version  # Should be v20.x
   ```

2. **Xcode 16.4+**
   - Install from App Store
   - Install command line tools:
     ```bash
     xcode-select --install
     ```

3. **iOS Simulator**
   - Open Xcode → Preferences → Components
   - Download iOS simulators

4. **Expo CLI (Optional)**
   ```bash
   npm install -g expo-cli
   ```

### First-Time Setup

1. **Clone and navigate:**

   ```bash
   cd ios/mastodon-rn
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Verify TypeScript:**

   ```bash
   npm run type-check
   ```

4. **Run linter:**

   ```bash
   npm run lint
   ```

5. **Start development server:**

   ```bash
   npm start
   ```

6. **Open in simulator:**
   - Press `i` in the terminal
   - Or scan QR code with Expo Go on physical device

### Development Workflow

1. **Start server:**

   ```bash
   npm start
   ```

2. **Open in iOS simulator:**
   - Press `i`

3. **Make changes:**
   - Edit files in `app/` or `src/`
   - Save and see changes instantly (Fast Refresh)

4. **Debug:**
   - Press `j` to open debugger
   - Press `r` to reload
   - Shake device/Cmd+D for dev menu

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint
npm run lint

# Fix lint issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run type-check
```

### Troubleshooting

#### Problem: Metro bundler won't start

**Solution:**

```bash
npx expo start -c  # Clear cache
```

#### Problem: Dependencies out of sync

**Solution:**

```bash
rm -rf node_modules package-lock.json
npm install
```

#### Problem: iOS build fails

**Solution:**

```bash
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
npx expo prebuild --clean
```

#### Problem: Can't find module

**Solution:**
Check that imports use the correct aliases:

- `@/...` for `src/...`
- `@components/...` for `src/components/...`
- `@lib/...` for `src/lib/...`
- etc.

### Project Structure

```
app/                # Expo Router screens (file-based routing)
├── _layout.tsx    # Root layout
├── index.tsx      # Landing screen
├── (auth)/        # Auth flow (group route)
├── (tabs)/        # Main app (group route)
└── modals/        # Modal screens

src/
├── components/    # Reusable components
├── contexts/      # React contexts
├── hooks/         # Custom hooks
├── lib/           # Core libraries
├── types/         # TypeScript types
├── theme/         # Styling
└── config/        # Configuration
```

### Environment Variables

Create `.env` file in project root:

```bash
# Development
EXPO_PUBLIC_API_URL=https://api.example.com

# For production builds
# Set these in EAS or Expo dashboard
```

### Building for Production

```bash
# Create production build
npx expo build:ios

# Or use EAS Build (recommended)
npm install -g eas-cli
eas build --platform ios
```

## Next Steps

1. ✅ Phase 0 complete - Foundation established
2. 🚧 Phase 1 - Implement storage layer
3. 📋 Phase 2 - OAuth authentication
4. 📋 Phase 3 - Feed system
5. 📋 Phase 4+ - See roadmap

## Resources

- [Expo Docs](https://docs.expo.dev/)
- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Migration Roadmap](../REACT_NATIVE_MIGRATION_ROADMAP.md)

## Getting Help

- Check the roadmap: `ios/REACT_NATIVE_MIGRATION_ROADMAP.md`
- Review this guide
- Check Expo documentation
- Open an issue on GitHub

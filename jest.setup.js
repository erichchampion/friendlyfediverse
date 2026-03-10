import '@testing-library/jest-native/extend-expect';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock react-native-mmkv with stateful storage
jest.mock('react-native-mmkv', () => {
  const stores = new Map();

  return {
    MMKV: jest.fn(function ({ id = 'default' } = {}) {
      if (!stores.has(id)) {
        stores.set(id, new Map());
      }
      const store = stores.get(id);

      return {
        set: jest.fn((key, value) => {
          store.set(key, value);
        }),
        getString: jest.fn((key) => {
          const value = store.get(key);
          return typeof value === 'string' ? value : undefined;
        }),
        getBoolean: jest.fn((key) => {
          const value = store.get(key);
          return typeof value === 'boolean' ? value : undefined;
        }),
        getNumber: jest.fn((key) => {
          const value = store.get(key);
          return typeof value === 'number' ? value : undefined;
        }),
        getAllKeys: jest.fn(() => Array.from(store.keys())),
        delete: jest.fn((key) => {
          store.delete(key);
        }),
        clearAll: jest.fn(() => {
          store.clear();
        }),
      };
    }),
  };
});

// Mock expo-secure-store with stateful storage
jest.mock('expo-secure-store', () => {
  const secureStore = new Map();

  return {
    setItemAsync: jest.fn(async (key, value) => {
      secureStore.set(key, value);
    }),
    getItemAsync: jest.fn(async (key) => {
      return secureStore.get(key) || null;
    }),
    deleteItemAsync: jest.fn(async (key) => {
      secureStore.delete(key);
    }),
    // Test-only method to clear all storage
    __clearAllForTesting: () => {
      secureStore.clear();
    },
  };
});

// Mock FlashList with FlatList for testing
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');

  return {
    FlashList: React.forwardRef((props, ref) => {
      return <FlatList {...props} ref={ref} />;
    }),
  };
});

jest.mock('expo-linking', () => ({
  createURL: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

jest.mock('expo-video', () => {
  const React = require('react');
  const mockPlayer = {
    playing: false,
    muted: false,
    loop: false,
    duration: 60000, // 60 seconds in milliseconds
    currentTime: 0,
    play: jest.fn(() => {
      mockPlayer.playing = true;
    }),
    pause: jest.fn(() => {
      mockPlayer.playing = false;
    }),
  };

  return {
    useVideoPlayer: jest.fn((url, callback) => {
      const player = { ...mockPlayer };
      if (callback) {
        callback(player);
      }
      return player;
    }),
    VideoView: React.forwardRef((props: any, ref: any) => {
      const MockView = require('react-native').View;
      return <MockView testID="video-component" {...props} />;
    }),
  };
});

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => { };
  // Add missing functions for Reanimated 4.x
  Reanimated.useSharedValue = jest.fn((init) => ({ value: init }));
  Reanimated.useAnimatedStyle = jest.fn((style) => style);
  Reanimated.withSpring = jest.fn((toValue) => toValue);
  Reanimated.withTiming = jest.fn((toValue) => toValue);
  return Reanimated;
});

// Mock react-native-gesture-handler GestureDetector
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    GestureHandlerRootView: View,
    Gesture: {
      Pinch: jest.fn(() => ({
        onUpdate: jest.fn().mockReturnThis(),
        onEnd: jest.fn().mockReturnThis(),
      })),
    },
    GestureDetector: ({ children }: any) => children,
  };
});

// Mock react-native useWindowDimensions to prevent Invariant Violation outside providers
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
}));

// Mock react-native-safe-area-context to prevent invariant violations in child components
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: jest.fn().mockImplementation(({ children }) => children),
    SafeAreaConsumer: jest.fn().mockImplementation(({ children }) => children(inset)),
    SafeAreaView: jest.fn().mockImplementation(({ children }) => children),
    useSafeAreaInsets: jest.fn().mockImplementation(() => inset),
    useSafeAreaFrame: jest.fn().mockImplementation(() => ({ x: 0, y: 0, width: 390, height: 844 })),
    useWindowDimensions: jest.fn().mockImplementation(() => ({ width: 390, height: 844 })),
  };
});

// Silence the warning: Animated: `useNativeDriver` is not supported
// Note: This path may have changed in React Native 0.81, but the mock is optional
try {
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
} catch (e) {
  // Path may not exist in RN 0.81, ignore
}

// Mock ActionSheetIOS
try {
  jest.mock('react-native/Libraries/ActionSheetIOS/ActionSheetIOS', () => ({
    showActionSheetWithOptions: jest.fn(),
  }));
} catch (e) {
  // Path may not exist in RN 0.81, ignore
}

// Global test teardown to clear any remaining timers
afterAll(() => {
  // Clean up RequestQueue timers
  try {
    const { requestQueue } = require('./src/lib/api/requestQueue');
    if (requestQueue && typeof requestQueue.cleanup === 'function') {
      requestQueue.cleanup();
    }
  } catch (e) {
    // Ignore if module not available
  }

  // Clean up RelationshipBatcher timers
  try {
    const { relationshipBatcher } = require('./src/lib/api/relationshipBatcher');
    if (relationshipBatcher && typeof relationshipBatcher.cleanup === 'function') {
      relationshipBatcher.cleanup();
    }
  } catch (e) {
    // Ignore if module not available
  }

  // Clear any remaining timers that might be keeping the process alive
  // This helps prevent "worker process has failed to exit gracefully" warnings
  jest.clearAllTimers();
});

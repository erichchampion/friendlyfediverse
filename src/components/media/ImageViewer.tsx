import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Text,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Alert,
} from "react-native";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { RetryableImage as Image } from "./RetryableImage";
import { UI_CONFIG } from "@lib/uiConfig";
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { MediaAttachment } from "@types";
import { useTheme } from "@contexts/ThemeContext";

/**
 * Full-screen Image Viewer with pinch-to-zoom
 * Phase 4: Media Handling
 */

interface ImageViewerProps {
  visible: boolean;
  images: MediaAttachment[];
  initialIndex?: number;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export function ImageViewer({
  visible,
  images,
  initialIndex = 0,
  onClose,
}: ImageViewerProps) {
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullSize, setIsFullSize] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  // Restore StatusBar when modal closes
  useEffect(() => {
    if (visible) {
      StatusBar.setHidden(true, "fade");
    } else {
      StatusBar.setHidden(false, "fade");
    }

    return () => {
      // Always restore StatusBar on unmount
      StatusBar.setHidden(false, "fade");
    };
  }, [visible]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = event.scale;
      focalX.value = event.focalX;
      focalY.value = event.focalY;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
      } else if (scale.value > 3) {
        scale.value = withSpring(3);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: focalX.value },
        { translateY: focalY.value },
        { scale: scale.value },
        { translateX: -focalX.value },
        { translateY: -focalY.value },
      ],
    };
  });

  const currentImage = images[currentIndex];
  const fullSizeDimensions = useMemo(() => {
    const original = currentImage.meta?.original;
    if (original?.width && original?.height) {
      return {
        width: original.width,
        height: original.height,
      };
    }

    return {
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT * 1.5,
    };
  }, [currentImage]);

  const toggleFullSize = useCallback(() => {
    setIsFullSize((prev) => !prev);
  }, []);

  const handleLongPress = useCallback(async () => {
    if (isSavingRef.current) return;

    const sharingAvailable = await Sharing.isAvailableAsync();
    if (!sharingAvailable) {
      Alert.alert("Save failed", "Sharing is not available on this device.");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const urlPath = currentImage.url.split("?")[0];
      const ext = urlPath.split(".").pop();
      const safeExt = ext && ext.length <= 4 ? ext : "jpg";
      const targetPath = `${FileSystemLegacy.cacheDirectory}image-${currentImage.id}.${safeExt}`;
      const { uri } = await FileSystemLegacy.downloadAsync(
        currentImage.url,
        targetPath,
      );

      const mimeType =
        safeExt === "png"
          ? "image/png"
          : safeExt === "webp"
            ? "image/webp"
            : "image/jpeg";

      await Sharing.shareAsync(uri, {
        mimeType,
        dialogTitle: "Save image",
      });
    } catch (error) {
      console.error("ImageViewer: failed to save image", error);
      Alert.alert("Save failed", "Could not save image. Please try again.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [currentImage]);

  // Reset full-size mode when switching images or closing
  useEffect(() => {
    setIsFullSize(false);
  }, [currentIndex, visible]);

  if (!visible) return null;

  const imageContent = (
    <GestureDetector gesture={pinchGesture}>
      <Pressable
        onPress={toggleFullSize}
        onLongPress={handleLongPress}
        style={styles.pressable}
        testID="image-viewer-image-pressable"
      >
        <Animated.View
          style={[
            styles.imageWrapper,
            animatedStyle,
            isFullSize && styles.fullSizeWrapper,
          ]}
        >
          <Image
            source={{ uri: currentImage.url }}
            style={[
              styles.image,
              isFullSize && {
                width: fullSizeDimensions.width,
                height: fullSizeDimensions.height,
              },
            ]}
            contentFit={isFullSize ? "cover" : "contain"}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            transition={200}
            testID="image-viewer-image"
          />
        </Animated.View>
      </Pressable>
    </GestureDetector>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.container, { backgroundColor: "#000000" }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>

            {images.length > 1 && (
              <Text style={styles.counter}>
                {currentIndex + 1} / {images.length}
              </Text>
            )}
          </View>

          {/* Image */}
          <View style={styles.imageContainer}>
            {isFullSize ? (
              <ScrollView
                testID="image-viewer-fullsize-scroll"
                maximumZoomScale={3}
                minimumZoomScale={1}
                bounces={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.fullSizeScrollContent,
                  {
                    minWidth: fullSizeDimensions.width,
                    minHeight: fullSizeDimensions.height,
                  },
                ]}
              >
                {imageContent}
              </ScrollView>
            ) : (
              imageContent
            )}

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            )}

            {isSaving && (
              <View style={styles.savingOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.savingText}>Preparing image…</Text>
              </View>
            )}
          </View>

          {/* Footer with description */}
          {!isFullSize && currentImage.description && (
            <View style={styles.footer}>
              <Text style={styles.description}>{currentImage.description}</Text>
            </View>
          )}

          {/* Navigation arrows for multiple images */}
          {images.length > 1 && (
            <View style={styles.navigation}>
              {currentIndex > 0 && (
                <TouchableOpacity
                  style={[styles.navButton, styles.navButtonLeft]}
                  onPress={() => {
                    setCurrentIndex(currentIndex - 1);
                    scale.value = 1;
                  }}
                >
                  <Text style={styles.navIcon}>‹</Text>
                </TouchableOpacity>
              )}

              {currentIndex < images.length - 1 && (
                <TouchableOpacity
                  style={[styles.navButton, styles.navButtonRight]}
                  onPress={() => {
                    setCurrentIndex(currentIndex + 1);
                    scale.value = 1;
                  }}
                >
                  <Text style={styles.navIcon}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeIcon: {
    fontSize: 24,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  counter: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  fullSizeWrapper: {
    alignItems: "flex-start",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  pressable: {
    flex: 1,
  },
  fullSizeScrollContent: {
    alignItems: "flex-start",
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  savingOverlay: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    marginHorizontal: 32,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  savingText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  description: {
    fontSize: 14,
    color: "#FFFFFF",
    lineHeight: 20,
  },
  navigation: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    pointerEvents: "box-none",
  },
  navButton: {
    width: 60,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  navButtonLeft: {
    borderTopRightRadius: 50,
    borderBottomRightRadius: 50,
  },
  navButtonRight: {
    borderTopLeftRadius: 50,
    borderBottomLeftRadius: 50,
  },
  navIcon: {
    fontSize: 48,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});

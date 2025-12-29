import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  PanResponder,
  LayoutChangeEvent,
  Modal,
  StatusBar,
} from "react-native";
import { useState, useEffect, useRef, useCallback } from "react";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@contexts/ThemeContext";
import type { MediaAttachment } from "@types";
import { STYLE_CONSTANTS } from "@lib/styleConstants";
import { fullSizeConstraints } from "@lib/styleHelpers";

/**
 * Enhanced Video Player Component with interactive controls
 * Phase 4: Media Handling - Enhanced Controls
 */

interface VideoPlayerProps {
  media: MediaAttachment;
  autoPlay?: boolean;
  muted?: boolean;
  style?: any;
  mode?: "grid" | "list";
  isVisible?: boolean;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export function VideoPlayer({
  media,
  autoPlay = false,
  muted = true,
  style,
  mode = "list",
  isVisible = true,
}: VideoPlayerProps) {
  const { colors } = useTheme();
  const [showControls, setShowControls] = useState(mode === "list");
  const [isMuted, setIsMuted] = useState(muted);
  const [volume, setVolume] = useState(1.0);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const wasPlayingBeforeSeek = useRef(false);
  const progressBarWidth = useRef(0);
  const progressBarLayout = useRef({ x: 0, width: 0 });

  const isGif = media.type === "gifv";
  const shouldShowControls = (mode === "list" || isFullScreen) && !isGif;

  // Handle StatusBar visibility for full-screen
  useEffect(() => {
    if (isFullScreen) {
      StatusBar.setHidden(true, "fade");
    } else {
      StatusBar.setHidden(false, "fade");
    }

    return () => {
      // Always restore StatusBar on unmount
      StatusBar.setHidden(false, "fade");
    };
  }, [isFullScreen]);

  // Determine if video should be playing based on visibility and settings
  const shouldPlay = isVisible && (autoPlay || isGif);

  // Create video player instance
  const player = useVideoPlayer(media.url, (player) => {
    player.loop = mode === "grid" || isGif;
    player.muted = mode === "grid" ? true : isMuted;
    if (mode !== "grid" && !isMuted) {
      player.volume = volume;
    }
  });

  // Update player state based on props
  useEffect(() => {
    if (shouldPlay && !isSeeking) {
      // Handle promise rejection from browser autoplay restrictions
      try {
        // Chain catch immediately to prevent uncaught promise rejection
        // Use optional chaining since play() might return undefined on some platforms
        player.play()?.catch?.((error) => {
          // Silently ignore autoplay errors - browsers block autoplay without user interaction
          // This is expected behavior and not a critical error
          console.debug('Video autoplay blocked:', error?.message || error);
        });
      } catch (error) {
        // Catch synchronous errors
        console.debug('Video autoplay blocked (sync):', error instanceof Error ? error.message : String(error));
      }
    } else {
      player.pause();
    }
  }, [shouldPlay, player, isSeeking]);

  useEffect(() => {
    player.muted = mode === "grid" ? true : isMuted;
    if (mode !== "grid" && !isMuted) {
      player.volume = volume;
    }
  }, [isMuted, mode, player, volume]);

  useEffect(() => {
    player.loop = mode === "grid" || isGif;
  }, [mode, isGif, player]);

  // Update volume when not muted
  useEffect(() => {
    if (!isMuted && mode !== "grid") {
      player.volume = volume;
    }
  }, [volume, isMuted, mode, player]);

  const isPlaying = player.playing;
  const duration = player.duration ? player.duration / 1000 : 0; // Convert to seconds
  const currentTime = player.currentTime ? player.currentTime / 1000 : 0; // Convert to seconds

  // Use seek position when seeking, otherwise use current time
  const displayTime = isSeeking ? seekPosition : currentTime;
  const displayProgress = duration > 0 ? displayTime / duration : 0;

  // Auto-hide controls after 3 seconds if playing (list mode only)
  useEffect(() => {
    if (isPlaying && shouldShowControls && mode === "list" && !showVolumeSlider && !isSeeking) {
      const timer = setTimeout(() => setShowControls(false), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isPlaying, shouldShowControls, mode, showVolumeSlider, isSeeking]);

  const handlePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      try {
        player.play()?.catch?.((error) => {
          console.debug('Video play failed:', error?.message || error);
        });
      } catch (error) {
        console.debug('Video play failed (sync):', error instanceof Error ? error.message : String(error));
      }
    }
    setShowControls(true);
  };

  const handleMuteToggle = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    player.muted = newMutedState;
    if (!newMutedState) {
      player.volume = volume;
      setShowVolumeSlider(true);
      // Hide volume slider after 2 seconds
      setTimeout(() => setShowVolumeSlider(false), 2000);
    }
  };

  const handleVolumeChange = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    if (!isMuted && mode !== "grid") {
      player.volume = clampedVolume;
    }
    setShowVolumeSlider(true);
    // Reset hide timer
    setTimeout(() => setShowVolumeSlider(false), 2000);
  }, [isMuted, mode, player]);

  const handleSeek = useCallback((position: number) => {
    if (duration > 0) {
      const clampedPosition = Math.max(0, Math.min(duration, position));
      setSeekPosition(clampedPosition);
      // Seek to the position in milliseconds
      player.currentTime = clampedPosition * 1000;
    }
  }, [duration, player]);

  const formatTime = (seconds: number) => {
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Pan responder for progress bar scrubbing
  const progressBarPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        wasPlayingBeforeSeek.current = isPlaying;
        setIsSeeking(true);
        setShowControls(true);
        // Calculate initial position on touch down
        if (duration > 0 && progressBarLayout.current.width > 0) {
          const { pageX } = evt.nativeEvent;
          const progressBarX = progressBarLayout.current.x;
          const progressBarWidth = progressBarLayout.current.width;
          const relativeX = pageX - progressBarX;
          const progress = Math.max(0, Math.min(1, relativeX / progressBarWidth));
          const newTime = progress * duration;
          setSeekPosition(newTime);
        }
      },
      onPanResponderMove: (evt) => {
        if (duration > 0 && progressBarLayout.current.width > 0) {
          const { pageX } = evt.nativeEvent;
          const progressBarX = progressBarLayout.current.x;
          const progressBarWidth = progressBarLayout.current.width;
          
          // Calculate progress from touch position
          const relativeX = pageX - progressBarX;
          const progress = Math.max(0, Math.min(1, relativeX / progressBarWidth));
          const newTime = progress * duration;
          setSeekPosition(newTime);
        }
      },
      onPanResponderRelease: () => {
        if (isSeeking && duration > 0) {
          handleSeek(seekPosition);
          setIsSeeking(false);
          // Resume playing if it was playing before seek
          if (wasPlayingBeforeSeek.current) {
            try {
              player.play()?.catch?.((error) => {
                console.debug('Video play after seek failed:', error?.message || error);
              });
            } catch (error) {
              console.debug('Video play after seek failed (sync):', error instanceof Error ? error.message : String(error));
            }
          }
        }
      },
    })
  ).current;

  const volumeSliderLayout = useRef({ x: 0, width: 100 });

  const handleVolumeSliderLayout = (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    volumeSliderLayout.current = { x, width };
  };

  // Pan responder for volume slider
  const volumeSliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setShowVolumeSlider(true);
        setShowControls(true);
        // Calculate initial volume on touch down
        const { pageX } = evt.nativeEvent;
        const sliderX = volumeSliderLayout.current.x;
        const sliderWidth = volumeSliderLayout.current.width;
        const relativeX = pageX - sliderX;
        const progress = Math.max(0, Math.min(1, relativeX / sliderWidth));
        handleVolumeChange(progress);
      },
      onPanResponderMove: (evt) => {
        const { pageX } = evt.nativeEvent;
        const sliderX = volumeSliderLayout.current.x;
        const sliderWidth = volumeSliderLayout.current.width;
        const relativeX = pageX - sliderX;
        const progress = Math.max(0, Math.min(1, relativeX / sliderWidth));
        handleVolumeChange(progress);
      },
      onPanResponderRelease: () => {
        setTimeout(() => setShowVolumeSlider(false), 2000);
      },
    })
  ).current;

  const handleProgressBarLayout = (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    progressBarLayout.current = { x, width };
    progressBarWidth.current = width;
  };

  const handleProgressBarPress = (event: any) => {
    if (duration > 0 && progressBarLayout.current.width > 0) {
      const { pageX } = event.nativeEvent;
      const progressBarX = progressBarLayout.current.x;
      const progressBarWidth = progressBarLayout.current.width;
      
      const relativeX = pageX - progressBarX;
      const progress = Math.max(0, Math.min(1, relativeX / progressBarWidth));
      const newTime = progress * duration;
      handleSeek(newTime);
      setShowControls(true);
    }
  };

  const handleFullScreenToggle = () => {
    setIsFullScreen(!isFullScreen);
    setShowControls(true);
  };

  const handleExitFullScreen = () => {
    setIsFullScreen(false);
    setShowControls(true);
  };

  // Render video player content (reusable for normal and full-screen modes)
  const renderVideoPlayer = (wrapperStyle: any, showCloseButton = false) => {
    // In grid mode, use View with pointerEvents="box-none" to allow touches to pass through
    // to the parent TouchableOpacity in FeedGridView
    // Include GIF badge if it's a GIF, but no controls
    if (mode === "grid" && !isFullScreen) {
      return (
        <View style={wrapperStyle} pointerEvents="box-none">
          <VideoView
            player={player}
            style={styles.video}
            contentFit="cover"
            nativeControls={false}
          />
          {/* GIF indicator - should be visible in grid mode */}
          {isGif && (
            <View style={styles.gifBadge}>
              <Text style={styles.gifText}>GIF</Text>
            </View>
          )}
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={wrapperStyle}
        activeOpacity={0.9}
        onPress={() => {
          // In list mode or full-screen, toggle controls visibility
          setShowControls(!showControls);
        }}
      >
        <VideoView
          player={player}
          style={styles.video}
          contentFit={isFullScreen ? "contain" : "contain"}
          nativeControls={false}
        />

        {/* Controls overlay - only shown in list mode */}
        {shouldShowControls && showControls && (
          <View style={styles.controlsOverlay} pointerEvents="box-none">
            {/* Volume slider overlay */}
            {showVolumeSlider && !isMuted && (
              <View style={styles.volumeSliderOverlay} pointerEvents="box-none">
                <View style={styles.volumeSliderContainer}>
                  <Text style={styles.volumeLabel}>🔊</Text>
                  <View
                    style={styles.volumeSliderTrack}
                    onLayout={handleVolumeSliderLayout}
                    {...volumeSliderPanResponder.panHandlers}
                  >
                    <View
                      style={[
                        styles.volumeSliderFill,
                        { width: `${volume * 100}%` },
                      ]}
                    />
                    <View
                      style={[
                        styles.volumeSliderThumb,
                        { left: `${Math.min(100, Math.max(0, volume * 100))}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.volumeValue}>{Math.round(volume * 100)}%</Text>
                </View>
              </View>
            )}

            {/* Bottom control bar */}
            <View style={styles.bottomControlBar}>
              {/* Play/Pause button */}
              <TouchableOpacity
                testID="play-button"
                style={styles.controlButton}
                onPress={handlePlayPause}
              >
                <Text testID="play-icon" style={styles.controlIcon}>
                  {isPlaying ? "⏸" : "▶️"}
                </Text>
              </TouchableOpacity>

              {/* Time display */}
              {duration > 0 && (
                <Text testID="time-display" style={styles.timeText}>
                  {formatTime(displayTime)} / {formatTime(duration)}
                </Text>
              )}

              {/* Volume control */}
              <View style={styles.volumeControl}>
                <TouchableOpacity
                  testID="mute-button"
                  style={styles.controlButton}
                  onPress={handleMuteToggle}
                  onLongPress={() => setShowVolumeSlider(!showVolumeSlider)}
                >
                  <Text testID="mute-icon" style={styles.controlIcon}>
                    {isMuted ? "🔇" : "🔊"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Full-screen button */}
              {!isGif && (
                <TouchableOpacity
                  testID="fullscreen-button"
                  style={styles.controlButton}
                  onPress={handleFullScreenToggle}
                >
                  <Ionicons
                    testID="fullscreen-icon"
                    name={isFullScreen ? "contract" : "expand"}
                    size={20}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Interactive progress bar - shown in list mode */}
            {duration > 0 && (
              <View
                testID="progress-bar"
                style={styles.progressBarContainer}
                onLayout={handleProgressBarLayout}
              >
                <TouchableOpacity
                  activeOpacity={1}
                  style={styles.progressBarTouchable}
                  onPress={handleProgressBarPress}
                  {...progressBarPanResponder.panHandlers}
                >
                  <View style={styles.progressBarBackground}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${displayProgress * 100}%` },
                      ]}
                    />
                    {/* Progress bar thumb */}
                    <View
                      style={[
                        styles.progressBarThumb,
                        { left: `${Math.min(100, Math.max(0, displayProgress * 100))}%` },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* GIF indicator */}
        {isGif && (
          <View style={styles.gifBadge}>
            <Text style={styles.gifText}>GIF</Text>
          </View>
        )}

        {/* Close button for full-screen mode */}
        {showCloseButton && (
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleExitFullScreen}
          >
            <Text style={styles.closeButtonIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // Render normal view or full-screen modal
  const baseWrapperStyle = isFullScreen
    ? styles.videoWrapperFullScreen
    : mode === "grid"
      ? styles.videoWrapperGrid
      : styles.videoWrapper;
  const wrapperStyle = [baseWrapperStyle, style];

  const videoContent = renderVideoPlayer(wrapperStyle, isFullScreen);

  if (isFullScreen) {
    return (
      <Modal
        visible={isFullScreen}
        transparent={false}
        animationType="fade"
        onRequestClose={handleExitFullScreen}
        statusBarTranslucent
      >
        <View style={styles.fullScreenContainer}>
          {videoContent}
        </View>
      </Modal>
    );
  }

  return (
    <View
      style={[
        mode === "grid" ? styles.containerGrid : styles.container,
        style,
      ]}
    >
      {videoContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000000",
    borderRadius: 12,
    overflow: "hidden",
    maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
    width: STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
  },
  containerGrid: {
    backgroundColor: "#000000",
    width: STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
    overflow: "hidden",
    ...fullSizeConstraints,
  },
  videoWrapper: {
    position: "relative",
    width: STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
    maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
    ...fullSizeConstraints,
  },
  videoWrapperGrid: {
    position: "relative",
    width: STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
    ...fullSizeConstraints,
  },
  video: {
    width: STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
    ...fullSizeConstraints,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  bottomControlBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 16,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    gap: 12,
  },
  controlButton: {
    padding: 8,
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  controlIcon: {
    fontSize: 20,
    color: "#FFFFFF",
  },
  timeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
    textAlign: "center",
  },
  volumeControl: {
    flexDirection: "row",
    alignItems: "center",
  },
  volumeSliderOverlay: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  volumeSliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 12,
  },
  volumeLabel: {
    fontSize: 18,
  },
  volumeSliderTrack: {
    width: 100,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    position: "relative",
    justifyContent: "center",
  },
  volumeSliderFill: {
    position: "absolute",
    left: 0,
    height: "100%",
    backgroundColor: "#6364FF",
    borderRadius: 2,
  },
  volumeSliderThumb: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    marginLeft: -6,
    top: -4,
  },
  volumeValue: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
    minWidth: 35,
    textAlign: "right",
  },
  progressBarContainer: {
    position: "absolute",
    bottom: 48,
    left: 0,
    right: 0,
    height: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  progressBarTouchable: {
    flex: 1,
    justifyContent: "center",
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    position: "relative",
  },
  progressBarFill: {
    position: "absolute",
    left: 0,
    height: "100%",
    backgroundColor: "#6364FF",
    borderRadius: 2,
  },
  progressBarThumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    marginLeft: -7,
    top: -5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  gifBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 5,
  },
  gifText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  containerFullScreen: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  videoWrapperFullScreen: {
    flex: 1,
    width: "100%",
    height: "100%",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
  },
  closeButtonIcon: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
  },
});

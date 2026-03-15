import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { ImageViewer } from "../ImageViewer";
import type { MediaAttachment } from "@types";

jest.mock("@contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      card: "#FFFFFF",
      text: "#000000",
      textSecondary: "#666666",
      primary: "#6364FF",
      background: "#000000",
      border: "#333333",
    },
  }),
}));

jest.mock("expo-image", () => ({
  Image: ({ testID, ...props }: any) => {
    const { View } = require("react-native");
    return <View testID={testID || "image"} {...props} />;
  },
}));

const mockDownloadAsync = jest.fn().mockResolvedValue({
  uri: "file://cache/image-1.jpg",
});

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file://cache/",
  downloadAsync: (...args: any[]) => mockDownloadAsync(...args),
}));

const mockShareAsync = jest.fn().mockResolvedValue({ action: "sharedAction" });

jest.mock(
  "expo-sharing",
  () => ({
    isAvailableAsync: async () => true,
    shareAsync: (...args: any[]) => mockShareAsync(...args),
  }),
  { virtual: true },
);

jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  const mockPinch = () => {
    const gesture = {
      onUpdate() {
        return this;
      },
      onEnd() {
        return this;
      },
    };
    return gesture;
  };

  return {
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    GestureDetector: ({ children }: any) => <View>{children}</View>,
    Gesture: {
      Pinch: mockPinch,
    },
  };
});

/**
 * Helper to flush multiple ticks of the microtask/timer queue.
 * handleLongPress has 3 sequential awaits (isAvailableAsync → downloadAsync → shareAsync),
 * each requiring a separate event loop tick to resolve.
 */
async function flushAsyncChain(ticks = 5) {
  for (let i = 0; i < ticks; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe("ImageViewer full-size toggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDownloadAsync.mockReset();
    mockDownloadAsync.mockResolvedValue({
      uri: "file://cache/image-1.jpg",
    });
  });

  const images: MediaAttachment[] = [
    {
      id: "1",
      type: "image",
      url: "https://example.com/image.jpg",
      previewUrl: "https://example.com/preview.jpg",
      description: "Sample alt text",
      meta: {
        original: { width: 1200, height: 1600 },
      },
    },
  ];

  it("hides alt text and enables full-size scroll after tapping image", () => {
    const { getByText, queryByText, getByTestId } = render(
      <ImageViewer visible images={images} onClose={() => {}} />,
    );

    // Alt text is visible by default
    expect(getByText("Sample alt text")).toBeTruthy();

    // Toggle full-size view
    fireEvent.press(getByTestId("image-viewer-image-pressable"));

    // Alt text hidden in full-size mode
    expect(queryByText("Sample alt text")).toBeNull();

    // Full-size scroll container is rendered
    expect(getByTestId("image-viewer-fullsize-scroll")).toBeTruthy();

    // Image uses original dimensions to allow panning
    const image = getByTestId("image-viewer-image");
    expect(image.props.style.find((s: any) => s?.height === 1600)).toBeTruthy();
    expect(image.props.style.find((s: any) => s?.width === 1200)).toBeTruthy();
  });

  it("downloads and shares the image on long press with mime and title", async () => {
    const { getByTestId } = render(
      <ImageViewer visible images={images} onClose={() => {}} />,
    );

    await act(async () => {
      fireEvent(getByTestId("image-viewer-image-pressable"), "onLongPress");
    });

    // Flush detached async chain: isAvailableAsync → downloadAsync → shareAsync
    await flushAsyncChain();

    expect(mockDownloadAsync).toHaveBeenCalledTimes(1);
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
    expect(mockShareAsync).toHaveBeenCalledWith(
      "file://cache/image-1.jpg",
      expect.objectContaining({
        mimeType: "image/jpeg",
        dialogTitle: "Save image",
      }),
    );
  });

  it("prevents duplicate downloads while one is in progress", async () => {
    let resolveDownload: ((value: any) => void) | null = null;
    mockDownloadAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDownload = resolve;
        }),
    );

    const { getByTestId } = render(
      <ImageViewer visible images={images} onClose={() => {}} />,
    );

    // Fire first long press and flush so the handler reaches the pending downloadAsync
    await act(async () => {
      fireEvent(getByTestId("image-viewer-image-pressable"), "onLongPress");
    });
    await flushAsyncChain();

    // Fire second long press — should be blocked by isSavingRef guard
    await act(async () => {
      fireEvent(getByTestId("image-viewer-image-pressable"), "onLongPress");
    });
    await flushAsyncChain();

    expect(mockDownloadAsync).toHaveBeenCalledTimes(1);

    // Resolve the pending download and flush the shareAsync call
    await act(async () => {
      resolveDownload?.({ uri: "file://cache/image-1.jpg" });
    });
    await flushAsyncChain();

    expect(mockShareAsync).toHaveBeenCalledTimes(1);
  });
});

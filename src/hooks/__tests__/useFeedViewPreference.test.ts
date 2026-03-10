/**
 * useFeedViewPreference Hook Tests
 * Tests for persisting feed view preference (grid/list)
 * TDD approach: Tests written first to define desired behavior
 */

import { renderHook, waitFor, act } from "@testing-library/react-native";
import { useFeedViewPreference } from "../useFeedViewPreference";
import { storageService } from "@lib/storage";
import { useAuth } from "@contexts/AuthContext";
import { STORAGE_KEYS } from "@lib/constants";

// Mock dependencies
jest.mock("@lib/storage");
jest.mock("@contexts/AuthContext");

describe("useFeedViewPreference", () => {
  const mockInstanceId = "https://mastodon.social@user123";

  beforeEach(() => {
    jest.clearAllMocks();

    (useAuth as jest.Mock).mockReturnValue({
      instance: {
        id: mockInstanceId,
        url: "https://mastodon.social",
      },
    });

    // Mock storage service
    (storageService.getPreference as jest.Mock) = jest.fn();
    (storageService.setPreference as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    // Clear any pending mocks
    jest.clearAllTimers();
  });

  describe("default view", () => {
    it("should default to grid view when no preference is stored", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });

      expect(storageService.getPreference).toHaveBeenCalledWith(
        mockInstanceId,
        STORAGE_KEYS.GRID_VIEW_PREFERENCE,
      );
    });

    it("should default to grid view when preference is undefined", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });
    });
  });

  describe("loading saved preference", () => {
    it("should load grid view preference from storage", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });

      expect(storageService.getPreference).toHaveBeenCalledWith(
        mockInstanceId,
        STORAGE_KEYS.GRID_VIEW_PREFERENCE,
      );
    });

    it("should load list view preference from storage", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(false);
      });
    });
  });

  describe("persisting preference", () => {
    it("should persist grid view preference when toggled to grid", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(false);
      });

      await act(async () => {
        await result.current.setIsGridView(true);
      });

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });

      // Wait for storage operation to complete
      await waitFor(() => {
        expect(storageService.setPreference).toHaveBeenCalledWith(
          mockInstanceId,
          STORAGE_KEYS.GRID_VIEW_PREFERENCE,
          true,
        );
      });
    });

    it("should persist list view preference when toggled to list", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });

      await act(async () => {
        await result.current.setIsGridView(false);
      });

      await waitFor(() => {
        expect(result.current.isGridView).toBe(false);
      });

      // Wait for storage operation to complete
      await waitFor(() => {
        expect(storageService.setPreference).toHaveBeenCalledWith(
          mockInstanceId,
          STORAGE_KEYS.GRID_VIEW_PREFERENCE,
          false,
        );
      });
    });

    it("should persist preference when view changes multiple times", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });

      // Toggle to list
      await act(async () => {
        await result.current.setIsGridView(false);
      });

      // Toggle back to grid
      await act(async () => {
        await result.current.setIsGridView(true);
      });

      // Wait for all storage operations to complete
      await waitFor(() => {
        expect(storageService.setPreference).toHaveBeenCalledTimes(2);
      });
      expect(storageService.setPreference).toHaveBeenNthCalledWith(
        1,
        mockInstanceId,
        STORAGE_KEYS.GRID_VIEW_PREFERENCE,
        false,
      );
      expect(storageService.setPreference).toHaveBeenNthCalledWith(
        2,
        mockInstanceId,
        STORAGE_KEYS.GRID_VIEW_PREFERENCE,
        true,
      );
    });
  });

  describe("preference persistence across navigation", () => {
    it("should maintain grid view when navigating between feeds", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(true);

      const { result, rerender } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });

      // Simulate navigation to different feed
      rerender();

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });

      // Should still be grid view
      expect(result.current.isGridView).toBe(true);
    });

    it("should maintain list view when navigating between feeds", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(false);

      const { result, rerender } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(false);
      });

      // Simulate navigation to different feed
      rerender();

      await waitFor(() => {
        expect(result.current.isGridView).toBe(false);
      });

      // Should still be list view
      expect(result.current.isGridView).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should default to grid view when storage read fails", async () => {
      (storageService.getPreference as jest.Mock).mockRejectedValue(
        new Error("Storage error"),
      );

      const { result } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });
    });

    it("should still update state when storage write fails", async () => {
      (storageService.getPreference as jest.Mock).mockResolvedValue(false);
      (storageService.setPreference as jest.Mock).mockRejectedValue(
        new Error("Storage error"),
      );

      const { result } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(false);
      });

      await act(async () => {
        await result.current.setIsGridView(true);
      });

      // State should still update even if storage fails
      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });
    });
  });

  describe("instance switching", () => {
    it("should load preference for new instance when instance changes", async () => {
      const firstInstanceId = "https://mastodon.social@user123";
      const secondInstanceId = "https://other.instance@user456";

      (useAuth as jest.Mock).mockReturnValue({
        instance: {
          id: firstInstanceId,
          url: "https://mastodon.social",
        },
      });

      (storageService.getPreference as jest.Mock).mockResolvedValue(true);

      const { result, rerender } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(true);
      });

      // Switch instance
      (useAuth as jest.Mock).mockReturnValue({
        instance: {
          id: secondInstanceId,
          url: "https://other.instance",
        },
      });

      (storageService.getPreference as jest.Mock).mockResolvedValue(false);

      rerender();

      await waitFor(() => {
        expect(result.current.isGridView).toBe(false);
      });

      expect(storageService.getPreference).toHaveBeenCalledWith(
        secondInstanceId,
        STORAGE_KEYS.GRID_VIEW_PREFERENCE,
      );
    });

    it("should reset to default grid view immediately when instance changes", async () => {
      const firstInstanceId = "https://mastodon.social@user123";
      const secondInstanceId = "https://other.instance@user456";

      (useAuth as jest.Mock).mockReturnValue({
        instance: {
          id: firstInstanceId,
          url: "https://mastodon.social",
        },
      });

      (storageService.getPreference as jest.Mock).mockResolvedValue(false);

      const { result, rerender } = renderHook(() => useFeedViewPreference());

      await waitFor(() => {
        expect(result.current.isGridView).toBe(false);
      });

      // Switch instance - should immediately reset to default (true) before loading
      (useAuth as jest.Mock).mockReturnValue({
        instance: {
          id: secondInstanceId,
          url: "https://other.instance",
        },
      });

      // Simulate slow storage read (using a more robust delay for test stability)
      const STORAGE_DELAY_MS = 200;
      (storageService.getPreference as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(false), STORAGE_DELAY_MS),
          ),
      );

      rerender();

      // Should reset to default (true) immediately, not keep old value (false)
      // This prevents showing the wrong view during the loading period
      expect(result.current.isGridView).toBe(true);
      expect(result.current.isLoading).toBe(true);

      // After loading completes, should have the new instance's preference
      await waitFor(() => {
        expect(result.current.isGridView).toBe(false);
      });

      expect(storageService.getPreference).toHaveBeenCalledWith(
        secondInstanceId,
        STORAGE_KEYS.GRID_VIEW_PREFERENCE,
      );
    });
  });
});

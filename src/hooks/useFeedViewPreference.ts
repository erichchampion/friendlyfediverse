import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@contexts/AuthContext";
import { storageService } from "@lib/storage";
import { STORAGE_KEYS } from "@lib/constants";

/**
 * Hook to manage feed view preference (grid/list)
 * Persists the preference across navigation and feed changes
 * Defaults to grid view
 */
export function useFeedViewPreference() {
  const { instance } = useAuth();
  const [isGridView, setIsGridViewState] = useState<boolean>(true); // Default to grid view
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load preference from storage on mount and when instance changes
  useEffect(() => {
    if (!instance?.id) {
      setIsLoading(false);
      return;
    }

    // Reset to default grid view immediately when instance changes
    // This prevents showing the wrong view during the loading period
    setIsGridViewState(true);
    setIsLoading(true);

    let isMounted = true;

    const loadPreference = async () => {
      try {
        const savedPreference = await storageService.getPreference(
          instance.id,
          STORAGE_KEYS.GRID_VIEW_PREFERENCE,
        );

        // Only update state if component is still mounted
        if (isMounted) {
          // Default to grid view (true) if no preference is stored
          setIsGridViewState(savedPreference ?? true);
          setIsLoading(false);
        }
      } catch (error) {
        // Only update state if component is still mounted
        if (isMounted) {
          console.error(
            "[useFeedViewPreference] Error loading preference:",
            error,
          );
          // Default to grid view on error
          setIsGridViewState(true);
          setIsLoading(false);
        }
      }
    };

    loadPreference();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [instance?.id]);

  // Wrapper to persist preference when view changes
  const setIsGridView = useCallback(
    async (value: boolean) => {
      setIsGridViewState(value);

      if (!instance?.id) {
        return;
      }

      try {
        await storageService.setPreference(
          instance.id,
          STORAGE_KEYS.GRID_VIEW_PREFERENCE,
          value,
        );
      } catch (error) {
        console.error(
          "[useFeedViewPreference] Error saving preference:",
          error,
        );
        // State is already updated, so we continue even if storage fails
      }
    },
    [instance?.id],
  );

  return {
    isGridView,
    setIsGridView,
    isLoading,
  };
}

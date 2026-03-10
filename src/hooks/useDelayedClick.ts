/**
 * useDelayedClick Hook
 * Handles delayed single-click actions and double-click detection
 *
 * This hook delays single-click actions to allow double-click detection.
 * If a second click occurs within the double-click window, the single-click
 * action is cancelled and the double-click action is executed instead.
 */

import { useCallback, useEffect, useRef } from "react";

type ClickKey = string | number;
type ClickHandlers = {
  onSingleClick: () => void;
  onDoubleClick: () => void;
};

interface UseDelayedClickOptions {
  /**
   * Callback to execute on single-click (after delay)
   */
  onSingleClick: () => void;
  /**
   * Callback to execute on double-click
   */
  onDoubleClick: () => void;
  /**
   * Delay in milliseconds before executing single-click action
   * Should be slightly longer than DOUBLE_CLICK_DELAY to allow detection
   */
  singleClickDelay?: number;
  /**
   * Maximum time between clicks to be considered a double-click (in ms)
   */
  doubleClickDelay?: number;
}

/**
 * Hook to handle delayed single-click and double-click detection
 *
 * Works with both real timers and Jest fake timers by using setTimeout
 * to track time differences instead of Date.now()
 *
 * @example
 * const handleClick = useDelayedClick({
 *   onSingleClick: () => openMedia(),
 *   onDoubleClick: () => toggleFavorite(),
 * });
 *
 * <TouchableOpacity onPress={handleClick} />
 */
export function useDelayedClick({
  onSingleClick,
  onDoubleClick,
  singleClickDelay = 350, // Slightly longer than double-click delay
  doubleClickDelay = 300,
}: UseDelayedClickOptions) {
  // Track timers per click key so different items don't interfere with each other
  const clickStateRef = useRef<
    Map<
      ClickKey,
      {
        hasRecentClick: boolean;
        singleClickTimeout: NodeJS.Timeout | null;
        doubleClickWindowTimeout: NodeJS.Timeout | null;
        handlers: ClickHandlers;
      }
    >
  >(new Map());

  // Ensure timers are cleared on unmount to avoid stray callbacks after component cleanup
  useEffect(() => {
    return () => {
      clickStateRef.current.forEach((state) => {
        if (state.singleClickTimeout) {
          clearTimeout(state.singleClickTimeout);
        }
        if (state.doubleClickWindowTimeout) {
          clearTimeout(state.doubleClickWindowTimeout);
        }
      });
      clickStateRef.current.clear();
    };
  }, []);

  const handleClick = useCallback<
    (clickKey?: ClickKey, handlerOverrides?: Partial<ClickHandlers>) => boolean
  >(
    (
      clickKey: ClickKey = "default",
      handlerOverrides?: Partial<ClickHandlers>,
    ) => {
      const state = clickStateRef.current.get(clickKey) ?? {
        hasRecentClick: false,
        singleClickTimeout: null,
        doubleClickWindowTimeout: null,
        handlers: { onSingleClick, onDoubleClick },
      };

      // Always refresh handlers for this key so the latest closures are used
      state.handlers = {
        onSingleClick: handlerOverrides?.onSingleClick ?? onSingleClick,
        onDoubleClick: handlerOverrides?.onDoubleClick ?? onDoubleClick,
      };

      // If we already have a recent click for this key, treat this as the second click
      if (state.hasRecentClick) {
        if (state.doubleClickWindowTimeout) {
          clearTimeout(state.doubleClickWindowTimeout);
          state.doubleClickWindowTimeout = null;
        }

        state.hasRecentClick = false;
        clickStateRef.current.set(clickKey, state);
        state.handlers.onDoubleClick();
        return true;
      }

      // First click for this key - set flag and start detection window
      state.hasRecentClick = true;

      // Set a timeout to detect if this is a single-click (no second click)
      state.doubleClickWindowTimeout = setTimeout(() => {
        state.doubleClickWindowTimeout = null;

        // If flag is still set, no second click came, so execute single-click
        if (state.hasRecentClick) {
          state.hasRecentClick = false;
          state.singleClickTimeout = setTimeout(() => {
            state.singleClickTimeout = null;
            state.handlers.onSingleClick();
          }, singleClickDelay - doubleClickDelay);
        }
      }, doubleClickDelay);

      clickStateRef.current.set(clickKey, state);
      return false;
    },
    [onSingleClick, onDoubleClick, singleClickDelay, doubleClickDelay],
  );

  return handleClick;
}

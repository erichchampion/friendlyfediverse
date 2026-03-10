import { useState, useCallback, useEffect, useRef } from "react";
import { Image, ImageProps } from "expo-image";

export interface RetryableImageProps extends ImageProps {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay in milliseconds before the first retry */
  baseRetryDelayMs?: number;
}

/**
 * A wrapper around expo-image that automatically retries loading
 * the image if it fails (e.g., due to rate limits or network issues).
 */
export function RetryableImage({
  maxRetries = 3,
  baseRetryDelayMs = 2000,
  onError,
  source,
  ...props
}: RetryableImageProps) {
  const [retryCount, setRetryCount] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Reset retry count if source changes
  useEffect(() => {
    setRetryCount(0);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [source]);

  const handleError = useCallback(
    (event: any) => {
      // Call the original onError prop if provided
      if (onError) {
        onError(event);
      }

      // If we haven't reached the max retries, schedule another attempt
      if (retryCount < maxRetries) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        // Exponential backoff
        const delay = baseRetryDelayMs * Math.pow(1.5, retryCount);

        timeoutRef.current = setTimeout(() => {
          setRetryCount((prev) => prev + 1);
        }, delay);
      }
    },
    [retryCount, maxRetries, baseRetryDelayMs, onError]
  );

  return (
    <Image
      {...props}
      source={source}
      key={`retryable-image-${retryCount}`}
      onError={handleError}
    />
  );
}

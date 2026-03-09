import {
  REQUEST_QUEUE_CONFIG,
  REQUEST_CACHE_CONFIG,
} from "@lib/storage/constants";

/**
 * Request Queue Manager
 * Handles request throttling, batching, and rate limiting
 * Prevents 429 (Too Many Requests) errors by controlling request flow
 * Phase: Performance Optimization
 */

export enum RequestPriority {
  HIGH = 0, // User-initiated actions (like, boost, etc.)
  NORMAL = 1, // Timeline refresh
  LOW = 2, // Background prefetch
}

interface QueuedRequest<T> {
  id: string;
  fn: () => Promise<T>;
  priority: RequestPriority;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  retries: number;
  timestamp: number;
}

export class RequestQueue {
  private queue: QueuedRequest<any>[] = [];
  private activeRequests = 0;
  private lastRequestTime = 0;
  private isRateLimited = false;
  private rateLimitUntil = 0;
  private requestCache = new Map<string, Promise<any>>();
  private activeTimers = new Set<ReturnType<typeof setTimeout>>();

  private readonly maxConcurrent = REQUEST_QUEUE_CONFIG.MAX_CONCURRENT_REQUESTS;
  private readonly requestDelay = REQUEST_QUEUE_CONFIG.REQUEST_DELAY;
  private readonly rateLimitDelay = REQUEST_QUEUE_CONFIG.RATE_LIMIT_DELAY;
  private readonly maxRetries = REQUEST_QUEUE_CONFIG.MAX_RETRIES;
  private readonly retryBackoff = REQUEST_QUEUE_CONFIG.RETRY_BACKOFF;

  /**
   * Track and return a timer ID
   */
  private createTimer(
    callback: () => void,
    delay: number,
  ): ReturnType<typeof setTimeout> {
    const timerId = setTimeout(() => {
      this.activeTimers.delete(timerId);
      callback();
    }, delay);
    this.activeTimers.add(timerId);
    // Use .unref() to prevent timers from keeping the process alive
    // This is especially important in test environments
    if (typeof timerId === "object" && timerId !== null && "unref" in timerId) {
      (timerId as any).unref();
    }
    return timerId;
  }

  /**
   * Add request to queue
   */
  async enqueue<T>(
    fn: () => Promise<T>,
    priority: RequestPriority = RequestPriority.NORMAL,
    cacheKey?: string,
  ): Promise<T> {
    // Check cache first for read operations
    if (cacheKey && this.requestCache.has(cacheKey)) {
      return this.requestCache.get(cacheKey)!;
    }

    // Create promise that will be returned (and cached if cacheKey provided)
    let resolvePromise: (value: T) => void;
    let rejectPromise: (error: any) => void;

    const promise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    // Create queued request
    const id = `${Date.now()}_${Math.random()}`;

    const request: QueuedRequest<T> = {
      id,
      fn,
      priority,
      resolve: resolvePromise!,
      reject: rejectPromise!,
      retries: 0,
      timestamp: Date.now(),
    };

    // Insert in priority order
    const insertIndex = this.queue.findIndex((r) => r.priority > priority);
    if (insertIndex === -1) {
      this.queue.push(request);
    } else {
      this.queue.splice(insertIndex, 0, request);
    }

    // Cache the promise if cache key provided
    if (cacheKey) {
      this.requestCache.set(cacheKey, promise);

      // Clear cache after completion
      promise.finally(() => {
        this.createTimer(
          () => this.requestCache.delete(cacheKey),
          REQUEST_CACHE_CONFIG.CLEAR_DELAY,
        );
      });
    }

    // Process queue
    this.processQueue();

    return promise;
  }

  /**
   * Process requests in queue
   */
  private async processQueue(): Promise<void> {
    // Check if we can process more requests
    if (this.activeRequests >= this.maxConcurrent) {
      return;
    }

    // Check rate limiting
    if (this.isRateLimited && Date.now() < this.rateLimitUntil) {
      const delay = this.rateLimitUntil - Date.now();
      console.warn(`[RequestQueue] Rate limited, waiting ${delay}ms`);
      this.createTimer(() => {
        this.isRateLimited = false;
        this.processQueue();
      }, delay);
      return;
    }

    // Check request delay
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.requestDelay) {
      this.createTimer(
        () => this.processQueue(),
        this.requestDelay - timeSinceLastRequest,
      );
      return;
    }

    // Get next request from queue
    const request = this.queue.shift();
    if (!request) {
      return;
    }

    this.activeRequests++;
    this.lastRequestTime = Date.now();

    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error: any) {
      await this.handleRequestError(request, error);
    } finally {
      this.activeRequests--;
      // Process next request
      this.processQueue();
    }
  }

  /**
   * Handle request errors with retry logic
   */
  private async handleRequestError(
    request: QueuedRequest<any>,
    error: any,
  ): Promise<void> {
    const status = this.getStatusCode(error);

    // Check if it's a rate limit error
    if (status === 429 || error?.message?.includes("Too many requests")) {
      console.warn("[RequestQueue] Rate limit detected (429)");
      this.isRateLimited = true;
      this.rateLimitUntil = Date.now() + this.rateLimitDelay;

      // Retry this request after rate limit delay
      if (request.retries < this.maxRetries) {
        request.retries++;
        this.queue.unshift(request); // Put back at front of queue
        return;
      }
    }

    // Check if we should retry
    if (request.retries < this.maxRetries && this.shouldRetry(error, status)) {
      request.retries++;
      const delay = this.retryBackoff * Math.pow(2, request.retries - 1);

      console.warn(
        `[RequestQueue] Retrying request (attempt ${request.retries}/${this.maxRetries}) after ${delay}ms`,
      );

      this.createTimer(() => {
        this.queue.unshift(request); // Put back at front of queue
        this.processQueue();
      }, delay);

      return;
    }

    // Max retries exceeded or non-retryable error
    request.reject(error);
  }

  /**
   * Check if error is retryable
   */
  private shouldRetry(error: any, status?: number): boolean {
    const message = error?.message || "";
    const code = status ?? this.getStatusCode(error);

    // Don't retry auth errors
    if (
      code === 401 ||
      code === 403 ||
      message.includes("401") ||
      message.includes("403")
    ) {
      return false;
    }

    // Don't retry client errors (except 429)
    if (
      code === 400 ||
      code === 404 ||
      message.includes("400") ||
      message.includes("404")
    ) {
      return false;
    }

    // Retry network errors and server errors
    return true;
  }

  /**
   * Extract HTTP status code from masto / fetch style errors
   */
  private getStatusCode(error: any): number | undefined {
    return (
      error?.response?.status ??
      error?.status ??
      (typeof error?.message === "string"
        ? Number.parseInt(error.message.match(/\b(\d{3})\b/)?.[1] || "")
        : undefined)
    );
  }

  /**
   * Batch multiple requests together
   */
  async batch<T>(
    requests: (() => Promise<T>)[],
    priority: RequestPriority = RequestPriority.NORMAL,
  ): Promise<T[]> {
    return Promise.all(requests.map((fn) => this.enqueue(fn, priority)));
  }

  /**
   * Clear the queue
   */
  clear(): void {
    for (const request of this.queue) {
      request.reject(new Error("Queue cleared"));
    }
    this.queue = [];
    this.requestCache.clear();
    this.cleanup();
  }

  /**
   * Clean up all active timers
   * Useful for test teardown to prevent leaks
   */
  cleanup(): void {
    for (const timerId of this.activeTimers) {
      clearTimeout(timerId);
    }
    this.activeTimers.clear();
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueLength: number;
    activeRequests: number;
    isRateLimited: boolean;
    cacheSize: number;
  } {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      isRateLimited: this.isRateLimited,
      cacheSize: this.requestCache.size,
    };
  }

  /**
   * Wait for all active requests to complete
   */
  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.activeRequests > 0) {
      await new Promise((resolve) => {
        const timerId = setTimeout(() => {
          this.activeTimers.delete(timerId);
          resolve(undefined);
        }, REQUEST_CACHE_CONFIG.DRAIN_CHECK_INTERVAL);
        this.activeTimers.add(timerId);
      });
    }
  }

  /**
   * Set rate limit state (for testing or manual control)
   */
  setRateLimit(until: number): void {
    this.isRateLimited = true;
    this.rateLimitUntil = until;
  }

  /**
   * Clear rate limit
   */
  clearRateLimit(): void {
    this.isRateLimited = false;
    this.rateLimitUntil = 0;
  }
}

// Export singleton instance
export const requestQueue = new RequestQueue();

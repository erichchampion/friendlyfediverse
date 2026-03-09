/**
 * Relationship Batcher
 * Batches multiple relationship requests into single API calls
 * Prevents cascading API calls when rendering multiple posts
 *
 * Inspired by the web app's relationship cache pattern
 */

import type { mastodon } from "masto";
import type { createRestAPIClient } from "masto";
import { withRetry, RequestPriority } from "./client";
import {
  CACHE_EXPIRATION,
  RELATIONSHIP_BATCHER_CONFIG,
} from "@lib/storage/constants";

interface RelationshipData {
  following: boolean;
  followedBy: boolean;
  blocking: boolean;
  muting: boolean;
  requested: boolean;
}

interface CachedRelationship {
  data: RelationshipData;
  timestamp: number;
}

interface PendingResolver {
  resolve: (value: RelationshipData) => void;
  reject: (error: any) => void;
}

/**
 * Relationship Batcher
 * Collects relationship requests and batches them into single API calls
 */
class RelationshipBatcher {
  private cache: Map<string, CachedRelationship> = new Map();
  private pendingRequests: Map<string, Promise<RelationshipData>> = new Map();
  private pendingResolvers: Map<string, PendingResolver[]> = new Map();
  private batchQueue: string[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly CACHE_TTL = CACHE_EXPIRATION.RELATIONSHIPS;
  private readonly BATCH_SIZE = RELATIONSHIP_BATCHER_CONFIG.BATCH_SIZE;
  private readonly BATCH_DELAY = RELATIONSHIP_BATCHER_CONFIG.BATCH_DELAY;
  private readonly MAX_BATCH_INTERVAL =
    RELATIONSHIP_BATCHER_CONFIG.MAX_BATCH_INTERVAL;

  private lastBatchTime = 0;

  /**
   * Create and track a timer
   */
  private createTimer(
    callback: () => void,
    delay: number,
  ): ReturnType<typeof setTimeout> {
    const timerId = setTimeout(callback, delay);
    // Use .unref() to prevent timers from keeping the process alive
    // This is especially important in test environments
    if (typeof timerId === "object" && timerId !== null && "unref" in timerId) {
      (timerId as any).unref();
    }
    return timerId;
  }

  /**
   * Clear the current batch timeout
   */
  private clearBatchTimeout(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  /**
   * Get relationship for a single account
   * Batches requests automatically
   */
  async getRelationship(
    client: ReturnType<typeof createRestAPIClient>,
    accountId: string,
  ): Promise<RelationshipData> {
    // Check cache first
    const cached = this.cache.get(accountId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    // Check if there's already a pending request for this account
    const pending = this.pendingRequests.get(accountId);
    if (pending) {
      return pending;
    }

    // Create a promise for this request
    const promise = new Promise<RelationshipData>((resolve, reject) => {
      // Add to batch queue
      if (!this.batchQueue.includes(accountId)) {
        this.batchQueue.push(accountId);
      }

      // Store the resolver
      const resolvers = this.pendingResolvers.get(accountId) || [];
      resolvers.push({ resolve, reject });
      this.pendingResolvers.set(accountId, resolvers);

      // Clear existing timeout
      this.clearBatchTimeout();

      // Set new timeout to process batch
      this.batchTimeout = this.createTimer(() => {
        this.batchTimeout = null;
        this.processBatch(client).catch((err) => {
          console.error("[RelationshipBatcher] Error processing batch:", err);
        });
      }, this.BATCH_DELAY);
    });

    this.pendingRequests.set(accountId, promise);
    return promise;
  }

  /**
   * Process the current batch of relationship requests
   */
  private async processBatch(
    client: ReturnType<typeof createRestAPIClient>,
  ): Promise<void> {
    if (this.batchQueue.length === 0) {
      return;
    }

    // Apply throttling to prevent excessive batch operations
    const now = Date.now();
    if (now - this.lastBatchTime < this.MAX_BATCH_INTERVAL) {
      // Reschedule for later
      this.clearBatchTimeout();
      this.batchTimeout = this.createTimer(
        () => {
          this.batchTimeout = null;
          this.processBatch(client).catch((err) => {
            console.error("[RelationshipBatcher] Error processing batch:", err);
          });
        },
        this.MAX_BATCH_INTERVAL - (now - this.lastBatchTime),
      );
      return;
    }

    // Get batch (up to BATCH_SIZE accounts)
    const batch = this.batchQueue.splice(0, this.BATCH_SIZE);
    console.log(
      `[RelationshipBatcher] Processing batch of ${batch.length} account(s)`,
    );

    this.lastBatchTime = now;

    try {
      // Fetch relationships using request queue
      const relationships = await withRetry(
        () => client.v1.accounts.relationships.fetch({ id: batch }),
        RequestPriority.NORMAL,
        `relationships_batch_${batch.join(",")}`,
      );

      // Process results
      const relationshipMap = new Map<string, mastodon.v1.Relationship>();
      for (const rel of relationships) {
        relationshipMap.set(rel.id, rel);
      }

      // Resolve all pending promises
      for (const accountId of batch) {
        const relationship = relationshipMap.get(accountId);
        const resolvers = this.pendingResolvers.get(accountId) || [];

        if (relationship) {
          const data: RelationshipData = {
            following: relationship.following || false,
            followedBy: relationship.followedBy || false,
            blocking: relationship.blocking || false,
            muting: relationship.muting || false,
            requested: relationship.requested || false,
          };

          // Cache the result
          this.cache.set(accountId, {
            data,
            timestamp: now,
          });

          // Resolve all waiting promises
          for (const { resolve } of resolvers) {
            resolve(data);
          }
        } else {
          // Account not found in response, resolve with defaults
          const data: RelationshipData = {
            following: false,
            followedBy: false,
            blocking: false,
            muting: false,
            requested: false,
          };

          this.cache.set(accountId, {
            data,
            timestamp: now,
          });

          for (const { resolve } of resolvers) {
            resolve(data);
          }
        }

        // Clean up
        this.pendingRequests.delete(accountId);
        this.pendingResolvers.delete(accountId);
      }
    } catch (error) {
      console.error(
        "[RelationshipBatcher] Error fetching relationships:",
        error,
      );

      // Reject all pending promises
      for (const accountId of batch) {
        const resolvers = this.pendingResolvers.get(accountId) || [];

        for (const { reject } of resolvers) {
          reject(error);
        }

        this.pendingRequests.delete(accountId);
        this.pendingResolvers.delete(accountId);
      }
    }

    // If there are more items in queue, process them
    if (this.batchQueue.length > 0) {
      this.clearBatchTimeout();
      this.batchTimeout = this.createTimer(() => {
        this.batchTimeout = null;
        this.processBatch(client).catch((err) => {
          console.error("[RelationshipBatcher] Error processing batch:", err);
        });
      }, this.BATCH_DELAY);
    }
  }

  /**
   * Update cached relationship (e.g., after follow/unfollow)
   */
  updateCache(accountId: string, update: Partial<RelationshipData>): void {
    const cached = this.cache.get(accountId);
    if (cached) {
      this.cache.set(accountId, {
        data: { ...cached.data, ...update },
        timestamp: Date.now(),
      });
    } else {
      this.cache.set(accountId, {
        data: {
          following: false,
          followedBy: false,
          blocking: false,
          muting: false,
          requested: false,
          ...update,
        },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Clear cache for a specific account or all accounts
   */
  clearCache(accountId?: string): void {
    if (accountId) {
      this.cache.delete(accountId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      queueLength: this.batchQueue.length,
    };
  }

  /**
   * Clean up all active timers
   * Useful for test teardown to prevent leaks
   */
  cleanup(): void {
    this.clearBatchTimeout();
    // Clear any pending operations
    this.batchQueue = [];
    this.pendingRequests.clear();
    this.pendingResolvers.clear();
  }
}

// Export singleton instance
export const relationshipBatcher = new RelationshipBatcher();

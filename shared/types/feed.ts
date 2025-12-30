/**
 * Feed/Timeline type definitions
 * Shared between web and React Native apps
 */

import type { Post } from './post';

export interface FeedType {
  type: 'home' | 'local' | 'public' | 'list' | 'hashtag' | 'profile';
  id?: string; // For list ID, hashtag name, or profile ID
}

export interface TimelineOptions {
  maxId?: string; // For pagination (older posts)
  minId?: string; // For fetching newer posts
  sinceId?: string; // For checking new posts
  limit?: number; // Number of posts to fetch (default 20, max 40)
  local?: boolean; // For public timeline
}

export interface ViewportPosition {
  firstVisibleIndex: number;
  lastVisibleIndex: number;
}

export interface FeedState {
  posts: Post[];
  pendingNewPosts: Post[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  anchorPostId: string | null;
  viewportPosition?: ViewportPosition;
}

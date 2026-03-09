/**
 * Timeline and Feed Types
 * Shared between web and React Native apps
 */

export interface TimelineOption {
  id: string;
  name: string;
  type:
    | "home"
    | "public"
    | "local"
    | "list"
    | "hashtag"
    | "account"
    | "favourites"
    | "bookmarks";
  description?: string;
}

export interface ListTimeline {
  id: string;
  title: string;
  repliesPolicy: string;
}

export interface TrendingHashtag {
  name: string;
  url: string;
  history: Array<{
    day: string;
    uses: string;
    accounts: string;
  }>;
}

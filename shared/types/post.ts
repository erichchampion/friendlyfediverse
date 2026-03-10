/**
 * Post/Status type definitions
 * Shared between web and React Native apps
 */

import type { User, CustomEmoji } from "./user";
import type { MediaAttachment } from "./media";

export interface Post {
  id: string;
  uri: string;
  createdAt: string;
  account: User;
  content: string;
  visibility: PostVisibility;
  sensitive: boolean;
  spoilerText: string;
  mediaAttachments: MediaAttachment[];
  mentions: Mention[];
  tags: Tag[];
  emojis: CustomEmoji[];
  reblogsCount: number;
  favouritesCount: number;
  repliesCount: number;
  url?: string;
  inReplyToId?: string | null;
  inReplyToAccountId?: string | null;
  reblog?: Post | null; // Boost/reblog
  poll?: Poll | null;
  card?: Card | null;
  language?: string | null;
  text?: string | null; // Plain text version
  favourited?: boolean;
  reblogged?: boolean;
  muted?: boolean;
  bookmarked?: boolean;
  pinned?: boolean;
}

export type PostVisibility = "public" | "unlisted" | "private" | "direct";

export interface Mention {
  id: string;
  username: string;
  url: string;
  acct: string;
}

export interface Tag {
  name: string;
  url: string;
}

export interface Poll {
  id: string;
  expiresAt: string | null;
  expired: boolean;
  multiple: boolean;
  votesCount: number;
  votersCount: number | null;
  voted?: boolean;
  ownVotes?: number[];
  options: PollOption[];
  emojis: CustomEmoji[];
}

export interface PollOption {
  title: string;
  votesCount: number | null;
}

export interface Card {
  url: string;
  title: string;
  description: string;
  type: "link" | "photo" | "video" | "rich";
  authorName?: string;
  authorUrl?: string;
  providerName?: string;
  providerUrl?: string;
  html?: string;
  width?: number;
  height?: number;
  image?: string;
  embedUrl?: string;
  blurhash?: string;
}

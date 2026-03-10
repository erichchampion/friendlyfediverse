/**
 * Instance/Server type definitions
 * Shared between web and React Native apps
 */

export interface Instance {
  id: string; // Format: "${url}@${accountId}" for multi-account support
  url: string; // Server URL (e.g., "https://mastodon.social")
  accountId: string; // Mastodon account ID (e.g., "109382926501")
  username: string; // Username for display (e.g., "alice")
  displayName: string;
  domain: string;
  createdAt: number;
  lastAccessed: number;
  isActive: boolean;
  settings?: InstanceSettings;
}

export interface InstanceSettings {
  defaultFeedType?: "home" | "local" | "public";
  autoRefresh?: boolean;
  cacheRetention?: number; // hours
}

export interface InstanceInfo {
  uri: string;
  title: string;
  shortDescription: string;
  description: string;
  email: string;
  version: string;
  languages: string[];
  registrations: boolean;
  approvalRequired: boolean;
  invitesEnabled: boolean;
  thumbnail?: string;
  stats?: InstanceStats;
  contactAccount?: {
    id: string;
    username: string;
    acct: string;
    displayName: string;
  };
}

export interface InstanceStats {
  userCount: number;
  statusCount: number;
  domainCount: number;
}

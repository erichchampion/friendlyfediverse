/**
 * Authentication type definitions
 * Shared between web and React Native apps
 */

export interface AuthData {
  instanceUrl: string;
  accountId: string; // Mastodon account ID to associate auth with specific account
  username: string; // Username for identification
  clientId: string;
  clientSecret: string;
  accessToken: string;
  tokenExpiry?: number;
  scopes: string[];
  refreshToken?: string;
}

export interface AppRegistration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  instanceUrl: string;
}

export interface OAuthToken {
  accessToken: string;
  tokenType: string;
  scope: string;
  createdAt: number;
  expiresIn?: number;
  refreshToken?: string;
}

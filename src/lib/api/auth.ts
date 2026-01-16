import { createRestAPIClient } from "masto";
import * as AuthSession from "expo-auth-session";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { storageService } from "@lib/storage";
import type { AuthData } from "@types";
import { APP_CONFIG } from "@config/index";

/**
 * OAuth Authentication Module
 * Phase 1.2: OAuth implementation
 * Updated to use redirect flow instead of popup for better mobile support
 */

/**
 * Pending OAuth state stored before redirect
 */
export interface PendingOAuthState {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  forceLogin: boolean;
  timestamp: number;
}

// Storage key for pending OAuth state
const PENDING_OAUTH_KEY = "pending_oauth_state";

interface AppRegistration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Normalize instance URL
 */
export function normalizeInstanceUrl(url: string): string {
  let normalized = url.trim().toLowerCase();

  // Remove protocol if present
  normalized = normalized.replace(/^https?:\/\//, "");

  // Remove trailing slash
  normalized = normalized.replace(/\/$/, "");

  // Add https protocol
  return `https://${normalized}`;
}

/**
 * Get redirect URI for OAuth
 */
export function getRedirectUri(): string {
  // Use AuthSession.makeRedirectUri for Expo SDK 51+
  // This creates a proper redirect URI based on the app's scheme
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "friendlyfediverse.com",
    path: "oauth-callback",
  });

  console.info("Generated redirect URI:", redirectUri);
  return redirectUri;
}

/**
 * Register app with Mastodon instance
 */
export async function registerApp(
  instanceUrl: string,
): Promise<AppRegistration> {
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);
  const redirectUri = getRedirectUri();

  try {
    const client = createRestAPIClient({
      url: normalizedUrl,
    });

    const app = await client.v1.apps.create({
      clientName: APP_CONFIG.APP_NAME,
      redirectUris: redirectUri,
      scopes: "read write follow push",
      website: "https://friendlyfediverse.com",
    });

    if (!app.clientId || !app.clientSecret) {
      throw new Error("App registration failed: missing credentials");
    }

    return {
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      redirectUri,
    };
  } catch (error) {
    console.error("Error registering app:", error);
    throw new Error(
      `Failed to register app with ${normalizedUrl}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Save pending OAuth state before redirect
 */
export async function savePendingOAuthState(
  state: PendingOAuthState,
): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // On web, use sessionStorage to persist across page reload
      sessionStorage.setItem(PENDING_OAUTH_KEY, JSON.stringify(state));
    } else {
      // On native, use AsyncStorage via storageService
      await storageService.setPreference("oauth", "pending_state", state);
    }
    console.info("Saved pending OAuth state for:", state.instanceUrl);
  } catch (error) {
    console.error("Error saving pending OAuth state:", error);
    throw error;
  }
}

/**
 * Get pending OAuth state after redirect
 */
export async function getPendingOAuthState(): Promise<PendingOAuthState | null> {
  try {
    let state: PendingOAuthState | null = null;

    if (Platform.OS === "web") {
      const json = sessionStorage.getItem(PENDING_OAUTH_KEY);
      state = json ? JSON.parse(json) : null;
    } else {
      state = await storageService.getPreference("oauth", "pending_state");
    }

    if (state) {
      // Check if state is expired (15 minutes)
      const MAX_AGE = 15 * 60 * 1000;
      if (Date.now() - state.timestamp > MAX_AGE) {
        console.info("Pending OAuth state expired");
        await clearPendingOAuthState();
        return null;
      }
    }

    return state;
  } catch (error) {
    console.error("Error getting pending OAuth state:", error);
    return null;
  }
}

/**
 * Clear pending OAuth state
 */
export async function clearPendingOAuthState(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      sessionStorage.removeItem(PENDING_OAUTH_KEY);
    } else {
      await storageService.deletePreference("oauth", "pending_state");
    }
    console.info("Cleared pending OAuth state");
  } catch (error) {
    console.error("Error clearing pending OAuth state:", error);
  }
}

/**
 * Start OAuth authorization flow using redirect (not popup)
 * This replaces the current window/opens external browser for better mobile support
 * @param forceLogin - If true, forces re-authentication even if already logged in
 */
export async function startOAuthFlow(
  instanceUrl: string,
  appRegistration: AppRegistration,
  forceLogin: boolean = false,
): Promise<void> {
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);

  // Build authorization URL parameters
  const params: Record<string, string> = {
    client_id: appRegistration.clientId,
    redirect_uri: appRegistration.redirectUri,
    response_type: "code",
    scope: "read write follow push",
  };

  // Force re-authentication for multi-account same-server support
  // max_age=0 forces the user to re-authenticate even if they have an active session
  if (forceLogin) {
    params.max_age = "0";
  }

  const authUrl = `${normalizedUrl}/oauth/authorize?${new URLSearchParams(params).toString()}`;

  console.info("Starting OAuth flow with redirect", { forceLogin, url: authUrl });

  // Save OAuth state before redirecting so we can complete the flow when we return
  await savePendingOAuthState({
    instanceUrl: normalizedUrl,
    clientId: appRegistration.clientId,
    clientSecret: appRegistration.clientSecret,
    redirectUri: appRegistration.redirectUri,
    forceLogin,
    timestamp: Date.now(),
  });

  // Redirect to authorization URL
  if (Platform.OS === "web") {
    // On web, replace current window location
    window.location.href = authUrl;
  } else {
    // On native, use Linking to open external browser
    const canOpen = await Linking.canOpenURL(authUrl);
    if (!canOpen) {
      await clearPendingOAuthState();
      throw new Error("Cannot open authorization URL");
    }
    await Linking.openURL(authUrl);
  }
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  instanceUrl: string,
  code: string,
  appRegistration: AppRegistration,
): Promise<string> {
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);

  try {
    // Use direct fetch instead of masto client to avoid encoding issues
    const response = await fetch(`${normalizedUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: appRegistration.clientId,
        client_secret: appRegistration.clientSecret,
        redirect_uri: appRegistration.redirectUri,
        grant_type: "authorization_code",
        code,
        scope: "read write follow push",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Token exchange failed:", response.status, errorText);
      throw new Error(
        `Token exchange failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    if (!data.access_token) {
      throw new Error("Token exchange failed: no access token received");
    }

    return data.access_token;
  } catch (error) {
    console.error("Error exchanging code for token:", error);
    throw new Error(
      `Failed to exchange code for token: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Validate access token
 */
export async function validateToken(
  instanceUrl: string,
  accessToken: string,
): Promise<boolean> {
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);

  try {
    const client = createRestAPIClient({
      url: normalizedUrl,
      accessToken,
    });

    // Try to verify credentials
    await client.v1.accounts.verifyCredentials();
    return true;
  } catch (error) {
    console.error("Token validation failed:", error);
    return false;
  }
}

/**
 * Initiate OAuth login process (redirect-based flow)
 * This starts the OAuth flow by redirecting the user to the authorization page.
 * The flow is completed via completeOAuthFromCallback when the user returns.
 * @param forceLogin - If true, forces re-authentication for multi-account support
 */
export async function initiateLogin(
  instanceUrl: string,
  forceLogin: boolean = false,
): Promise<void> {
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);

  try {
    // Step 1: Register app (or retrieve existing registration)
    console.info("Registering app with", normalizedUrl);
    const appRegistration = await registerApp(normalizedUrl);

    // Step 2: Start OAuth flow - this will redirect away from the app
    console.info("Starting OAuth flow with redirect", { forceLogin });
    await startOAuthFlow(normalizedUrl, appRegistration, forceLogin);

    // Note: Execution stops here as the user is redirected away
    // The flow continues in completeOAuthFromCallback when they return
  } catch (error) {
    console.error("Login initiation error:", error);
    throw error;
  }
}

/**
 * Complete OAuth flow from callback URL
 * Called when the user returns from the OAuth authorization page
 * @param callbackUrl - The full callback URL containing the authorization code
 * @returns AuthData if successful, null if no pending OAuth state
 */
export async function completeOAuthFromCallback(
  callbackUrl: string,
): Promise<AuthData | null> {
  try {
    // Get pending OAuth state
    const pendingState = await getPendingOAuthState();
    if (!pendingState) {
      console.info("No pending OAuth state found");
      return null;
    }

    // Extract authorization code from callback URL
    const url = new URL(callbackUrl);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      await clearPendingOAuthState();
      throw new Error(`OAuth authorization denied: ${error}`);
    }

    if (!code) {
      await clearPendingOAuthState();
      throw new Error("No authorization code received from OAuth callback");
    }

    console.info("Completing OAuth flow with authorization code");

    // Create app registration from pending state
    const appRegistration: AppRegistration = {
      clientId: pendingState.clientId,
      clientSecret: pendingState.clientSecret,
      redirectUri: pendingState.redirectUri,
    };

    // Exchange code for token
    console.info("Exchanging code for access token");
    const accessToken = await exchangeCodeForToken(
      pendingState.instanceUrl,
      code,
      appRegistration,
    );

    // Validate token and fetch account info
    console.info("Validating access token");
    const client = createRestAPIClient({
      url: pendingState.instanceUrl,
      accessToken,
    });

    const account = await client.v1.accounts.verifyCredentials();
    if (!account) {
      await clearPendingOAuthState();
      throw new Error("Token validation failed");
    }

    // Create auth data object with account info
    const authData: AuthData = {
      instanceUrl: pendingState.instanceUrl,
      accountId: account.id,
      username: account.username,
      clientId: appRegistration.clientId,
      clientSecret: appRegistration.clientSecret,
      accessToken,
      scopes: ["read", "write", "follow", "push"],
    };

    // Save to storage
    console.info("Saving auth data to storage");
    await storageService.saveAuthData(pendingState.instanceUrl, authData);

    // Clear pending state
    await clearPendingOAuthState();

    console.info("OAuth flow completed successfully");
    return authData;
  } catch (error) {
    console.error("OAuth completion error:", error);
    await clearPendingOAuthState();
    throw error;
  }
}

/**
 * Check if a URL is an OAuth callback
 */
export function isOAuthCallback(url: string): boolean {
  try {
    const redirectUri = getRedirectUri();
    return url.startsWith(redirectUri) || url.includes("oauth-callback");
  } catch {
    return false;
  }
}

/**
 * Legacy login function for backward compatibility
 * @deprecated Use initiateLogin and completeOAuthFromCallback instead
 */
export async function login(
  instanceUrl: string,
  forceLogin: boolean = false,
): Promise<AuthData> {
  // This function now only initiates the login
  // The actual completion happens via completeOAuthFromCallback
  await initiateLogin(instanceUrl, forceLogin);

  // This will never be reached as initiateLogin redirects away
  // But we need to satisfy the return type for TypeScript
  throw new Error("OAuth flow initiated - waiting for callback");
}

/**
 * Logout - clear auth data
 */
export async function logout(instanceUrl: string): Promise<void> {
  try {
    const normalizedUrl = normalizeInstanceUrl(instanceUrl);
    await storageService.deleteAuthData(normalizedUrl);
    console.info("Logout successful");
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
}

/**
 * Get current user info
 */
export async function getCurrentUser(instanceUrl: string, accessToken: string) {
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);

  try {
    const client = createRestAPIClient({
      url: normalizedUrl,
      accessToken,
    });

    const account = await client.v1.accounts.verifyCredentials();
    return account;
  } catch (error) {
    console.error("Error getting current user:", error);
    throw error;
  }
}

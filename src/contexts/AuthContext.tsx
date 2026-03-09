import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { storageService } from "@lib/storage";
import {
  initiateLogin,
  completeOAuthFromCallback,
  isOAuthCallback,
  getPendingOAuthState,
  logout as apiLogout,
  validateToken,
  normalizeInstanceUrl,
} from "@lib/api/auth";
import { createMastodonClient, clearClientCache } from "@lib/api/client";
import type { Instance, AuthData, User } from "@types";

/**
 * Authentication context
 * Phase 1.2: Full OAuth implementation
 */

interface Account {
  instance: Instance;
  user: User;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  instance: Instance | null;
  user: User | null;
  error: string | null;
  accounts: Account[];
}

interface AuthContextType extends AuthState {
  login: (instanceUrl: string) => Promise<void>;
  logout: () => Promise<void>;
  switchAccount: (instanceId: string) => Promise<void>;
  removeAccount: (instanceId: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    instance: null,
    user: null,
    error: null,
    accounts: [],
  });

  // Track if we've handled the OAuth callback to prevent double processing
  const oauthCallbackHandled = useRef(false);

  /**
   * Handle OAuth callback URL and complete the login flow
   */
  const handleOAuthCallback = useCallback(async (url: string) => {
    // Prevent double handling of the same callback
    if (oauthCallbackHandled.current) {
      console.info("OAuth callback already handled, skipping");
      return;
    }

    if (!isOAuthCallback(url)) {
      return;
    }

    console.info("Handling OAuth callback:", url);
    oauthCallbackHandled.current = true;

    try {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      const authData = await completeOAuthFromCallback(url);
      if (!authData) {
        // No pending OAuth state, just reload auth state
        await loadAuthState();
        return;
      }

      // Get user info
      const client = createMastodonClient(
        authData.instanceUrl,
        authData.accessToken,
      );
      const account = await client.v1.accounts.verifyCredentials();

      // Create composite ID and save instance
      const compositeId = `${authData.instanceUrl}@${account.id}`;

      // Check if this account already exists
      const existingAccount = await storageService.accountExists(
        authData.instanceUrl,
        account.id,
      );

      if (existingAccount) {
        // Account exists - refresh token and switch to it
        console.info(
          `Account @${account.username} already exists. Refreshing token.`,
        );
        const enhancedAuthData: AuthData = {
          ...authData,
          accountId: account.id,
          username: account.username,
        };
        await storageService.saveAuthData(compositeId, enhancedAuthData);
        await storageService.switchInstance(compositeId);
      } else {
        // New account - create instance record
        const instance: Instance = {
          id: compositeId,
          url: authData.instanceUrl,
          accountId: account.id,
          username: account.username,
          displayName: account.displayName || account.username,
          domain: new URL(authData.instanceUrl).hostname,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          isActive: true,
        };

        const enhancedAuthData: AuthData = {
          ...authData,
          accountId: account.id,
          username: account.username,
        };

        await storageService.saveInstance(instance);
        await storageService.saveAuthData(compositeId, enhancedAuthData);
        await storageService.setActiveInstance(instance);
      }

      // Clear client cache for clean slate
      clearClientCache();

      // Clear all feed caches to prevent loading old posts from previous accounts
      await storageService.clearAllCache();

      // Reload full auth state
      await loadAuthState();
    } catch (error) {
      console.error("OAuth callback error:", error);
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "OAuth login failed",
      }));
    } finally {
      // Reset the flag after a delay to allow for retry if needed
      setTimeout(() => {
        oauthCallbackHandled.current = false;
      }, 5000);
    }
  }, []);

  // Load auth state and check for OAuth callback on mount
  useEffect(() => {
    const initializeAuth = async () => {
      // First check for OAuth callback in URL (web) or pending state
      if (Platform.OS === "web") {
        // On web, check if current URL is an OAuth callback
        const currentUrl = window.location.href;
        if (isOAuthCallback(currentUrl)) {
          // Handle the callback
          await handleOAuthCallback(currentUrl);
          // Clean up URL by removing query params
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
          return;
        }
      }

      // Check if there's a pending OAuth state (user may have returned to app)
      const pendingState = await getPendingOAuthState();
      if (pendingState) {
        // There's pending OAuth - user might be returning from authorization
        // On native, the deep link handler will catch the callback
        console.info("Found pending OAuth state, waiting for callback");
      }

      // Load normal auth state
      await loadAuthState();
    };

    initializeAuth();
  }, [handleOAuthCallback]);

  // Listen for deep link URLs (native platforms)
  useEffect(() => {
    if (Platform.OS === "web") {
      return; // Web handles this differently via page load
    }

    // Get the initial URL if app was opened via deep link
    const handleInitialURL = async () => {
      try {
        // Check if getInitialURL is available (may not be in test environment)
        if (typeof Linking.getInitialURL === "function") {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl && isOAuthCallback(initialUrl)) {
            await handleOAuthCallback(initialUrl);
          }
        }
      } catch (error) {
        console.warn("Error getting initial URL:", error);
      }
    };
    handleInitialURL();

    // Listen for deep links while app is running
    let subscription: ReturnType<typeof Linking.addEventListener> | null = null;
    try {
      if (typeof Linking.addEventListener === "function") {
        subscription = Linking.addEventListener("url", async (event) => {
          if (isOAuthCallback(event.url)) {
            await handleOAuthCallback(event.url);
          }
        });
      }
    } catch (error) {
      console.warn("Error adding URL listener:", error);
    }

    return () => {
      if (subscription && typeof subscription.remove === "function") {
        subscription.remove();
      }
    };
  }, [handleOAuthCallback]);

  /**
   * Load all accounts and set active one
   * Phase 2.4: Multi-account support
   */
  const loadAllAccounts = async (): Promise<Account[]> => {
    try {
      const instances = await storageService.getAuthenticatedInstances();
      const accounts: Account[] = [];

      for (const instance of instances) {
        const authData = await storageService.getAuthData(instance.id);
        if (!authData) continue;

        try {
          // Validate token
          const isValid = await validateToken(
            instance.url,
            authData.accessToken,
          );
          if (!isValid) {
            console.warn(`Token invalid for instance ${instance.id}`);
            continue;
          }

          // Get user info
          const client = createMastodonClient(
            instance.url,
            authData.accessToken,
          );
          const account = await client.v1.accounts.verifyCredentials();

          accounts.push({
            instance,
            user: {
              id: account.id,
              username: account.username,
              displayName: account.displayName || account.username,
              avatar: account.avatar,
              header: account.header || "",
              followersCount: account.followersCount || 0,
              followingCount: account.followingCount || 0,
              statusesCount: account.statusesCount || 0,
              note: account.note,
              url: account.url,
              acct: account.acct,
              locked: account.locked ?? false,
              bot: account.bot ?? false,
              discoverable: account.discoverable ?? false,
              fields: account.fields,
            },
          });
        } catch (error) {
          console.error(`Error loading account for ${instance.id}:`, error);
        }
      }

      return accounts;
    } catch (error) {
      console.error("Error loading all accounts:", error);
      return [];
    }
  };

  const loadAuthState = async () => {
    try {
      // Initialize storage
      await storageService.initialize();

      // Load all accounts
      const accounts = await loadAllAccounts();

      // Get active instance
      const instance = await storageService.getActiveInstance();
      if (!instance) {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          instance: null,
          user: null,
          error: null,
          accounts,
        });
        return;
      }

      // Find active account
      const activeAccount = accounts.find(
        (acc) => acc.instance.id === instance.id,
      );
      if (!activeAccount) {
        // Active instance doesn't have valid auth
        await storageService.setActiveInstance(null);
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          instance: null,
          user: null,
          error: "Session expired. Please login again.",
          accounts,
        });
        return;
      }

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        instance: activeAccount.instance,
        user: activeAccount.user,
        error: null,
        accounts,
      });
    } catch (error) {
      console.error("Error loading auth state:", error);
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        instance: null,
        user: null,
        error: error instanceof Error ? error.message : "Unknown error",
        accounts: [],
      });
    }
  };

  const login = async (instanceUrl: string) => {
    try {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      // 1. Normalize the instance URL first
      const normalizedUrl = normalizeInstanceUrl(instanceUrl);

      // 2. Check if we already have accounts on this server
      // If yes, force re-authentication to allow different account login
      const existingAccounts =
        await storageService.getAccountsForServer(normalizedUrl);
      const forceLogin = existingAccounts.length > 0;

      if (forceLogin) {
        console.info(
          `Server ${normalizedUrl} already has ${existingAccounts.length} account(s). Forcing re-authentication to allow different account login.`,
        );
      }

      // 3. Initiate OAuth login (this will redirect away from the app)
      // The flow continues in handleOAuthCallback when the user returns
      await initiateLogin(instanceUrl, forceLogin);

      // On web, execution stops here as the page redirects
      // On native, the browser opens but the app stays running
      // Reset loading state so user can interact if they come back without completing OAuth
      if (Platform.OS !== "web") {
        setAuthState((prev) => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error("Login error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Login failed";
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (authState.instance) {
        await apiLogout(authState.instance.id);
        await storageService.deleteInstance(authState.instance.id);
      }

      // Clear client cache
      clearClientCache();

      // Reload accounts after logout
      const accounts = await loadAllAccounts();

      // If there are other accounts, don't set active instance
      // User will need to manually switch
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        instance: null,
        user: null,
        error: null,
        accounts,
      });
    } catch (error) {
      console.error("Logout error:", error);
      // Even if logout fails, clear local state
      const accounts = await loadAllAccounts();
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        instance: null,
        user: null,
        error: null,
        accounts,
      });
    }
  };

  /**
   * Switch to a different account
   * Phase 2.4: Multi-account support
   */
  const switchAccount = async (instanceId: string) => {
    try {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      // Switch instance in storage
      const instance = await storageService.switchInstance(instanceId);
      if (!instance) {
        throw new Error("Failed to switch instance");
      }

      // Find account in accounts list
      const account = authState.accounts.find(
        (acc) => acc.instance.id === instanceId,
      );
      if (!account) {
        throw new Error("Account not found");
      }

      // Clear client cache for clean slate
      clearClientCache();

      // Clear all feed caches when switching accounts
      await storageService.clearAllCache();

      setAuthState((prev) => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        instance: account.instance,
        user: account.user,
        error: null,
      }));
    } catch (error) {
      console.error("Switch account error:", error);
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error ? error.message : "Failed to switch account",
      }));
      throw error;
    }
  };

  /**
   * Remove an account (logout from specific instance)
   * Phase 2.4: Multi-account support
   */
  const removeAccount = async (instanceId: string) => {
    try {
      // Delete instance and its auth data
      await storageService.deleteInstance(instanceId);

      // Reload accounts
      const accounts = await loadAllAccounts();

      // If removed account was active, clear active state
      if (authState.instance?.id === instanceId) {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          instance: null,
          user: null,
          error: null,
          accounts,
        });
      } else {
        // Just update accounts list
        setAuthState((prev) => ({
          ...prev,
          accounts,
        }));
      }
    } catch (error) {
      console.error("Remove account error:", error);
      throw error;
    }
  };

  const refreshAuth = async () => {
    await loadAuthState();
  };

  const clearError = () => {
    setAuthState((prev) => ({ ...prev, error: null }));
  };

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        logout,
        switchAccount,
        removeAccount,
        refreshAuth,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

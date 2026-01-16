import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../AuthContext";
import { storageService } from "@lib/storage";
import * as authApi from "@lib/api/auth";

// Mock dependencies
jest.mock("@lib/storage");
jest.mock("@lib/api/auth");
jest.mock("@lib/api/client", () => ({
  createMastodonClient: jest.fn((url: string, token: string) => ({
    v1: {
      accounts: {
        verifyCredentials: jest.fn(),
      },
    },
  })),
  clearClientCache: jest.fn(),
}));

const mockStorageService = storageService as jest.Mocked<typeof storageService>;
const mockAuthApi = authApi as jest.Mocked<typeof authApi>;

/**
 * Tests for AuthContext with multi-account same-server support
 */
describe("AuthContext - Multi-Account Same-Server", () => {
  const mockAccount1 = {
    id: "109382926501",
    username: "alice",
    displayName: "Alice Wonderland",
    avatar: "https://example.com/alice.jpg",
  };

  const mockAccount2 = {
    id: "109382926502",
    username: "bob",
    displayName: "Bob Builder",
    avatar: "https://example.com/bob.jpg",
  };

  const mockAuthData1 = {
    instanceUrl: "https://mastodon.social",
    accountId: "109382926501",
    username: "alice",
    clientId: "client-1",
    clientSecret: "secret-1",
    accessToken: "token-1",
    scopes: ["read", "write"],
  };

  const mockInstance1 = {
    id: "https://mastodon.social@109382926501",
    url: "https://mastodon.social",
    accountId: "109382926501",
    username: "alice",
    displayName: "Alice Wonderland",
    domain: "mastodon.social",
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    isActive: true,
  };

  const mockInstance2 = {
    id: "https://mastodon.social@109382926502",
    url: "https://mastodon.social",
    accountId: "109382926502",
    username: "bob",
    displayName: "Bob Builder",
    domain: "mastodon.social",
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    isActive: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockStorageService.initialize.mockResolvedValue();
    mockStorageService.getInstances.mockResolvedValue([]);
    mockStorageService.getActiveInstance.mockResolvedValue(null);
    mockStorageService.getAuthData.mockResolvedValue(null);
    mockStorageService.saveInstance.mockResolvedValue();
    mockStorageService.saveAuthData.mockResolvedValue();
    mockStorageService.setActiveInstance.mockResolvedValue();
    mockStorageService.getAuthenticatedInstances.mockResolvedValue([]);
    mockStorageService.accountExists.mockResolvedValue(false);
    mockStorageService.getAccountsForServer.mockResolvedValue([]);
    mockStorageService.switchInstance.mockResolvedValue(null);
    mockStorageService.deleteInstance.mockResolvedValue();

    // Mock new OAuth redirect flow functions
    mockAuthApi.initiateLogin.mockResolvedValue();
    mockAuthApi.completeOAuthFromCallback.mockResolvedValue(mockAuthData1);
    mockAuthApi.getPendingOAuthState.mockResolvedValue(null);
    mockAuthApi.isOAuthCallback.mockReturnValue(false);
    // Legacy login function (now throws after initiating)
    mockAuthApi.login.mockResolvedValue(mockAuthData1);
    mockAuthApi.validateToken.mockResolvedValue(true);
    mockAuthApi.normalizeInstanceUrl.mockImplementation((url: string) => {
      // Simple normalization for tests
      return url.startsWith("http") ? url : `https://${url}`;
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  describe("login with composite IDs", () => {
    it("should create composite ID when logging in", async () => {
      const { createMastodonClient } = require("@lib/api/client");
      createMastodonClient.mockReturnValue({
        v1: {
          accounts: {
            verifyCredentials: jest.fn().mockResolvedValue(mockAccount1),
          },
        },
      });

      mockStorageService.accountExists.mockResolvedValue(false);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Login initiates OAuth redirect (mocked to do nothing)
      await act(async () => {
        await result.current.login("https://mastodon.social");
      });

      // Verify initiateLogin was called
      expect(mockAuthApi.initiateLogin).toHaveBeenCalledWith(
        "https://mastodon.social",
        false, // forceLogin = false since no existing accounts
      );

      // Simulate OAuth callback completion by setting up storage state
      mockStorageService.getActiveInstance.mockResolvedValue(mockInstance1);
      mockStorageService.getAuthData.mockResolvedValue(mockAuthData1);
      mockStorageService.getAuthenticatedInstances.mockResolvedValue([
        mockInstance1,
      ]);

      // Refresh auth to load the new state (simulates callback completion)
      await act(async () => {
        await result.current.refreshAuth();
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });
    });

    it("should treat re-login as token refresh for existing accounts", async () => {
      const { createMastodonClient } = require("@lib/api/client");
      createMastodonClient.mockReturnValue({
        v1: {
          accounts: {
            verifyCredentials: jest.fn().mockResolvedValue(mockAccount1),
          },
        },
      });

      // Set up existing account
      mockStorageService.getAccountsForServer.mockResolvedValue([mockInstance1]);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Login initiates OAuth redirect
      await act(async () => {
        await result.current.login("https://mastodon.social");
      });

      // Verify initiateLogin was called with forceLogin=true (existing accounts)
      expect(mockAuthApi.initiateLogin).toHaveBeenCalledWith(
        "https://mastodon.social",
        true, // forceLogin = true since existing accounts
      );

      // Simulate callback completion
      mockStorageService.getActiveInstance.mockResolvedValue(mockInstance1);
      mockStorageService.getAuthData.mockResolvedValue(mockAuthData1);
      mockStorageService.getAuthenticatedInstances.mockResolvedValue([
        mockInstance1,
      ]);

      await act(async () => {
        await result.current.refreshAuth();
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });
    });

    it("should allow adding different account from same server", async () => {
      const { createMastodonClient } = require("@lib/api/client");
      createMastodonClient.mockReturnValue({
        v1: {
          accounts: {
            verifyCredentials: jest.fn().mockResolvedValue(mockAccount2),
          },
        },
      });

      // Set up existing account on server
      mockStorageService.getAccountsForServer.mockResolvedValue([mockInstance1]);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Login initiates OAuth redirect for second account
      await act(async () => {
        await result.current.login("https://mastodon.social");
      });

      // Verify initiateLogin was called with forceLogin=true (existing accounts)
      expect(mockAuthApi.initiateLogin).toHaveBeenCalledWith(
        "https://mastodon.social",
        true, // forceLogin = true since there's already an account on this server
      );

      // Set up auth data for second account
      const mockAuthData2 = {
        instanceUrl: "https://mastodon.social",
        accountId: "109382926502",
        username: "bob",
        clientId: "client-2",
        clientSecret: "secret-2",
        accessToken: "token-2",
        scopes: ["read", "write"],
      };

      // Simulate second account added via callback
      mockStorageService.getActiveInstance.mockResolvedValue(mockInstance2);
      mockStorageService.getAuthData.mockResolvedValue(mockAuthData2);
      mockStorageService.getAuthenticatedInstances.mockResolvedValue([
        mockInstance1,
        mockInstance2,
      ]);
      // Ensure token validation passes for both accounts
      mockAuthApi.validateToken.mockResolvedValue(true);

      await act(async () => {
        await result.current.refreshAuth();
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.accounts).toHaveLength(2);
      });
    });

    it("should check accountExists before adding account", async () => {
      // This test verifies that initiateLogin is called with correct forceLogin parameter
      // The actual accountExists check now happens in handleOAuthCallback
      const { createMastodonClient } = require("@lib/api/client");
      createMastodonClient.mockReturnValue({
        v1: {
          accounts: {
            verifyCredentials: jest.fn().mockResolvedValue(mockAccount1),
          },
        },
      });

      // No existing accounts
      mockStorageService.getAccountsForServer.mockResolvedValue([]);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.login("https://mastodon.social");
      });

      // Verify getAccountsForServer was called to check for existing accounts
      expect(mockStorageService.getAccountsForServer).toHaveBeenCalledWith(
        "https://mastodon.social",
      );

      // Verify initiateLogin was called with forceLogin=false (no existing accounts)
      expect(mockAuthApi.initiateLogin).toHaveBeenCalledWith(
        "https://mastodon.social",
        false,
      );
    });
  });

  describe("account switching with composite IDs", () => {
    beforeEach(() => {
      const { createMastodonClient } = require("@lib/api/client");

      // Mock to return different accounts for different calls
      let callCount = 0;
      createMastodonClient.mockImplementation(() => ({
        v1: {
          accounts: {
            verifyCredentials: jest.fn(() => {
              const accounts = [mockAccount1, mockAccount2];
              return Promise.resolve(accounts[callCount++ % 2]);
            }),
          },
        },
      }));

      mockStorageService.getAuthenticatedInstances.mockResolvedValue([
        mockInstance1,
        mockInstance2,
      ]);

      mockStorageService.getAuthData.mockImplementation(async (id) => {
        if (id === mockInstance1.id) {
          return mockAuthData1;
        }
        if (id === mockInstance2.id) {
          return {
            ...mockAuthData1,
            accountId: mockInstance2.accountId,
            username: mockInstance2.username,
            accessToken: "token-2",
          };
        }
        return null;
      });

      mockStorageService.switchInstance.mockImplementation(async (id) => {
        if (id === mockInstance2.id) {
          return mockInstance2;
        }
        return mockInstance1;
      });
    });

    it("should switch between accounts on the same server", async () => {
      mockStorageService.getActiveInstance.mockResolvedValueOnce(mockInstance1);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(2);
      });

      await act(async () => {
        await result.current.switchAccount(mockInstance2.id);
      });

      await waitFor(() => {
        expect(mockStorageService.switchInstance).toHaveBeenCalledWith(
          mockInstance2.id,
        );
      });
    });

    it("should update auth state when switching accounts", async () => {
      mockStorageService.getActiveInstance.mockResolvedValueOnce(mockInstance1);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.instance?.id).toBe(mockInstance1.id);
        expect(result.current.accounts).toHaveLength(2);
      });

      await act(async () => {
        await result.current.switchAccount(mockInstance2.id);
      });

      await waitFor(() => {
        expect(result.current.instance?.id).toBe(mockInstance2.id);
        expect(result.current.user?.username).toBe("bob");
      });
    });

    it("should clear client cache when switching accounts", async () => {
      const { clearClientCache } = require("@lib/api/client");

      mockStorageService.getActiveInstance.mockResolvedValueOnce(mockInstance1);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(2);
      });

      await act(async () => {
        await result.current.switchAccount(mockInstance2.id);
      });

      expect(clearClientCache).toHaveBeenCalled();
    });
  });

  describe("account removal with composite IDs", () => {
    beforeEach(() => {
      const { createMastodonClient } = require("@lib/api/client");

      // Mock to return different accounts for different calls
      let callCount = 0;
      createMastodonClient.mockImplementation(() => ({
        v1: {
          accounts: {
            verifyCredentials: jest.fn(() => {
              const accounts = [mockAccount1, mockAccount2];
              return Promise.resolve(accounts[callCount++ % 2]);
            }),
          },
        },
      }));

      mockStorageService.getAuthenticatedInstances.mockResolvedValue([
        mockInstance1,
        mockInstance2,
      ]);
      mockStorageService.getActiveInstance.mockResolvedValue(mockInstance1);

      mockStorageService.getAuthData.mockImplementation(async (id) => {
        if (id === mockInstance1.id) {
          return mockAuthData1;
        }
        if (id === mockInstance2.id) {
          return {
            ...mockAuthData1,
            accountId: mockInstance2.accountId,
            username: mockInstance2.username,
            accessToken: "token-2",
          };
        }
        return null;
      });
    });

    it("should remove account by composite ID", async () => {
      mockStorageService.deleteInstance.mockResolvedValue();

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(2);
      });

      await act(async () => {
        await result.current.removeAccount(mockInstance2.id);
      });

      expect(mockStorageService.deleteInstance).toHaveBeenCalledWith(
        mockInstance2.id,
      );
    });

    it("should allow removing one account while keeping other on same server", async () => {
      mockStorageService.deleteInstance.mockResolvedValue();
      mockStorageService.getAuthenticatedInstances
        .mockResolvedValueOnce([mockInstance1, mockInstance2])
        .mockResolvedValueOnce([mockInstance1]);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(2);
      });

      await act(async () => {
        await result.current.removeAccount(mockInstance2.id);
      });

      // First account on same server should still be active
      await waitFor(() => {
        expect(result.current.instance?.id).toBe(mockInstance1.id);
      });
    });

    it("should update state when removing non-active account", async () => {
      mockStorageService.deleteInstance.mockResolvedValue();
      mockStorageService.getAuthenticatedInstances
        .mockResolvedValueOnce([mockInstance1, mockInstance2])
        .mockResolvedValueOnce([mockInstance1]);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(2);
      });

      await act(async () => {
        await result.current.removeAccount(mockInstance2.id);
      });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(1);
        expect(result.current.isAuthenticated).toBe(true);
      });
    });

    it("should clear auth when removing active account", async () => {
      mockStorageService.deleteInstance.mockResolvedValue();
      mockStorageService.getAuthenticatedInstances
        .mockResolvedValueOnce([mockInstance1])
        .mockResolvedValueOnce([]);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.instance?.id).toBe(mockInstance1.id);
      });

      await act(async () => {
        await result.current.removeAccount(mockInstance1.id);
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.instance).toBeNull();
      });
    });
  });

  describe("loadAllAccounts with composite IDs", () => {
    it("should load accounts with composite IDs", async () => {
      const { createMastodonClient } = require("@lib/api/client");

      createMastodonClient
        .mockReturnValueOnce({
          v1: {
            accounts: {
              verifyCredentials: jest.fn().mockResolvedValue(mockAccount1),
            },
          },
        })
        .mockReturnValueOnce({
          v1: {
            accounts: {
              verifyCredentials: jest.fn().mockResolvedValue(mockAccount2),
            },
          },
        });

      mockStorageService.getAuthenticatedInstances.mockResolvedValue([
        mockInstance1,
        mockInstance2,
      ]);

      mockStorageService.getAuthData
        .mockResolvedValueOnce(mockAuthData1)
        .mockResolvedValueOnce({
          ...mockAuthData1,
          accountId: "109382926502",
          username: "bob",
          accessToken: "token-2",
        });

      mockAuthApi.validateToken.mockResolvedValue(true);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(2);
        expect(result.current.accounts[0].instance.id).toBe(mockInstance1.id);
        expect(result.current.accounts[1].instance.id).toBe(mockInstance2.id);
      });
    });

    it("should skip accounts with invalid tokens", async () => {
      const { createMastodonClient } = require("@lib/api/client");

      createMastodonClient.mockReturnValue({
        v1: {
          accounts: {
            verifyCredentials: jest.fn().mockResolvedValue(mockAccount1),
          },
        },
      });

      mockStorageService.getAuthenticatedInstances.mockResolvedValue([
        mockInstance1,
        mockInstance2,
      ]);

      mockStorageService.getAuthData
        .mockResolvedValueOnce(mockAuthData1)
        .mockResolvedValueOnce({
          ...mockAuthData1,
          accountId: "109382926502",
          accessToken: "invalid-token",
        });

      mockAuthApi.validateToken
        .mockResolvedValueOnce(true) // First account valid
        .mockResolvedValueOnce(false); // Second account invalid

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(1);
        expect(result.current.accounts[0].instance.id).toBe(mockInstance1.id);
      });
    });
  });
});

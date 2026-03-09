import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import InstanceSelectorScreen from "../instance-selector";

const mockLogin = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
    isLoading: false,
    isAuthenticated: false,
  }),
}));

jest.mock("@contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff",
      text: "#000",
      textSecondary: "#666",
      primary: "#6364FF",
      success: "#34C759",
      border: "#e0e0e0",
      card: "#f5f5f5",
    },
  }),
}));

jest.mock("@lib/instances", () => ({
  POPULAR_INSTANCES: [
    {
      name: "Closed Instance",
      domain: "closed.example",
      description: "Registrations closed",
      category: "general",
      userCount: "10k",
      openRegistrations: false,
    },
  ],
  INSTANCE_CATEGORIES: [{ key: "general", label: "General", icon: "🌐" }],
}));

jest.mock("@lib/api/instance", () => ({
  validateInstance: jest.fn().mockResolvedValue(true),
  getInstanceInfo: jest
    .fn()
    .mockResolvedValue({ registrations: false, uri: "https://closed.example" }),
}));

jest.mock("@lib/api/auth", () => ({
  normalizeInstanceUrl: (url: string) =>
    url.startsWith("http") ? url : `https://${url}`,
}));

jest.mock("@components/base", () => {
  const React = require("react");
  const { View, Text, TextInput, ActivityIndicator } = require("react-native");
  return {
    Input: (props: any) => (
      <View>
        <TextInput accessibilityLabel="search-input" {...props} />
      </View>
    ),
    Card: ({ children, ...rest }: any) => <View {...rest}>{children}</View>,
    Spinner: (props: any) => <ActivityIndicator {...props} testID="spinner" />,
  };
});

jest.mock("react-native-gesture-handler", () => ({}));

describe("InstanceSelectorScreen Try Anyway flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockLogin.mockRejectedValue(new Error("Login failed"));
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it("clears validating state after Try Anyway failure", async () => {
    const { getByText, queryByTestId } = render(<InstanceSelectorScreen />);

    // Open instance card
    fireEvent.press(getByText("Closed Instance"));

    // Capture the Alert and trigger Try Anyway
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const tryAnyway = buttons.find((b) => b.text === "Try Anyway");
    expect(tryAnyway).toBeDefined();
    tryAnyway?.onPress?.();

    // Allow login promise to reject and state to settle
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    await waitFor(() =>
      expect(queryByTestId("instance-loading-closed.example")).toBeNull(),
    );
  });
});

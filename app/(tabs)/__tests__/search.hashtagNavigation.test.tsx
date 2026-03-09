import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import SearchScreen from "../search";
import { getActiveClient } from "@lib/api/client";

const mockPush = jest.fn();
const mockAddHashtagFeed = jest.fn();
const mockSearchList = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff",
      text: "#000",
      textSecondary: "#666",
      primary: "#6364FF",
      border: "#e0e0e0",
      card: "#f5f5f5",
      error: "#f00",
    },
  }),
}));

jest.mock("@contexts/TimelinesContext", () => ({
  useTimelines: () => ({
    addHashtagFeed: mockAddHashtagFeed,
    addAccountFeed: jest.fn(),
    removeFeed: jest.fn(),
    refreshTimelines: jest.fn(),
    timelineOptions: [],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@lib/api/client", () => ({
  getActiveClient: jest.fn(),
}));

jest.mock("@components/base", () => ({
  Avatar: () => null,
}));

jest.mock("@components/feed", () => ({
  PostCard: () => null,
}));

jest.mock("@lib/api/timeline", () => ({
  transformStatus: jest.fn(),
}));

describe("SearchScreen hashtag navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (getActiveClient as jest.Mock).mockResolvedValue({
      client: {
        v2: {
          search: {
            list: mockSearchList,
          },
        },
      },
    });

    mockSearchList.mockResolvedValue({
      accounts: [],
      statuses: [],
      hashtags: [
        {
          name: "hello",
          url: "https://example.com/hello",
          history: [{ uses: "3" }],
        },
      ],
    });
  });

  it("adds hashtag feed and navigates when tapping a search hashtag", async () => {
    const { getByPlaceholderText, getByText } = render(<SearchScreen />);

    const input = getByPlaceholderText("Search...");
    fireEvent.changeText(input, "hello");
    fireEvent(input, "submitEditing");

    fireEvent.press(getByText("Tags"));

    await waitFor(() => expect(getByText("#hello")).toBeTruthy());

    fireEvent.press(getByText("#hello"));

    expect(mockAddHashtagFeed).toHaveBeenCalledWith("hello");
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/feed/hashtag/hello");
  });
});

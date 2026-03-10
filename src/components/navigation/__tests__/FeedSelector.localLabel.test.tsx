import { render } from "@testing-library/react-native";
import { FeedSelector } from "../FeedSelector";
import { usePathname } from "expo-router";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: jest.fn(),
}));

jest.mock("@contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      card: "#FFFFFF",
      text: "#000000",
      textSecondary: "#666666",
      primary: "#6364FF",
      background: "#F5F5F5",
      border: "#E0E0E0",
    },
  }),
}));

jest.mock("@contexts/TimelinesContext", () => ({
  useTimelines: () => ({
    isLoading: false,
    timelineOptions: [
      {
        id: "home",
        name: "Home Feed",
        type: "home",
        description: "Your home timeline",
      },
      {
        id: "local",
        name: "Local Feed",
        type: "local",
        description: "Local timeline for your instance",
      },
    ],
  }),
}));

describe("FeedSelector - Local feed label", () => {
  it("shows Local feed label when pathname points to local feed", () => {
    (usePathname as jest.Mock).mockReturnValue("/(tabs)/feed/local");

    const { getByText } = render(<FeedSelector />);

    expect(getByText("Local Feed")).toBeTruthy();
  });
});

import { RequestQueue } from "../requestQueue";

jest.useFakeTimers();

// Speed up queue timings for tests
jest.mock("@lib/storage/constants", () => ({
  REQUEST_QUEUE_CONFIG: {
    MAX_CONCURRENT_REQUESTS: 1,
    REQUEST_DELAY: 0,
    RATE_LIMIT_DELAY: 50,
    MAX_RETRIES: 2,
    RETRY_BACKOFF: 10,
  },
  REQUEST_CACHE_CONFIG: {
    CLEAR_DELAY: 0,
    DRAIN_CHECK_INTERVAL: 5,
  },
}));

describe("RequestQueue rate limit handling", () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue();
  });

  it("retries when response status is 429 even without message text", async () => {
    let attempts = 0;

    const promise = queue.enqueue(async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = { response: { status: 429 } };
        throw error;
      }
      return "ok";
    });

    // Allow first attempt to run
    await Promise.resolve();
    // Advance through rate-limit delay and retry
    await jest.advanceTimersByTimeAsync(60);

    await expect(promise).resolves.toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry auth errors (401/403) when status is present", async () => {
    let attempts = 0;

    const promise = queue.enqueue(async () => {
      attempts += 1;
      const error = { response: { status: 401 }, message: "Unauthorized" };
      throw error;
    });

    await Promise.resolve();
    await expect(promise).rejects.toEqual(
      expect.objectContaining({ response: { status: 401 } }),
    );
    expect(attempts).toBe(1);
  });
});

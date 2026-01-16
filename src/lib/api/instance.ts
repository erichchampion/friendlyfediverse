import { normalizeInstanceUrl } from "./auth";

/**
 * Instance validation and info fetching
 * Phase 2.2: Instance validation
 */

export interface InstanceInfo {
  uri: string;
  title: string;
  description: string;
  version: string;
  registrations: boolean;
  approvalRequired: boolean;
  stats?: {
    userCount: number;
    statusCount: number;
    domainCount: number;
  };
  thumbnail?: string;
  languages?: string[];
}

/**
 * Validate instance URL and check if it's a valid Mastodon-compatible instance
 */
export async function validateInstance(instanceUrl: string): Promise<boolean> {
  try {
    const normalizedUrl = normalizeInstanceUrl(instanceUrl);
    console.info(`Validating instance: ${normalizedUrl}`);

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${normalizedUrl}/api/v1/instance`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.info(`Instance validation response: ${response.status}`);

    if (!response.ok) {
      console.warn(`Instance validation failed: HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    // Check if response looks like a Mastodon-compatible instance
    // Some instances (like Pixelfed) may use 'domain' instead of 'uri'
    const hasIdentifier = !!data.uri || !!data.domain;
    const hasVersion = !!data.version;

    console.info(`Instance validation result: hasIdentifier=${hasIdentifier}, hasVersion=${hasVersion}`);

    return hasIdentifier && hasVersion;
  } catch (error) {
    console.error("Instance validation error:", error);
    return false;
  }
}

/**
 * Get instance information
 */
export async function getInstanceInfo(
  instanceUrl: string,
): Promise<InstanceInfo | null> {
  try {
    const normalizedUrl = normalizeInstanceUrl(instanceUrl);
    console.info(`Getting instance info: ${normalizedUrl}`);

    const response = await fetch(`${normalizedUrl}/api/v1/instance`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`Instance info request failed: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.info(`Instance info raw registrations field:`, data.registrations);

    // Handle different API formats for registrations
    // Mastodon v4+ uses { enabled: boolean }, older versions use boolean directly
    // Pixelfed may use a different format
    let registrationsOpen = true;
    if (typeof data.registrations === "boolean") {
      registrationsOpen = data.registrations;
    } else if (typeof data.registrations === "object" && data.registrations !== null) {
      registrationsOpen = data.registrations.enabled ?? true;
    }

    console.info(`Instance registrations open: ${registrationsOpen}`);

    return {
      uri: data.uri || data.domain,
      title: data.title,
      description: data.description || data.short_description || "",
      version: data.version,
      registrations: registrationsOpen,
      approvalRequired: data.approval_required ?? false,
      stats: data.stats
        ? {
            userCount: data.stats.user_count,
            statusCount: data.stats.status_count,
            domainCount: data.stats.domain_count,
          }
        : undefined,
      thumbnail: data.thumbnail?.url,
      languages: data.languages,
    };
  } catch (error) {
    console.error("Error fetching instance info:", error);
    return null;
  }
}

/**
 * Search for instances (using joinmastodon.org API)
 */
export async function searchInstances(query: string): Promise<InstanceInfo[]> {
  try {
    // For now, just validate the provided URL
    // In the future, we could integrate with joinmastodon.org API
    if (!query.trim()) {
      return [];
    }

    const isValid = await validateInstance(query);
    if (isValid) {
      const info = await getInstanceInfo(query);
      return info ? [info] : [];
    }

    return [];
  } catch (error) {
    console.error("Instance search error:", error);
    return [];
  }
}

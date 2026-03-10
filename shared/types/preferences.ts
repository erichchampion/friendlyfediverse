/**
 * Preferences and Profile Update type definitions
 * Shared between web and React Native apps
 */

/**
 * Mastodon account preferences
 * These are server-side preferences that affect behavior across all clients
 */
export interface MastodonPreferences {
  /** Default visibility for new posts */
  "posting:default:visibility": "public" | "unlisted" | "private" | "direct";

  /** Mark media as sensitive by default */
  "posting:default:sensitive": boolean;

  /** Default language for new posts (ISO 639-1 language code) */
  "posting:default:language": string | null;

  /** Default quote policy (Mastodon 4.5+) */
  "posting:default:quote_policy"?: "public" | "followers" | "nobody";

  /** How to display media attachments */
  "reading:expand:media": "default" | "show_all" | "hide_all";

  /** Auto-expand content warnings/spoilers */
  "reading:expand:spoilers": boolean;
}

/**
 * Parameters for updating account credentials
 * Used with PATCH /api/v1/accounts/update_credentials
 */
export interface UpdateCredentialsParams {
  /** The display name to use for the profile */
  displayName?: string;

  /** The account bio/description (max 500 characters) */
  note?: string;

  /** Avatar image file */
  avatar?: File | Blob | { uri: string; type: string; name: string };

  /** Header/banner image file */
  header?: File | Blob | { uri: string; type: string; name: string };

  /** Require manual approval of follow requests */
  locked?: boolean;

  /** Mark account as a bot */
  bot?: boolean;

  /** Allow account to appear in discovery features */
  discoverable?: boolean;

  /** Hide follower/following lists */
  hideCollections?: boolean;

  /** Opt-in to search engine indexing */
  indexable?: boolean;

  /** Profile metadata fields (max 4) */
  fieldsAttributes?: ProfileFieldUpdate[];

  /** Source preferences (nested under 'source' in API) */
  source?: {
    /** Default post visibility */
    privacy?: "public" | "unlisted" | "private" | "direct";

    /** Mark media as sensitive by default */
    sensitive?: boolean;

    /** Default language for posts */
    language?: string;

    /** Default quote policy */
    quotePolicy?: "public" | "followers" | "nobody";
  };
}

/**
 * Profile metadata field for updates
 */
export interface ProfileFieldUpdate {
  /** Field name (e.g., "Website", "Location") */
  name: string;

  /** Field value (can include links) */
  value: string;
}

/**
 * Form state for editing profile
 */
export interface ProfileFormData {
  displayName: string;
  note: string;
  locked: boolean;
  bot: boolean;
  discoverable: boolean;
  fields: ProfileFieldUpdate[];
  avatarUri?: string;
  headerUri?: string;
}

/**
 * Preferences form state for account settings
 */
export interface PreferencesFormData {
  defaultVisibility: "public" | "unlisted" | "private" | "direct";
  defaultSensitive: boolean;
  defaultLanguage: string;
  expandMedia: "default" | "show_all" | "hide_all";
  expandSpoilers: boolean;
  hideCollections: boolean;
  indexable: boolean;
}

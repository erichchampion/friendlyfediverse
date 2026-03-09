# Shared TypeScript Types

This directory contains TypeScript type definitions shared between the web app and React Native mobile app.

## Purpose

Sharing types ensures:

- ✅ **Consistency**: Both platforms use identical data structures
- ✅ **Type Safety**: TypeScript catches mismatches at compile time
- ✅ **Single Source of Truth**: Update types once, applies everywhere
- ✅ **API Compliance**: Guaranteed compatibility with Mastodon API
- ✅ **Zero Runtime Cost**: Types are compile-time only

## Structure

```
shared/types/
├── index.ts         # Main export file - import from here
├── user.ts          # User/Account types
├── post.ts          # Post/Status types
├── media.ts         # Media attachment types
├── instance.ts      # Instance/Server types
├── auth.ts          # Authentication types
├── feed.ts          # Feed/Timeline types
└── package.json     # Package metadata
```

## Usage

### In Web App (Next.js)

```typescript
import { Post, User, Instance } from "@shared/types";
// or import specific types
import type { MediaAttachment } from "@shared/types/media";

const user: User = {
  id: "123",
  username: "johndoe",
  displayName: "John Doe",
  // ...
};
```

### In React Native App (Expo)

```typescript
import { Post, User, Instance } from "@shared/types";
// or through the re-export
import type { Post } from "@types";

const post: Post = {
  id: "456",
  content: "Hello world",
  // ...
};
```

## Type Modules

### `user.ts`

Defines user/account related types:

- `User` - Full Mastodon account structure
- `UserField` - Profile metadata fields
- `CustomEmoji` - Custom emoji definitions

### `post.ts`

Defines post/status related types:

- `Post` - Full Mastodon status structure
- `Mention` - User mentions in posts
- `Tag` - Hashtags
- `Poll` - Polls attached to posts
- `Card` - Link preview cards
- `PostVisibility` - Visibility levels

### `media.ts`

Defines media attachment types:

- `MediaAttachment` - Media files (images, videos, audio)
- `MediaMeta` - Metadata (dimensions, duration, etc.)
- `MediaDimensions` - Width/height info

### `instance.ts`

Defines instance/server types:

- `Instance` - Server configuration
- `InstanceInfo` - Server metadata
- `InstanceStats` - Server statistics
- `InstanceSettings` - User preferences per instance

### `auth.ts`

Defines authentication types:

- `AuthData` - Stored authentication data
- `AppRegistration` - OAuth app credentials
- `OAuthToken` - OAuth token response

### `feed.ts`

Defines feed/timeline types:

- `FeedType` - Feed type identifiers
- `TimelineOptions` - Pagination parameters
- `FeedState` - Feed state management

## Configuration

### Web App (`/tsconfig.json`)

```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["./shared/*"]
    }
  }
}
```

### React Native (`/ios/mastodon-rn/tsconfig.json`)

```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../../shared/*"]
    }
  }
}
```

### React Native Babel (`/ios/mastodon-rn/babel.config.js`)

```javascript
{
  alias: {
    '@shared': '../../shared'
  }
}
```

## Adding New Types

1. **Create or edit type file** in `/shared/types/`
2. **Export from `index.ts`** to make it available
3. **Update both apps** to use the new type
4. **Test compilation** in both web and RN

Example:

```typescript
// shared/types/notification.ts
export interface Notification {
  id: string;
  type: "mention" | "reblog" | "favourite" | "follow";
  account: User;
  status?: Post;
  createdAt: string;
}

// shared/types/index.ts
export * from "./notification";
```

## Migration Notes

The RN app's `src/types/index.ts` now re-exports from shared types:

```typescript
// Before: Duplicated types
export interface User { ... }

// After: Re-export from shared
export * from '@shared/types';
```

This means existing imports still work:

```typescript
import { Post } from "@types"; // Still works!
```

## Best Practices

### ✅ DO

- Keep types minimal and focused
- Use optional properties (`?`) for non-required fields
- Import types using `import type` when possible
- Document complex types with JSDoc comments
- Version types with the API they represent

### ❌ DON'T

- Add platform-specific types here (put in app-specific types)
- Include implementation logic (types only!)
- Make breaking changes without updating both apps
- Duplicate types between files

## Platform-Specific Types

If you need platform-specific type augmentations:

**Web:** Add to `/src/lib/types/`
**RN:** Add to `/ios/mastodon-rn/src/types/` after the re-export

Example:

```typescript
// ios/mastodon-rn/src/types/index.ts
export * from "@shared/types";

// Platform-specific augmentation
export interface NativeMediaAttachment extends MediaAttachment {
  localUri?: string; // RN-specific field
}
```

## Type Versioning

Types should match the Mastodon API version they represent. For breaking changes:

1. Update types to match new API
2. Update both web and RN apps to handle new structure
3. Test thoroughly before deploying

## Testing

After modifying shared types:

```bash
# Test web app compilation
npm run build

# Test RN app compilation
cd ios/mastodon-rn
npx tsc --noEmit
```

## Future Enhancements

Potential improvements:

- Add JSON schema generation
- Create runtime validators
- Generate API client types from OpenAPI spec
- Add type documentation generation

## Questions?

See `SHARED_CODE_PLAN.md` for the overall code sharing strategy.

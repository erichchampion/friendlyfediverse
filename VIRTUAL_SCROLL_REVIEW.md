# Virtual Scrolling Code Review

## Executive Summary

Overall, the virtual scrolling implementation is **well-architected** with good separation of concerns between list view (FlashList) and grid view (ScrollView). However, there are several bugs, edge cases, and optimization opportunities identified below.

---

## Critical Issues 🔴

### 1. **Race Condition in Sticky Header Layout Measurement**
**Location**: `app/(tabs)/feed/[id].tsx:381-414`

**Issue**: The `handleItemLayout` function aggregates header and content heights only after BOTH are measured, but there's no guarantee of measurement order or timing. If a user scrolls quickly before both measurements complete, visibility tracking and scroll calculations will use incomplete data.

```typescript
// Current code waits for both measurements
if (headerLayout && contentLayout) {
  postLayoutsRef.current.set(postId, {
    y: headerLayout.y,
    height: headerLayout.height + contentLayout.height,
  });
}
```

**Impact**:
- Incorrect visibility detection for video autoplay
- Scroll restoration may jump to wrong position
- Average post height calculation may be skewed

**Recommendation**: Add defensive fallback for incomplete measurements:
```typescript
// Use estimated height if only one measurement is available
if (headerLayout || contentLayout) {
  const totalHeight = (headerLayout?.height || averagePostHeightRef.current / 2) +
                      (contentLayout?.height || averagePostHeightRef.current / 2);
  postLayoutsRef.current.set(postId, {
    y: headerLayout?.y || contentLayout?.y || 0,
    height: totalHeight,
  });
}
```

### 2. **Memory Leak in Grid View Retry Timeout**
**Location**: `src/components/feed/FeedGridView.tsx:573-578`

**Issue**: The retry timeout is stored in a ref but may not be cleared if the component unmounts or scrollToPostId changes before all retries complete.

```typescript
retryTimeoutRef.current = setTimeout(checkAndScroll, retryDelay);
```

**Impact**:
- Memory leaks if component unmounts during retry
- Attempts to scroll after component is gone → crashes
- Multiple concurrent retry chains if scrollToPostId changes rapidly

**Recommendation**: Clear timeout in cleanup and when scrollToPostId changes:
```typescript
useEffect(() => {
  return () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };
}, [scrollToPostId]); // Add dependency to clear on change
```

### 3. **Stale Closure in Grid View Scroll Handler**
**Location**: `src/components/feed/FeedGridView.tsx:871-949`

**Issue**: The `handleScroll` callback captures `visibleItems` in its closure, but uses it for change detection. This can cause missed updates when rapid scrolling occurs.

```typescript
if (
  newVisibleItems.size !== visibleItems.size ||
  ![...newVisibleItems].every((id) => visibleItems.has(id))
) {
  setVisibleItems(newVisibleItems);
}
```

**Impact**:
- Stale comparison may prevent visibility updates
- Videos may not autoplay when scrolling quickly

**Recommendation**: Use ref-based comparison:
```typescript
const visibleItemsRef = useRef<Set<string>>(new Set());

// In handleScroll:
if (
  newVisibleItems.size !== visibleItemsRef.current.size ||
  ![...newVisibleItems].every((id) => visibleItemsRef.current.has(id))
) {
  visibleItemsRef.current = newVisibleItems;
  setVisibleItems(newVisibleItems);
}
```

---

## Major Issues 🟠

### 4. **Inconsistent Layout Cleanup Between Views**
**Location**: `app/(tabs)/feed/[id].tsx:290-309`

**Issue**: Layout cleanup only runs for list view, but grid view layouts can also become stale when switching views.

```typescript
useEffect(() => {
  // Clean up post layouts
  postLayoutsRef.current.forEach((_, id) => {
    if (!validIds.has(id)) {
      postLayoutsRef.current.delete(id);
    }
  });
  // ...
}, [displayPosts]);
```

**Impact**:
- Growing memory usage as users switch between views
- Incorrect scroll calculations when returning to a view

**Recommendation**: Add view-specific cleanup or clean both on view switch.

### 5. **Estimated Layout Pre-population Runs on Every Render**
**Location**: `app/(tabs)/feed/[id].tsx:203-213`

**Issue**: The effect re-runs whenever `isGridView` changes, re-estimating all layouts even when switching from list→grid where layouts don't matter.

```typescript
useEffect(() => {
  displayPosts.forEach((post, index) => {
    if (!postLayoutsRef.current.has(post.id)) {
      // Re-calculates even when unnecessary
    }
  });
}, [displayPosts, isGridView]);
```

**Impact**:
- Wasted CPU cycles
- Potential scroll jump if estimates are applied while switching views

**Recommendation**: Only run for list view:
```typescript
useEffect(() => {
  if (isGridView) return; // Skip for grid view
  displayPosts.forEach((post, index) => {
    // ...
  });
}, [displayPosts, isGridView]);
```

### 6. **Double Scroll Compensation in Grid View**
**Location**: `src/components/feed/FeedGridView.tsx:386-419` and `986-1012`

**Issue**: Both the items update effect AND onContentSizeChange try to compensate for scroll position. They may conflict or double-compensate.

**Impact**:
- Scroll position jumps or over-compensation
- Inconsistent behavior when posts are removed

**Recommendation**: Consolidate compensation logic in one place or add guards to prevent double execution.

### 7. **Missing Error Handling in measureInWindow**
**Location**: `src/components/feed/FeedGridView.tsx:638-654`

**Issue**: `measureInWindow` can fail or return invalid values, but there's no error handling.

```typescript
scrollViewRef.current.measureInWindow((scrollX: number, scrollY: number) => {
  // No validation of values
  const contentRelativeY = (y - scrollY) + scrollOffset;
});
```

**Impact**:
- Invalid position calculations stored
- Scroll restoration fails silently

**Recommendation**: Add validation:
```typescript
scrollViewRef.current?.measureInWindow?.((scrollX, scrollY, width, height) => {
  if (typeof scrollY !== 'number' || scrollY < 0) return;
  // ...
});
```

---

## Minor Issues 🟡

### 8. **Unused renderPost Function**
**Location**: `app/(tabs)/feed/[id].tsx:452-482`

**Issue**: The `renderPost` function is defined but never used after the sticky header refactor. Only `renderFlashListItem` is used.

**Impact**: Code bloat, confusion

**Recommendation**: Remove the unused function.

### 9. **Duplicate End Reached Logic**
**Location**: `app/(tabs)/feed/[id].tsx:567-594` and `596-608`

**Issue**: Both `handleScroll` and `handleEndReached` implement pagination logic. The comment says `handleEndReached` is "kept for compatibility" but it's redundant.

**Impact**:
- Confusion about which is used
- Potential double-loading if both fire

**Recommendation**: Remove `handleEndReached` if truly unused, or consolidate.

### 10. **Magic Numbers Not in Config**
**Location**: Multiple locations

**Issue**: Several magic numbers aren't in UI_CONFIG:
- `200` px for pagination threshold (appears in both views)
- `1000` ms for end reached debounce
- `50%` visibility buffer ratio hardcoded in grid view

**Impact**:
- Inconsistent behavior if values drift
- Harder to tune performance

**Recommendation**: Move all to `UI_CONFIG`:
```typescript
UI_CONFIG = {
  PAGINATION_THRESHOLD: 200,
  END_REACHED_DEBOUNCE: 1000,
  GRID_VISIBILITY_BUFFER_RATIO: 0.5,
  // ...
}
```

### 11. **Grid View Column Distribution Not Memoized Correctly**
**Location**: `src/components/feed/FeedGridView.tsx:289-358`

**Issue**: The `useMemo` depends on `posts` and `itemColumnMapRef.current`, but `itemColumnMapRef.current` is a ref and doesn't trigger re-memos. Changes to column assignments won't cause recalculation.

**Impact**:
- Stale column assignments if items are reordered
- Potential layout inconsistencies

**Recommendation**: Remove ref from dependency or redesign:
```typescript
const { gridItems, columns } = useMemo(() => {
  // ... column distribution logic
}, [posts]); // itemColumnMapRef.current shouldn't be a dependency
```

### 12. **Inconsistent Scroll Debounce Timing**
**Location**: Multiple

**Issue**: List view uses `UI_CONFIG.SCROLL_DEBOUNCE_DELAY` (1000ms) but grid view uses hardcoded `1000` in timeout.

**Impact**: If config changes, grid view won't update

**Recommendation**: Use config consistently everywhere.

---

## Performance Opportunities ⚡

### 13. **Excessive Array Iterations in Visibility Tracking**
**Location**: `src/components/feed/FeedGridView.tsx:905-946`

**Issue**: Multiple array operations in hot path:
- `gridItems.find()` in loop
- `Array.from().map().filter().sort()`
- Creates new arrays on every scroll event

**Impact**: CPU spikes during scrolling

**Recommendation**: Pre-compute itemId→feedItemId map:
```typescript
const itemIdToFeedItemIdMap = useMemo(() => {
  const map = new Map<string, string>();
  gridItems.forEach(item => map.set(item.id, item.feedItemId));
  return map;
}, [gridItems]);

// In handleScroll:
newVisibleItems.forEach((itemId) => {
  const feedItemId = itemIdToFeedItemIdMap.get(itemId);
  if (feedItemId) newVisiblePosts.add(feedItemId);
});
```

### 14. **Redundant Set Spread Operations**
**Location**: Multiple visibility comparison blocks

**Issue**: Converting Set to Array for comparison on every scroll:
```typescript
![...newVisibleItems].every((id) => visibleItems.has(id))
```

**Impact**: Unnecessary allocations in hot path

**Recommendation**: Use helper function:
```typescript
const setsEqual = (a: Set<string>, b: Set<string>) => {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
};
```

### 15. **Layout Measurement on Every Render**
**Location**: `src/components/feed/FeedGridView.tsx:676`

**Issue**: `handleItemLayout` is called in a setTimeout on every render:
```typescript
setTimeout(() => handleItemLayout(item.id, ref), 0);
```

**Impact**: Excessive measurements even when layout hasn't changed

**Recommendation**: Only measure when ref changes or layout invalidated:
```typescript
const prevRefRef = useRef<any>(null);
if (ref && ref !== prevRefRef.current) {
  prevRefRef.current = ref;
  setTimeout(() => handleItemLayout(item.id, ref), 0);
}
```

---

## Edge Cases 🔍

### 16. **Empty Posts Array Handling**
**Location**: `app/(tabs)/feed/[id].tsx:217-239`

**Issue**: Scroll restoration checks `feedItems.length > 0` but doesn't handle the case where feedItems becomes empty after being populated.

**Impact**: If all posts are deleted, restoration logic doesn't reset state

**Recommendation**: Add reset logic:
```typescript
useEffect(() => {
  if (feedItems.length === 0) {
    currentPostIdRef.current = null;
    // Reset other restoration state
  }
}, [feedItems.length]);
```

### 17. **Reblog Handling in Grid View Scroll Target**
**Location**: `src/components/feed/FeedGridView.tsx:513-515`

**Issue**: Searches by `feedItemId` but doesn't consider that a reblog might have a different ID than the original post.

**Impact**: Scroll restoration fails for reblogged posts

**Recommendation**: Check both IDs like list view does:
```typescript
const targetItem = gridItems.find(
  (item) => item.feedItemId === scrollToPostId || item.displayPostId === scrollToPostId
);
```

### 18. **Visibility Buffer Asymmetry**
**Location**: Different buffer ratios between views

**Issue**:
- List view: `UI_CONFIG.VISIBILITY_BUFFER_RATIO` (0.5)
- Grid view: Hardcoded `0.5` in code

**Impact**: Inconsistent autoplay behavior when switching views

**Recommendation**: Use same config value everywhere.

---

## Type Safety Issues 🔧

### 19. **Any Type in Event Handlers**
**Location**: Multiple scroll handlers

**Issue**: Event parameter typed as `any`:
```typescript
const handleScroll = useCallback((event: any) => {
```

**Impact**: No type safety, potential runtime errors

**Recommendation**: Use proper React Native types:
```typescript
import { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

const handleScroll = useCallback(
  (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // ...
  }
);
```

### 20. **NodeJS.Timeout Type Inconsistency**
**Location**: `src/components/feed/FeedGridView.tsx:208, 234`

**Issue**: Uses `NodeJS.Timeout` type but TypeScript errors suggest it should be `number` for setTimeout in browser/RN environment.

**Impact**: Type errors in some environments

**Recommendation**: Use ReturnType:
```typescript
const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

---

## Recommendations Summary

### High Priority
1. ✅ Fix race condition in layout measurement (Issue #1)
2. ✅ Fix memory leak in retry timeout (Issue #2)
3. ✅ Fix stale closure in scroll handler (Issue #3)
4. ✅ Add consistent layout cleanup (Issue #4)

### Medium Priority
5. ⚠️ Remove duplicate scroll compensation (Issue #6)
6. ⚠️ Add error handling to measureInWindow (Issue #7)
7. ⚠️ Consolidate pagination logic (Issue #9)
8. ⚠️ Optimize visibility tracking (Issue #13)

### Low Priority
9. 📝 Clean up unused code (Issue #8)
10. 📝 Move magic numbers to config (Issue #10)
11. 📝 Improve type safety (Issues #19, #20)
12. 📝 Handle edge cases (Issues #16, #17, #18)

---

## Overall Assessment

**Grade: B+**

The code demonstrates strong architectural decisions (FlashList for performance, separated concerns, comprehensive scroll restoration). However, there are several race conditions, memory leaks, and optimization opportunities that should be addressed.

The sticky header implementation is solid but introduced the layout measurement race condition that needs fixing. Grid view has more technical debt, particularly around scroll position tracking and retry logic.

**Estimated effort to address all issues**: 2-3 days

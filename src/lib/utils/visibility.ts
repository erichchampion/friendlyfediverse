export interface ItemLayout {
  y: number;
  height: number;
}

/**
 * Returns IDs whose layout intersects the viewport (with buffer)
 */
export const computeVisibleIds = (
  layouts: Map<string, ItemLayout>,
  scrollY: number,
  viewportHeight: number,
  bufferRatio = 0.5,
): Set<string> => {
  const buffer = viewportHeight * bufferRatio;
  const visibleTop = Math.max(0, scrollY - buffer);
  const visibleBottom = scrollY + viewportHeight + buffer;

  const visibleIds = new Set<string>();
  layouts.forEach((layout, id) => {
    const itemTop = layout.y;
    const itemBottom = layout.y + layout.height;
    if (itemBottom >= visibleTop && itemTop <= visibleBottom) {
      visibleIds.add(id);
    }
  });

  return visibleIds;
};

import { useEffect, useRef, useState } from 'react';

/** Measures the card grid so unloaded rows can be reserved as scroll height, keeping the scrollbar steady while paging. */
export function useGridSpacer(remaining: number, deps: unknown[]) {
  const grid = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState({ columns: 1, height: 0 });
  useEffect(() => {
    const node = grid.current;
    if (!node) return;
    const measure = () => {
      const card = node.querySelector<HTMLElement>('.catalog-card');
      if (!card) return;
      const style = getComputedStyle(node);
      const columns = Math.max(1, style.gridTemplateColumns.split(' ').length);
      setRowHeight({ columns, height: card.offsetHeight + (parseFloat(style.rowGap) || 0) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, deps);
  const spacerHeight = remaining && rowHeight.height ? Math.ceil(remaining / rowHeight.columns) * rowHeight.height : 0;
  return { grid, spacerHeight };
}

'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Timestamp {
  text: string;
  startMs: number;
  endMs: number;
}

interface Props {
  timestamps: Timestamp[];
  currentTimeMs: number;
  isPlaying: boolean;
  contentRef: React.RefObject<HTMLDivElement | null>;
  activeClassName: string;
  onChunkClick?: (startMs: number) => void;
}

export default function KaraokeHighlight({
  timestamps,
  currentTimeMs,
  isPlaying,
  contentRef,
  activeClassName,
  onChunkClick,
}: Props) {
  const prevIndexRef = useRef(-1);

  // Active chunk is fully derived from the current playback time — no state.
  const activeIndex =
    !isPlaying || timestamps.length === 0
      ? -1
      : timestamps.findIndex((ts) => currentTimeMs >= ts.startMs && currentTimeMs < ts.endMs);

  // Apply highlighting to matching text chunks in the content
  useEffect(() => {
    if (!contentRef.current) return;

    // Remove previous highlights
    const prevHighlights = contentRef.current.querySelectorAll(`.${activeClassName}`);
    prevHighlights.forEach((el) => el.classList.remove(activeClassName));

    if (activeIndex < 0 || activeIndex >= timestamps.length) return;

    const chunk = timestamps[activeIndex];
    if (!chunk.text) return;

    // Find text node containing this chunk
    const chunkDataEl = contentRef.current.querySelector(
      `[data-chunk-index="${activeIndex}"]`,
    );

    if (chunkDataEl) {
      chunkDataEl.classList.add(activeClassName);

      // Auto-scroll to active chunk
      if (activeIndex !== prevIndexRef.current) {
        chunkDataEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        prevIndexRef.current = activeIndex;
      }
    }
  }, [activeIndex, timestamps, contentRef, activeClassName]);

  // Handle click on chunk
  const handleChunkClick = useCallback(
    (index: number) => {
      if (onChunkClick && timestamps[index]) {
        onChunkClick(timestamps[index].startMs);
      }
    },
    [timestamps, onChunkClick],
  );

  // Expose chunk click handler for parent to bind
  useEffect(() => {
    const content = contentRef.current;
    if (!content || !onChunkClick) return;

    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      const chunkEl = target.closest('[data-chunk-index]');
      if (chunkEl) {
        const index = parseInt(chunkEl.getAttribute('data-chunk-index') || '-1');
        if (index >= 0) handleChunkClick(index);
      }
    };

    content.addEventListener('click', handler);
    return () => {
      content.removeEventListener('click', handler);
    };
  }, [contentRef, handleChunkClick, onChunkClick]);

  return null; // This component operates via DOM manipulation, no rendered output
}

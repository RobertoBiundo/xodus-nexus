import { useSyncExternalStore } from 'react';

type SharedBackdrop = { src: string; at: number };
let sharedBackdrop: SharedBackdrop | undefined;
let pageArt: string | undefined;
let overrideArt: string | undefined;
let accountPool: string[] = [];
const sharedListeners = new Set<() => void>();
const notify = () => sharedListeners.forEach(listener => listener());
/** Backdrop artwork state kept at module level so it survives navigation. */
export const backdropStore = {
  /** The rotating artwork for the browsing pages and when it was chosen. */
  get: () => sharedBackdrop,
  set(src: string) { sharedBackdrop = { src, at: Date.now() }; notify(); },
  /** Artwork currently requested by a browsing page (undefined on pages without a backdrop). */
  setPage(src?: string) { if (pageArt !== src) { pageArt = src; notify(); } },
  setOverride(src?: string) { if (overrideArt !== src) { overrideArt = src; notify(); } },
  /** Artwork reported by the account library once loaded; preferred over the user's own game art. */
  getAccountPool: () => accountPool,
  setAccountPool(urls: string[]) { accountPool = urls; },
  display: () => overrideArt ?? pageArt,
  subscribe(listener: () => void) { sharedListeners.add(listener); return () => { sharedListeners.delete(listener); }; },
};

/** True while any page artwork is requested; lets CSS switch the app chrome to its glass look. */
export const useHasBackdrop = () => useSyncExternalStore(backdropStore.subscribe, () => !!backdropStore.display());

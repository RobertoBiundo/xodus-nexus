import { useEffect, useRef, useState } from 'react';
import type { Game } from '../shared/types';
import { backdropStore } from './backdrop-store';
import { BACKDROP_INTERVAL_MS } from './constants';

/** Shared rotating artwork for the browsing pages (Home, Store, My Library, On this PC). */
export function PageBackdrop({ games }: { games: Game[] }) {
  const accountPool = backdropStore.getAccountPool();
  const own = games.flatMap(game => game.heroUrl ?? []);
  const pool = [...accountPool, ...(accountPool.length ? own : own.length ? own : games.flatMap(game => game.coverUrl ?? []))];
  const src = useRotatingBackdrop(pool);
  useEffect(() => { backdropStore.setPage(src); return () => backdropStore.setPage(undefined); }, [src]);
  return null;
}

function useRotatingBackdrop(pool: string[]): string | undefined {
  const [src, setSrc] = useState(() => backdropStore.get()?.src);
  const poolRef = useRef(pool);
  poolRef.current = pool;
  const ready = pool.length > 0;
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      window.clearTimeout(timer);
      const current = backdropStore.get();
      if (poolRef.current.length && (!current || Date.now() - current.at >= BACKDROP_INTERVAL_MS)) {
        const options = poolRef.current.filter(url => url !== current?.src);
        const next = options[Math.floor(Math.random() * options.length)] ?? poolRef.current[0];
        backdropStore.set(next);
        return;
      }
      const latest = backdropStore.get();
      setSrc(latest?.src);
      if (latest) timer = window.setTimeout(tick, Math.max(1000, BACKDROP_INTERVAL_MS - (Date.now() - latest.at)));
    };
    const unsubscribe = backdropStore.subscribe(tick);
    tick();
    return () => { unsubscribe(); window.clearTimeout(timer); };
  }, [ready]);
  return src;
}

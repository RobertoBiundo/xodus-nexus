import { useEffect, useRef, useState } from 'react';
import type { AccountLibraryPage, AppSnapshot } from '../shared/types';
import { errorMessage } from './errors';
import { SEARCH_DEBOUNCE_MS } from './constants';

interface Options {
  data: AppSnapshot;
  kind: AccountLibraryPage['kind'];
  query: string;
  /** Installed games come from the snapshot, so they never need account pages. */
  installedOnly: boolean;
  /** Number of active facet filters; filtering needs every page loaded before reporting no matches. */
  facetCount: number;
}

/** Loads the account library page by page and keeps it tied to the signed-in account. */
export function useAccountLibrary({ data, kind, query, installedOnly, facetCount }: Options) {
  const [result, setResult] = useState<AccountLibraryPage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    if (!query.trim()) { setSearchTerm(''); return; }
    const timer = window.setTimeout(() => setSearchTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);
  const identity = `${data.auth.stored}:${data.auth.username}:${data.auth.running}:${data.settings.market}:${data.backend.binaryPath}:${kind}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [loadedIdentity, setLoadedIdentity] = useState(identity);
  const available = data.auth.stored === true && !data.auth.running && Boolean(data.backend.capabilities.library);
  useEffect(() => {
    let cancelled = false;
    setResult(undefined); setLoadedIdentity(identity); setError(undefined);
    if (!available) { setBusy(false); return; }
    setBusy(true);
    window.launcher.getAccountLibrary(kind).then(value => { if (!cancelled) setResult(value); })
      .catch(error => { if (!cancelled) setError(errorMessage(error)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [identity, available]);
  // Never display the previous account's cards while the identity effect settles.
  const visible = loadedIdentity === identity ? result : undefined;
  // Account searches must resolve every remaining licensed page before reporting no matches.
  const searching = available && !installedOnly && (Boolean(query.trim()) || facetCount > 0) && !error && (busy || Boolean(visible?.cursor));
  const loading = useRef(false);
  async function load(refresh = false) {
    if (loading.current) return;
    loading.current = true;
    setBusy(true); setError(undefined);
    try {
      const next = await window.launcher.getAccountLibrary(kind, refresh ? undefined : visible?.cursor, refresh);
      if (currentIdentity.current !== identity) return;
      if (!refresh && visible?.cursor && next.cursor === visible.cursor) throw Error('Library pagination did not advance. Refresh the library to try again.');
      setResult(old => ({ ...next, products: refresh ? next.products : [...(old?.products ?? []), ...next.products.filter(p => !old?.products.some(old => old.productId === p.productId))] }));
    } catch (error) { if (currentIdentity.current === identity) setError(errorMessage(error)); }
    finally { loading.current = false; if (currentIdentity.current === identity) setBusy(false); }
  }
  useEffect(() => {
    if (!searching || busy || !visible?.cursor || searchTerm !== query.trim()) return;
    void load();
  }, [identity, searching, busy, visible?.cursor, searchTerm, query, facetCount]);
  return { visible, busy, error, available, searching, load, loadingCards: available && !error && busy && !visible && !installedOnly };
}

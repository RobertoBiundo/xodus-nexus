import { randomUUID } from 'node:crypto';
import { spawnTracked } from './process.js';
import { backendDiagnostic } from './backend-diagnostics.js';
import { sessionFailureMessage } from './session-errors.js';
import type { AccountLibraryPage, CatalogProduct } from '../shared/types.js';

interface Entitlement {
  productId: string; status: string; isTrial: boolean; sharingSource: string;
  endDate: string; satisfiedByProductId?: string | null; special: boolean;
}
type Kind = AccountLibraryPage['kind'];
type Reader = (binary: string, market: string, signal: AbortSignal) => Promise<string>;
type Catalog = (ids: string[], market: string) => Promise<CatalogProduct[]>;
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Z0-9]{12}$/.test(value);
const plans = new Set(['CFQ7TTC0KGQ8', 'CFQ7TTC0KHS0', 'CFQ7TTC0P85B', 'CFQ7TTC0K5DJ', 'CFQ7TTC0K6L8', 'CFQ7TTC10QFD']);
const TTL = 5 * 60_000;
const BATCH_SIZE = 60; // catalog lookup limit
const PAGE_SIZE = 120;

export function parseEntitlements(output: string, account: string, market: string, now = Date.now()): { checkedAt: string; entries: Map<string, Entitlement>; skipped: number } {
  if (output.length > 8_000_000) throw Error('Account library response is too large.');
  const line = output.split('\n').reverse().find(line => line.trimStart().startsWith('{'));
  const result = JSON.parse(line ?? '');
  if (!result || result.schema !== 1 || result.account !== account || result.market !== market
    || typeof result.checkedAt !== 'string' || !Array.isArray(result.entitlements) || result.entitlements.length > 10_000) throw Error('Invalid account library response.');
  const age = now - Date.parse(result.checkedAt);
  if (!Number.isFinite(age) || age < -60_000 || age >= TTL) throw Error('Stale account library response.');
  const entries = new Map<string, Entitlement>();
  const seen = new Set<string>(), blocked = new Set<string>();
  if (result.skippedEntitlements !== undefined && (!Number.isInteger(result.skippedEntitlements) || result.skippedEntitlements < 0 || result.skippedEntitlements > 200_000)) throw Error('Invalid skipped entitlement count.');
  for (const row of result.entitlements) {
    if (!row || !id(row.productId)) continue;
    const duplicate = seen.has(row.productId); seen.add(row.productId);
    if (duplicate || typeof row.status !== 'string' || row.status.length >= 40
      || typeof row.isTrial !== 'boolean' || typeof row.special !== 'boolean' || typeof row.sharingSource !== 'string'
      || row.sharingSource.length >= 40 || typeof row.endDate !== 'string' || row.endDate.length >= 50 || !Number.isFinite(Date.parse(row.endDate))
      || (row.satisfiedByProductId != null && !id(row.satisfiedByProductId))) { blocked.add(row.productId); entries.delete(row.productId); continue; }
    entries.set(row.productId, row);
  }
  // Quarantine descendants as well, including known subscription IDs. An invalid
  // parent must never turn its child's bundle/subscription reference into access.
  const children = new Map<string, string[]>();
  for (const [product, row] of entries) if (row.satisfiedByProductId) {
    const list = children.get(row.satisfiedByProductId) ?? []; list.push(product); children.set(row.satisfiedByProductId, list);
  }
  const queue = [...blocked];
  for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i]) ?? []) {
    if (!blocked.has(child)) { blocked.add(child); queue.push(child); entries.delete(child); }
  }
  const skipped = Math.min(200_000, (result.skippedEntitlements ?? 0) + result.entitlements.length - entries.size);
  if (skipped) backendDiagnostic({ operation: 'library', event: 'validation', stage: 'partial', skipped });
  return { checkedAt: result.checkedAt, entries, skipped };
}

/** Parent chains must themselves be licensed; unknown/trial/shared access is not ownership. */
export function entitlementKind(productId: string, entries: Map<string, Entitlement>, now = Date.now(), visited = new Set<string>()): Exclude<Kind, 'all'> | undefined {
  if (visited.has(productId) || visited.size >= 16) return;
  const item = entries.get(productId);
  if (!item || item.status !== 'Active' || item.isTrial || item.special || item.sharingSource !== 'None'
    || Date.parse(item.endDate) <= now) return;
  const parent = item.satisfiedByProductId;
  if (!parent) return plans.has(productId) ? undefined : 'owned';
  if (plans.has(parent)) return 'gamepass';
  return entitlementKind(parent, entries, now, new Set([...visited, productId]));
}

async function read(binary: string, market: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const tracked = spawnTracked(binary, ['library', '--json', '--market', market], { maxOutput: 8_000_000, stdoutOnly: true });
  let diagnostics = '';
  const stderr = (bytes: Buffer) => { diagnostics = (diagnostics + bytes.toString('utf8')).slice(-64_000); };
  tracked.child.stderr.on('data', stderr);
  const stop = () => { tracked.child.kill('SIGKILL'); };
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();
  const timer = setTimeout(stop, 50_000); timer.unref();
  try {
    const result = await tracked.result; signal.throwIfAborted();
    if (result.code !== 0) throw Error(sessionFailureMessage(diagnostics) ?? 'Microsoft account licenses could not be loaded. Try Refresh later.');
    return result.output;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', stop); tracked.child.stderr.removeListener('data', stderr); }
}

/** Credentials stay in the CLI. Account-bound memory only, no license dumps in UI/disk logs. */
export class AccountLibrary {
  private identity?: { account: string; binary: string; market: string };
  private generation = 0;
  private controller?: AbortController;
  private cached?: { checkedAt: string; entries: Map<string, Entitlement>; skipped: number; until: number; key: string };
  private job?: Promise<void>;
  private pages = new Map<string, AccountLibraryPage>();
  // Catalog metadata per product for the current snapshot, so every filter pages through one title-sorted list.
  private resolved = new Map<string, CatalogProduct | undefined>();
  constructor(private catalog: Catalog, private reader: Reader = read) {}
  reset(): void {
    this.generation++; this.controller?.abort(); this.controller = undefined;
    this.cached = undefined; this.job = undefined; this.pages.clear(); this.resolved.clear();
  }
  select(account: string | undefined, binary: string | undefined, market: string): void {
    const normalized = /^[A-Z]{2}$/.test(market.toUpperCase()) ? market.toUpperCase() : 'US';
    const next = account && binary ? { account, binary, market: normalized } : undefined;
    if (JSON.stringify(this.identity) !== JSON.stringify(next)) { this.reset(); this.identity = next; }
  }
  private async load(cursor?: string, refresh = false): Promise<NonNullable<AccountLibrary['cached']>> {
    const identity = this.identity;
    if (!identity) throw Error('Sign in and update the Xodus backend to load account games.');
    if (refresh) { this.reset(); cursor = undefined; }
    const generation = this.generation;
    const current = () => { if (generation !== this.generation) throw Error('Account library changed. Refresh this page.'); };
    if (!this.cached || this.cached.until <= Date.now()) {
      if (cursor) throw Error('Library results expired. Refresh this page.');
      if (!this.job) {
        const controller = new AbortController(); this.controller = controller;
        this.job = (async () => {
          const output = await this.reader(identity.binary, identity.market, controller.signal);
          let data: ReturnType<typeof parseEntitlements>;
          try { data = parseEntitlements(output, identity.account, identity.market); }
          catch (error) {
            backendDiagnostic({ operation: 'library', event: 'validation', stage: 'invalid-response' });
            throw error;
          }
          current();
          this.cached = { ...data, until: Date.parse(data.checkedAt) + TTL, key: randomUUID() };
          this.pages.clear(); this.resolved.clear();
        })().finally(() => { if (generation === this.generation) { this.controller = undefined; this.job = undefined; } });
      }
      await this.job;
    }
    current();
    return this.cached!;
  }
  /** Scoped callers can read access without fetching unrelated library artwork. */
  async access(refresh = false): Promise<{ checkedAt: string; accessByProductId: AccountLibraryPage['accessByProductId'] }> {
    const cached = await this.load(undefined, refresh);
    if (cached !== this.cached || !this.identity) throw Error('Account library changed. Refresh this page.');
    const accessByProductId: AccountLibraryPage['accessByProductId'] = {};
    for (const product of cached.entries.keys()) {
      const access = entitlementKind(product, cached.entries);
      if (access) accessByProductId[product] = access;
    }
    return { checkedAt: cached.checkedAt, accessByProductId };
  }
  async get(kind: Kind, cursor?: string, refresh = false): Promise<AccountLibraryPage> {
    if (kind !== 'all' && kind !== 'owned' && kind !== 'gamepass') throw Error('Invalid library filter.');
    if (typeof refresh !== 'boolean' || (cursor !== undefined && typeof cursor !== 'string')) throw Error('Invalid library request.');
    const cached = await this.load(cursor, refresh);
    if (cached !== this.cached || !this.identity) throw Error('Account library changed. Refresh this page.');
    if (refresh) cursor = undefined;
    const identity = this.identity!;
    const generation = this.generation;
    const current = () => { if (generation !== this.generation) throw Error('Account library changed. Refresh this page.'); };
    const accessByProductId: AccountLibraryPage['accessByProductId'] = {};
    for (const product of cached.entries.keys()) {
      const access = entitlementKind(product, cached.entries);
      if (access) accessByProductId[product] = access;
    }
    // Stable offsets within one snapshot even when a license expires mid-page.
    const checked = Date.parse(cached.checkedAt);
    const snapshotAccess = new Map([...cached.entries.keys()].map(product => [product, entitlementKind(product, cached.entries, checked)]));
    const ids = [...cached.entries.keys()].filter(product => snapshotAccess.get(product) && (kind === 'all' || snapshotAccess.get(product) === kind))
      .sort((a,b) => Number(snapshotAccess.get(b) === 'owned') - Number(snapshotAccess.get(a) === 'owned') || a.localeCompare(b));
    let offset = 0;
    if (cursor) {
      const match = cursor.match(/^([a-f0-9-]{36}):(all|owned|gamepass):(\d{1,5})$/);
      if (!match || match[1] !== cached.key || match[2] !== kind) throw Error('Invalid or expired library page.');
      offset = Number(match[3]);
      if (offset % PAGE_SIZE) throw Error('Invalid library page offset.');
    }
    const key = `${kind}:${offset}`;
    const existing = this.pages.get(key);
    if (existing) return structuredClone({ ...existing, accessByProductId, products: existing.products.filter(p => accessByProductId[p.productId]) });
    // Titles are only known from the catalog, so resolve the whole licensed set (in parallel batches) and
    // page through it sorted by title; paging by product id would interleave the alphabet on every page.
    const missing = ids.filter(product => !this.resolved.has(product));
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += BATCH_SIZE) batches.push(missing.slice(i, i + BATCH_SIZE));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, batches.length) }, async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        const found = await this.catalog(batch, identity.market);
        for (const product of found) if (batch.includes(product.productId)) this.resolved.set(product.productId, product);
        for (const product of batch) if (!this.resolved.has(product)) this.resolved.set(product, undefined);
      }
    }));
    current();
    if (this.cached !== cached) throw Error('Library results changed. Refresh this page.');
    const sorted = ids.flatMap(product => { const value = this.resolved.get(product); return value && accessByProductId[product] ? [{ ...value, access: accessByProductId[product]! }] : []; })
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) || a.productId.localeCompare(b.productId));
    if (offset > sorted.length) throw Error('Invalid library page offset.');
    const page: AccountLibraryPage = { kind, checkedAt: cached.checkedAt, accessByProductId, skippedEntitlements: cached.skipped,
      products: sorted.slice(offset, offset + PAGE_SIZE), total: sorted.length,
      cursor: offset + PAGE_SIZE < sorted.length ? `${cached.key}:${kind}:${offset + PAGE_SIZE}` : undefined };
    this.pages.set(key, page);
    return structuredClone(page);
  }
}

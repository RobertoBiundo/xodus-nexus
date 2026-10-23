import type { AccountLibraryPage, Game } from '../shared/types';
import { facetKeys, facetRatings, productFacets, type FacetKey } from './library-facets';
import { libraryProductMatchesPlayState, type LibraryFilters } from './library-preferences';
import { normalizeTitle } from './library-utils';

type AccountProduct = AccountLibraryPage['products'][number];

export interface LibraryRow {
  id: string;
  title: string;
  game?: Game;
  product?: AccountProduct;
  facets: Record<FacetKey, string[]>;
}

export type FacetSelection = Partial<Record<FacetKey, string[]>>;

interface Input {
  games: Game[];
  page?: AccountLibraryPage;
  kind: AccountLibraryPage['kind'];
  playState: LibraryFilters['playState'];
  query: string;
  facets: FacetSelection;
}

const productKey = (row: LibraryRow) => row.product ? (row.product.installProductId ?? row.product.productId).toUpperCase() : row.id;
const byTitle = (a: { title: string; id: string }, b: { title: string; id: string }) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id);

/** Account products that are not already installed, one per title (preferring owned over Game Pass). */
export function uninstalledProducts(games: Game[], products: AccountProduct[]): AccountProduct[] {
  const installed = new Set(games.flatMap(game => game.storeId?.toUpperCase() ?? []));
  const installedTitles = new Set(games.map(game => normalizeTitle(game.title)));
  return [...products].sort((a, b) => Number(b.access === 'owned') - Number(a.access === 'owned'))
    .filter(product => !installed.has(product.productId) && !installed.has(product.installProductId ?? '') && !installedTitles.has(normalizeTitle(product.title)))
    .filter((product, index, all) => all.findIndex(other => normalizeTitle(other.title) === normalizeTitle(product.title)) === index);
}

/** Merges installed games and account products into the sorted, filtered rows shown in the library. */
export function buildLibraryRows({ games, page, kind, playState, query, facets }: Input): { rows: LibraryRow[]; facetOptions: Record<FacetKey, string[]> } {
  const products = page?.products ?? [];
  const access = (game: Game) => game.storeId ? page?.accessByProductId[game.storeId.toUpperCase()] : undefined;
  const metaById = new Map(products.map(product => [product.productId, product]));
  const metaByTitle = new Map(products.map(product => [normalizeTitle(product.title), product]));
  const needle = query.trim().toLocaleLowerCase();
  const candidates: LibraryRow[] = [
    ...games.filter(game => playState !== 'installable' && (kind === 'all' || access(game) === kind))
      .map(game => ({ id: game.id, title: game.title, game, facets: productFacets(metaById.get(game.storeId?.toUpperCase() ?? '') ?? metaByTitle.get(normalizeTitle(game.title)), true) })),
    ...uninstalledProducts(games, products).filter(product => libraryProductMatchesPlayState(product, playState))
      .map(product => ({ id: product.productId, title: product.title, product, facets: productFacets(product, false) })),
  ].filter(row => row.title.toLocaleLowerCase().includes(needle));
  const facetOptions = Object.fromEntries(facetKeys.map(key => {
    const values = new Set<string>(candidates.flatMap(row => row.facets[key]));
    for (const selected of facets[key] ?? []) values.add(selected);
    const sorted = [...values].sort((a, b) => key === 'year' ? b.localeCompare(a) : a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
    return [key, key === 'rating' ? facetRatings.filter(value => values.has(value)) : sorted];
  })) as Record<FacetKey, string[]>;
  const active = facetKeys.filter(key => facets[key]?.length);
  const rows = candidates
    .filter(row => active.every(key => row.facets[key].some(value => facets[key]!.includes(value))))
    .sort(byTitle)
    // Pages can overlap or repeat a package under another id; duplicate React keys would also duplicate DOM nodes.
    .filter((row, index, all) => all.findIndex(other => productKey(other) === productKey(row)) === index);
  return { rows, facetOptions };
}

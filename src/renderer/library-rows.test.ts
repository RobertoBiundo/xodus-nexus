import { describe, expect, it } from 'vitest';
import type { AccountLibraryPage, Game } from '../shared/types';
import { buildLibraryRows, uninstalledProducts } from './library-rows';
import { productFacets } from './library-facets';
import { installDestination, installFolderName, libraryLetter, normalizeTitle } from './library-utils';
import { loadLibraryView, saveLibraryView } from './library-preferences';

type Product = AccountLibraryPage['products'][number];
const product = (title: string, extra: Partial<Product> = {}) => ({ productId: title.replace(/\W/g, '').toUpperCase().padEnd(12, '0').slice(0, 12), title, access: 'owned', installability: 'supported', ...extra }) as Product;
const game = (title: string, extra: Partial<Game> = {}) => ({ id: title, title, ...extra }) as Game;
const page = (products: Product[]) => ({ products, accessByProductId: {} }) as unknown as AccountLibraryPage;

describe('library rows', () => {
  it('sorts installed games and account products together, A to Z', () => {
    const { rows } = buildLibraryRows({ games: [game('Zeta'), game('alpha')], page: page([product('Mid'), product('Beta')]), kind: 'all', playState: 'all', query: '', facets: {} });
    expect(rows.map(row => row.title)).toEqual(['alpha', 'Beta', 'Mid', 'Zeta']);
  });

  it('shows one card per title, preferring the owned license, and hides installed titles', () => {
    const products = uninstalledProducts([game('Installed')], [
      product('Doom', { productId: 'GAMEPASS0001', access: 'gamepass' }), product('Doom', { productId: 'OWNED0000001' }), product('installed '),
    ]);
    expect(products.map(item => item.productId)).toEqual(['OWNED0000001']);
  });

  it('filters by search text and by facets (values within one facet are ORed)', () => {
    const products = [product('Halo', { publisher: 'Xbox', categories: ['Shooter'] }), product('Forza', { publisher: 'Xbox', categories: ['Racing'] }), product('Hades', { publisher: 'Supergiant', categories: ['Action'] })];
    const input = { games: [], page: page(products), kind: 'all' as const, playState: 'all' as const };
    expect(buildLibraryRows({ ...input, query: 'ha', facets: {} }).rows.map(row => row.title)).toEqual(['Hades', 'Halo']);
    expect(buildLibraryRows({ ...input, query: '', facets: { publisher: ['Xbox'], genre: ['Racing', 'Action'] } }).rows.map(row => row.title)).toEqual(['Forza']);
  });

  it('keeps a selected facet value available even when no row has it', () => {
    const { facetOptions } = buildLibraryRows({ games: [], page: page([product('Halo', { publisher: 'Xbox' })]), kind: 'all', playState: 'all', query: '', facets: { publisher: ['Gone'] } });
    expect(facetOptions.publisher).toEqual(['Gone', 'Xbox']);
  });
});

describe('library facets', () => {
  it.each([[undefined, 'Not rated'], [0, 'Not rated'], [4.5, '4 stars & up'], [3, '3 stars & up'], [2.2, '2 stars & up'], [1.5, 'Under 2 stars']])('buckets rating %s as %s', (averageRating, label) => {
    expect(productFacets({ averageRating } as Product, false).rating).toEqual([label]);
  });
  it('reports pricing, compatibility and installation', () => {
    const facets = productFacets({ purchasePrice: 'Free', includedWith: 'Game Pass', installability: 'unknown' } as Product, true);
    expect(facets.pricing).toEqual(['Free', 'Included with Game Pass']);
    expect(facets.support).toEqual(['Unverified']);
    expect(facets.installed).toEqual(['Installed']);
  });
});

describe('library utils', () => {
  it('normalizes titles', () => expect(normalizeTitle('  Halo ')).toBe('halo'));
  it('builds safe install folders', () => {
    expect(installFolderName('Halo: The Master Chief Collection!', 'ID')).toBe('Halo-The-Master-Chief-Collection');
    expect(installFolderName('!!!', 'FALLBACK')).toBe('FALLBACK');
    expect(installFolderName('x'.repeat(200), 'ID')).toHaveLength(80);
    expect(installDestination('/games//', 'Halo', 'ID')).toBe('/games/Halo');
  });
  it('groups list headings by letter, accents folded, others under #', () => {
    expect(libraryLetter('Élan')).toBe('E');
    expect(libraryLetter('1000xRESIST')).toBe('#');
  });
});

it('remembers the library view and falls back to grid', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  expect(loadLibraryView(storage)).toBe('grid');
  saveLibraryView('list', storage);
  expect(loadLibraryView(storage)).toBe('list');
});

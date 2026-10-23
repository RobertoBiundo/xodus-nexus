import type { CatalogProduct } from '../shared/types';

export const facetKeys = ['genre', 'year', 'publisher', 'rating', 'pricing', 'support', 'installed'] as const;
export type FacetKey = typeof facetKeys[number];
export const facetLabels: Record<FacetKey, string> = { genre: 'Genre', year: 'Release year', publisher: 'Publisher', rating: 'Rating', pricing: 'Pricing', support: 'Compatibility', installed: 'Installation' };
/** Display order for the Rating filter (best first). */
export const facetRatings = ['4 stars & up', '3 stars & up', '2 stars & up', 'Under 2 stars', 'Not rated'];

function ratingBucket(rating: number | undefined): string {
  if (rating === undefined || rating <= 0) return 'Not rated';
  return rating >= 4 ? '4 stars & up' : rating >= 3 ? '3 stars & up' : rating >= 2 ? '2 stars & up' : 'Under 2 stars';
}

export function productFacets(product: CatalogProduct | undefined, installed: boolean): Record<FacetKey, string[]> {
  const year = product?.releaseDate ? new Date(product.releaseDate).getUTCFullYear() : NaN;
  const free = product?.purchasePrice?.toLowerCase() === 'free';
  return {
    genre: product?.categories ?? [],
    year: Number.isFinite(year) && year > 1970 ? [String(year)] : [],
    publisher: product?.publisher ? [product.publisher] : [],
    rating: [ratingBucket(product?.averageRating)],
    pricing: [...(free ? ['Free'] : product?.purchasePrice ? ['Paid'] : []), ...(product?.includedWith ? [`Included with ${product.includedWith}`] : [])],
    support: product ? [product.installability === 'supported' ? 'Supported' : product.installability === 'unsupported' ? 'Unsupported' : 'Unverified'] : [],
    installed: [installed ? 'Installed' : 'Not installed'],
  };
}

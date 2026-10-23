import { LayoutGrid, List, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import type { AccountLibraryPage } from '../shared/types';
import { MultiSelect, SingleSelect } from './Dropdowns';
import { facetKeys, facetLabels, type FacetKey } from './library-facets';
import type { LibraryFilters, LibraryView } from './library-preferences';
import type { FacetSelection } from './library-rows';

const accessOptions = [{ value: 'all', label: 'All games' }, { value: 'owned', label: 'Owned' }, { value: 'gamepass', label: 'In Game Pass' }];
const playStateOptions = [{ value: 'all', label: 'All states' }, { value: 'installed', label: 'Installed' }, { value: 'installable', label: 'Ready to install' }];

interface Props {
  kind: AccountLibraryPage['kind'];
  setKind: (kind: AccountLibraryPage['kind']) => void;
  /** Hidden when a page already fixes the play state. */
  playState?: LibraryFilters['playState'];
  setPlayState: (playState: LibraryFilters['playState']) => void;
  hiddenFacets: FacetKey[];
  facets: FacetSelection;
  facetOptions: Record<FacetKey, string[]>;
  setFacets: (facets: FacetSelection) => void;
  query: string;
  setQuery: (query: string) => void;
  view: LibraryView;
  setView: (view: LibraryView) => void;
  refreshing: boolean;
  canRefresh: boolean;
  refresh: () => void;
}

export function LibraryFilterBar(props: Props) {
  const { facets, setFacets, query, setQuery, view, setView } = props;
  const active = facetKeys.filter(key => facets[key]?.length);
  return <div className="library-filters" data-gamepad-filters>
    <SingleSelect label="Filters" ariaLabel="Access" value={props.kind} onChange={value => props.setKind(value as AccountLibraryPage['kind'])} options={accessOptions} />
    {props.playState ? <SingleSelect label="Play state" ariaLabel="Play state" value={props.playState} onChange={value => props.setPlayState(value as LibraryFilters['playState'])} options={playStateOptions} /> : null}
    {facetKeys.filter(key => !props.hiddenFacets.includes(key)).map(key => <MultiSelect key={key} label={facetLabels[key]} options={props.facetOptions[key]} selected={facets[key] ?? []} onChange={values => setFacets({ ...facets, [key]: values })} />)}
    {active.length ? <button className="secondary library-clear-filters" onClick={() => setFacets({})}>Clear filters</button> : null}
    <label className="library-filter-search">Search<span className="library-search-field"><Search /><input aria-label="Search library" placeholder="Search your games" value={query} onChange={event => setQuery(event.target.value)} />{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X /></button> : null}</span></label>
    <div className="library-view-toggle" role="group" aria-label="View">
      <button className={view === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={view === 'grid'} title="Grid view" onClick={() => setView('grid')}><LayoutGrid /></button>
      <button className={view === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={view === 'list'} title="List view" onClick={() => setView('list')}><List /></button>
    </div>
    <button className="secondary library-refresh" aria-label="Refresh library" title="Refresh library" disabled={!props.canRefresh || props.refreshing} onClick={props.refresh}>{props.refreshing ? <LoaderCircle className="spin" /> : <RefreshCw />}</button>
  </div>;
}

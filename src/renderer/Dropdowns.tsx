import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/** Open/close state for a dropdown that closes on outside press and on Escape. */
function useDismissable() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); } };
  return { open, setOpen, root, onKeyDown, toggle: () => setOpen(value => !value) };
}

export function SingleSelect({ label, ariaLabel, options, value, onChange }: { label: string; ariaLabel: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  const { open, setOpen, root, onKeyDown, toggle } = useDismissable();
  const current = options.find(option => option.value === value) ?? options[0];
  return <div className="single-select-field"><span className="single-select-caption">{label}</span>
    <div className="multi-select single-select" ref={root} onKeyDown={onKeyDown}>
      <button type="button" className="multi-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={toggle}><span>{current.label}</span><ChevronDown /></button>
      {open ? <div className="multi-select-menu" role="listbox" aria-label={ariaLabel}>
        {options.map(option => <button type="button" key={option.value} role="option" aria-selected={option.value === value} className={`single-select-option${option.value === value ? ' selected' : ''}`}
          onClick={() => { onChange(option.value); setOpen(false); }}><span>{option.label}</span>{option.value === value ? <Check /> : null}</button>)}
      </div> : null}
    </div></div>;
}

export function MultiSelect({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (values: string[]) => void }) {
  const { open, root, onKeyDown, toggle } = useDismissable();
  if (options.length < 2 && !selected.length) return null;
  return <div className={`multi-select${selected.length ? ' has-selection' : ''}`} ref={root} onKeyDown={onKeyDown}>
    <button type="button" className="multi-select-trigger" aria-haspopup="listbox" aria-expanded={open} disabled={!options.length} onClick={toggle}>
      <span>{label}</span>{selected.length ? <b>{selected.length}</b> : null}<ChevronDown />
    </button>
    {open ? <div className="multi-select-menu" role="listbox" aria-label={label} aria-multiselectable="true">
      {options.map(option => <label key={option} role="option" aria-selected={selected.includes(option)}>
        <input type="checkbox" checked={selected.includes(option)} onChange={() => onChange(selected.includes(option) ? selected.filter(value => value !== option) : [...selected, option])} /><span>{option}</span>
      </label>)}
      {selected.length ? <button type="button" className="multi-select-clear" onClick={() => onChange([])}>Clear {label.toLowerCase()}</button> : null}
    </div> : null}
  </div>;
}

/** Minimize / maximize / close buttons for the frameless window (only exposed on Linux). */
export function WindowControls() {
  const controls = window.launcher?.windowControls;
  if (!controls) return null;
  return <div className="window-controls">
    <button type="button" aria-label="Minimize" title="Minimize" onClick={controls.minimize}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10" /></svg></button>
    <button type="button" aria-label="Maximize" title="Maximize" onClick={controls.toggleMaximize}><svg viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" rx="1" /></svg></button>
    <button type="button" className="close" aria-label="Close" title="Close" onClick={controls.close}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" /></svg></button>
  </div>;
}

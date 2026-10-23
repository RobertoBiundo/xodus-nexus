import { useEffect, useRef, useState } from 'react';
import { installGamepadNavigation, type InputSource } from './gamepad-navigation';

export function GamepadNavigation({ back }: { back: () => void }) {
  const callbacks = useRef({ back }); callbacks.current = { back };
  const [active, setActive] = useState<false | InputSource>(false);
  useEffect(() => installGamepadNavigation(window, {
    mode: (value, by) => setActive(value ? by : false), back: () => callbacks.current.back(),
  }), []);
  if (!active) return null;
  return <div className="gamepad-hints" aria-label={active === 'key' ? 'Keyboard controls' : 'Gamepad controls'}>
    {active === 'key' ? <>
      <span>Arrows: Move</span><span>Enter: Select</span><span>Esc: Back</span><span>Menu key: Options</span><span>Ctrl+PgUp / PgDn: Menu / Content</span>
    </> : <>
      <span>D-pad: Move</span><span>A: Select</span><span>B: Back</span><span>X: Options</span>
      <span>LB / RB: Menu / Content</span><span>Sticks: Scroll</span><span>Steam + X: Keyboard</span>
    </>}
  </div>;
}

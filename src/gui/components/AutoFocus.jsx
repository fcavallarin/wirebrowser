import React, { useEffect, useRef }  from "react";

/**
 * AntD Popover renders its content inside a portal and often remounts the
 * internal <input> element (especially AntD Input) during open/positioning
 * and on every keystroke. Because of this, `autoFocus` and ref-based focus
 * inside the popover are unreliable or run too early.
 *
 * <AutoFocus> ensures the child receives focus exactly once, after the
 * element is fully mounted inside the popover portal.
 */
const AutoFocus = ({ children, select = true }) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const dom = el.input || el;
    dom.focus?.();
    if (select && dom.select) {
      dom.select();
    }
  }, []);

  return React.cloneElement(children, { ref });
}

export default AutoFocus;
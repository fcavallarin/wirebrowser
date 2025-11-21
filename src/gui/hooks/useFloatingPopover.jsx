import { useState, useCallback } from "react";
import { Popover } from "antd";

const useFloatingPopover = () => {
  const [state, setState] = useState({
    open: false,
    x: 0,
    y: 0,
    context: null,
  });

  const open = (x, y, context = null) => {
    setState({ open: true, x, y, context });
  };

  const close = () => {
    setState((s) => ({ ...s, open: false }));
  };

  const FloatingPopover = useCallback(
    ({ children, width = 220, placement = "rightTop" }) => {
      if (!state.open) return null;

      return (
        <>
          <div
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              background: "transparent"
            }}
          />
          <Popover
            trigger="manual"
            open={state.open}
            styles={{ root: { zIndex: 9999 } }}
            onOpenChange={(next) => {
              if (!next) close();
            }}
            placement={placement}
            content={
              state.open &&
              (typeof children === "function"
                ? children(state.context)
                : children)
            }
          >
            <div
              style={{
                position: "fixed",
                left: state.x,
                top: state.y,
                width: state.open ? 1 : 0,
                height: 0,
                pointerEvents: "none",
              }}
            />
          </Popover>
        </>
      );
    },
    [state, close]
  );

  return {
    openFloatingPopover: open,
    closeFloatingPopover: close,
    FloatingPopover
  };
}


export default useFloatingPopover;
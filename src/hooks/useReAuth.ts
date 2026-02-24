import { useState, useCallback, useRef } from "react";

interface ReAuthState {
  open: boolean;
  title: string;
  description: string;
  onConfirmed: () => void | Promise<void>;
}

export const useReAuth = () => {
  const [state, setState] = useState<ReAuthState>({
    open: false,
    title: "",
    description: "",
    onConfirmed: () => {},
  });

  const requireReAuth = useCallback(
    (opts: { title: string; description: string; onConfirmed: () => void | Promise<void> }) => {
      setState({ open: true, ...opts });
    },
    []
  );

  const setOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, open }));
  }, []);

  return { reAuthState: state, requireReAuth, setReAuthOpen: setOpen };
};

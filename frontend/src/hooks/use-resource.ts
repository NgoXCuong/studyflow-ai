"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";

export function useResource<T>(path: string) {
  const [state, setState] = useState<{ path: string; data?: T; error?: string }>({ path });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setState({ path, data }); },
      error => { if (!controller.signal.aborted) setState({ path, error: errorMessage(error) }); },
    );
    return () => controller.abort();
  }, [path, revision]);
  const reload = useCallback(() => { setState({ path }); setRevision(value => value + 1); }, [path]);
  const refresh = useCallback(() => { setRevision(value => value + 1); }, []);
  return { data: state.path === path ? state.data : undefined, error: state.path === path ? state.error : undefined, reload, refresh };
}

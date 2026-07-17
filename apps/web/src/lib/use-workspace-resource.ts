"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WorkspaceScopeChangedError,
  getWorkspaceResource,
  refreshWorkspaceResource,
  setWorkspaceResource,
} from "./workspace-data-cache";

export interface WorkspaceResourceState<T> {
  data: T;
  initialLoading: boolean;
  refreshing: boolean;
  error: string;
  refresh: () => Promise<void>;
  update: (update: T | ((current: T) => T)) => void;
}

interface InternalWorkspaceResourceState<T> {
  key: string;
  data: T;
  initialLoading: boolean;
  refreshing: boolean;
  error: string;
}

export function useWorkspaceResource<T>({
  key,
  initialData,
  load,
  enabled = true,
  errorMessage,
}: {
  key: string;
  initialData: T;
  load: () => Promise<T>;
  enabled?: boolean;
  errorMessage: string;
}): WorkspaceResourceState<T> {
  const initialDataRef = useRef(initialData);
  const loadRef = useRef(load);
  initialDataRef.current = initialData;
  loadRef.current = load;

  const cached = getWorkspaceResource<T>(key);
  const [state, setState] = useState<InternalWorkspaceResourceState<T>>(() => ({
    key,
    data: cached?.value ?? initialData,
    initialLoading: enabled && !cached,
    refreshing: false,
    error: "",
  }));

  const visible = state.key === key
    ? state
    : {
        ...state,
        key,
        data: cached?.value ?? initialData,
        initialLoading: enabled && !cached,
        refreshing: false,
        error: "",
      };

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const existing = getWorkspaceResource<T>(key);
    setState((current) => ({
      ...current,
      key,
      data: current.key === key
        ? current.data
        : existing?.value ?? initialDataRef.current,
      initialLoading: !existing,
      refreshing: Boolean(existing),
      error: "",
    }));

    try {
      const data = await refreshWorkspaceResource(key, () => loadRef.current());
      setState((current) => ({
        ...current,
        key,
        data,
        initialLoading: false,
        refreshing: false,
        error: "",
      }));
    } catch (error) {
      if (error instanceof WorkspaceScopeChangedError) return;
      setState((current) => ({
        ...current,
        key,
        data: current.key === key
          ? current.data
          : getWorkspaceResource<T>(key)?.value ?? initialDataRef.current,
        initialLoading: false,
        refreshing: false,
        error: errorMessage,
      }));
    }
  }, [enabled, errorMessage, key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback((updater: T | ((current: T) => T)) => {
    setState((current) => {
      const base = current.key === key
        ? current.data
        : getWorkspaceResource<T>(key)?.value ?? initialDataRef.current;
      const data = typeof updater === "function"
        ? (updater as (current: T) => T)(base)
        : updater;
      setWorkspaceResource(key, data);
      return {
        ...current,
        key,
        data,
        initialLoading: false,
        error: "",
      };
    });
  }, [key]);

  return {
    data: visible.data,
    initialLoading: visible.initialLoading,
    refreshing: visible.refreshing,
    error: visible.error,
    refresh,
    update,
  };
}

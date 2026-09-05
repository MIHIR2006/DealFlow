"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, AuthApi, ApiError, readToken, clearToken } from "@/lib/api";
import type { UserRole } from "@/lib/types";

// ---------------------------------------------------------------------------
// useFetch — reusable data loader for any BFF endpoint
// ---------------------------------------------------------------------------

export interface FetchState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches `path` from the BFF on mount (and whenever `path` changes).
 * Skips the call when `skip` is true (useful for conditional fetching).
 */
export function useFetch<T>(path: string | null, init?: RequestInit): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const version = useRef(0);

  const load = useCallback(() => {
    if (!path) return;
    version.current += 1;
    const v = version.current;
    setLoading(true);
    setError(null);
    api<T>(path, init)
      .then((d) => {
        if (v === version.current) { setData(d); setLoading(false); }
      })
      .catch((e) => {
        if (v === version.current) {
          setError(e instanceof ApiError ? e : new ApiError(0, "NETWORK", String(e)));
          setLoading(false);
        }
      });
  }, [path, init]);

  useEffect(() => { load(); }, [load]);

  return { data, error, loading, refetch: load };
}

// ---------------------------------------------------------------------------
// useMutation — fire-and-forget API calls (POST/PUT/PATCH/DELETE)
// ---------------------------------------------------------------------------

export interface MutationState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  trigger: (path: string, init?: RequestInit) => Promise<T>;
}

export function useMutation<T>(): MutationState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const trigger = useCallback(async (path: string, init?: RequestInit): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path, init);
      setData(result);
      return result;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "NETWORK", String(e));
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, error, loading, trigger };
}

// ---------------------------------------------------------------------------
// useAuth — lightweight auth state reader
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  salesTeam: string;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  isLoggedIn: boolean;
  logout: () => void;
  refetch: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const token = readToken();
    if (!token) { setUser(null); setLoading(false); return; }
    setLoading(true);
    AuthApi.me()
      .then((u) => setUser({ id: u.id, name: u.full_name, email: u.email, role: u.role, salesTeam: u.sales_team }))
      .catch(() => { clearToken(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return { user, loading, isLoggedIn: !!user, logout, refetch: load };
}

// ---------------------------------------------------------------------------
// fmt — tiny formatting helpers pages share
// ---------------------------------------------------------------------------

/** Format a numeric string (possibly from the backend) as ₹ Indian locale */
export function inr(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Relative time label from an ISO timestamp */
export function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso; // fallback to raw string
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

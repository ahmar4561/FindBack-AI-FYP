
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8001";

type Notification = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  case_type: string;
  is_read: boolean;
  created_at: string;
};

type NotificationResponse = {
  status: string;
  notifications: Notification[];
  unread_count: number;
  total: number;
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Get authenticated user token
  const getToken = useCallback(async () => {
    const { data, error } =
      await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error("Please sign in again.");
    }

    return data.session.access_token;
  }, []);

  // Load notifications from backend
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = await getToken();

      const response = await fetch(
        `${API_URL}/admin/notifications`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Unable to load notifications (HTTP ${response.status}).`
        );
      }

      const result: NotificationResponse =
        await response.json();

      setItems(
        Array.isArray(result.notifications)
          ? result.notifications
          : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Notification request failed."
      );
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Initial load and automatic refresh
  useEffect(() => {
    void loadNotifications();

    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  // Mark single notification as read
  async function markAsRead(id: string) {
    if (busyId !== null) return;

    setBusyId(id);
    setError("");

    try {
      const token = await getToken();

      const response = await fetch(
        `${API_URL}/admin/notifications/mark-read`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notification_id: id,
          }),
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);

        throw new Error(
          typeof result?.detail === "string"
            ? result.detail
            : `Mark as read failed (HTTP ${response.status}).`
        );
      }

      setItems((previous) =>
        previous.map((item) =>
          item.id === id
            ? { ...item, is_read: true }
            : item
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to mark notification as read."
      );
    } finally {
      setBusyId(null);
    }
  }

  // Mark all notifications as read
  async function markAllAsRead() {
    if (busyId !== null) return;

    setBusyId("all");
    setError("");

    try {
      const token = await getToken();

      const response = await fetch(
        `${API_URL}/admin/notifications/mark-all-read`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);

        throw new Error(
          typeof result?.detail === "string"
            ? result.detail
            : `Mark all failed (HTTP ${response.status}).`
        );
      }

      setItems((previous) =>
        previous.map((item) => ({
          ...item,
          is_read: true,
        }))
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to mark all notifications as read."
      );
    } finally {
      setBusyId(null);
    }
  }

  const unread = items.filter(
    (item) => !item.is_read
  ).length;

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        type="button"
        onClick={() => {
          setOpen((previous) => !previous);
          void loadNotifications();
        }}
        aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
        className="relative rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white transition hover:border-cyan-400"
      >
        <span className="text-xl">🔔</span>

        {unread > 0 && (
          <span className="absolute -right-2 -top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {open && (
        <div className="absolute right-0 top-14 z-50 w-[min(90vw,390px)] rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white">
                Notifications
              </h3>

              <p className="mt-1 text-xs text-slate-400">
                {unread} unread notification
                {unread !== 1 ? "s" : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-slate-400 hover:text-white"
            >
              Close ✕
            </button>
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center gap-4 border-b border-slate-700 pb-3">
            <button
              type="button"
              onClick={() => void loadNotifications()}
              disabled={loading || busyId !== null}
              className="text-xs font-medium text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => void markAllAsRead()}
              disabled={busyId !== null || unread === 0}
              className="text-xs font-medium text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
            >
              {busyId === "all"
                ? "Updating..."
                : "Mark All as Read"}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && items.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              Loading notifications...
            </p>
          )}

          {/* Notifications List */}
          <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
            {items.length === 0 && !loading && !error && (
              <div className="py-8 text-center">
                <p className="text-2xl">🔔</p>

                <p className="mt-3 text-sm text-slate-400">
                  No notifications yet.
                </p>
              </div>
            )}

            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition ${
                  item.is_read
                    ? "border-slate-700 bg-slate-800/40"
                    : "border-cyan-500/30 bg-cyan-500/10"
                }`}
              >
                {/* Title and Case Type */}
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {item.title}
                  </p>

                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase ${
                      item.case_type === "demo"
                        ? "bg-amber-400/10 text-amber-300"
                        : item.case_type === "real"
                          ? "bg-emerald-400/10 text-emerald-300"
                          : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {item.case_type === "demo"
                      ? "DEMO"
                      : item.case_type === "real"
                        ? "REAL"
                        : "UNVERIFIED"}
                  </span>
                </div>

                {/* Notification Message */}
                <p className="mt-3 text-xs leading-5 text-slate-300">
                  {item.message}
                </p>

                {/* Date */}
                <p className="mt-3 text-xs text-slate-500">
                  {new Date(
                    item.created_at
                  ).toLocaleString("en-PK")}
                </p>

                {/* Read Status */}
                <div className="mt-3 flex items-center justify-between">
                  {item.is_read ? (
                    <span className="text-xs text-emerald-400">
                      ✓ Read
                    </span>
                  ) : (
                    <span className="text-xs text-cyan-300">
                      ● Unread
                    </span>
                  )}

                  {!item.is_read && (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void markAsRead(item.id)}
                      className="text-xs font-medium text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
                    >
                      {busyId === item.id
                        ? "Updating..."
                        : "Mark as Read"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-4 border-t border-slate-700 pt-3">
            <p className="text-center text-[11px] text-slate-500">
              FindBack AI System— Secure Staff Notifications
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

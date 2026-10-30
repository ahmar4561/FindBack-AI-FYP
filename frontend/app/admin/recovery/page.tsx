
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8001";

type RecoveryStatus =
  | "pending_coordination"
  | "agency_contacted"
  | "safeguarding_review"
  | "resolved"
  | "closed_unresolved";

type CaseType = "demo" | "real";
type CaseFilter = "all" | "demo" | "real";

type RecoveryCase = {
  id: string;
  match_id: string;
  case_type: CaseType;
  case_status: RecoveryStatus;
  assigned_staff_id: string;
  coordination_notes: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type RecoveryEvent = {
  id: string;
  previous_status: string | null;
  new_status: string;
  notes: string;
  created_at: string;
};

type CasesResponse = {
  status: string;
  total: number;
  demo_total: number;
  real_total: number;
  cases: RecoveryCase[];
};

type HistoryResponse = {
  status: string;
  events: RecoveryEvent[];
};

const transitions: Record<RecoveryStatus, RecoveryStatus[]> = {
  pending_coordination: [
    "agency_contacted",
    "closed_unresolved",
  ],
  agency_contacted: [
    "safeguarding_review",
    "closed_unresolved",
  ],
  safeguarding_review: ["closed_unresolved"],
  resolved: [],
  closed_unresolved: [],
};

function label(status: string) {
  return status.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleString("en-PK");
}

function getErrorMessage(result: unknown, fallback: string) {
  if (
    result &&
    typeof result === "object" &&
    "detail" in result
  ) {
    const detail = (result as { detail: unknown }).detail;

    if (typeof detail === "string") return detail;
    if (detail !== undefined) return JSON.stringify(detail);
  }

  return fallback;
}

export default function RecoveryDashboard() {
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [history, setHistory] = useState<
    Record<string, RecoveryEvent[]>
  >({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<
    Record<string, RecoveryStatus>
  >({});

  const [filter, setFilter] = useState<CaseFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [authorized, setAuthorized] = useState(false);

  const api = useCallback(
    async (path: string, body?: object): Promise<unknown> => {
      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !data.session?.access_token) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch(`${API_URL}${path}`, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          ...(body
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const result: unknown = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            result,
            `Request failed (${response.status})`
          )
        );
      }

      return result;
    },
    []
  );

  const loadCases = useCallback(async () => {
    const result = (await api(
      "/admin/recovery/cases"
    )) as CasesResponse;

    if (!Array.isArray(result.cases)) {
      throw new Error("Invalid recovery cases response.");
    }

    setCases(result.cases);
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error("Please sign in.");
        }

        const { data, error: roleError } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (roleError || data?.role !== "admin") {
          throw new Error("Admin access required.");
        }

        if (cancelled) return;

        setAuthorized(true);
        await loadCases();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load dashboard."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [loadCases]);

  async function refreshCases() {
    setRefreshing(true);
    setError("");
    setMessage("");

    try {
      await loadCases();
      setMessage("Recovery cases refreshed.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to refresh cases."
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function updateCase(item: RecoveryCase) {
    const status = statuses[item.id];
    const note = (notes[item.id] ?? "").trim();

    if (!status) {
      setError("Select a new case status.");
      return;
    }

    if (!transitions[item.case_status].includes(status)) {
      setError("Invalid status transition.");
      return;
    }

    if (note.length < 10) {
      setError(
        "Please enter at least 10 characters in notes."
      );
      return;
    }

    const isDemo = item.case_type === "demo";

    const confirmation = isDemo
      ? `Update DEMO case to ${label(status)}? This is simulated workflow tracking only.`
      : `Update REAL case to ${label(status)}? Confirm that the recorded coordination activity actually occurred.`;

    if (!window.confirm(confirmation)) return;

    setBusyId(item.id);
    setError("");
    setMessage("");

    try {
      await api("/admin/recovery/update", {
        case_id: item.id,
        case_status: status,
        notes: note,
      });

      setMessage(
        isDemo
          ? "Demo recovery case updated successfully."
          : "Recovery case updated successfully."
      );

      setNotes((previous) => ({
        ...previous,
        [item.id]: "",
      }));

      setStatuses((previous) => {
        const updated = { ...previous };
        delete updated[item.id];
        return updated;
      });

      await loadCases();

      const result = (await api(
        `/admin/recovery/cases/${item.id}/history`
      )) as HistoryResponse;

      setHistory((previous) => ({
        ...previous,
        [item.id]: result.events ?? [],
      }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update case."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function loadHistory(caseId: string) {
    setBusyId(caseId);
    setError("");

    try {
      const result = (await api(
        `/admin/recovery/cases/${caseId}/history`
      )) as HistoryResponse;

      setHistory((previous) => ({
        ...previous,
        [caseId]: result.events ?? [],
      }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load history."
      );
    } finally {
      setBusyId(null);
    }
  }

  const demoCases = useMemo(
    () => cases.filter((item) => item.case_type === "demo"),
    [cases]
  );

  const realCases = useMemo(
    () => cases.filter((item) => item.case_type === "real"),
    [cases]
  );

  const visibleCases = useMemo(
    () =>
      cases.filter(
        (item) =>
          filter === "all" || item.case_type === filter
      ),
    [cases, filter]
  );

  const activeCases = cases.filter(
    (item) =>
      !["resolved", "closed_unresolved"].includes(
        item.case_status
      )
  );

  const closedCases = cases.filter(
    (item) =>
      ["resolved", "closed_unresolved"].includes(
        item.case_status
      )
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        Loading recovery dashboard...
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-2xl font-bold">
          Access Restricted
        </h1>

        <p className="mt-3 text-red-300">{error}</p>

        <a
          href="/admin/login"
          className="mt-4 block text-cyan-300"
        >
           Go to Admin Sign In
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <a
          href="/admin/matches"
          className="text-sm text-cyan-300 hover:underline"
        >
          ← Back to Match Review
        </a>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
              FindBack AI System
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Safe Recovery Case Management
            </h1>

            <p className="mt-3 max-w-3xl text-slate-400">
              Track recovery coordination, demo testing,
              safeguarding reviews and audit history.
              This dashboard does not authorize person handover.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refreshCases()}
            disabled={refreshing || busyId !== null}
            className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-300 hover:bg-cyan-400/20 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh Cases"}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-red-700 bg-red-950 p-4 text-red-200"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            className="mt-6 rounded-lg border border-emerald-700 bg-emerald-950 p-4 text-emerald-200"
          >
            {message}
          </div>
        )}

        {/* DASHBOARD SUMMARY */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Summary
            title="Total Cases"
            value={cases.length}
          />

          <Summary
            title="Demo Cases"
            value={demoCases.length}
            accent="amber"
          />

          <Summary
            title="Real Cases"
            value={realCases.length}
            accent="emerald"
          />

          <Summary
            title="Active Coordination"
            value={activeCases.length}
          />

          <Summary
            title="Closed Cases"
            value={closedCases.length}
          />
        </div>

        {/* SAFETY NOTICE */}
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="font-semibold text-amber-300">
            Demo and Real Case Separation
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            DEMO cases are created from self-consented test
            verification and must not be treated as actual
            missing-person recoveries. REAL indicates a
            non-demo verification method in the database,
            not independent proof of identity or permission
            to conduct physical recovery.
          </p>
        </div>

        {/* FILTER BUTTONS */}
        <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="font-semibold text-white">
            Filter Recovery Cases
          </h2>

          <div className="mt-4 flex flex-wrap gap-3">
            {(
              [
                { value: "all", title: "All Cases" },
                { value: "demo", title: "Demo Cases" },
                { value: "real", title: "Real Cases" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                aria-pressed={filter === option.value}
                className={`rounded-lg px-5 py-3 text-sm font-semibold transition ${
                  filter === option.value
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {option.title}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Showing {visibleCases.length} of {cases.length} cases.
          </p>
        </section>

        {cases.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-8">
            <h2 className="text-xl font-semibold">
              No recovery cases yet
            </h2>

            <p className="mt-3 text-slate-400">
              A recovery coordination case can be created
              after a candidate match has a completed
              verification record.
            </p>
          </div>
        )}

        {cases.length > 0 && visibleCases.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-8">
            <p className="text-slate-400">
              No {filter} cases found.
            </p>
          </div>
        )}

        {/* RECOVERY CASE CARDS */}
        <div className="mt-8 grid gap-6">
          {visibleCases.map((item) => {
            const isDemo = item.case_type === "demo";
            const allowed =
              transitions[item.case_status] ?? [];

            return (
              <section
                key={item.id}
                className={`rounded-2xl border bg-slate-900 p-6 ${
                  isDemo
                    ? "border-amber-500/40"
                    : "border-emerald-500/30"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Recovery Coordination Case
                    </h2>

                    <p className="mt-1 text-xs text-slate-400">
                      {isDemo
                        ? "FYP simulated workflow"
                        : "Non-demo coordination record"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-4 py-2 text-sm font-bold ${
                        isDemo
                          ? "bg-amber-400/10 text-amber-300"
                          : "bg-emerald-400/10 text-emerald-300"
                      }`}
                    >
                      {isDemo ? "DEMO" : "REAL"}
                    </span>

                    <span className="rounded-full bg-cyan-400/10 px-4 py-2 text-sm capitalize text-cyan-300">
                      {label(item.case_status)}
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-2 break-words text-sm text-slate-300">
                  <p>
                    <strong>Case ID:</strong> {item.id}
                  </p>

                  <p>
                    <strong>Match ID:</strong> {item.match_id}
                  </p>

                  <p>
                    <strong>Case Type:</strong>{" "}
                    {isDemo ? "Demo / Testing" : "Real Workflow"}
                  </p>

                  <p>
                    <strong>Created:</strong>{" "}
                    {formatDate(item.created_at)}
                  </p>

                  <p>
                    <strong>Last Updated:</strong>{" "}
                    {formatDate(item.updated_at)}
                  </p>

                  <p>
                    <strong>Coordination Notes:</strong>{" "}
                    {item.coordination_notes || "None"}
                  </p>

                  {item.resolution_notes && (
                    <p>
                      <strong>Closure Notes:</strong>{" "}
                      {item.resolution_notes}
                    </p>
                  )}
                </div>

                {/* UPDATE CASE STATUS */}
                {allowed.length > 0 && (
                  <div className="mt-6 rounded-xl bg-slate-800 p-5">
                    <h3 className="font-semibold">
                      Update Case Status
                    </h3>

                    {isDemo && (
                      <p className="mt-2 text-xs text-amber-300">
                        DEMO ONLY: All updates must clearly
                        describe simulated actions.
                      </p>
                    )}

                    <select
                      aria-label="New case status"
                      value={statuses[item.id] ?? ""}
                      onChange={(e) =>
                        setStatuses((previous) => ({
                          ...previous,
                          [item.id]:
                            e.target.value as RecoveryStatus,
                        }))
                      }
                      disabled={busyId !== null}
                      className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-950 p-3"
                    >
                      <option value="">
                        Select next status
                      </option>

                      {allowed.map((status) => (
                        <option key={status} value={status}>
                          {label(status)}
                        </option>
                      ))}
                    </select>

                    <textarea
                      aria-label="Coordination notes"
                      value={notes[item.id] ?? ""}
                      onChange={(e) =>
                        setNotes((previous) => ({
                          ...previous,
                          [item.id]: e.target.value,
                        }))
                      }
                      placeholder={
                        isDemo
                          ? "FYP DEMO ONLY: Describe simulated coordination activity (minimum 10 characters)"
                          : "Record actual authorized coordination activity (minimum 10 characters)"
                      }
                      rows={3}
                      maxLength={2000}
                      disabled={busyId !== null}
                      className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-950 p-3"
                    />

                    <button
                      type="button"
                      onClick={() => void updateCase(item)}
                      disabled={busyId !== null}
                      className="mt-4 rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
                    >
                      {busyId === item.id
                        ? "Updating..."
                        : "Save Status"}
                    </button>
                  </div>
                )}

                {/* AUDIT HISTORY */}
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => void loadHistory(item.id)}
                    disabled={busyId !== null}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-cyan-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busyId === item.id
                      ? "Loading..."
                      : "View Audit History"}
                  </button>

                  {history[item.id] && (
                    <div className="mt-4 space-y-3">
                      {history[item.id].length === 0 ? (
                        <p className="text-sm text-slate-400">
                          No history recorded.
                        </p>
                      ) : (
                        history[item.id].map((event) => (
                          <div
                            key={event.id}
                            className="rounded-lg bg-slate-800 p-4 text-sm"
                          >
                            <p className="font-semibold capitalize text-cyan-300">
                              {event.previous_status
                                ? `${label(event.previous_status)} → `
                                : ""}
                              {label(event.new_status)}
                            </p>

                            <p className="mt-2 text-slate-300">
                              {event.notes}
                            </p>

                            <p className="mt-2 text-xs text-slate-500">
                              {formatDate(event.created_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-slate-500">
          FindBack AI System— FYP Prototype. Demo records are
          simulated. No dashboard status or AI score
          authorizes physical recovery, transfer or handover.
        </p>
      </div>
    </main>
  );
}

function Summary({
  title,
  value,
  accent = "default",
}: {
  title: string;
  value: number;
  accent?: "default" | "amber" | "emerald";
}) {
  const color =
    accent === "amber"
      ? "text-amber-300"
      : accent === "emerald"
        ? "text-emerald-300"
        : "text-white";

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">
        {title}
      </p>

      <p className={`mt-2 text-3xl font-bold ${color}`}>
        {value}
      </p>
    </div>
  );
}

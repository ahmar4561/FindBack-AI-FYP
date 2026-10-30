"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import type { User } from "@supabase/supabase-js";

type ReportType = "Missing" | "Found";

type ReportRow = {
  id: string;
  case_number: string | null;
  full_name: string | null;
  status: string | null;
  created_at: string | null;
  type: ReportType;
};

type NotificationRow = {
  id: string;
  title: string | null;
  message: string | null;
  is_read: boolean;
  created_at: string | null;
};

type DashboardStats = {
  total: number;
  missing: number;
  found: number;
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    missing: 0,
    found: 0,
  });

  const [dataError, setDataError] = useState("");
  const [notificationError, setNotificationError] = useState("");

  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const {
          data: { user: currentUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !currentUser) {
          if (active) {
            router.replace("/");
          }
          return;
        }

        if (!active) return;

        setUser(currentUser);

        /* ================= REPORTS ================= */

        const [missingResult, foundResult] = await Promise.all([
          supabase
            .from("missing_reports")
            .select(
              "id,case_number,full_name,status,created_at"
            )
            .eq("reporter_id", currentUser.id)
            .order("created_at", { ascending: false }),

          supabase
            .from("found_reports")
            .select(
              "id,case_number,full_name,status,created_at"
            )
            .eq("reporter_id", currentUser.id)
            .order("created_at", { ascending: false }),
        ]);

        if (!active) return;

        if (missingResult.error || foundResult.error) {
          console.error(
            "Dashboard reports error:",
            missingResult.error,
            foundResult.error
          );

          setDataError(
            "Unable to load reports. Please refresh and try again."
          );
        } else {
          const missingReports: ReportRow[] = (
            missingResult.data ?? []
          ).map((report) => ({
            id: report.id,
            case_number: report.case_number,
            full_name: report.full_name,
            status: report.status,
            created_at: report.created_at,
            type: "Missing" as const,
          }));

          const foundReports: ReportRow[] = (
            foundResult.data ?? []
          ).map((report) => ({
            id: report.id,
            case_number: report.case_number,
            full_name: report.full_name,
            status: report.status,
            created_at: report.created_at,
            type: "Found" as const,
          }));

          const combinedReports = [
            ...missingReports,
            ...foundReports,
          ].sort((a, b) => {
            const first = a.created_at
              ? new Date(a.created_at).getTime()
              : 0;

            const second = b.created_at
              ? new Date(b.created_at).getTime()
              : 0;

            return second - first;
          });

          setReports(combinedReports);

          setStats({
            total: combinedReports.length,
            missing: missingReports.length,
            found: foundReports.length,
          });
        }

        /* ================= NOTIFICATIONS ================= */

        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.access_token) {
            setNotificationError(
              "Unable to load notifications."
            );
            return;
          }

          const apiUrl =
            process.env.NEXT_PUBLIC_API_URL ||
            "http://127.0.0.1:8001";

          const response = await fetch(
            `${apiUrl}/notifications/mine`,
            {
              method: "GET",
              headers: {
                Authorization:
                  `Bearer ${session.access_token}`,
              },
              cache: "no-store",
            }
          );

          if (!response.ok) {
            throw new Error(
              `Notification request failed: ${response.status}`
            );
          }

          const result = await response.json();

          if (!active) return;

          setNotifications(
            Array.isArray(result.notifications)
              ? result.notifications
              : []
          );
        } catch (error) {
          console.error(
            "Dashboard notification error:",
            error
          );

          if (active) {
            setNotificationError(
              "Notifications are temporarily unavailable."
            );
          }
        }
      } catch (error) {
        console.error("Dashboard error:", error);

        if (active) {
          setDataError(
            "Something went wrong while loading your dashboard."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [router]);

  /* ================= LOGOUT ================= */

  async function handleLogout() {
    if (signingOut) return;

    setSigningOut(true);
    setLogoutError("");

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setLogoutError(
          "Sign out failed. Please try again."
        );
        return;
      }

      setUser(null);
      setNotifications([]);

      window.location.replace("/");
    } catch (error) {
      console.error("Sign out error:", error);

      setLogoutError(
        "Unable to sign out. Please try again."
      );
    } finally {
      setSigningOut(false);
    }
  }

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#06111f] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-slate-400 mt-4 text-sm">
            Loading your dashboard...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#06111f] text-white flex items-center justify-center">
        <p className="text-slate-400">
          Redirecting...
        </p>
      </main>
    );
  }

  const fullName =
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "User";

  const firstName =
    fullName.trim().split(/\s+/)[0] || "User";

  const unreadNotifications =
    notifications.filter(
      (notification) => !notification.is_read
    ).length;

  return (
    <main className="min-h-screen bg-[#06111f] text-white">

      {/* ================= NAVBAR ================= */}

      <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#06111f]/95 backdrop-blur-xl">

        <div className="max-w-7xl mx-auto px-5 md:px-8 h-[76px] flex items-center justify-between gap-5">

          {/* BRAND */}

          <a
            href="/"
            className="group shrink-0"
          >
            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
                <span className="text-cyan-400 font-black text-lg">
                  F
                </span>
              </div>

              <div>
                <h1 className="text-lg md:text-xl font-bold tracking-tight leading-none">
                  FindBack{" "}
                  <span className="text-cyan-400">
                    AI System
                  </span>
                </h1>

                <p className="hidden sm:block text-[8px] text-slate-500 tracking-[0.22em] mt-1.5">
                  IDENTIFY • VERIFY • REUNITE
                </p>
              </div>

            </div>
          </a>

          {/* NAV ACTIONS */}

          <div className="flex items-center gap-2 md:gap-3">

            {/* NOTIFICATION INDICATOR */}

            <a
              href="#notifications"
              title="Notifications"
              className="relative w-10 h-10 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-cyan-400/30 transition flex items-center justify-center"
            >
              <span className="text-base">
                🔔
              </span>

              {unreadNotifications > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[19px] h-[19px] px-1 rounded-full bg-cyan-400 text-[#03101d] text-[10px] font-black flex items-center justify-center">
                  {unreadNotifications > 9
                    ? "9+"
                    : unreadNotifications}
                </span>
              )}
            </a>

            {/* PROFILE */}

            <div className="hidden sm:flex items-center gap-3 border-l border-white/10 ml-1 pl-4">

              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 border border-cyan-400/20 flex items-center justify-center text-cyan-300 text-sm font-bold">
                {firstName.charAt(0).toUpperCase()}
              </div>

              <div className="hidden lg:block">
                <p className="text-sm font-semibold leading-none">
                  {fullName}
                </p>

                <p className="text-[10px] text-slate-500 mt-1.5">
                  My Account
                </p>
              </div>

            </div>

            {/* SIGN OUT */}

            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="ml-1 border border-white/10 text-slate-300 px-3.5 md:px-4 py-2.5 rounded-xl hover:border-red-400/30 hover:bg-red-400/[0.07] hover:text-red-300 transition text-xs md:text-sm font-medium disabled:opacity-50"
            >
              {signingOut
                ? "..."
                : "Sign Out"}
            </button>

          </div>

        </div>

        {logoutError && (
          <div className="max-w-7xl mx-auto px-6 pb-3">
            <p className="text-sm text-red-300">
              {logoutError}
            </p>
          </div>
        )}

      </nav>

      {/* ================= PAGE ================= */}

      <section className="max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14">

        {/* ================= HERO / WELCOME ================= */}

        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#0a1c2d] via-[#081725] to-[#06111f] p-7 md:p-10">

          <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-cyan-400/[0.07] blur-3xl" />

          <div className="absolute right-20 bottom-[-100px] w-60 h-60 rounded-full bg-blue-500/[0.06] blur-3xl" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">

            <div className="max-w-2xl">

              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1.5">

                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />

                <span className="text-[10px] font-bold tracking-[0.18em] text-cyan-300">
                  MY DASHBOARD
                </span>

              </div>

              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mt-5">
                Welcome back,{" "}
                <span className="text-cyan-400">
                  {firstName}
                </span>
              </h2>

              <p className="text-slate-400 mt-4 max-w-xl leading-7 text-sm md:text-base">
                Submit missing or found person reports,
                follow case progress and receive verified
                updates securely from one place.
              </p>

            </div>

            {/* QUICK ACTIONS */}

            <div className="flex flex-col sm:flex-row gap-3 shrink-0">

              <a
                href="/report-missing"
                className="inline-flex items-center justify-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-[#03101d] font-bold px-5 py-3.5 rounded-xl transition shadow-lg shadow-cyan-500/10"
              >
                <span className="text-lg leading-none">
                  +
                </span>
                Report Missing
              </a>

              <a
                href="/report-found"
                className="inline-flex items-center justify-center gap-2 border border-white/15 bg-white/[0.04] hover:border-cyan-400/40 hover:bg-cyan-400/[0.06] text-slate-100 font-semibold px-5 py-3.5 rounded-xl transition"
              >
                <span className="text-lg leading-none text-cyan-400">
                  +
                </span>
                Report Found
              </a>

            </div>

          </div>

        </div>

        {/* ================= STATS ================= */}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mt-6">

          <StatCard
            title="Total Reports"
            value={String(stats.total)}
            description="All cases submitted by you"
            icon="01"
          />

          <StatCard
            title="Missing Reports"
            value={String(stats.missing)}
            description="Missing person reports"
            icon="02"
          />

          <StatCard
            title="Found Reports"
            value={String(stats.found)}
            description="Found person reports"
            icon="03"
          />

        </div>

        {/* ================= ERRORS ================= */}

        {dataError && (
          <div className="mt-6 border border-red-400/20 bg-red-400/[0.07] rounded-2xl px-5 py-4">
            <p className="text-sm text-red-300">
              {dataError}
            </p>
          </div>
        )}

        {/* ================= MAIN CONTENT ================= */}

        <div className="grid lg:grid-cols-[1.6fr_0.8fr] gap-6 mt-6">

          {/* ================= REPORTS ================= */}

          <div className="border border-white/[0.08] bg-[#081522] rounded-3xl overflow-hidden">

            <div className="px-6 md:px-7 py-6 border-b border-white/[0.07] flex items-center justify-between gap-4">

              <div>
                <p className="text-[10px] text-cyan-400 font-bold tracking-[0.18em]">
                  CASES
                </p>

                <h3 className="text-xl font-bold mt-2">
                  My Reports
                </h3>

                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Your recently submitted reports.
                </p>
              </div>

              <span className="text-xs text-slate-400 border border-white/10 bg-white/[0.03] px-3 py-1.5 rounded-full">
                {reports.length} Total
              </span>

            </div>

            {reports.length === 0 ? (
              <div className="py-20 px-6 text-center">

                <div className="w-14 h-14 mx-auto rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] flex items-center justify-center text-cyan-400 text-xl">
                  ◇
                </div>

                <h4 className="font-semibold mt-5">
                  No reports submitted
                </h4>

                <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                  When you submit a missing or found
                  person report, it will appear here.
                </p>

              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">

                {reports.map((report) => (
                  <div
                    key={`${report.type}-${report.id}`}
                    className="px-6 md:px-7 py-5 hover:bg-white/[0.018] transition"
                  >

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

                      <div className="min-w-0">

                        <div className="flex flex-wrap items-center gap-2">

                          <p className="text-[11px] text-cyan-400 font-bold tracking-wide">
                            {report.case_number ||
                              "CASE PENDING"}
                          </p>

                          <TypeBadge
                            type={report.type}
                          />

                        </div>

                        <h4 className="font-semibold text-base mt-2 truncate">
                          {report.full_name ||
                            "Unknown Person"}
                        </h4>

                        <p className="text-xs text-slate-500 mt-1.5">
                          Submitted{" "}
                          {formatDate(report.created_at)}
                        </p>

                      </div>

                      <div className="sm:text-right shrink-0">

                        <p className="text-[10px] uppercase tracking-[0.15em] text-slate-600">
                          Status
                        </p>

                        <div className="mt-1.5">
                          <StatusBadge
                            status={
                              report.status ||
                              "Pending"
                            }
                          />
                        </div>

                      </div>

                    </div>

                  </div>
                ))}

              </div>
            )}

          </div>

          {/* ================= CASE PROCESS ================= */}

          <div className="border border-white/[0.08] bg-[#081522] rounded-3xl p-6 md:p-7 h-fit">

            <p className="text-[10px] text-cyan-400 font-bold tracking-[0.18em]">
              CASE JOURNEY
            </p>

            <h3 className="text-xl font-bold mt-2">
              How your case progresses
            </h3>

            <p className="text-sm text-slate-500 mt-2 leading-6">
              FindBack AI System uses AI assistance with
              controlled human verification.
            </p>

            <div className="mt-8">

              <StatusItem
                number="01"
                title="Report Submitted"
                description="Your case details are securely recorded."
              />

              <StatusItem
                number="02"
                title="AI Analysis"
                description="Reports are compared for potential similarities."
              />

              <StatusItem
                number="03"
                title="Human Verification"
                description="Potential matches require authorized review."
              />

              <StatusItem
                number="04"
                title="Safe Resolution"
                description="Verified cases proceed through controlled recovery."
                last
              />

            </div>

          </div>

        </div>

        {/* ================= NOTIFICATIONS ================= */}

        <div
          id="notifications"
          className="mt-6 border border-white/[0.08] bg-[#081522] rounded-3xl overflow-hidden scroll-mt-28"
        >

          <div className="px-6 md:px-7 py-6 border-b border-white/[0.07] flex items-start justify-between gap-5">

            <div>

              <div className="flex flex-wrap items-center gap-3">

                <p className="text-[10px] text-cyan-400 font-bold tracking-[0.18em]">
                  UPDATES
                </p>

                {unreadNotifications > 0 && (
                  <span className="bg-cyan-400 text-[#03101d] text-[10px] font-black px-2 py-1 rounded-full">
                    {unreadNotifications} NEW
                  </span>
                )}

              </div>

              <h3 className="text-xl font-bold mt-2">
                Notifications
              </h3>

              <p className="text-sm text-slate-500 mt-1">
                Important updates related to your cases.
              </p>

            </div>

            <div className="w-10 h-10 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] flex items-center justify-center">
              🔔
            </div>

          </div>

          {notificationError ? (
            <div className="m-6 border border-amber-400/20 bg-amber-400/[0.05] rounded-2xl p-4">
              <p className="text-sm text-amber-300">
                {notificationError}
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-14 px-6 text-center">

              <div className="w-12 h-12 mx-auto rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
                🔔
              </div>

              <h4 className="font-semibold mt-4">
                You're all caught up
              </h4>

              <p className="text-sm text-slate-500 mt-2">
                New verified case updates will appear here.
              </p>

            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">

              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={
                    notification.is_read
                      ? "px-6 md:px-7 py-5"
                      : "px-6 md:px-7 py-5 bg-cyan-400/[0.025]"
                  }
                >

                  <div className="flex items-start gap-4">

                    <div
                      className={
                        notification.is_read
                          ? "mt-1 w-2 h-2 rounded-full bg-slate-700 shrink-0"
                          : "mt-1 w-2 h-2 rounded-full bg-cyan-400 shrink-0"
                      }
                    />

                    <div className="flex-1 min-w-0">

                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">

                        <div className="flex items-center gap-2">

                          <h4 className="font-semibold text-sm md:text-base">
                            {notification.title ||
                              "Case Update"}
                          </h4>

                          {!notification.is_read && (
                            <span className="text-[9px] font-black text-cyan-300 uppercase tracking-wider">
                              New
                            </span>
                          )}

                        </div>

                        <p className="text-[11px] text-slate-600 shrink-0">
                          {formatDate(
                            notification.created_at
                          )}
                        </p>

                      </div>

                      <p className="text-sm text-slate-400 mt-2 leading-6">
                        {notification.message ||
                          "A new case update is available."}
                      </p>

                    </div>

                  </div>

                </div>
              ))}

            </div>
          )}

        </div>

        {/* ================= SAFETY NOTE ================= */}

        <div className="mt-6 rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.035] px-5 md:px-6 py-5 flex flex-col md:flex-row md:items-center gap-4">

          <div className="w-10 h-10 shrink-0 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.07] flex items-center justify-center text-cyan-300 font-bold">
            ✓
          </div>

          <div>
            <p className="font-semibold text-sm">
              AI assists. Humans verify.
            </p>

            <p className="text-xs md:text-sm text-slate-500 mt-1.5 leading-6">
              AI-generated similarity results are treated
              only as potential matches. Identity
              confirmation and sensitive case actions
              require controlled human verification.
            </p>
          </div>

        </div>

      </section>

      {/* ================= FOOTER ================= */}

      <footer className="border-t border-white/[0.07] mt-8">

        <div className="max-w-7xl mx-auto px-6 md:px-8 py-7 flex flex-col sm:flex-row items-center justify-between gap-3">

          <p className="text-xs text-slate-600">
            FindBack AI System
          </p>

          <p className="text-[10px] text-slate-700 tracking-[0.15em]">
            IDENTIFY • VERIFY • REUNITE
          </p>

        </div>

      </footer>

    </main>
  );
}

/* ================= DATE ================= */

function formatDate(value: string | null): string {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ================= STAT CARD ================= */

function StatCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="group border border-white/[0.08] bg-[#081522] rounded-2xl p-5 md:p-6 hover:border-cyan-400/20 transition">

      <div className="flex items-start justify-between gap-4">

        <div>

          <p className="text-xs text-slate-500">
            {title}
          </p>

          <p className="text-3xl md:text-4xl font-bold text-white mt-3">
            {value}
          </p>

          <p className="text-[11px] md:text-xs text-slate-600 mt-2">
            {description}
          </p>

        </div>

        <div className="w-10 h-10 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.05] flex items-center justify-center text-[10px] font-bold text-cyan-400">
          {icon}
        </div>

      </div>

    </div>
  );
}

/* ================= TYPE BADGE ================= */

function TypeBadge({
  type,
}: {
  type: ReportType;
}) {
  return (
    <span
      className={
        type === "Missing"
          ? "text-[9px] uppercase tracking-wider font-bold px-2 py-1 rounded-md border border-amber-400/15 bg-amber-400/[0.06] text-amber-300"
          : "text-[9px] uppercase tracking-wider font-bold px-2 py-1 rounded-md border border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-300"
      }
    >
      {type}
    </span>
  );
}

/* ================= STATUS BADGE ================= */

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  let classes =
    "border-white/10 bg-white/[0.04] text-slate-300";

  if (
    normalized.includes("resolved") ||
    normalized.includes("closed") ||
    normalized.includes("verified")
  ) {
    classes =
      "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300";
  } else if (
    normalized.includes("open") ||
    normalized.includes("active")
  ) {
    classes =
      "border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300";
  } else if (
    normalized.includes("pending") ||
    normalized.includes("review")
  ) {
    classes =
      "border-amber-400/20 bg-amber-400/[0.07] text-amber-300";
  }

  return (
    <span
      className={`inline-flex text-[10px] font-semibold px-2.5 py-1 rounded-full border ${classes}`}
    >
      {status}
    </span>
  );
}

/* ================= STATUS ITEM ================= */

function StatusItem({
  number,
  title,
  description,
  last = false,
}: {
  number: string;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <div className="relative flex gap-4">

      {!last && (
        <div className="absolute left-[17px] top-9 bottom-0 w-px bg-white/[0.08]" />
      )}

      <div className="relative z-10 w-9 h-9 shrink-0 rounded-xl bg-[#0b1b29] border border-cyan-400/15 flex items-center justify-center text-[10px] text-cyan-400 font-bold">
        {number}
      </div>

      <div className={last ? "" : "pb-7"}>

        <p className="text-sm font-semibold">
          {title}
        </p>

        <p className="text-xs text-slate-500 mt-1.5 leading-5">
          {description}
        </p>

      </div>

    </div>
  );
}
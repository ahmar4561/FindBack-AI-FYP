
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import NotificationBell from "../../../components/NotificationBell";
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

type Report = {
  id: string;
  case_number: string;
  full_name: string | null;
  approximate_age: number | null;
  gender: string | null;
  image_url: string | null;
};

type Match = {
  id: string;
  missing_report_id: string;
  found_report_id: string;
  face_score: number | null;
  attribute_score: number | null;
  combined_score: number | null;
  match_status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  identity_verification_method: string | null;
  identity_verified_at: string | null;
  created_at: string;
};

type MatchView = Match & {
  missing: Report | null;
  found: Report | null;
  missingPhoto: string | null;
  foundPhoto: string | null;
};

type Decision = "under_review" | "rejected" | "confirmed";
type VerificationMethod =
  | "guardian_and_document"
  | "authorized_agency";
type Filter = "all" | "potential" | "under_review" | "finalized";
type Sort = "review" | "face" | "attribute" | "newest";

type AttributeResult = {
  status: string;
  message: string;
  missing_reports: number;
  found_reports: number;
  matches_created: number;
  matches_existing?: number;
  note?: string;
};

type FaceResult = {
  status: string;
  message: string;
  images_processed?: number;
  images_skipped: number;
  created: number;
  updated: number;
  skipped_reviewed: number;
  note?: string;
};

function errorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail !== undefined) return JSON.stringify(detail);
  }
  return fallback;
}

function score(value: number | null) {
  return value === null ? "Not calculated" : value.toFixed(2);
}

function dateText(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleString("en-PK");
}

function normalized(value: string | null | undefined) {
  const result = (value ?? "").trim().toLowerCase();
  return ["", "unknown", "not known", "n/a", "none"].includes(result)
    ? ""
    : result;
}

function reviewInsights(match: MatchView) {
  const warnings: string[] = [];
  const missing = match.missing;
  const found = match.found;

  if (!missing || !found) {
    return {
      available: 0,
      total: 2,
      warnings: ["One or both report records are unavailable."],
    };
  }

  let available = 0;
  const missingAge = missing.approximate_age;
  const foundAge = found.approximate_age;

  if (missingAge !== null && foundAge !== null) {
    available++;
    const difference = Math.abs(missingAge - foundAge);

    if (difference > 10) {
      warnings.push(
        `Large reported age difference: ${difference} years. Check report dates and age estimates.`
      );
    } else if (difference > 5) {
      warnings.push(
        `Reported ages differ by ${difference} years. Review the estimates.`
      );
    }
  }

  const missingGender = normalized(missing.gender);
  const foundGender = normalized(found.gender);

  if (missingGender && foundGender) {
    available++;

    if (
      missingGender !== foundGender &&
      missingGender !== "other" &&
      foundGender !== "other"
    ) {
      warnings.push(
        "Reported genders differ. Check the original information."
      );
    }
  }

  if (available < 2) {
    warnings.push(
      "Limited comparable information: age or gender is missing."
    );
  }

  if (match.face_score === null) {
    warnings.push(
      "Face similarity is unavailable for this candidate."
    );
  }

  if (warnings.length === 0) {
    warnings.push(
      "No age/gender inconsistency detected. This does not verify identity."
    );
  }

  return { available, total: 2, warnings };
}

function priority(match: MatchView) {
  if (match.match_status === "under_review") return 0;
  if (match.match_status === "potential") return 1;
  return 2;
}

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [staffRole, setStaffRole] = useState("");
  const [error, setError] = useState("");

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [decisions, setDecisions] =
    useState<Record<string, Decision>>({});
  const [methods, setMethods] =
    useState<Record<string, VerificationMethod>>({});
  const [references, setReferences] =
    useState<Record<string, string>>({});
  const [evidenceChecked, setEvidenceChecked] =
    useState<Record<string, boolean>>({});
  const [feedback, setFeedback] =
    useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [runningMatching, setRunningMatching] = useState(false);
  const [matchingResult, setMatchingResult] =
    useState<AttributeResult | null>(null);
  const [matchingError, setMatchingError] = useState("");

  const [runningFaceMatching, setRunningFaceMatching] =
    useState(false);
  const [faceResult, setFaceResult] =
    useState<FaceResult | null>(null);
  const [faceError, setFaceError] = useState("");

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("review");
  const [search, setSearch] = useState("");

  // RECOVERY CASE MANAGEMENT
  const [recoveryNotes, setRecoveryNotes] =
    useState<Record<string, string>>({});
  const [recoveryFeedback, setRecoveryFeedback] =
    useState<Record<string, string>>({});
  const [recoveryBusyId, setRecoveryBusyId] =
    useState<string | null>(null);
  const [recoveryCaseMatchIds, setRecoveryCaseMatchIds] =
    useState<Set<string>>(new Set());
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryListError, setRecoveryListError] = useState("");

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error("Session expired. Please sign in again.");
    }

    return data.session.access_token;
  }

  async function adminRequest(
    path: string,
    method: "GET" | "POST" = "GET",
    body?: object
  ) {
    const token = await getAccessToken();

    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const result: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        errorMessage(result, `Request failed: HTTP ${response.status}`)
      );
    }

    if (!result || typeof result !== "object") {
      throw new Error("Unexpected server response.");
    }

    return result;
  }

  const loadRecoveryCaseIds = useCallback(async () => {
    setRecoveryLoading(true);
    setRecoveryListError("");

    try {
      const tokenResult = await supabase.auth.getSession();
      const token = tokenResult.data.session?.access_token;

      if (!token) throw new Error("Session expired.");

      const response = await fetch(
        `${API_URL}/admin/recovery/cases`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          errorMessage(result, `HTTP ${response.status}`)
        );
      }

      const ids = new Set<string>(
        (result.cases ?? []).map(
          (item: { match_id: string }) => item.match_id
        )
      );

      setRecoveryCaseMatchIds(ids);
    } catch (err) {
      setRecoveryListError(
        err instanceof Error
          ? err.message
          : "Unable to load recovery cases."
      );
    } finally {
      setRecoveryLoading(false);
    }
  }, []);

  const loadMatches = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setAuthorized(false);
        throw new Error("Please sign in first.");
      }

      const { data: roleData, error: roleError } = await supabase
        .from("admin_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        roleError ||
        !roleData ||
        !["admin", "reviewer"].includes(roleData.role)
      ) {
        setAuthorized(false);
        throw new Error("Access denied. Staff only.");
      }

      setStaffRole(roleData.role);
      setAuthorized(true);

      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select(
          "id,missing_report_id,found_report_id,face_score,attribute_score,combined_score,match_status,review_notes,reviewed_at,identity_verification_method,identity_verified_at,created_at"
        )
        .order("created_at", { ascending: false });

      if (matchError) throw matchError;

      const rows = (matchData ?? []) as Match[];

      const missingIds = [
        ...new Set(rows.map((m) => m.missing_report_id)),
      ];
      const foundIds = [
        ...new Set(rows.map((m) => m.found_report_id)),
      ];

      let missingReports: Report[] = [];
      let foundReports: Report[] = [];

      if (missingIds.length) {
        const { data, error } = await supabase
          .from("missing_reports")
          .select(
            "id,case_number,full_name,approximate_age,gender,image_url"
          )
          .in("id", missingIds);

        if (error) throw error;
        missingReports = (data ?? []) as Report[];
      }

      if (foundIds.length) {
        const { data, error } = await supabase
          .from("found_reports")
          .select(
            "id,case_number,full_name,approximate_age,gender,image_url"
          )
          .in("id", foundIds);

        if (error) throw error;
        foundReports = (data ?? []) as Report[];
      }

      const missingMap = new Map(
        missingReports.map((r) => [r.id, r])
      );
      const foundMap = new Map(
        foundReports.map((r) => [r.id, r])
      );

      async function privatePhoto(
        bucket: string,
        path: string | null | undefined
      ): Promise<string | null> {
        if (!path) return null;

        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 300);

        return error ? null : data?.signedUrl ?? null;
      }

      const results = await Promise.all(
        rows.map(async (match): Promise<MatchView> => {
          const missing =
            missingMap.get(match.missing_report_id) ?? null;
          const found =
            foundMap.get(match.found_report_id) ?? null;

          const [missingPhoto, foundPhoto] = await Promise.all([
            privatePhoto(
              "missing-person-images",
              missing?.image_url
            ),
            privatePhoto(
              "found-person-images",
              found?.image_url
            ),
          ]);

          return {
            ...match,
            missing,
            found,
            missingPhoto,
            foundPhoto,
          };
        })
      );

      setMatches(results);

      setNotes((previous) => {
        const updated = { ...previous };

        for (const match of results) {
          if (updated[match.id] === undefined) {
            updated[match.id] = match.review_notes ?? "";
          }
        }

        return updated;
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load matches."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    if (authorized && staffRole === "admin") {
      void loadRecoveryCaseIds();
    }
  }, [authorized, staffRole, loadRecoveryCaseIds]);

  async function runMatching() {
    if (
      staffRole !== "admin" ||
      runningMatching ||
      runningFaceMatching
    ) return;

    if (
      !window.confirm(
        "Run attribute matching on all open reports? New results will be potential candidates only."
      )
    ) return;

    setRunningMatching(true);
    setMatchingError("");
    setMatchingResult(null);

    try {
      const result = (await adminRequest(
        "/run-matching",
        "POST"
      )) as AttributeResult;

      if (result.status !== "success") {
        throw new Error(result.message || "Matching failed.");
      }

      setMatchingResult(result);
      await loadMatches(false);
    } catch (err) {
      setMatchingError(
        err instanceof Error ? err.message : "Matching failed."
      );
    } finally {
      setRunningMatching(false);
    }
  }

  async function runFaceMatching() {
    if (
      staffRole !== "admin" ||
      runningFaceMatching ||
      runningMatching
    ) return;

    if (
      !window.confirm(
        "Run FaceNet similarity matching? Existing human review decisions will not be changed."
      )
    ) return;

    setRunningFaceMatching(true);
    setFaceError("");
    setFaceResult(null);

    try {
      const result = (await adminRequest(
        "/admin/run-face-matching",
        "POST"
      )) as FaceResult;

      if (result.status !== "success") {
        throw new Error(result.message || "Face matching failed.");
      }

      setFaceResult(result);
      await loadMatches(false);
    } catch (err) {
      setFaceError(
        err instanceof Error
          ? err.message
          : "Face matching failed."
      );
    } finally {
      setRunningFaceMatching(false);
    }
  }

  async function saveReview(match: MatchView) {
    const decision = decisions[match.id] ?? "under_review";
    const reviewNotes = (notes[match.id] ?? "").trim();

    function message(value: string) {
      setFeedback((prev) => ({
        ...prev,
        [match.id]: value,
      }));
    }

    if (["confirmed", "rejected"].includes(match.match_status)) {
      message("This match already has a finalized decision.");
      return;
    }

    if (reviewNotes.length < 10) {
      message("Please enter at least 10 characters.");
      return;
    }

    if (decision === "confirmed") {
      if (staffRole !== "admin") {
        message("Only an admin can confirm a match.");
        return;
      }

      if (match.match_status !== "under_review") {
        message("Move this match to Under Review first.");
        return;
      }

      if (!methods[match.id]) {
        message("Select an identity verification method.");
        return;
      }

      if ((references[match.id] ?? "").trim().length < 5) {
        message("Enter a verification reference.");
        return;
      }

      if (!evidenceChecked[match.id]) {
        message("Independent evidence must actually be checked.");
        return;
      }

      if (
        !window.confirm(
          "DEMO ONLY: Has identity been independently verified? This does not authorize recovery or handover."
        )
      ) return;
    }

    if (
      decision === "rejected" &&
      !window.confirm("Reject this candidate match?")
    ) return;

    setSavingId(match.id);
    message("");

    try {
      await adminRequest("/admin/review-match", "POST", {
        match_id: match.id,
        decision,
        notes: reviewNotes,
        identity_verification_method:
          decision === "confirmed" ? methods[match.id] : null,
        verification_reference:
          decision === "confirmed"
            ? (references[match.id] ?? "").trim()
            : null,
      });

      message("Review saved successfully.");
      await loadMatches(false);
    } catch (err) {
      message(
        err instanceof Error
          ? err.message
          : "Unable to save review."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function createRecoveryCase(match: MatchView) {
    if (staffRole !== "admin") return;

    const coordinationNotes =
      (recoveryNotes[match.id] ?? "").trim();

    function message(value: string) {
      setRecoveryFeedback((prev) => ({
        ...prev,
        [match.id]: value,
      }));
    }

    if (
      match.match_status !== "confirmed" ||
      !match.identity_verified_at ||
      !match.identity_verification_method
    ) {
      message("A completed verification record is required.");
      return;
    }

    if (recoveryCaseMatchIds.has(match.id)) {
      message("Recovery case already exists.");
      return;
    }

    if (recoveryListError || recoveryLoading) {
      message("Wait until existing recovery cases are checked.");
      return;
    }

    if (coordinationNotes.length < 10) {
      message("Enter at least 10 characters in coordination notes.");
      return;
    }

    if (
      !window.confirm(
        "Create a coordination tracking case? This does not authorize physical recovery, transfer, or handover."
      )
    ) return;

    setRecoveryBusyId(match.id);
    message("");

    try {
      await adminRequest("/admin/recovery/create", "POST", {
        match_id: match.id,
        notes: coordinationNotes,
      });

      message("Recovery coordination case created successfully.");

      setRecoveryCaseMatchIds((previous) => {
        const updated = new Set(previous);
        updated.add(match.id);
        return updated;
      });

      await loadRecoveryCaseIds();
    } catch (err) {
      message(
        err instanceof Error
          ? err.message
          : "Unable to create recovery case."
      );

      await loadRecoveryCaseIds();
    } finally {
      setRecoveryBusyId(null);
    }
  }

  const visibleMatches = useMemo(() => {
    const query = search.trim().toLowerCase();

    const results = matches.filter((match) => {
      const statusOk =
        filter === "all" ||
        (filter === "finalized"
          ? ["confirmed", "rejected"].includes(match.match_status)
          : match.match_status === filter);

      const searchable = [
        match.missing?.case_number,
        match.found?.case_number,
        match.missing?.full_name,
        match.found?.full_name,
      ]
        .join(" ")
        .toLowerCase();

      return statusOk && (!query || searchable.includes(query));
    });

    return [...results].sort((a, b) => {
      if (sort === "review") {
        const difference = priority(a) - priority(b);
        if (difference !== 0) return difference;
      }

      if (sort === "face") {
        const difference =
          (b.face_score ?? -Infinity) -
          (a.face_score ?? -Infinity);

        if (difference !== 0 && !Number.isNaN(difference)) {
          return difference;
        }
      }

      if (sort === "attribute") {
        const difference =
          (b.attribute_score ?? -Infinity) -
          (a.attribute_score ?? -Infinity);

        if (difference !== 0 && !Number.isNaN(difference)) {
          return difference;
        }
      }

      return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
      );
    });
  }, [matches, filter, sort, search]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-cyan-300">
        Loading FindBack Admin Dashboard...
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <h1 className="text-2xl font-bold">
          Access Restricted
        </h1>
        <p className="mt-3 text-red-400">{error}</p>
        <a
          href="/login"
          className="mt-5 inline-block text-cyan-300 underline"
        >
          Go to Sign In
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <a
          href="/dashboard"
          className="text-sm text-cyan-300 hover:underline"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              FindBack — Admin Match Review
            </h1>
            <p className="mt-2 text-slate-400">
              AI-assisted candidate matches. Human verification required.
            </p>
          </div>

         <div className="flex items-center gap-3">
  <NotificationBell />

  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-300">
    {staffRole.toUpperCase()}
  </span>
</div>
        </div>

        {staffRole === "admin" && (
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/admin/recovery"
              className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-5 py-3 font-semibold text-emerald-300 hover:bg-emerald-400/20"
            >
              View Recovery Dashboard →
            </a>

            <button
              type="button"
              onClick={() => void loadRecoveryCaseIds()}
              disabled={recoveryLoading}
              className="rounded-xl border border-slate-600 px-5 py-3 text-sm text-slate-300 disabled:opacity-50"
            >
              {recoveryLoading
                ? "Checking Recovery Cases..."
                : "Refresh Recovery Cases"}
            </button>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-red-950 p-4 text-red-300"
          >
            {error}
          </p>
        )}

        {staffRole === "admin" && (
          <section className="mt-8 rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-slate-900 to-[#082235] p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
              AI Matching Engine
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Matching Control Center
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Run attribute matching and FaceNet similarity analysis.
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div className="rounded-xl border border-cyan-400/20 bg-slate-950/50 p-5">
                <div className="mb-3 text-3xl">📋</div>
                <h3 className="text-lg font-bold">
                  Attribute Matching
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Compare missing and found reports using descriptive
                  information.
                </p>

                <button
                  type="button"
                  onClick={() => void runMatching()}
                  disabled={runningMatching || runningFaceMatching}
                  className="mt-4 w-full rounded-xl bg-cyan-400 px-5 py-4 font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                >
                  {runningMatching
                    ? "Running Attribute Matching..."
                    : "▶ Run AI Matching"}
                </button>

                {matchingError && (
                  <p role="alert" className="mt-3 text-sm text-red-300">
                    {matchingError}
                  </p>
                )}

                {matchingResult && (
                  <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                    <p className="font-semibold text-emerald-300">
                      {matchingResult.message}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <ResultCard
                        label="Missing Reports"
                        value={matchingResult.missing_reports}
                      />
                      <ResultCard
                        label="Found Reports"
                        value={matchingResult.found_reports}
                      />
                      <ResultCard
                        label="New Matches"
                        value={matchingResult.matches_created}
                      />
                      <ResultCard
                        label="Existing Matches"
                        value={matchingResult.matches_existing ?? 0}
                      />
                    </div>

                    {matchingResult.note && (
                      <p className="mt-3 text-xs text-slate-300">
                        {matchingResult.note}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-emerald-400/20 bg-slate-950/50 p-5">
                <div className="mb-3 text-3xl">🧠</div>
                <h3 className="text-lg font-bold">
                  Face Recognition
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Use MTCNN and FaceNet to calculate face similarity.
                </p>

                <button
                  type="button"
                  onClick={() => void runFaceMatching()}
                  disabled={runningMatching || runningFaceMatching}
                  className="mt-4 w-full rounded-xl bg-emerald-400 px-5 py-4 font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                >
                  {runningFaceMatching
                    ? "Running Face Recognition..."
                    : "▶ Run Face Recognition"}
                </button>

                {runningFaceMatching && (
                  <p className="mt-3 text-xs text-amber-200">
                    Processing images on CPU. Please wait.
                  </p>
                )}

                {faceError && (
                  <p role="alert" className="mt-3 text-sm text-red-300">
                    {faceError}
                  </p>
                )}

                {faceResult && (
                  <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                    <p className="font-semibold text-emerald-300">
                      {faceResult.message}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <ResultCard
                        label="Images Processed"
                        value={faceResult.images_processed ?? 0}
                      />
                      <ResultCard
                        label="Images Skipped"
                        value={faceResult.images_skipped}
                      />
                      <ResultCard
                        label="New Matches"
                        value={faceResult.created}
                      />
                      <ResultCard
                        label="Updated Matches"
                        value={faceResult.updated}
                      />
                      <ResultCard
                        label="Reviewed Skipped"
                        value={faceResult.skipped_reviewed}
                      />
                    </div>

                    {faceResult.note && (
                      <p className="mt-3 text-xs text-slate-300">
                        {faceResult.note}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <p className="mt-5 text-xs text-slate-400">
              Face similarity is not identity verification.
              Independent human review is required.
            </p>
          </section>
        )}

        <div className="my-8 grid gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Total Candidate Matches"
            value={matches.length}
          />
          <SummaryCard
            title="Under Review"
            value={
              matches.filter(
                (m) => m.match_status === "under_review"
              ).length
            }
          />
          <SummaryCard
            title="Potential Matches"
            value={
              matches.filter(
                (m) => m.match_status === "potential"
              ).length
            }
          />
        </div>

        <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-cyan-300">
            Candidate Review Queue
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Filter and sort candidates. Ranking is for review
            organization, not identity confirmation.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input
              type="search"
              aria-label="Search cases"
              placeholder="Search name or case number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"
            />

            <select
              aria-label="Filter by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="rounded-lg border border-slate-600 bg-slate-950 p-3"
            >
              <option value="all">All Candidates</option>
              <option value="potential">Potential</option>
              <option value="under_review">Under Review</option>
              <option value="finalized">Finalized</option>
            </select>

            <select
              aria-label="Sort candidates"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-lg border border-slate-600 bg-slate-950 p-3"
            >
              <option value="review">Review Priority</option>
              <option value="face">Face Similarity: Highest First</option>
              <option value="attribute">
                Attribute Score: Highest First
              </option>
              <option value="newest">Newest First</option>
            </select>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Showing {visibleMatches.length} of {matches.length} candidates.
            Low similarity does not automatically exclude a candidate.
          </p>
        </section>

        {visibleMatches.length === 0 && (
          <p className="rounded-xl bg-slate-900 p-6 text-slate-400">
            No candidate matches found for these filters.
          </p>
        )}

        <div className="grid gap-6">
          {visibleMatches.map((match) => {
            const finalized = ["confirmed", "rejected"].includes(
              match.match_status
            );
            const selectedDecision =
              decisions[match.id] ?? "under_review";
            const insights = reviewInsights(match);

            return (
              <section
                key={match.id}
                className="rounded-2xl border border-slate-700 bg-slate-900 p-6"
              >
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">
                    Candidate Match
                  </h2>

                  <span className="rounded-full bg-amber-900/40 px-3 py-1 text-sm capitalize text-amber-200">
                    {match.match_status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  {[
                    {
                      label: "Missing Person",
                      report: match.missing,
                      photo: match.missingPhoto,
                    },
                    {
                      label: "Found Person",
                      report: match.found,
                      photo: match.foundPhoto,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-slate-700 bg-slate-800 p-4"
                    >
                      <h3 className="mb-3 font-semibold">
                        {item.label}
                      </h3>

                      {item.photo ? (
                        <img
                          src={item.photo}
                          alt={`${item.label} report`}
                          className="mb-4 h-56 w-full rounded-lg bg-slate-700 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="mb-4 flex h-56 items-center justify-center rounded-lg bg-slate-700 text-sm text-slate-300">
                          Photo unavailable
                        </div>
                      )}

                      <div className="space-y-2 text-sm">
                        <p>
                          <strong>Case:</strong>{" "}
                          {item.report?.case_number ?? "Unavailable"}
                        </p>
                        <p>
                          <strong>Name:</strong>{" "}
                          {item.report?.full_name || "Unknown"}
                        </p>
                        <p>
                          <strong>Age:</strong>{" "}
                          {item.report?.approximate_age ?? "Unknown"}
                        </p>
                        <p>
                          <strong>Gender:</strong>{" "}
                          {item.report?.gender || "Unknown"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: "Face Similarity (scaled)",
                      value: match.face_score,
                    },
                    {
                      label: "Attribute Score",
                      value: match.attribute_score,
                    },
                    {
                      label: "Combined Score",
                      value: match.combined_score,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg bg-slate-800 p-4"
                    >
                      <p className="text-sm text-slate-400">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xl font-bold">
                        {score(item.value)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* AI REVIEW INSIGHTS */}
                <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/5 p-5">
                  <h3 className="font-semibold text-amber-200">
                    ⚠ AI Review Insights
                  </h3>

                  <p className="mt-2 text-sm text-slate-300">
                    Comparable age/gender attributes:{" "}
                    <strong>
                      {insights.available} / {insights.total}
                    </strong>
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    The backend also scores hair, eye color,
                    clothing and distinguishing marks.
                    Those fields are not evaluated in this panel yet.
                  </p>

                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-100">
                    {insights.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>

                  <p className="mt-3 text-xs text-slate-400">
                    These are review prompts, not identity decisions.
                    Verify original records and independent evidence.
                  </p>
                </div>

                {/* HUMAN VERIFICATION */}
                <div className="mt-5 rounded-xl border border-slate-700 bg-slate-800 p-4">
                  <h3 className="font-semibold">
                    Human Verification
                  </h3>

                  <p className="mt-2 text-sm text-slate-400">
                    AI similarity is not proof of identity.
                    Record your independent findings.
                  </p>

                  {match.reviewed_at && (
                    <p className="mt-3 text-sm text-slate-400">
                      Last reviewed: {dateText(match.reviewed_at)}
                    </p>
                  )}

                  {match.identity_verified_at && (
                    <p className="mt-2 text-sm text-green-300">
                      Verification recorded:{" "}
                      {dateText(match.identity_verified_at)}
                    </p>
                  )}

                  {match.identity_verification_method && (
                    <p className="mt-2 text-sm text-slate-300">
                      Verification method:{" "}
                      {match.identity_verification_method.replaceAll(
                        "_",
                        " "
                      )}
                    </p>
                  )}

                  <label
                    htmlFor={`notes-${match.id}`}
                    className="mt-4 block text-sm text-slate-300"
                  >
                    Review Notes (minimum 10 characters)
                  </label>

                  <textarea
                    id={`notes-${match.id}`}
                    value={notes[match.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({
                        ...prev,
                        [match.id]: e.target.value,
                      }))
                    }
                    disabled={finalized || savingId === match.id}
                    maxLength={2000}
                    rows={3}
                    placeholder="Explain the evidence checked..."
                    className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400 disabled:opacity-60"
                  />

                  {!finalized ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <select
                          aria-label="Review decision"
                          value={selectedDecision}
                          onChange={(e) =>
                            setDecisions((prev) => ({
                              ...prev,
                              [match.id]: e.target.value as Decision,
                            }))
                          }
                          disabled={savingId === match.id}
                          className="rounded-lg border border-slate-600 bg-slate-950 px-4 py-3 text-white"
                        >
                          <option value="under_review">
                            Under Review
                          </option>
                          <option value="rejected">
                            Reject Match
                          </option>

                          {staffRole === "admin" &&
                            match.match_status === "under_review" && (
                              <option value="confirmed">
                                Confirm Match (Demo)
                              </option>
                            )}
                        </select>

                        <button
                          type="button"
                          onClick={() => void saveReview(match)}
                          disabled={savingId === match.id}
                          className="rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                        >
                          {savingId === match.id
                            ? "Saving..."
                            : "Save Decision"}
                        </button>
                      </div>

                      {selectedDecision === "confirmed" &&
                        staffRole === "admin" &&
                        match.match_status === "under_review" && (
                          <div className="space-y-4 rounded-lg border border-amber-700 bg-slate-950 p-4">
                            <p className="font-semibold text-amber-300">
                              Identity Verification — FYP Demo
                            </p>

                            <p className="text-xs text-slate-400">
                              Only confirm when independent evidence
                              has actually been checked. Do not enter
                              CNIC numbers or private document contents.
                            </p>

                            <label
                              htmlFor={`method-${match.id}`}
                              className="block text-sm"
                            >
                              Verification Method
                            </label>

                            <select
                              id={`method-${match.id}`}
                              value={methods[match.id] ?? ""}
                              onChange={(e) =>
                                setMethods((prev) => ({
                                  ...prev,
                                  [match.id]:
                                    e.target.value as VerificationMethod,
                                }))
                              }
                              className="w-full rounded-lg border border-slate-600 bg-slate-900 p-3"
                            >
                              <option value="">
                                Select method
                              </option>
                              <option value="guardian_and_document">
                                Guardian and Document
                              </option>
                              <option value="authorized_agency">
                                Authorized Agency
                              </option>
                            <option value="self_consented_demo">
                             Self-Consented Demo Test
                            </option>
                            </select>

                            <label
                              htmlFor={`reference-${match.id}`}
                              className="block text-sm"
                            >
                              Verification Reference
                            </label>

                            <input
                              id={`reference-${match.id}`}
                              type="text"
                              value={references[match.id] ?? ""}
                              onChange={(e) =>
                                setReferences((prev) => ({
                                  ...prev,
                                  [match.id]: e.target.value,
                                }))
                              }
                              maxLength={200}
                              placeholder="Authorized evidence reference"
                              className="w-full rounded-lg border border-slate-600 bg-slate-900 p-3"
                            />

                            <label className="flex items-start gap-3 text-sm text-slate-300">
                              <input
                                type="checkbox"
                                checked={
                                  evidenceChecked[match.id] ?? false
                                }
                                onChange={(e) =>
                                  setEvidenceChecked((prev) => ({
                                    ...prev,
                                    [match.id]: e.target.checked,
                                  }))
                                }
                                className="mt-1"
                              />

                              <span>
                                I confirm that independent identity
                                evidence was checked. This does not
                                authorize recovery or handover.
                              </span>
                            </label>
                          </div>
                        )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-amber-300">
                      This match has a finalized decision.
                    </p>
                  )}

                  {feedback[match.id] && (
                    <p
                      role="status"
                      className="mt-3 text-sm text-cyan-200"
                    >
                      {feedback[match.id]}
                    </p>
                  )}

                  <p className="mt-4 text-xs text-slate-400">
                    Confirmation is a demo record only.
                    Safe recovery and case resolution require
                    a separate authorized safeguarding process.
                  </p>
                </div>

                {/* SAFE RECOVERY COORDINATION */}
                {staffRole === "admin" &&
                  match.match_status === "confirmed" && (
                    <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-5">
                      <h3 className="font-semibold text-emerald-300">
                        Safe Recovery Coordination
                      </h3>

                      <p className="mt-2 text-sm text-slate-300">
                        A coordination record is not permission to
                        recover, transfer, or hand over a person.
                      </p>

                      {recoveryCaseMatchIds.has(match.id) ? (
                        <div className="mt-4 space-y-3">
                          <p className="text-sm text-emerald-300">
                            Recovery coordination case already exists.
                          </p>

                          <a
                            href="/admin/recovery"
                            className="text-sm text-cyan-300 underline"
                          >
                            Open Recovery Dashboard →
                          </a>
                        </div>
                      ) : match.identity_verified_at &&
                        match.identity_verification_method ? (
                        <div className="mt-4">
                          <label
                            htmlFor={`recovery-notes-${match.id}`}
                            className="block text-sm text-slate-300"
                          >
                            Coordination Notes (minimum 10 characters)
                          </label>

                          <textarea
                            id={`recovery-notes-${match.id}`}
                            rows={3}
                            maxLength={2000}
                            value={recoveryNotes[match.id] ?? ""}
                            onChange={(e) =>
                              setRecoveryNotes((prev) => ({
                                ...prev,
                                [match.id]: e.target.value,
                              }))
                            }
                            placeholder="Describe planned authorized coordination. Do not include private document details."
                            className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"
                            disabled={
                              recoveryBusyId !== null ||
                              recoveryLoading ||
                              Boolean(recoveryListError)
                            }
                          />

                          <button
                            type="button"
                            onClick={() =>
                              void createRecoveryCase(match)
                            }
                            disabled={
                              recoveryBusyId !== null ||
                              recoveryLoading ||
                              Boolean(recoveryListError)
                            }
                            className="mt-3 rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
                          >
                            {recoveryBusyId === match.id
                              ? "Creating..."
                              : "Create Recovery Case"}
                          </button>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-amber-300">
                          Verification record incomplete;
                          case creation unavailable.
                        </p>
                      )}

                      {recoveryListError && (
                        <p
                          role="alert"
                          className="mt-3 text-sm text-red-300"
                        >
                          Unable to check existing recovery cases:{" "}
                          {recoveryListError}

                          <button
                            type="button"
                            onClick={() =>
                              void loadRecoveryCaseIds()
                            }
                            className="ml-2 underline"
                          >
                            Retry
                          </button>
                        </p>
                      )}

                      {recoveryFeedback[match.id] && (
                        <p
                          role="status"
                          className="mt-3 text-sm text-cyan-200"
                        >
                          {recoveryFeedback[match.id]}
                        </p>
                      )}
                    </div>
                  )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-2 text-4xl font-bold">{value}</p>
    </div>
  );
}

function ResultCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-emerald-400/10 bg-slate-950/60 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}

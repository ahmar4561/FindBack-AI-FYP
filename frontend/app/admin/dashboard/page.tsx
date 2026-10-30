"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function AdminDashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/admin/login");
        return;
      }

      const { data: staffRole, error } = await supabase
        .from("admin_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        error ||
        !staffRole ||
        !["admin", "reviewer"].includes(staffRole.role)
      ) {
        await supabase.auth.signOut();
        router.replace("/admin/login");
        return;
      }

      setRole(staffRole.role);
      setEmail(user.email || "");
      setLoading(false);
    }

    void checkAccess();
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#06111f] text-white flex items-center justify-center">
        <p className="text-slate-400">Verifying staff access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#06111f] text-white">
      <nav className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">
              FindBack <span className="text-cyan-400">AI System</span>
            </h1>
            <p className="text-[10px] tracking-[0.18em] text-slate-500">
              STAFF CONTROL CENTER
            </p>
          </div>

          <button
            onClick={handleSignOut}
            className="border border-red-400/30 text-red-300 hover:bg-red-400/10 px-4 py-2 rounded-xl text-sm transition"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <p className="text-cyan-400 text-sm font-semibold uppercase tracking-wider">
            Authorized Staff
          </p>

          <h2 className="text-3xl md:text-4xl font-bold mt-2">
            Admin Dashboard
          </h2>

          <p className="text-slate-400 mt-3">
            Signed in as {email}
          </p>

          <div className="inline-flex mt-4 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300 uppercase">
            Role: {role}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={() => router.push("/admin/matches")}
            className="text-left rounded-3xl border border-white/10 bg-white/[0.03] hover:border-cyan-400/30 hover:bg-white/[0.05] p-7 transition"
          >
            <div className="w-12 h-12 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400 font-bold mb-5">
              01
            </div>

            <h3 className="text-xl font-bold">Candidate Match Review</h3>

            <p className="text-slate-400 text-sm mt-3 leading-6">
              Review AI-generated candidate matches, compare similarity
              evidence and record a human decision.
            </p>

            <p className="text-cyan-400 text-sm font-semibold mt-6">
              Open Match Review →
            </p>
          </button>

          <button
            onClick={() => router.push("/admin/recovery")}
            className="text-left rounded-3xl border border-white/10 bg-white/[0.03] hover:border-cyan-400/30 hover:bg-white/[0.05] p-7 transition"
          >
            <div className="w-12 h-12 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400 font-bold mb-5">
              02
            </div>

            <h3 className="text-xl font-bold">
              Recovery Coordination
            </h3>

            <p className="text-slate-400 text-sm mt-3 leading-6">
              Manage verified recovery cases, safeguarding stages,
              coordination notes and audit history.
            </p>

            <p className="text-cyan-400 text-sm font-semibold mt-6">
              Open Recovery Dashboard →
            </p>
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5">
          <p className="text-sm text-amber-100 leading-6">
            AI similarity results are candidate-support signals only.
            Identity confirmation and recovery decisions require authorized
            human verification.
          </p>
        </div>
      </section>
    </main>
  );
}
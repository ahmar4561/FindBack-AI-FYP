"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleAdminLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setErrorMessage("");

    try {
      // Authenticate account with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setErrorMessage(error?.message || "Unable to sign in.");
        return;
      }

      // Verify that the authenticated account has an authorized role
      const { data: staffRole, error: roleError } = await supabase
        .from("admin_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (
        roleError ||
        !staffRole ||
        !["admin", "reviewer"].includes(staffRole.role)
      ) {
        // Normal users must not remain signed in through the admin portal
        await supabase.auth.signOut();

        setErrorMessage(
          "Access denied. This account is not authorized for the admin portal."
        );
        return;
      }

      // Authorized admin/reviewer
      router.replace("/admin/dashboard");
      router.refresh();
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#06111f] text-white flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-white/10">
        <div className="max-w-7xl w-full mx-auto px-6 py-5 flex justify-between items-center">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-left"
          >
            <h1 className="text-2xl font-bold">
              FindBack <span className="text-cyan-400">AI System</span>
            </h1>

            <p className="text-[9px] text-slate-500 tracking-[0.18em]">
              ADMINISTRATION PORTAL
            </p>
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            ← Back to Home
          </button>
        </div>
      </nav>

      {/* Login Area */}
      <section className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Heading */}
          <div className="text-center mb-8">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 text-xl font-bold mb-5">
              A
            </div>

            <h2 className="text-3xl font-bold">
              Admin Sign In
            </h2>

            <p className="text-slate-400 text-sm mt-3">
              Authorized administrators and reviewers only.
            </p>
          </div>

          {/* Login Card */}
          <div className="border border-white/10 bg-white/[0.03] rounded-3xl p-7 md:p-8 shadow-2xl">
            <form onSubmit={handleAdminLogin}>
              {/* Email */}
              <div>
                <label className="text-sm text-slate-300">
                  Admin Email Address
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  autoComplete="email"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 outline-none focus:border-cyan-400/50 placeholder:text-slate-600"
                />
              </div>

              {/* Password */}
              <div className="mt-5">
                <label className="text-sm text-slate-300">
                  Password
                </label>

                <div className="relative mt-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 pr-16 outline-none focus:border-cyan-400/50 placeholder:text-slate-600"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Security / Forgot Password */}
              <div className="mt-5 flex justify-between items-center text-xs">
                <span className="text-slate-500">
                  Role verification required
                </span>

                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="text-cyan-400 hover:text-cyan-300"
                >
                  Forgot password?
                </button>
              </div>

              {/* Error */}
              {errorMessage && (
                <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {errorMessage}
                </div>
              )}

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="mt-7 w-full bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed text-[#03101d] font-bold py-3.5 rounded-xl transition"
              >
                {loading
                  ? "Verifying Access..."
                  : "Sign In to Admin Portal"}
              </button>
            </form>

            {/* Security Notice */}
            <div className="mt-7 pt-6 border-t border-white/10 text-center">
              <p className="text-xs text-slate-500 leading-5">
                Access is restricted to authorized FindBack AI System staff.
                AI-generated candidate matches require human review.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
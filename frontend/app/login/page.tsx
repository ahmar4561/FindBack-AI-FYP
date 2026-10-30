
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setErrorMessage("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.user) {
        router.push("/dashboard");
        router.refresh();
      }
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

          <a href="/">
            <h1 className="text-2xl font-bold">
              FindBack<span className="text-cyan-400">AI</span>
            </h1>

            <p className="text-[9px] text-slate-500 tracking-[0.18em]">
              IDENTIFY • VERIFY • REUNITE
            </p>
          </a>

          <a
            href="/"
            className="text-sm text-slate-400 hover:text-white transition"
          >
            ← Back to Home
          </a>

        </div>
      </nav>

      {/* Login Area */}
      <section className="flex-1 flex items-center justify-center px-6 py-12">

        <div className="w-full max-w-md">

          {/* Heading */}
          <div className="text-center mb-8">

            <div className="mx-auto w-14 h-14 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 text-2xl mb-5">
              ◇
            </div>

            <h2 className="text-3xl font-bold">
              Welcome Back
            </h2>

            <p className="text-slate-400 text-sm mt-3">
              Sign in to access your FindBack account.
            </p>

          </div>

          {/* Card */}
          <div className="border border-white/10 bg-white/[0.03] rounded-3xl p-7 md:p-8 shadow-2xl">

            <form onSubmit={handleLogin}>

              {/* Email */}
              <div>

                <label className="text-sm text-slate-300">
                  Email Address
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
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
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>

                </div>
              </div>

              {/* Forgot Password */}
              <div className="flex justify-between items-center mt-5 text-xs">

                <span className="text-slate-400">
                  Secure account access
                </span>

                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="text-cyan-400 hover:text-cyan-300"
                >
                  Forgot password?
                </button>

              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {errorMessage}
                </div>
              )}

              {/* Login */}
              <button
                type="submit"
                disabled={loading}
                className="mt-7 w-full bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed text-[#03101d] font-bold py-3.5 rounded-xl transition"
              >
                {loading ? "Signing In..." : "Sign In"}
              </button>

            </form>

            {/* Register */}
            <div className="mt-7 pt-6 border-t border-white/10 text-center">

              <p className="text-sm text-slate-400">
                Don't have an account?{" "}

                <a
                  href="/register"
                  className="text-cyan-400 font-semibold hover:text-cyan-300"
                >
                  Create Account
                </a>

              </p>

            </div>

          </div>

          <p className="text-center text-xs text-slate-600 mt-6 leading-5">
            Your account helps us securely manage reports,
            verification and case updates.
          </p>

        </div>

      </section>

    </main>
  );
}

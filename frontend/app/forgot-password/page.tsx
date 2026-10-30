
"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo:
              `${window.location.origin}/reset-password`,
          }
        );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setMessage(
        "If your email is registered, you will receive a password reset link. Check your inbox and spam folder."
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#06111f] flex items-center justify-center px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">

        <div className="text-center">
          <h1 className="text-2xl font-bold">
            FindBack<span className="text-cyan-400">AI</span>
          </h1>

          <h2 className="mt-7 text-2xl font-bold">
            Forgot Password?
          </h2>

          <p className="mt-3 text-sm text-slate-400">
            Enter your registered email address.
            We will send you a password reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8">
          <label className="text-sm text-slate-300">
            Email Address
          </label>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 outline-none focus:border-cyan-400/50"
          />

          {error && (
            <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          {message && (
            <p className="mt-4 rounded-xl bg-green-500/10 p-3 text-sm text-green-300">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-cyan-400 py-3.5 font-bold text-[#03101d] hover:bg-cyan-300 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-sm text-cyan-400 hover:underline"
          >
            ← Back to Login
          </Link>
        </div>
      </div>
    </main>
  );
}

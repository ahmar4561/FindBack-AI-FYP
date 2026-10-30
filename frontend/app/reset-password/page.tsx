
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function initializeRecovery() {
      try {
        const hash = new URLSearchParams(
          window.location.hash.substring(1)
        );

        const query = new URLSearchParams(
          window.location.search
        );

        const linkError =
          hash.get("error_description") ||
          query.get("error_description");

        if (linkError) {
          throw new Error(linkError);
        }

        // Supabase recovery email commonly returns
        // access_token and refresh_token in URL hash.
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const recoveryType = hash.get("type");

        if (
          accessToken &&
          refreshToken &&
          recoveryType === "recovery"
        ) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;

          // Remove sensitive tokens from browser URL.
          window.history.replaceState(
            {},
            "",
            window.location.pathname
          );

          if (active) setAuthorized(true);
          return;
        }

        // Some Supabase configurations use PKCE
        // authorization codes instead of hash tokens.
        const code = query.get("code");

        if (code) {
          const { error } =
            await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;

          window.history.replaceState(
            {},
            "",
            window.location.pathname
          );

          if (active) setAuthorized(true);
          return;
        }

        throw new Error(
          "Open this page using a new password reset link from your email."
        );
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Invalid or expired reset link."
          );
        }
      } finally {
        if (active) setChecking(false);
      }
    }

    initializeRecovery();

    return () => {
      active = false;
    };
  }, []);

  async function handleUpdate(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    setErrorMessage("");

    if (!authorized) {
      setErrorMessage("Valid recovery link required.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage(
        "Password must contain at least 8 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");

      await supabase.auth.signOut();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update password."
      );
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
            Reset Password
          </h2>

          <p className="mt-3 text-sm text-slate-400">
            Create a new password for your account.
          </p>
        </div>

        {success ? (
          <div className="mt-7 text-center">
            <p className="text-green-300">
              Password updated successfully!
            </p>

            <Link
              href="/login"
              className="mt-6 inline-block rounded-xl bg-cyan-400 px-6 py-3 font-bold text-[#03101d]"
            >
              Go to Login
            </Link>
          </div>
        ) : checking ? (
          <p className="mt-7 text-center text-slate-400">
            Verifying reset link...
          </p>
        ) : !authorized ? (
          <div className="mt-7 text-center">
            <p className="text-sm text-red-300">
              {errorMessage}
            </p>

            <Link
              href="/forgot-password"
              className="mt-5 inline-block text-cyan-400 hover:underline"
            >
              Request New Reset Link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleUpdate} className="mt-7">

            <label className="text-sm text-slate-300">
              New Password
            </label>

            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 outline-none focus:border-cyan-400/50"
            />

            <label className="mt-5 block text-sm text-slate-300">
              Confirm Password
            </label>

            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
              placeholder="Confirm new password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 outline-none focus:border-cyan-400/50"
            />

            {errorMessage && (
              <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-cyan-400 py-3.5 font-bold text-[#03101d] hover:bg-cyan-300 disabled:opacity-50"
            >
              {loading
                ? "Updating Password..."
                : "Update Password"}
            </button>
          </form>
        )}

      </div>
    </main>
  );
}

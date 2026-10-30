"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function RegisterPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState("general");
  const [agreed, setAgreed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!fullName || !email || !phone || !password) {
      setErrorMessage("Please fill in all required fields.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    if (!agreed) {
      setErrorMessage("Please agree to the responsible use policy.");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.signUp({
        email,
        password,

        options: {
          data: {
            full_name: fullName,
            phone: phone,
            account_type: accountType,
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage(
        "Account created successfully. Please check your email if verification is required."
      );

      setTimeout(() => {
        router.push("/login");
      }, 2000);

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

      {/* Register Area */}
      <section className="flex-1 flex items-center justify-center px-6 py-12">

        <div className="w-full max-w-lg">

          <div className="text-center mb-8">

            <div className="mx-auto w-14 h-14 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 text-2xl mb-5">
              +
            </div>

            <h2 className="text-3xl font-bold">
              Create Your Account
            </h2>

            <p className="text-slate-400 text-sm mt-3">
              Create an account to submit and manage FindBack reports.
            </p>

          </div>

          <div className="border border-white/10 bg-white/[0.03] rounded-3xl p-7 md:p-8 shadow-2xl">

            <form onSubmit={handleRegister}>

              {/* Name */}
              <div>
                <label className="text-sm text-slate-300">
                  Full Name
                </label>

                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 outline-none focus:border-cyan-400/50 placeholder:text-slate-600"
                />
              </div>

              {/* Email */}
              <div className="mt-5">
                <label className="text-sm text-slate-300">
                  Email Address
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  required
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 outline-none focus:border-cyan-400/50 placeholder:text-slate-600"
                />
              </div>

              {/* Phone */}
              <div className="mt-5">
                <label className="text-sm text-slate-300">
                  Phone Number
                </label>

                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 3XX XXXXXXX"
                  required
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
                    placeholder="Create a strong password"
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 pr-16 outline-none focus:border-cyan-400/50 placeholder:text-slate-600"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-cyan-400"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>

                </div>
              </div>

              {/* Account Type */}
              <div className="mt-5">

                <label className="text-sm text-slate-300">
                  Account Type
                </label>

                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1727] px-4 py-3.5 outline-none focus:border-cyan-400/50 text-slate-300"
                >
                  <option value="general">General User / Reporter</option>
                  <option value="police">Police / Authority</option>
                  <option value="hospital">Hospital Staff</option>
                  <option value="shelter">Shelter / NGO</option>
                </select>

              </div>

              {/* Terms */}
              <label className="flex items-start gap-3 mt-6 text-xs text-slate-400">

                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 accent-cyan-400"
                />

                <span>
                  I agree to use FindBack responsibly and provide accurate
                  information for missing or found person reports.
                </span>

              </label>

              {/* Error */}
              {errorMessage && (
                <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {errorMessage}
                </div>
              )}

              {/* Success */}
              {successMessage && (
                <div className="mt-5 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                  {successMessage}
                </div>
              )}

              {/* Create */}
              <button
                type="submit"
                disabled={loading}
                className="mt-7 w-full bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed text-[#03101d] font-bold py-3.5 rounded-xl transition"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </button>

            </form>

            <div className="mt-7 pt-6 border-t border-white/10 text-center">

              <p className="text-sm text-slate-400">
                Already have an account?{" "}
                <a
                  href="/login"
                  className="text-cyan-400 font-semibold hover:text-cyan-300"
                >
                  Sign In
                </a>
              </p>

            </div>

          </div>

          <p className="text-center text-xs text-slate-600 mt-6">
            Sensitive cases and institutional accounts may require verification.
          </p>

        </div>
      </section>
    </main>
  );
}
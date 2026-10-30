"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

type StaffRole = "admin" | "reviewer" | null;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [staffRole, setStaffRole] = useState<StaffRole>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadRole(currentUser: User | null) {
      if (!currentUser) {
        if (active) setStaffRole(null);
        return;
      }

      const { data, error } = await supabase
        .from("admin_roles")
        .select("role")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (!active) return;

      if (
        !error &&
        (data?.role === "admin" || data?.role === "reviewer")
      ) {
        setStaffRole(data.role);
      } else {
        setStaffRole(null);
      }
    }

    async function checkSession() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!active) return;

      setUser(currentUser);
      await loadRole(currentUser);

      if (active) setAuthLoading(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      const currentUser = session?.user ?? null;

      setUser(currentUser);
      setStaffRole(null);

      if (!currentUser) {
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);

      setTimeout(async () => {
        if (!active) return;

        await loadRole(currentUser);

        if (active) {
          setAuthLoading(false);
        }
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Unable to sign out. Please try again.");
      setSigningOut(false);
      return;
    }

    setUser(null);
    setStaffRole(null);
    setSigningOut(false);
    setMobileMenuOpen(false);

    window.location.assign("/");
  }

  const isStaff =
    staffRole === "admin" || staffRole === "reviewer";

  return (
    <main className="min-h-screen bg-[#06111f] text-white">

      {/* ================= NAVBAR ================= */}

      <nav className="relative z-50 border-b border-white/10 bg-[#06111f]/95 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-5 flex items-center justify-between gap-4">

          {/* LOGO */}

          <a href="/" className="shrink-0">
            <h1 className="text-2xl font-bold tracking-tight">
              FindBack{" "}
              <span className="text-cyan-400">
                AI System
              </span>
            </h1>

            <p className="text-[10px] text-slate-400 tracking-[0.18em]">
              IDENTIFY • VERIFY • REUNITE
            </p>
          </a>

          {/* DESKTOP NAVIGATION */}

          <div className="hidden lg:flex items-center gap-7 text-sm text-slate-300">
            <a
              href="#home"
              className="text-cyan-400 hover:text-cyan-300 transition"
            >
              Home
            </a>

            <a
              href="#how"
              className="hover:text-white transition"
            >
              How It Works
            </a>

            <a
              href="#safety"
              className="hover:text-white transition"
            >
              Safety
            </a>

            <a
              href="#about"
              className="hover:text-white transition"
            >
              About
            </a>
          </div>

          {/* ================= DESKTOP AUTH ================= */}

          <div className="hidden md:flex items-center gap-3">

            {/* LOGGED OUT */}

            {!authLoading && !user && (
              <>
                <a
                  href="/admin/login"
                  className="border border-cyan-400/40 text-cyan-300 px-5 py-2.5 rounded-xl hover:bg-cyan-400/10 hover:border-cyan-300/60 transition text-sm font-semibold"
                >
                  Admin
                </a>

                <a
                  href="/login"
                  className="border border-cyan-400/40 text-cyan-300 px-5 py-2.5 rounded-xl hover:bg-cyan-400/10 hover:border-cyan-300/60 transition text-sm font-semibold"
                >
                  Sign In
                </a>

                <a
                  href="/register"
                  className="bg-cyan-400 hover:bg-cyan-300 text-[#03101d] px-5 py-2.5 rounded-xl transition text-sm font-bold"
                >
                  Sign Up
                </a>
              </>
            )}

            {/* ADMIN / REVIEWER LOGGED IN */}

            {!authLoading && user && isStaff && (
              <>
                <a
                  href="/admin/dashboard"
                  className="border border-cyan-400/40 text-cyan-300 px-5 py-2.5 rounded-xl hover:bg-cyan-400/10 hover:border-cyan-300/60 transition text-sm font-semibold"
                >
                  Admin
                </a>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="border border-red-400/30 text-red-300 px-5 py-2.5 rounded-xl hover:bg-red-400/10 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {signingOut ? "Signing Out..." : "Sign Out"}
                </button>
              </>
            )}

            {/* NORMAL USER LOGGED IN */}

            {!authLoading && user && !isStaff && (
              <>
                <a
                  href="/dashboard"
                  className="border border-cyan-400/40 text-cyan-300 px-5 py-2.5 rounded-xl hover:bg-cyan-400/10 transition text-sm font-semibold"
                >
                  Dashboard
                </a>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="border border-red-400/30 text-red-300 px-5 py-2.5 rounded-xl hover:bg-red-400/10 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {signingOut ? "Signing Out..." : "Sign Out"}
                </button>
              </>
            )}

            {authLoading && (
              <span className="text-xs text-slate-500">
                Checking session...
              </span>
            )}
          </div>

          {/* MOBILE MENU BUTTON */}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden border border-white/20 rounded-xl px-4 py-2 text-sm text-cyan-300"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? "Close" : "Menu"}
          </button>
        </div>

        {/* ================= MOBILE NAVIGATION ================= */}

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#071522] px-6 py-5 space-y-4 text-sm">

            <a
              href="#home"
              onClick={() => setMobileMenuOpen(false)}
              className="block"
            >
              Home
            </a>

            <a
              href="#how"
              onClick={() => setMobileMenuOpen(false)}
              className="block"
            >
              How It Works
            </a>

            <a
              href="#safety"
              onClick={() => setMobileMenuOpen(false)}
              className="block"
            >
              Safety
            </a>

            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="block"
            >
              About
            </a>

            {/* MOBILE LOGGED OUT */}

            {!authLoading && !user && (
              <>
                <a
                  href="/admin/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center border border-cyan-400/40 text-cyan-300 px-5 py-3 rounded-xl hover:bg-cyan-400/10 transition"
                >
                  Admin
                </a>

                <a
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center border border-cyan-400/40 text-cyan-300 px-5 py-3 rounded-xl"
                >
                  Sign In
                </a>

                <a
                  href="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center bg-cyan-400 text-[#03101d] font-bold px-5 py-3 rounded-xl"
                >
                  Sign Up
                </a>
              </>
            )}

            {/* MOBILE ADMIN */}

            {!authLoading && user && isStaff && (
              <>
                <a
                  href="/admin/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center border border-cyan-400/40 text-cyan-300 px-5 py-3 rounded-xl hover:bg-cyan-400/10 transition"
                >
                  Admin
                </a>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full border border-red-400/30 text-red-300 px-5 py-3 rounded-xl disabled:opacity-50"
                >
                  {signingOut ? "Signing Out..." : "Sign Out"}
                </button>
              </>
            )}

            {/* MOBILE NORMAL USER */}

            {!authLoading && user && !isStaff && (
              <>
                <a
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center border border-cyan-400/40 text-cyan-300 px-5 py-3 rounded-xl"
                >
                  Dashboard
                </a>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full border border-red-400/30 text-red-300 px-5 py-3 rounded-xl disabled:opacity-50"
                >
                  {signingOut ? "Signing Out..." : "Sign Out"}
                </button>
              </>
            )}
          </div>
        )}
      </nav>

      {/* ================= HERO ================= */}

      <section
        id="home"
        className="relative min-h-[680px] overflow-hidden flex items-center"
      >
        {/* BACKGROUND IMAGE */}

        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('/findback-hero-bg.png')",
          }}
        />

        {/* DARK OVERLAY */}

        <div className="absolute inset-0 bg-[#03101d]/65" />

        {/* LEFT DARK GRADIENT */}

        <div className="absolute inset-0 bg-gradient-to-r from-[#04111f]/95 via-[#04111f]/65 to-[#04111f]/25" />

        {/* BOTTOM GRADIENT */}

        <div className="absolute inset-0 bg-gradient-to-t from-[#06111f]/90 via-transparent to-transparent" />

        {/* HERO CONTENT */}

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 md:px-8 py-20">
          <div className="max-w-2xl">

            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full border border-cyan-400/30 bg-[#04111f]/60 backdrop-blur-md text-cyan-300 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              AI-POWERED MISSING PERSON RECOVERY
            </div>

            <h2 className="text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
              Bringing People
              <br />

              <span className="text-cyan-400">
                Back Home.
              </span>
            </h2>

            <p className="mt-7 text-base md:text-lg text-slate-300 max-w-xl leading-8">
              FindBack AI System connects missing and found
              person reports using intelligent image and
              multi-attribute matching — helping identify
              potential matches while keeping human
              verification at the center.
            </p>

            {/* HERO BUTTONS */}

            <div className="flex flex-wrap gap-4 mt-9">
              <a
                href="/report-missing"
                className="group bg-cyan-400 hover:bg-cyan-300 text-[#03101d] font-bold px-7 py-4 rounded-xl transition flex items-center gap-3 shadow-lg shadow-cyan-500/10"
              >
                <span>Report Missing Person</span>

                <span className="group-hover:translate-x-1 transition">
                  →
                </span>
              </a>

              <a
                href="/report-found"
                className="group bg-[#071522]/70 backdrop-blur-md border border-white/30 hover:border-cyan-400/60 px-7 py-4 rounded-xl transition flex items-center gap-3"
              >
                <span>Report Found Person</span>

                <span className="group-hover:translate-x-1 transition">
                  →
                </span>
              </a>
            </div>

            {/* TRUST FEATURES */}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10 max-w-2xl">

              <div className="flex items-center gap-3 border border-white/10 bg-black/20 backdrop-blur-md rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400">
                  ◇
                </div>

                <div>
                  <p className="text-sm font-semibold">
                    Secure Records
                  </p>

                  <p className="text-[10px] text-slate-400">
                    Protected data
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 border border-white/10 bg-black/20 rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400">
                  ✦
                </div>

                <div>
                  <p className="text-sm font-semibold">
                    AI Matching
                  </p>

                  <p className="text-[10px] text-slate-400">
                    Smart identification
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 border border-white/10 bg-black/20 rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400">
                  ✓
                </div>

                <div>
                  <p className="text-sm font-semibold">
                    Human Verified
                  </p>

                  <p className="text-[10px] text-slate-400">
                    Controlled process
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* PROFESSIONAL SCROLL INDICATOR */}

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 hidden md:block">
          <a
            href="#how"
            className="group flex flex-col items-center gap-2 text-[11px] tracking-wide text-slate-500 hover:text-cyan-300 transition"
          >
            <span>
              Explore FindBack AI System
            </span>

            <span className="text-cyan-400/70 text-lg leading-none group-hover:translate-y-1 transition-transform">
              ↓
            </span>
          </a>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}

      <section
        id="how"
        className="relative border-t border-white/10 bg-[#071522]"
      >
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-24">

          <div className="text-center mb-14">
            <p className="text-cyan-400 text-xs font-semibold tracking-[0.25em]">
              SIMPLE • SECURE • INTELLIGENT
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mt-4">
              How FindBack AI System Works
            </h2>

            <p className="text-slate-400 mt-4 max-w-2xl mx-auto leading-7">
              A structured process designed to connect
              missing and found person reports safely and
              intelligently.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">

            {/* STEP 1 */}

            <div className="group border border-white/10 bg-white/[0.025] rounded-2xl p-8 hover:border-cyan-400/40 hover:-translate-y-1 transition duration-300">
              <div className="w-12 h-12 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 font-bold">
                01
              </div>

              <h3 className="text-xl font-semibold mt-6">
                Report
              </h3>

              <p className="text-sm text-slate-400 mt-3 leading-6">
                A guardian, reporter or finder submits
                available person details, location
                information and a clear image.
              </p>
            </div>

            {/* STEP 2 */}

            <div className="group border border-white/10 bg-white/[0.025] rounded-2xl p-8 hover:border-cyan-400/40 hover:-translate-y-1 transition duration-300">
              <div className="w-12 h-12 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 font-bold">
                02
              </div>

              <h3 className="text-xl font-semibold mt-6">
                Intelligent Matching
              </h3>

              <p className="text-sm text-slate-400 mt-3 leading-6">
                FindBack AI System compares images,
                physical attributes and contextual
                information to identify potential matches.
              </p>
            </div>

            {/* STEP 3 */}

            <div className="group border border-white/10 bg-white/[0.025] rounded-2xl p-8 hover:border-cyan-400/40 hover:-translate-y-1 transition duration-300">
              <div className="w-12 h-12 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 font-bold">
                03
              </div>

              <h3 className="text-xl font-semibold mt-6">
                Verify & Reunite
              </h3>

              <p className="text-sm text-slate-400 mt-3 leading-6">
                Potential matches are reviewed and verified
                before notification, safe recovery and case
                resolution.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ================= SAFETY ================= */}

      <section
        id="safety"
        className="bg-[#06111f]"
      >
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-24">

          <div className="relative overflow-hidden border border-cyan-400/15 rounded-3xl bg-gradient-to-br from-cyan-400/[0.08] to-blue-500/[0.02] p-8 md:p-12">

            <div className="absolute -right-20 -top-20 w-64 h-64 bg-cyan-400/10 rounded-full blur-3xl" />

            <div className="relative z-10">

              <p className="text-cyan-400 text-xs tracking-[0.25em] font-semibold">
                SAFETY FIRST
              </p>

              <h2 className="text-3xl md:text-4xl font-bold mt-4">
                AI assists. Humans verify.
              </h2>

              <p className="text-slate-400 mt-5 max-w-3xl leading-7">
                FindBack AI System does not treat an AI
                similarity score as a confirmed identity.
                Potential matches remain subject to
                controlled human verification before
                sensitive information is shared or a case
                is resolved.
              </p>

              <div className="grid md:grid-cols-3 gap-5 mt-10">

                <div className="border border-white/10 bg-black/20 rounded-2xl p-6">
                  <p className="text-lg font-semibold">
                    Secure Data
                  </p>

                  <p className="text-sm text-slate-400 mt-2 leading-6">
                    Sensitive records and personal
                    information remain protected.
                  </p>
                </div>

                <div className="border border-white/10 bg-black/20 rounded-2xl p-6">
                  <p className="text-lg font-semibold">
                    Potential Matches
                  </p>

                  <p className="text-sm text-slate-400 mt-2 leading-6">
                    AI supports identification instead of
                    automatically confirming identity.
                  </p>
                </div>

                <div className="border border-white/10 bg-black/20 rounded-2xl p-6">
                  <p className="text-lg font-semibold">
                    Human Verification
                  </p>

                  <p className="text-sm text-slate-400 mt-2 leading-6">
                    Important decisions remain under
                    controlled human review.
                  </p>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= ABOUT ================= */}

      <section
        id="about"
        className="border-t border-white/10 bg-[#071522]"
      >
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">

          <p className="text-cyan-400 text-xs tracking-[0.25em] font-semibold">
            ABOUT FINDBACK AI SYSTEM
          </p>

          <h2 className="text-3xl md:text-4xl font-bold mt-4">
            Technology With a Human Purpose
          </h2>

          <p className="text-slate-400 mt-5 leading-8">
            FindBack AI System is an AI-based Missing Person
            Identification and Safe Recovery System designed
            to connect missing-person and found-person
            reports through intelligent matching,
            responsible verification and structured case
            handling.
          </p>

        </div>
      </section>

      {/* ================= FOOTER ================= */}

      <footer className="border-t border-white/10 bg-[#040d17]">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 flex flex-col md:flex-row gap-5 justify-between items-center">

          <div>
            <p className="text-lg font-bold">
              FindBack{" "}
              <span className="text-cyan-400">
                AI System
              </span>
            </p>

            <p className="text-[10px] text-slate-500 tracking-widest mt-1">
              IDENTIFY • VERIFY • REUNITE
            </p>
          </div>

          <p className="text-xs text-slate-500 text-center">
            AI-Based Missing Person Identification & Safe
            Recovery System
          </p>

        </div>
      </footer>

    </main>
  );
}
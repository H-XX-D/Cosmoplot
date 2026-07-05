"use client";

import { FormEvent, useMemo, useState } from "react";

function getUtmValue(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function LeadCaptureForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const donationUrl = process.env.NEXT_PUBLIC_DONATION_URL;

  const utm = useMemo(
    () => ({
      utmSource: getUtmValue("utm_source"),
      utmMedium: getUtmValue("utm_medium"),
      utmCampaign: getUtmValue("utm_campaign"),
      utmContent: getUtmValue("utm_content"),
      utmTerm: getUtmValue("utm_term"),
    }),
    [],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          name,
          company: organization,
          useCase: reason,
          source: "supporter-page",
          page: typeof window !== "undefined" ? window.location.href : "",
          consent: true,
          ...utm,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not save supporter note");
      }
      setStatus("success");
      setMessage("Thanks. You are on the supporter list, and any configured update or donation follow-up can continue from here.");
      setEmail("");
      setName("");
      setOrganization("");
      setReason("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save supporter note");
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl md:grid-cols-2">
      <div className="md:col-span-2">
        <div className="text-[0.68rem] uppercase tracking-[0.24em] text-sky-100/54">Support the project</div>
        <p className="mt-2 text-sm leading-6 text-slate-300/74">
          Join occasional updates, share how you might use Cosmoplot, and help support a public star chart plotter.
        </p>
      </div>
      <label className="grid gap-2 text-sm text-slate-200/84">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-2xl border border-white/12 bg-[#050c1d]/80 px-4 py-3 text-white outline-none transition focus:border-sky-300/40" />
      </label>
      <label className="grid gap-2 text-sm text-slate-200/84">
        <span>Organization</span>
        <input value={organization} onChange={(event) => setOrganization(event.target.value)} className="rounded-2xl border border-white/12 bg-[#050c1d]/80 px-4 py-3 text-white outline-none transition focus:border-sky-300/40" />
      </label>
      <label className="grid gap-2 text-sm text-slate-200/84 md:col-span-2">
        <span>Email</span>
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-2xl border border-white/12 bg-[#050c1d]/80 px-4 py-3 text-white outline-none transition focus:border-sky-300/40" />
      </label>
      <label className="grid gap-2 text-sm text-slate-200/84 md:col-span-2">
        <span>Why do you want to support it?</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="rounded-2xl border border-white/12 bg-[#050c1d]/80 px-4 py-3 text-white outline-none transition focus:border-sky-300/40" placeholder="Public outreach, planetary science, education, open science tooling, donor support, community updates..." />
      </label>
      <div className="md:col-span-2 flex items-center justify-between gap-4">
        <div className={`text-sm ${status === "error" ? "text-rose-300" : "text-slate-300/74"}`}>
          {message || "Your note stays with the local supporter record for follow-up."}
        </div>
        <div className="flex items-center gap-3">
          {donationUrl ? (
            <a href={donationUrl} target="_blank" rel="noreferrer" className="rounded-full border border-amber-300/24 bg-amber-300/14 px-6 py-3 text-sm font-medium text-amber-50 transition hover:bg-amber-300/20">
              Donate now
            </a>
          ) : null}
          <button type="submit" disabled={status === "loading"} className="rounded-full border border-sky-300/24 bg-sky-300/14 px-6 py-3 text-sm font-medium text-sky-50 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-60">
            {status === "loading" ? "Capturing..." : "Join supporter updates"}
          </button>
        </div>
      </div>
    </form>
  );
}

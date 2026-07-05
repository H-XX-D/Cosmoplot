import { mkdir, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";

export const leadInputSchema = z.object({
  email: z.email(),
  name: z.string().trim().max(120).optional().default(""),
  company: z.string().trim().max(160).optional().default(""),
  useCase: z.string().trim().max(2000).optional().default(""),
  source: z.string().trim().max(120).optional().default("website"),
  utmSource: z.string().trim().max(120).optional().default(""),
  utmMedium: z.string().trim().max(120).optional().default(""),
  utmCampaign: z.string().trim().max(160).optional().default(""),
  utmContent: z.string().trim().max(160).optional().default(""),
  utmTerm: z.string().trim().max(160).optional().default(""),
  page: z.string().trim().max(500).optional().default(""),
  consent: z.boolean().optional().default(false),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

export type LeadRecord = LeadInput & {
  id: string;
  createdAt: string;
  referrer: string;
  userAgent: string;
  ipHint: string;
};

function supporterStorePath() {
  // Serverless deployment filesystem is read-only except the temp dir.
  const base = process.env.VERCEL
    ? path.join(os.tmpdir(), "cosmoplot-cache", "business")
    : path.join(process.cwd(), ".cache", "business");
  return path.join(base, "supporters.jsonl");
}

async function persistLead(record: LeadRecord) {
  // Best-effort local log; webhook and email are the durable delivery paths,
  // so a read-only filesystem must not fail the submission.
  try {
    const filePath = supporterStorePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // ignore local persistence failures
  }
}

async function sendLeadWebhook(record: LeadRecord) {
  const webhookUrl = process.env.COSMOPLOT_SUPPORTER_WEBHOOK_URL ?? process.env.COSMOPLOT_LEAD_WEBHOOK_URL;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cosmoplot-event": "supporter.created",
    },
    body: JSON.stringify(record),
  });
}

async function sendLeadEmail(record: LeadRecord) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.COSMOPLOT_SUPPORTERS_TO ?? process.env.COSMOPLOT_LEADS_TO;
  const from = process.env.COSMOPLOT_SUPPORTERS_FROM ?? process.env.COSMOPLOT_LEADS_FROM;
  if (!apiKey || !to || !from) return;

  const html = `
    <h1>New Cosmoplot supporter</h1>
    <p><strong>Email:</strong> ${escapeHtml(record.email)}</p>
    <p><strong>Name:</strong> ${escapeHtml(record.name || "-")}</p>
    <p><strong>Company:</strong> ${escapeHtml(record.company || "-")}</p>
    <p><strong>Use case:</strong> ${escapeHtml(record.useCase || "-")}</p>
    <p><strong>Source:</strong> ${escapeHtml(record.source || "website")}</p>
    <p><strong>UTM:</strong> ${escapeHtml([record.utmSource, record.utmMedium, record.utmCampaign].filter(Boolean).join(" / ") || "-")}</p>
    <p><strong>Page:</strong> ${escapeHtml(record.page || "-")}</p>
    <p><strong>Referrer:</strong> ${escapeHtml(record.referrer || "-")}</p>
    <p><strong>Consent:</strong> ${record.consent ? "yes" : "no"}</p>
    <p><strong>ID:</strong> ${record.id}</p>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "Idempotency-Key": record.id,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `New Cosmoplot supporter: ${record.email}`,
      html,
      reply_to: record.email,
    }),
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function intakeLead(input: LeadInput, context: { referrer?: string; userAgent?: string; ipHint?: string }) {
  const record: LeadRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    referrer: context.referrer ?? "",
    userAgent: context.userAgent ?? "",
    ipHint: context.ipHint ?? "",
  };

  await persistLead(record);
  await Promise.allSettled([sendLeadWebhook(record), sendLeadEmail(record)]);
  return record;
}

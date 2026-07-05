# Donation Operations Blueprint

This is the shortest credible path from a science-heavy demo to a donor-supported public scientific tool.

## Principle

Do not automate accounting, donation processing, or outbound email directly inside the product runtime.
Use the app to emit clean supporter events, then fan them out through purpose-built systems.

## Recommended Stack

### Website / app
- Cosmoplot Next.js app
- supporter intake endpoint inside the app

### Email
- Resend for internal supporter notifications and supporter update workflows
- official docs: https://resend.com/docs/api-reference/emails

### Workflow automation
- n8n for routing supporter events into email, Slack, donation, and ops workflows
- official docs: https://docs.n8n.io/
- webhook production/testing behavior: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/workflow-development/

### Donations
- Stripe Checkout / Payment Links for donation flows
- official docs: https://docs.stripe.com/payment-links
- API reference: https://docs.stripe.com/api/payment-link

### Product analytics / supporter funnel instrumentation
- PostHog for analytics, funnels, session replay, experiments, and donor journey joins
- official docs/home: https://posthog.com/

### Accounting
- QuickBooks Online as the accounting system of record downstream of donation and invoicing events
- official docs: https://developer.intuit.com/app/developer/qbo/docs/develop
- API explorer: https://developer.intuit.com/app/developer/qbo/docs/get-started/get-started-with-the-api-explorer

## Event Flow

1. Visitor lands on the site.
2. Supporter form posts to `/api/leads`.
3. App stores a local JSONL supporter record.
4. If configured, the app fans out to:
   - `COSMOPLOT_SUPPORTER_WEBHOOK_URL` for n8n/supporter routing
   - Resend for internal supporter notification
5. n8n handles the rest:
   - supporter list create/update
   - donor email sequence enrollment
   - Slack alert
   - donation processor handoff
   - finance ops handoff

## Supporter Automations To Add Next

### Supporter funnel
- pageview and CTA event capture
- donor/source segmentation based on supporter reason
- lightweight supporter scoring
- donation-page handoff workflow

### Email
- internal supporter alerts
- donor thank-you sequence
- project update / supporter nurture

### Donations and finance
- Stripe donation success -> donor/accounting sync
- monthly revenue export workflow
- failed recurring-support notification and retry ops

## What is already implemented
- supporter capture API route
- local supporter persistence
- optional webhook fan-out
- optional Resend email fan-out
- env scaffolding for donor-support integrations

## What is intentionally not hardcoded yet
- a specific donor CRM vendor
- ad network automations
- accounting writeback logic

Those should be orchestrated from n8n or a dedicated backend integration layer, not embedded directly into UI code.

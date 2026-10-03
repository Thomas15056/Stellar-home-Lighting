# Stellar Home Lighting — Cloudflare Pages + GitHub

This site is designed for:

**Visitor → Cloudflare Pages site → `/api/lead` server-side function → GoHighLevel inbound webhook**

The GoHighLevel webhook URL is intentionally **not committed to the website code**. Store it as a Cloudflare environment variable named `GHL_WEBHOOK_URL` so visitors cannot view it in page source.

## 1. Put this folder on GitHub

1. Create a new GitHub repository, for example `stellar-home-lighting`.
2. Upload the contents of this folder to the repository root. Make sure `functions/api/lead.js` stays in that exact folder structure.
3. Commit the files.

## 2. Connect GitHub to Cloudflare Pages

1. In Cloudflare, open **Workers & Pages**.
2. Create a **Pages** project and connect your GitHub account/repository.
3. Use no framework preset / static HTML.
4. Leave the build command empty.
5. Set the build output directory to the repository root (`.`) if Cloudflare asks for one.
6. Deploy.

## 3. Add the GoHighLevel webhook securely

In your Cloudflare Pages project:

1. Open **Settings → Environment variables** (wording may vary slightly).
2. Add a variable named:

   `GHL_WEBHOOK_URL`

3. Paste your GoHighLevel inbound webhook URL as the value.
4. Add it for **Production**. You can also add it for Preview if you want form submissions from preview deployments to enter GHL.
5. Save and redeploy the project so the function receives the variable.

Do **not** put the webhook URL in `script.js`, `index.html`, or a public GitHub file.

## 4. Test the form

Open the deployed Cloudflare URL, complete all four steps, and click **Get My Free Quote**.

A successful submission should replace the form with **“Transmission received / You’re on our radar.”**

If it fails, the form shows the business phone number. Check Cloudflare function logs for the reason.

The payload forwarded to GHL includes:

- `first_name`
- `last_name`
- `full_name`
- `email`
- `phone`
- `address`
- `home_coverage`
- `budget_range`
- `lead_source`
- `service`
- `state_market`
- `consent`
- `page_url`
- `submitted_at`

## 5. GoHighLevel workflow mapping

After your first test submission, go back to your GHL Inbound Webhook trigger and load the received sample. Map at least:

- `first_name` → First Name
- `last_name` → Last Name
- `email` → Email
- `phone` → Phone

Recommended custom contact fields:

- `home_coverage` → Home Coverage
- `budget_range` → Project Budget Range
- `address` → Installation Address (or your preferred GHL address field)

Then add **Create/Update Contact** and whatever follow-up automation you want (SMS, call task, pipeline opportunity, email, etc.).

## Local development (optional)

Do not double-click `index.html` to test the webhook. The `/api/lead` route exists only when Cloudflare Pages Functions is running.

If Node is installed, you can use Wrangler locally:

1. Copy `.dev.vars.example` to `.dev.vars`.
2. Put your real webhook URL in `.dev.vars`.
3. Run `npx wrangler pages dev .`
4. Open the local URL Wrangler prints.

`.dev.vars` is ignored by Git and should never be committed.

## 10% promotion countdown
The quote card includes a fixed countdown to **October 31, 2026 at 11:59:59 PM Eastern**. The timer does not reset for each visitor. If you launch a new real promotion later, update `OFFER_END` in `script.js` and the matching on-page promo text/terms.

/**
 * Stellar Home Lighting — Cloudflare Worker
 *
 * Endpoint: POST /api/lead
 * Required secret: LEAD_WEBHOOK_URL
 * Static assets binding: ASSETS
 */

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });

const clean = (value, limit = 500) =>
  typeof value === "string"
    ? value.trim().slice(0, limit)
    : "";

// Only explicit opt-in counts as consent.
const optedIn = (value) =>
  value === true || value === "yes";

const allowedCoverage = [
  "Front Only",
  "Front + Sides",
  "Full Home",
  "Not Sure",
];

const allowedBudgets = [
  "$1,500–$2,999",
  "$3,000–$4,499",
  "$4,500–$5,999",
  "$6,000–$7,499",
  "$7,500–$8,999",
  "$9,000–$9,999",
  "$10,000+",
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve the website normally.
    if (url.pathname !== "/api/lead") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "POST") {
      return json(
        { ok: false, error: "Method not allowed" },
        405,
        { Allow: "POST" }
      );
    }

    try {
      // Validate the configured GHL webhook.
      let webhook;

      try {
        webhook = new URL(env.LEAD_WEBHOOK_URL);

        if (
          webhook.protocol !== "https:" ||
          webhook.username ||
          webhook.password
        ) {
          throw new Error("Invalid webhook configuration");
        }
      } catch {
        console.error(
          "Missing or invalid LEAD_WEBHOOK_URL configuration"
        );

        return json(
          { ok: false, error: "Service unavailable" },
          503
        );
      }

      // Require JSON.
      const contentType = (
        request.headers.get("content-type") || ""
      )
        .split(";")[0]
        .trim()
        .toLowerCase();

      if (contentType !== "application/json") {
        return json(
          { ok: false, error: "JSON required" },
          415
        );
      }

      // Limit the request body to 16 KB.
      const MAX_BYTES = 16384;

      const declaredLength = Number(
        request.headers.get("content-length") || 0
      );

      if (declaredLength > MAX_BYTES) {
        return json(
          { ok: false, error: "Request too large" },
          413
        );
      }

      const reader = request.body?.getReader();

      if (!reader) {
        return json(
          { ok: false, error: "Request body required" },
          400
        );
      }

      const chunks = [];
      let total = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        total += value.byteLength;

        if (total > MAX_BYTES) {
          await reader.cancel();

          return json(
            { ok: false, error: "Request too large" },
            413
          );
        }

        chunks.push(value);
      }

      const bytes = new Uint8Array(total);
      let offset = 0;

      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }

      let data;

      try {
        data = JSON.parse(
          new TextDecoder().decode(bytes)
        );
      } catch {
        return json(
          { ok: false, error: "Invalid JSON" },
          400
        );
      }

      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
      ) {
        return json(
          { ok: false, error: "Invalid form data" },
          400
        );
      }

      // Honeypot: silently discard spam.
      if (data.website) {
        return json({
          ok: true,
          success: true,
        });
      }

      // Read the fields sent by the HTML form.
      const firstName = clean(data.first_name, 100);
      const lastName = clean(data.last_name, 100);
      const email = clean(data.email, 254);
      const phoneInput = clean(data.phone, 40);
      const address = clean(data.address, 300);
      const coverage = clean(data.home_coverage, 100);
      const budget = clean(data.budget_range, 100);
      const quickCall = clean(
        data.quick_call_available,
        100
      );

      // SMS consent is optional and is not required
      // to submit a quote request.
      if (
        !firstName ||
        !lastName ||
        !phoneInput ||
        !address ||
        !allowedCoverage.includes(coverage) ||
        !allowedBudgets.includes(budget) ||
        !["Yes", "Not right now"].includes(quickCall)
      ) {
        return json(
          {
            ok: false,
            error:
              "Please complete all required fields, including quick-call availability.",
          },
          400
        );
      }

      if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        return json(
          {
            ok: false,
            error: "Invalid email address",
          },
          400
        );
      }

      // Normalize US numbers to +1XXXXXXXXXX.
      // International numbers need an explicit +country code.
      const digits = phoneInput.replace(/\D/g, "");
      let phone = "";

      if (/^[+\d\s().-]+$/.test(phoneInput)) {
        const compactPhone = phoneInput.replace(
          /[\s().-]/g,
          ""
        );

        if (/^\+[1-9]\d{7,14}$/.test(compactPhone)) {
          phone = `+${digits}`;
        } else if (
          !phoneInput.includes("+") &&
          digits.length === 10
        ) {
          phone = `+1${digits}`;
        } else if (
          !phoneInput.includes("+") &&
          /^1\d{10}$/.test(digits)
        ) {
          phone = `+${digits}`;
        }
      }

      if (!phone) {
        return json(
          {
            ok: false,
            error:
              "Please enter a valid phone number, including country code for international numbers.",
          },
          400
        );
      }

      // Payload sent to the GHL inbound webhook.
      const lead = {
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`,
        email,
        phone,
        address,

        home_coverage: coverage,
        budget_range: budget,
        quick_call_available: quickCall,

        // Separate permissions. Missing values default to false.
        sms_transactional: optedIn(
          data.sms_transactional
        ),
        sms_marketing: optedIn(
          data.sms_marketing
        ),

        service: "Permanent Outdoor Lighting",
        lead_source: "Stellar Home Lighting Website",
        state_market: "Florida",

        page_url: clean(data.page_url, 1000),
        submitted_at: new Date().toISOString(),
      };

      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        10000
      );

      let response;

      try {
        response = await fetch(webhook.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(lead),
          signal: controller.signal,
          redirect: "manual",
        });
      } catch {
        console.error(
          "GoHighLevel webhook network failure or timeout"
        );

        return json(
          {
            ok: false,
            error:
              "Unable to confirm your quote request. Please call (850) 296-7028.",
          },
          502
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        console.error(
          "GoHighLevel webhook failed:",
          response.status
        );

        return json(
          {
            ok: false,
            error:
              "Unable to submit your quote request.",
          },
          502
        );
      }

      return json({
        ok: true,
        success: true,
        message: "Quote request submitted successfully.",
      });
    } catch {
      // Avoid logging customer information or the webhook secret.
      console.error(
        "Stellar lead submission processing error"
      );

      return json(
        {
          ok: false,
          error: "Unable to process your request.",
        },
        500
      );
    }
  },
};

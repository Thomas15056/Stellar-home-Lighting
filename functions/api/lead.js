
/**
 * Stellar Home Lighting
 * Cloudflare Pages Function
 *
 * File: functions/api/lead.js
 * Endpoint: POST /api/lead
 *
 * Cloudflare Secret:
 * LEAD_WEBHOOK_URL = Your GoHighLevel inbound webhook URL
 *
 * No npm packages required.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const clean = (value, limit = 500) =>
  typeof value === "string"
    ? value.trim().slice(0, limit)
    : "";

export async function onRequestPost({ request, env }) {
  try {
    // Get GoHighLevel webhook from Cloudflare.
    const WEBHOOK_URL = env.LEAD_WEBHOOK_URL;

    if (!WEBHOOK_URL) {
      console.error("LEAD_WEBHOOK_URL is missing");

      return json(
        {
          ok: false,
          error: "Service temporarily unavailable",
        },
        503
      );
    }

    // Require HTTPS for the webhook.
    let webhook;

    try {
      webhook = new URL(WEBHOOK_URL);

      if (webhook.protocol !== "https:") {
        throw new Error("HTTPS required");
      }
    } catch {
      console.error("Invalid webhook configuration");

      return json(
        {
          ok: false,
          error: "Service temporarily unavailable",
        },
        503
      );
    }

    // Only accept JSON submissions.
    const contentType =
      request.headers.get("content-type") || "";

    if (
      !contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      return json(
        {
          ok: false,
          error: "JSON content type required",
        },
        415
      );
    }

    // Limit incoming request size.
    const MAX_BYTES = 16384;

    const declaredLength = Number(
      request.headers.get("content-length") || 0
    );

    if (declaredLength > MAX_BYTES) {
      return json(
        {
          ok: false,
          error: "Request too large",
        },
        413
      );
    }

    // Read request with a size limit.
    const reader = request.body?.getReader();

    if (!reader) {
      return json(
        {
          ok: false,
          error: "Request body required",
        },
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
          {
            ok: false,
            error: "Request too large",
          },
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

    const raw = new TextDecoder().decode(bytes);

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return json(
        {
          ok: false,
          error: "Invalid JSON",
        },
        400
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return json(
        {
          ok: false,
          error: "Invalid form data",
        },
        400
      );
    }

    // Honeypot field for basic bot protection.
    if (data.website) {
      return json({
        ok: true,
        success: true,
      });
    }

    // Extract fields from Stellar's quote form.
    const firstName = clean(data.first_name, 100);
    const lastName = clean(data.last_name, 100);
    const email = clean(data.email, 254);
    const phone = clean(data.phone, 40);
    const address = clean(data.address, 300);
    const coverage = clean(data.home_coverage, 100);
    const budget = clean(data.budget_range, 100);

    // Validate required fields.
    if (
      !firstName ||
      !lastName ||
      !phone ||
      !address ||
      !coverage ||
      !budget ||
      data.consent !== true
    ) {
      return json(
        {
          ok: false,
          error: "Please complete all required fields.",
        },
        400
      );
    }

    // Validate optional email.
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

    // Validate coverage selection.
    const allowedCoverage = [
      "Front Only",
      "Front + Sides",
      "Full Home",
      "Not Sure",
    ];

    if (!allowedCoverage.includes(coverage)) {
      return json(
        {
          ok: false,
          error: "Invalid home coverage selection",
        },
        400
      );
    }

    // Validate budget selection.
    const allowedBudgets = [
      "$1,500–$2,999",
      "$3,000–$4,499",
      "$4,500–$5,999",
      "$6,000–$7,499",
      "$7,500–$8,999",
      "$9,000–$9,999",
      "$10,000+",
    ];

    if (!allowedBudgets.includes(budget)) {
      return json(
        {
          ok: false,
          error: "Invalid budget selection",
        },
        400
      );
    }

    // Prepare lead for GoHighLevel.
    const lead = {
      first_name: firstName,
      last_name: lastName,
      name: `${firstName} ${lastName}`,
      email: email,
      phone: phone,
      address: address,

      // Project information
      home_coverage: coverage,
      budget_range: budget,
      service: "Permanent Outdoor Lighting",

      // Marketing information
      lead_source: "Stellar Home Lighting Website",
      state_market: "Florida",

      // Contact permission
      consent: true,

      // Submission metadata
      page_url: clean(data.page_url, 1000),
      submitted_at: new Date().toISOString(),
    };

    // Forward the lead to GoHighLevel.
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
        redirect: "error",
      });
    } finally {
      clearTimeout(timeout);
    }

    // Check GoHighLevel response.
    if (!response.ok) {
      console.error(
        "GoHighLevel webhook failed:",
        response.status
      );

      return json(
        {
          ok: false,
          error: "Unable to submit your quote request.",
        },
        502
      );
    }

    // Return success to the website.
    return json(
      {
        ok: true,
        success: true,
        message: "Quote request submitted successfully.",
      },
      200
    );
  } catch (error) {
    console.error(
      "Stellar lead submission error:",
      error
    );

    return json(
      {
        ok: false,
        error: "Unable to process your request.",
      },
      500
    );
  }
}

// Used to verify that the API endpoint is deployed.
export function onRequestGet() {
  return json(
    {
      ok: false,
      error: "Method not allowed",
    },
    405
  );
}

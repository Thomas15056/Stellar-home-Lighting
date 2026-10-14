
const WEBHOOK_URL =
  "https://services.leadconnectorhq.com/hooks/MI1tIaEPTtMJqR62nZ83/webhook-trigger/760874a8-cebb-4d69-9752-5e461d19ea1c";

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

export async function onRequestPost({ request }) {
  try {
    const type = request.headers.get("content-type") || "";

    if (!type.toLowerCase().includes("application/json")) {
      return json(
        { ok: false, error: "JSON required" },
        415
      );
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).length > 16384) {
      return json(
        { ok: false, error: "Request too large" },
        413
      );
    }

    let data;

    try {
      data = JSON.parse(raw);
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

    // Honeypot spam field
    if (data.website) {
      return json({ ok: true });
    }

    const firstName = clean(data.first_name, 100);
    const lastName = clean(data.last_name, 100);
    const email = clean(data.email, 254);
    const phone = clean(data.phone, 40);
    const address = clean(data.address, 300);
    const coverage = clean(data.home_coverage, 100);
    const budget = clean(data.budget_range, 100);

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

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return json(
        { ok: false, error: "Invalid email address" },
        400
      );
    }

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

    if (
      !allowedCoverage.includes(coverage) ||
      !allowedBudgets.includes(budget)
    ) {
      return json(
        { ok: false, error: "Invalid project selection" },
        400
      );
    }

    // Payload sent to GoHighLevel
    const lead = {
      first_name: firstName,
      last_name: lastName,
      name: `${firstName} ${lastName}`,
      email,
      phone,
      address,
      home_coverage: coverage,
      budget_range: budget,
      consent: true,
      lead_source: "Stellar Home Lighting Website",
      service: "Permanent Outdoor Lighting",
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
      response = await fetch(WEBHOOK_URL, {
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

    if (!response.ok) {
      console.error(
        "GoHighLevel webhook error:",
        response.status
      );

      return json(
        {
          ok: false,
          error: "Unable to send your quote request.",
        },
        502
      );
    }

    return json({
      ok: true,
      success: true,
      message: "Quote request submitted successfully.",
    });
  } catch (error) {
    console.error("Lead submission error:", error);

    return json(
      {
        ok: false,
        error: "Unable to process your request.",
      },
      500
    );
  }
}

export function onRequestGet() {
  return json(
    { ok: false, error: "Method not allowed" },
    405
  );
}

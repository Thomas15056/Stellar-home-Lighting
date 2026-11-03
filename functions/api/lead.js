
/**
 * Stellar Home Lighting
 * Cloudflare Pages Function
 * POST /api/lead
 *
 * Sends website leads to GoHighLevel.
 *
 * Cloudflare environment secret:
 * LEAD_WEBHOOK_URL or GHL_WEBHOOK_URL
 */

const reply = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const str = (v, max = 300) =>
  typeof v === "string"
    ? v.trim().slice(0, max)
    : "";

const budgets = [
  "$800–$1,499",
  "$1,500–$2,499",
  "$2,500–$3,499",
  "$3,500–$4,999",
  "$5,000–$6,999",
  "$7,000–$9,999",
  "$10,000+"
];

export async function onRequestPost({ request, env }) {
  try {
    const url =
      env.LEAD_WEBHOOK_URL ||
      env.GHL_WEBHOOK_URL;

    if (!url) {
      console.error("GHL webhook not configured");

      return reply({
        ok: false,
        error: "Lead service is not configured."
      }, 503);
    }

    let webhook;

    try {
      webhook = new URL(url);

      if (webhook.protocol !== "https:") {
        throw new Error("Invalid webhook protocol");
      }
    } catch {
      console.error("Invalid GHL webhook configuration");

      return reply({
        ok: false,
        error: "Lead service is not configured."
      }, 503);
    }

    // Verify request content type
    if (
      !(request.headers.get("content-type") || "")
        .includes("application/json")
    ) {
      console.error("Invalid content type");

      return reply({
        ok: false,
        error: "JSON required."
      }, 415);
    }

    const length = Number(
      request.headers.get("content-length") || 0
    );

    if (length > 16384) {
      return reply({
        ok: false,
        error: "Request too large."
      }, 413);
    }

    const body = await request.text();

    if (
      new TextEncoder().encode(body).length > 16384
    ) {
      return reply({
        ok: false,
        error: "Request too large."
      }, 413);
    }

    let data;

    try {
      data = JSON.parse(body);
    } catch {
      console.error("Invalid JSON body");

      return reply({
        ok: false,
        error: "Invalid JSON."
      }, 400);
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      console.error("Invalid JSON object");

      return reply({
        ok: false,
        error: "Invalid request."
      }, 400);
    }

    // Honeypot spam protection
    if (data.website) {
      return reply({ ok: true });
    }

    // Customer name
    const fullName = str(
      data.full_name || data.name,
      200
    );

    const nameParts = fullName
      .split(/\s+/)
      .filter(Boolean);

    const firstName =
      str(data.first_name, 100) ||
      nameParts[0] ||
      "";

    const lastName =
      str(data.last_name, 100) ||
      nameParts.slice(1).join(" ");

    // Phone number
    const phone = str(data.phone, 40);

    const digits = phone.replace(/\D/g, "");

    const normalizedPhone =
      digits.length === 10
        ? `+1${digits}`
        : digits.length === 11 &&
          digits.startsWith("1")
          ? `+${digits}`
          : "";

    // Project information
    const address = str(data.address, 300);
    const budget = str(data.budget_range, 100);
    const email = str(data.email, 254);

    // Detailed validation diagnostics.
    // Only log field names, never personal data.
    const missingFields = [];

    if (!firstName) {
      missingFields.push("first_name");
    }

    if (!normalizedPhone) {
      missingFields.push("phone");
    }

    if (!address) {
      missingFields.push("address");
    }

    if (!budgets.includes(budget)) {
      missingFields.push("budget_range");
    }

    if (missingFields.length > 0) {
      console.error(
        "Lead validation failed:",
        missingFields.join(", ")
      );

      return reply({
        ok: false,
        error: "Please check your form information."
      }, 400);
    }

    // Optional email validation
    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      console.error(
        "Lead validation failed: email"
      );

      return reply({
        ok: false,
        error: "Invalid email."
      }, 400);
    }

    // SMS consent must be explicitly true.
    const smsTransactional =
      data.sms_transactional === true;

    const smsMarketing =
      data.sms_marketing === true;

    const now = new Date().toISOString();

    // Record consent timestamps only
    // when the respective checkbox was selected.
    const transactionalConsentAt =
      smsTransactional ? now : null;

    const marketingConsentAt =
      smsMarketing ? now : null;

    // Discount is pending verification.
    const discountRequested =
      data.discount_percent === 10 &&
      data.discount_offer === "10% timed offer";

    // Contact preference
    const callPreference = str(
      data.quick_call_available,
      100
    );

    // Build GoHighLevel payload
    const lead = {
      first_name: firstName,
      last_name: lastName,

      full_name: [firstName, lastName]
        .filter(Boolean)
        .join(" "),

      name: [firstName, lastName]
        .filter(Boolean)
        .join(" "),

      phone: normalizedPhone,
      email: email,
      address: address,

      budget_range: budget,

      home_coverage: str(
        data.home_coverage,
        100
      ),

      quick_call_available: callPreference,

      service: "Permanent Outdoor Lighting",

      lead_source:
        str(data.lead_source, 100) ||
        "Stellar Home Lighting Website",

      state_market: "Florida",

      // Separate SMS permissions
      sms_transactional: smsTransactional,
      sms_marketing: smsMarketing,

      sms_transactional_consent_at:
        transactionalConsentAt,

      sms_marketing_consent_at:
        marketingConsentAt,

      sms_consent_source:
        str(data.page_url, 1000) ||
        str(
          request.headers.get("referer"),
          1000
        ),

      // Promotional discount
      discount_requested: discountRequested,

      discount_percent_requested:
        discountRequested ? 10 : 0,

      discount_status:
        discountRequested
          ? "Pending verification"
          : "Not requested",

      page_url: str(data.page_url, 1000),
      submitted_at: now
    };

    // Send lead to GoHighLevel
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
          "Content-Type": "application/json"
        },

        body: JSON.stringify(lead),

        signal: controller.signal,
        redirect: "error"
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error(
        "GHL webhook failed with HTTP status:",
        response.status
      );

      return reply({
        ok: false,
        error: "Unable to submit quote."
      }, 502);
    }

    console.log("Lead forwarded to GHL webhook");

    return reply({
      ok: true,
      success: true,
      discount_status: lead.discount_status
    });

  } catch (e) {
    console.error(
      "Lead request failed:",
      e?.name || "UnknownError"
    );

    return reply({
      ok: false,
      error: "Unable to process request."
    }, 500);
  }
}

export function onRequestGet() {
  return reply({
    ok: false,
    error: "Method not allowed"
  }, 405);
}

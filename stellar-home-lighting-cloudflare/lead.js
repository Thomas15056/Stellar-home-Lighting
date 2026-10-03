const REQUIRED_FIELDS = ['first_name', 'last_name', 'phone', 'address', 'home_coverage', 'budget_range'];
const ALLOWED_COVERAGE = new Set(['Front Only', 'Front + Sides', 'Full Home', 'Not Sure']);
const ALLOWED_BUDGETS = new Set([
  '$1,500–$2,999',
  '$3,000–$4,499',
  '$4,500–$5,999',
  '$6,000–$7,499',
  '$7,500–$8,999',
  '$9,000–$9,999',
  '$10,000+'
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GHL_WEBHOOK_URL) {
    console.error('GHL_WEBHOOK_URL is not configured');
    return json({ ok: false, error: 'Server configuration is incomplete.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }

  // Honeypot: pretend success so simple bots do not learn how the filter works.
  if (body.website) return json({ ok: true });

  for (const field of REQUIRED_FIELDS) {
    if (!String(body[field] || '').trim()) {
      return json({ ok: false, error: `Missing ${field}.` }, 400);
    }
  }

  if (!body.consent) {
    return json({ ok: false, error: 'Consent is required.' }, 400);
  }

  if (!ALLOWED_COVERAGE.has(body.home_coverage) || !ALLOWED_BUDGETS.has(body.budget_range)) {
    return json({ ok: false, error: 'Invalid project selection.' }, 400);
  }

  const forwarded = {
    first_name: String(body.first_name).slice(0, 80),
    last_name: String(body.last_name).slice(0, 80),
    full_name: `${String(body.first_name).trim()} ${String(body.last_name).trim()}`.trim(),
    email: String(body.email || '').slice(0, 160),
    phone: String(body.phone).slice(0, 40),
    address: String(body.address).slice(0, 240),
    home_coverage: body.home_coverage,
    budget_range: body.budget_range,
    lead_source: 'Stellar Home Lighting Website',
    service: 'Permanent Outdoor Lighting',
    state_market: 'Florida',
    consent: true,
    page_url: String(body.page_url || '').slice(0, 500),
    submitted_at: String(body.submitted_at || new Date().toISOString()),
    promotion: String(body.promotion || '').slice(0, 120),
    promotion_expires: String(body.promotion_expires || '').slice(0, 80),
    cf_country: request.cf?.country || '',
    cf_region: request.cf?.region || ''
  };

  try {
    const ghlResponse = await fetch(env.GHL_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'StellarHomeLighting/1.0'
      },
      body: JSON.stringify(forwarded)
    });

    if (!ghlResponse.ok) {
      const text = await ghlResponse.text().catch(() => '');
      console.error('GHL webhook failed', ghlResponse.status, text.slice(0, 500));
      return json({ ok: false, error: 'Lead delivery failed.' }, 502);
    }

    return json({ ok: true }, 200);
  } catch (error) {
    console.error('GHL webhook request error', error);
    return json({ ok: false, error: 'Lead delivery failed.' }, 502);
  }
}

export function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, error: 'Method not allowed.' }, 405);
}

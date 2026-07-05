// Travel sync worker (Cloudflare)
// One hub. Your app is the only UI. Everything else is headless:
//   - DC Member API      two-way trip sync (you enter in your app, it mirrors to DC and pulls DC-origin trips)
//   - Google Calendar    reads events you already drop in (Booking, Airbnb...) as trip segments, writes one clean event per trip
//   - Gmail + Claude      parses confirmation emails (drivers, transfers) into segments
//   - TripIt API          OPTIONAL drop-in replacement for ingestion (see note in ingestSegments)
//
// Storage: one KV namespace bound as TRIPS, single JSON doc under key "store".
// Secrets (wrangler secret put NAME):
//   DC_API_KEY  ANTHROPIC_API_KEY
//   GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET  GOOGLE_REFRESH_TOKEN  GOOGLE_CALENDAR_ID(optional, default "primary")
//   CALENDLY_TOKEN (optional)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    // --- Password gate. The password is set in-app and stored hashed in KV; no
    // dashboard secret needed. Once set, /trips and /sync require the X-Auth token.
    if (url.pathname === "/auth/status" && request.method === "GET") {
      return cors(json({ set: !!(await env.TRIPS.get("auth")) }));
    }
    if (url.pathname === "/auth/login" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const pw = (body && body.password) || "";
      const email = ((body && body.email) || "").trim().toLowerCase();
      if (!pw || !email) return cors(json({ error: "email and password required" }, 400));
      const hash = await sha256(pw);
      const storedHash = await env.TRIPS.get("auth");
      const storedEmail = await env.TRIPS.get("auth_email");
      if (!storedHash) {                                       // first-time setup
        await env.TRIPS.put("auth", hash);
        await env.TRIPS.put("auth_email", email);
        return okLogin(hash);
      }
      if (hash !== storedHash) return cors(json({ error: "wrong email or password" }, 401));
      if (!storedEmail) { await env.TRIPS.put("auth_email", email); } // migrate a password-only setup
      else if (storedEmail !== email) return cors(json({ error: "wrong email or password" }, 401));
      return okLogin(hash);
    }
    // Log out: expire the session cookie. Public (needs no auth) - it only clears.
    if (url.pathname === "/auth/logout" && request.method === "POST") {
      const r = cors(json({ ok: true }));
      r.headers.append("Set-Cookie", `tk=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`);
      return r;
    }
    const blocked = await authGuard(request, env);
    if (blocked) return cors(blocked);

    // --- In-app DC key (self-host friendly). Paste your dk_ key in Settings
    // instead of setting a dashboard secret. Stored in YOUR OWN KV, used only
    // server-side, and never returned to the browser in full. A dashboard
    // secret (DC_API_KEY / DC), if present, always wins.
    if (url.pathname === "/settings" && request.method === "GET") {
      const kv = (await env.TRIPS.get("dc_api_key")) || "";
      const sec = env.DC_API_KEY || env.DC || "";
      return cors(json({
        dcKeySet: !!(kv || sec),
        dcKeySource: sec ? "secret" : (kv ? "in-app" : "none"),
        dcKeyMask: sec ? "set via dashboard secret" : (kv ? maskKey(kv) : null),
      }));
    }
    if (url.pathname === "/settings/dckey" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const key = ((body && body.key) || "").trim();
      const sec = env.DC_API_KEY || env.DC || "";
      if (key === "") {
        await env.TRIPS.delete("dc_api_key");
        return cors(json({ ok: true, dcKeySet: !!sec, dcKeySource: sec ? "secret" : "none", dcKeyMask: sec ? "set via dashboard secret" : null }));
      }
      if (!key.startsWith("dk_")) return cors(json({ error: "A DC key starts with \"dk_\"." }, 400));
      await env.TRIPS.put("dc_api_key", key);
      return cors(json({ ok: true, dcKeySet: true, dcKeySource: sec ? "secret" : "in-app", dcKeyMask: sec ? "set via dashboard secret" : maskKey(key) }));
    }
    // Validate the effective DC key against DC /profile - powers "Test connection".
    if (url.pathname === "/dc/test" && request.method === "GET") {
      env._dcKey = (await env.TRIPS.get("dc_api_key")) || "";
      if (!dcKey(env)) return cors(json({ ok: false, error: "No DC key set yet." }));
      try {
        const p = await dcGet(env, "/profile");
        const name = p.displayName || p.fullName || p.name || (p.profile && (p.profile.displayName || p.profile.fullName)) || "your DC account";
        return cors(json({ ok: true, name }));
      } catch (e) { return cors(json({ ok: false, error: "DC rejected that key." })); }
    }

    // Your app reads the consolidated, segment-enriched trips from here.
    if (url.pathname === "/trips" && request.method === "GET") {
      const store = await loadStore(env);
      return cors(json(Object.values(store.trips).sort((a, b) => (a.start < b.start ? -1 : 1))));
    }
    // Your app creates OR updates a trip here. Manual plans you edit are merged with ingested ones.
    if (url.pathname === "/trips" && request.method === "POST") {
      const store = await loadStore(env);
      const body = await request.json();
      const id = body.id || uid();
      const existing = store.trips[id];
      if (existing) {
        const ingested = (existing.segments || []).filter((s) => s.source && s.source !== "manual");
        const manual = (body.segments || []).filter((s) => !s.source || s.source === "manual");
        store.trips[id] = { ...existing, from: body.from, to: body.to, start: body.start, end: body.end,
          label: body.label, notes: body.notes || "", segments: dedupeSegs([...ingested, ...manual]),
          photo: body.photo !== undefined ? body.photo : (existing.photo || ""), updatedAt: Date.now() };
      } else {
        store.trips[id] = { id, dcId: body.dcId || null, from: body.from || "", to: body.to || "",
          start: body.start, end: body.end, label: body.label || "", notes: body.notes || "", segments: body.segments || [],
          photo: body.photo || "", updatedAt: Date.now() };
      }
      await saveStore(env, store);
      ctx.waitUntil(runSync(env)); // mirror to DC + enrich right away
      return cors(json(store.trips[id]));
    }
    // Delete a trip from the hub. Without this, a delete in the app only removed
    // the local copy and the worker's copy resurrected it on every refresh.
    // NOTE: this never deletes the trip in DC (house rule) - if it was linked,
    // its dcId is tombstoned so pullFromDC won't re-import it either.
    if (url.pathname === "/trips/delete" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const store = await loadStore(env);
      const t = body && body.id ? store.trips[body.id] : null;
      if (t) {
        delete store.trips[body.id];
        if (t.dcId) { store.dcSuppressed = store.dcSuppressed || {}; store.dcSuppressed[t.dcId] = Date.now(); }
        await saveStore(env, store);
      }
      return cors(json({ ok: true, deleted: !!t }));
    }
    // Manual trigger (handy while testing). Cron calls runSync on its own.
    // Awaited so the response means the sync actually finished and the store is fresh.
    if (url.pathname === "/sync" && request.method === "POST") {
      await runSync(env);
      return cors(json({ ok: true }));
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSync(env));
  },
};

async function runSync(env) {
  const store = await loadStore(env);
  // Resolve an in-app DC key (if any) once, so the DC calls below can use it.
  if (env._dcKey === undefined) env._dcKey = (await env.TRIPS.get("dc_api_key")) || "";
  try { await pullFromDC(store, env); }      catch (e) { console.error("DC pull", e); }
  try { await pushToDC(store, env); }        catch (e) { console.error("DC push", e); }
  try { await ingestFromCalendar(store, env); } catch (e) { console.error("calendar", e); }
  try { await ingestFromGmail(store, env); } catch (e) { console.error("gmail", e); }
  try { await writeTripsToCalendar(store, env); } catch (e) { console.error("cal write", e); }
  await saveStore(env, store);
}

/* ----------------------------- DC two-way ----------------------------- */
// Finalized against the official DC client (github.com/dynamitecircle/dc:
// py/dc.py) and its OpenAPI contract (contracts/openapi.json):
//   Base URL : https://api.dynamitecircle.com   (NOT dc.dynamitecircle.com)
//   Auth     : Authorization: Bearer dk_<key>   (Bearer, not a custom header)
//   Envelope : success { ok:true, data:{...} } ; error { ok:false, error, message }
//   GET  /trips                  -> data.trips[] (+ data.nextCursor). Each trip:
//        { tripID, note, location:{ city,name,description,placeID,... },
//          startDate, endDate, eventID, points[], roomID }
//   POST /trips { startDate, endDate, note, placeID|eventID } -> data.trip{ tripID }
//        startDate + endDate required; pass EXACTLY ONE of placeID / eventID.
//   GET  /places/search?q=&limit=1 -> data.places[0].placeID  (resolve a destination)
//
// The loop guard: every trip carries its DC id (dcId = tripID) once known.
// Pull matches on dcId first, then on signature (so a trip you JUST pushed is
// not re-created). Push only sends trips that have no dcId yet, then records the
// tripID DC returns. runSync pulls before it pushes.

const DC_BASE = "https://api.dynamitecircle.com";

// Effective DC key. A dashboard secret (DC_API_KEY / DC) always wins; otherwise
// fall back to a key pasted in-app (env._dcKey is loaded from KV before DC calls).
function dcKey(env) { return env.DC_API_KEY || env.DC || env._dcKey || ""; }
// Show enough to recognise the key without revealing it: dk_1234_••••a9
function maskKey(k) { return k && k.length > 10 ? k.slice(0, 8) + "••••" + k.slice(-2) : "dk_••••"; }
function dcHeaders(env, extra) {
  return Object.assign(
    { Authorization: `Bearer ${dcKey(env)}`, Accept: "application/json" },
    extra || {}
  );
}
// DC wraps every response as { ok, data } / { ok:false, error, message }.
async function dcGet(env, path) {
  const res = await fetch(DC_BASE + path, { headers: dcHeaders(env) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    throw new Error(`DC GET ${path} -> ${res.status} ${(body && body.error) || ""}`);
  }
  return body.data || {};
}
async function dcPost(env, path, payload) {
  const res = await fetch(DC_BASE + path, {
    method: "POST",
    headers: dcHeaders(env, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    throw new Error(`DC POST ${path} -> ${res.status} ${(body && body.error) || ""}`);
  }
  return body.data || {};
}
// One DC place lookup. Returns a placeID or "" - never throws, so a search miss
// or error can't abort the whole push.
async function dcSearchPlace(env, query) {
  if (!query) return "";
  try {
    const data = await dcGet(env, `/places/search?q=${encodeURIComponent(query)}&limit=1`);
    const place = (data.places || [])[0];
    return (place && place.placeID) || "";
  } catch (e) { return ""; }
}
// Free geocoder (same one the app uses) to widen an obscure destination to a
// place DC can resolve.
async function geocodeName(name) {
  try {
    const r = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=" + encodeURIComponent(name));
    if (r.ok) { const d = await r.json(); const g = (d.results || [])[0]; if (g) return { name: g.name, admin1: g.admin1, country: g.country }; }
  } catch (e) {}
  return null;
}
// DC trips are created by placeID (or eventID), never free text. Resolve the
// app's free-text destination to a Google placeID DC accepts. If the exact name
// doesn't resolve (e.g. "Jurere Internacional"), geocode it and fall back to the
// city, then region, then country - so the trip still syncs instead of vanishing.
async function dcResolvePlaceId(env, query) {
  if (!query) return "";
  let pid = await dcSearchPlace(env, query);
  if (pid) return pid;
  // Widen via the geocoder. Try the full name, then just its first word
  // ("Jurere Internacional" -> "Jurere"), and for each match try city, region,
  // then country - so it resolves to the nearest place DC knows.
  const tries = [query];
  const first = query.trim().split(/[\s,]+/)[0];
  if (first && first.toLowerCase() !== query.trim().toLowerCase()) tries.push(first);
  for (const q of tries) {
    const g = await geocodeName(q);
    if (!g) continue;
    const cc = g.country ? ", " + g.country : "";
    const cands = [];
    if (g.name) cands.push(g.name + cc);
    if (g.admin1) cands.push(g.admin1 + cc);
    if (g.country) cands.push(g.country);
    for (const c of cands) { pid = await dcSearchPlace(env, c); if (pid) return pid; }
  }
  return "";
}

async function dcPatch(env, path, payload) {
  const res = await fetch(DC_BASE + path, {
    method: "PATCH",
    headers: dcHeaders(env, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    throw new Error(`DC PATCH ${path} -> ${res.status} ${(body && body.error) || ""}`);
  }
  return body.data || {};
}
// Fetch ALL trips of one kind (upcoming or past), following pagination.
async function dcAllTrips(env, past) {
  let out = [], cursor = null;
  for (let i = 0; i < 25; i++) {
    const q = "/trips?limit=100" + (past ? "&past=true" : "") + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
    const data = await dcGet(env, q);
    out = out.concat(data.trips || []);
    cursor = data.nextCursor;
    if (!cursor) break;
  }
  return out;
}

async function pullFromDC(store, env) {
  // Pull BOTH upcoming and past trips, all pages, so nothing is missed.
  const dcTrips = [...(await dcAllTrips(env, false)), ...(await dcAllTrips(env, true))];
  for (const dt of dcTrips) {
    const dcId = String(dt.tripID);
    if (store.dcSuppressed && store.dcSuppressed[dcId]) continue; // deleted in the app -> never re-import
    const dcUpdated = Date.parse(dt.updatedAt) || 0;
    const mapped = mapDcTrip(dt);
    let local = Object.values(store.trips).find((t) => t.dcId === dcId);
    if (!local) local = Object.values(store.trips).find((t) => !t.dcId && sig(t) === sig(mapped));
    if (local) {
      // The app OWNS a linked trip. NEVER overwrite its dates from DC - that is
      // exactly what was reverting your edits. You edit in the app; it pushes up.
      local.dcId = dcId;
      local.dcUpdatedAt = dcUpdated;
    } else {
      const id = uid();
      store.trips[id] = { id, dcId, from: "", ...mapped, segments: [], updatedAt: dcUpdated || Date.now(), dcUpdatedAt: dcUpdated };
    }
  }
}

async function pushToDC(store, env) {
  for (const t of Object.values(store.trips)) {
    if (!t.start || !t.end) continue;  // DC requires startDate + endDate
    if (t.dcId) {
      // Already in DC. If you edited it locally since the last DC sync, push ONLY
      // the new dates (never notes/segments). Otherwise leave it untouched.
      if ((t.updatedAt || 0) > (t.dcUpdatedAt || 0)) {
        try {
          await dcPatch(env, "/trips/" + encodeURIComponent(t.dcId), { startDate: t.start, endDate: t.end });
          t.dcUpdatedAt = t.updatedAt;  // mark synced so we don't re-patch every cycle
        } catch (e) { console.error("DC patch", e); }
      }
      continue;
    }
    // New trip -> create in DC with dates + destination only (no note/segments).
    // Isolated so a single failing trip never blocks the others in this loop.
    try {
      const placeID = await dcResolvePlaceId(env, t.to || t.label || t.from);
      if (!placeID) continue;          // still no resolvable destination -> skip, retry next sync
      const data = await dcPost(env, "/trips", toDcTrip(t, placeID));
      const trip = data.trip || data;
      if (trip && trip.tripID) { t.dcId = String(trip.tripID); t.dcUpdatedAt = t.updatedAt || Date.now(); }
    } catch (e) { console.error("DC create", t.to, e); }
  }
}

// DC -> app. DC trips are destination-only (no origin) and carry the label in
// `note`. Returns only DC-owned fields; the caller preserves local `from`.
function mapDcTrip(dt) {
  const loc = dt.location || {};
  return {
    to: loc.city || loc.name || loc.description || "",
    start: norm(dt.startDate),
    end: norm(dt.endDate),
    label: dt.note || loc.description || loc.city || "",
  };
}
// app -> DC. ONLY the dates + the destination placeID go up. No note, label,
// origin, or segments are ever pushed to DC.
function toDcTrip(t, placeID) {
  const body = { startDate: t.start, endDate: t.end };
  if (placeID) body.placeID = placeID;
  return body;
}

/* --------------------------- Calendar ingest --------------------------- */
// Reads Google Calendar events overlapping each trip and attaches them as segments.
// This is the cleanest source: the Booking.com / Airbnb items you already add to your calendar.

async function ingestFromCalendar(store, env) {
  const token = await googleToken(env);
  const calId = env.GOOGLE_CALENDAR_ID || "primary";
  for (const t of Object.values(store.trips)) {
    if (!t.start || !t.end) continue;
    const timeMin = new Date(t.start + "T00:00:00Z").toISOString();
    const timeMax = new Date(t.end + "T23:59:59Z").toISOString();
    const u = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`
      + `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
    const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) continue;
    const data = await res.json();
    for (const ev of data.items || []) {
      if (ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.travelSyncTrip) continue; // skip events we wrote
      const seg = {
        type: guessType(ev.summary || ""),
        name: ev.summary || "Event",
        start: norm(ev.start && (ev.start.dateTime || ev.start.date)),
        end: norm(ev.end && (ev.end.dateTime || ev.end.date)),
        address: ev.location || "",
        conf: "gcal:" + ev.id,
        source: "calendar",
      };
      addSegment(t, seg);
    }
  }
}

/* ----------------------------- Gmail ingest ---------------------------- */
// For confirmations that only land in email (drivers, transfers). Claude does the extraction.
// SWAP TO TRIPIT: if you would rather not maintain extraction, replace this whole function with a
// single GET https://api.tripit.com/v1/list/object/traveler/true/format/json (OAuth) and map the
// air/lodging/car objects into segments. Same downstream code.

async function ingestFromGmail(store, env) {
  const token = await googleToken(env);
  const q = "newer_than:120d (from:booking.com OR from:airbnb.com OR from:uber.com OR from:bolt.eu "
    + "OR subject:(confirmation OR itinerary OR reservation OR pickup))";
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) return;
  const list = await listRes.json();
  store.seenEmails = store.seenEmails || {};
  for (const m of list.messages || []) {
    if (store.seenEmails[m.id]) continue;
    store.seenEmails[m.id] = 1;
    const text = await gmailPlainText(token, m.id);
    if (!text) continue;
    const seg = await extractSegment(env, text);
    if (seg && seg.start) {
      seg.source = "gmail";
      const trip = findTripForDate(store, seg.start);
      if (trip) addSegment(trip, seg);
    }
  }
}

async function extractSegment(env, emailText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: "From this travel confirmation email, return ONLY a JSON object "
          + '{"type":"flight|hotel|car|ride|rail|other","name":"","start":"YYYY-MM-DD","end":"YYYY-MM-DD","address":"","conf":""}. '
          + "If it is not a real booking, return null. No prose.\n\n" + emailText.slice(0, 6000),
      }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const txt = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  try {
    const obj = JSON.parse(txt.replace(/```json|```/g, "").trim());
    if (!obj || obj === null) return null;
    obj.start = norm(obj.start); obj.end = norm(obj.end);
    return obj;
  } catch (_) { return null; }
}

/* --------------------------- Calendar write ---------------------------- */
// One tidy "Trip: X" event per trip, so the trip shows up on your calendar as a single block.

async function writeTripsToCalendar(store, env) {
  const token = await googleToken(env);
  const calId = env.GOOGLE_CALENDAR_ID || "primary";
  for (const t of Object.values(store.trips)) {
    if (!t.start || !t.end) continue;
    const body = {
      summary: `Trip: ${t.label || (t.to || "Travel")}`,
      start: { date: t.start },
      end: { date: addDay(t.end) }, // all-day end is exclusive
      description: (t.segments || []).map((s) => `${s.type}: ${s.name}`).join("\n"),
      extendedProperties: { private: { travelSyncTrip: t.id } },
    };
    const method = t.calEventId ? "PATCH" : "POST";
    const u = t.calEventId
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${t.calEventId}`
      : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`;
    const res = await fetch(u, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) { const ev = await res.json(); t.calEventId = ev.id; }
  }
}

/* ----------------------------- Calendly (optional) --------------------- */
// If you meant Calendly rather than Google Calendar, finish this and call it inside runSync.
// async function ingestFromCalendly(store, env) {
//   const res = await fetch("https://api.calendly.com/scheduled_events?user=YOUR_USER_URI",
//     { headers: { Authorization: `Bearer ${env.CALENDLY_TOKEN}` } });
//   const data = await res.json();
//   for (const ev of data.collection || []) { /* map ev to a segment, addSegment(trip, seg) */ }
// }

/* ------------------------------- helpers ------------------------------- */
async function googleToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token",
    }),
  });
  const d = await res.json();
  return d.access_token;
}

async function gmailPlainText(token, id) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return "";
  const msg = await res.json();
  const parts = [];
  (function walk(p) {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body && p.body.data) parts.push(b64(p.body.data));
    (p.parts || []).forEach(walk);
  })(msg.payload);
  return parts.join("\n");
}

function dedupeSegs(segs) {
  const seen = {}, out = [];
  for (const s of segs) {
    const key = s.conf || (s.type + "|" + s.name + "|" + s.start);
    if (seen[key]) continue;
    seen[key] = 1; out.push(s);
  }
  return out.sort((a, b) => ((a.start || "") < (b.start || "") ? -1 : 1));
}
function addSegment(trip, seg) {
  trip.segments = trip.segments || [];
  if (seg.conf && trip.segments.some((s) => s.conf === seg.conf)) return; // dedupe by confirmation id
  trip.segments.push(seg);
  trip.segments.sort((a, b) => ((a.start || "") < (b.start || "") ? -1 : 1));
  trip.updatedAt = Date.now();
}
function findTripForDate(store, dateISO) {
  return Object.values(store.trips).find((t) => t.start && t.end && dateISO >= t.start && dateISO <= t.end);
}
function guessType(s) {
  s = s.toLowerCase();
  if (/flight|airlines?|\b[a-z]{2}\d{2,4}\b/.test(s)) return "flight";
  if (/hotel|airbnb|booking|stay|inn|resort/.test(s)) return "hotel";
  if (/car|rental|hertz|avis|sixt/.test(s)) return "car";
  if (/uber|bolt|ride|pickup|driver|transfer/.test(s)) return "ride";
  if (/train|rail|sncf|trenitalia/.test(s)) return "rail";
  return "other";
}
function norm(d) { return d ? String(d).slice(0, 10) : ""; }
function addDay(iso) { const dt = new Date(iso + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + 1); return dt.toISOString().slice(0, 10); }
function sig(t) { return [t.from, t.to, t.start, t.end].join("|").toLowerCase(); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function b64(s) { return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))); }

async function loadStore(env) {
  const raw = await env.TRIPS.get("store");
  return raw ? JSON.parse(raw) : { trips: {}, seenEmails: {} };
}
async function saveStore(env, store) { await env.TRIPS.put("store", JSON.stringify(store)); }

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Successful login: return the token AND set a durable HttpOnly session cookie
// (survives iOS localStorage eviction, so you stay signed in ~30 days).
function okLogin(hash) {
  const r = cors(json({ ok: true, token: hash }));
  r.headers.append("Set-Cookie", `tk=${hash}; Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax`);
  return r;
}
// Returns a 401 Response if a password is set and the request has neither a valid
// X-Auth header nor a valid session cookie, else null.
async function authGuard(request, env) {
  const stored = await env.TRIPS.get("auth");
  // Fail CLOSED: until a password has been set, /trips, /sync and /settings are
  // locked (401), never open. The front end reads /auth/status (which is public)
  // and shows the "create your password" screen; /auth/login (also public) sets
  // it. Only after that does any trip data become reachable, and then only with
  // a matching X-Auth header or tk cookie. No password => no data, ever.
  if (!stored) return json({ error: "setup required - create your password first" }, 401);
  const header = request.headers.get("X-Auth") || "";
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)tk=([^;]+)/);
  const cookie = m ? m[1] : "";
  return (header === stored || cookie === stored) ? null : json({ error: "unauthorized" }, 401);
}

function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json" } }); }
function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers: h });
}

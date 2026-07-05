# Pending travelapp updates (apply manually)

The Claude session lost write access to `giovannibrees/travelapp`, so the latest
fixes are parked here. To apply: copy these 3 files over the same-named files in
https://github.com/giovannibrees/travelapp (main branch):

- `worker.js`            -> repo root
- `travel-app.html`      -> repo root
- `public/index.html`    -> public/  (identical to travel-app.html - keep both)

Easiest way: in travelapp click **Add file -> Upload files**, drag the three
files in (public/index.html goes via the same upload - GitHub keeps the folder
if you drag the whole `public` folder), commit to main. Cloudflare redeploys
automatically.

## What's inside (all verified)
1. SECURITY: auth fails closed - /trips, /sync, /settings are 401 until a password is set
2. Log out button (Settings) - clears session cookie + local token
3. Share = upcoming-only landscape timeline (no past trips, fits phone landscape)
4. Long destination names no longer push Edit/Delete off-screen (mobile)
5. Photo fallback: place without a Wikipedia image -> country image (Jurere -> Brazil)
6. Photo swap: 📷 button on each trip card - paste any image URL, preview, reset
7. DC sync: place resolution falls back place -> city -> region -> country, and one
   bad trip can no longer abort the push (this is what blocked Rio)
8. Zombie-trip fix: deleting a trip now also deletes it on the worker (+ tombstone
   so a DC-linked trip is not re-imported; DC itself is NEVER touched)

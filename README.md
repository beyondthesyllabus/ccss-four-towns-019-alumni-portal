# CCSS Four Towns '19 Set — Alumni Portal

Alumni biodata registration + birthday celebration tracking portal.
React frontend · Express + SQLite backend · light-red/white theme with animations.

## Run it

```
npm install        (first time only)
npm run build      (rebuild the React app after editing src/app.jsx)
npm start          → http://localhost:4000
```

## Sections

- **Home** — landing page with live set stats and birthday gallery preview
- **Alumni Registration** — surname, first name, other names, gender, state & LGA of origin,
  marital status, nationality, WhatsApp number, email, residential address, position in the
  association, date of birth (needed for birthday tracking), password and photo upload
- **Membership Login** — members log in with email or WhatsApp number; their dashboard shows a
  birthday countdown and lets them upload a picture for their celebration
- **Admin Dashboard** — 🔔 notification bell (rings + counts birthdays today / next 30 days /
  members who celebrated without uploading a picture), stats cards, upcoming & recent birthday
  lists, one-click **WhatsApp** (opens wa.me with a pre-filled picture request) and **Email**
  buttons for every celebrant, full member search, and a message log

## Admin login

Default: `admin@ccss19set.org` / `ccss19admin` — **change it in `.env`** (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).

## Optional real integrations (in `.env`)

- `SMTP_HOST/PORT/USER/PASS/FROM` — sends the birthday emails directly from the server.
  Without it the Email button opens the admin's mail app pre-filled.
- `WHATSAPP_TOKEN/PHONE_ID` (Meta Cloud API) — the WhatsApp button always works via wa.me deep link.

## Files

- `server/index.js` — API + database (SQLite auto-creates `portal.db`)
- `src/app.jsx` — React app (built to `public/app.js` with esbuild)
- `public/` — index.html, styles.css
- `uploads/` — member profile & birthday photos

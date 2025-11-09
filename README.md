# Lading Cockpit

Minimal Next.js App Router mockup for exploring palletized shipments from a denormalized JSON file (`data/data.json`). All logic runs client-side with inline filtering, sorting, editable notes, status badges, and CSV export.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 to use the cockpit. The interface loads `data/data.json` directly; edit that file and restart the dev server if you need to test different payloads.

## Notes

- The fixed reference time is `2025-11-09T00:00:00Z` (all status classifications, badges, and “Next arrivals ≤7d” filters rely on it).
- Exported CSV files include only the currently visible (filtered + sorted) rows and preserve the editable notes/status columns.
- No backend/API requests are made; everything happens in the single page at `/`.

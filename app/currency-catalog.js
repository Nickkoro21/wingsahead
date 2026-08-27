"use strict";
/* ════════════════════════════════════════════════════════════════════════
   Wings Ahead — INSTRUCTOR CURRENCY catalogue.  GENERATED FILE — DO NOT EDIT.
   ────────────────────────────────────────────────────────────────────────
   WA_E_ITEMS — the E-items of the 3-01/2025 ΔΑΕ EVENTS table (Ch.4 §48,
                PDF 105-107), read from the FDMS instructor-currency research
                file (data/requirements/instructor_currency.json, 2026-08-14).
   Regenerate with:  python tools/gen-currency-catalog.py

   WA_E_ITEMS.items[]
     id   — THE STORED VALUE. Pure ASCII (e-1a-aerobatics), asserted by the
            generator: the printed code is Greek and its Ε/α are homoglyphs of
            Latin E/a, so a stored code would be a value nobody could retype.
     c    — the printed code, verbatim («Ε-1α»)
     n    — the event name in English, as the catalog prints it
     seat — the ΘΕΣΗ ΧΕΙΡΙΣΤΗ column: which seat the event counts from
     d    — the printed ΔΙΑΘΕΣΙΜΟΤΗΤΑ window in days for an EXPERIENCED
            (ΕΜΠ) instructor, or absent where the 3-01 prints no number. It is
            carried for the TOOLTIP only: this application records that an event
            was exercised and on what day — FDMS is where the window counts down.

   27 of the catalog's 28 e-items. The one that is not, by name:
     e-1d-demo — Chapter 5 of the 3-01 — the display pilot's own currency, which FDMS shows only to the instructor who holds the post.

   WA_S_CATEGORIES — the Σ TAXONOMY (round 20): WHICH sortie was flown, not
                merely which table it belongs to. The 6 printed rows of Πίνακας 9
                (ΑΕΡΟΣ) and Πίνακας 6 (F/S), the 2 recording aids FDMS carries as
                columns of its own, the 1 demo flight of Chapter 5 (round 21,
                Demo pilots only — marked, never hidden), and 2 legacy ids for the
                rows round 19 stored before this taxonomy existed.

   WA_S_CATEGORIES.items[]
     id     — THE STORED VALUE, pure ASCII, asserted like the e-item ids
     c      — the printed code («Σ-3», «SIM-ΔΑ») or, for the two aids, the Greek
              head FDMS prints over the column
     n      — the name in English, as the source prints it
     g      — the PROGRAMME: 'aeros' (Πίνακας 9) or 'fs' (Πίνακας 6). Round 19
              stored this on the row; from round 20 it is DERIVED from the
              category, so a Σ-3 cannot claim to have been flown in the simulator.
     p / a  — the printed semester quota for a POSTED / ATTACHED instructor, or
              absent where the 3-01 prints a dash. Tooltip only: this application
              records that a sortie was flown and on what day, and FDMS is where
              the semester is counted against the printed table.
     aid    — true for a row the 3-01 does not print (FDMS's two columns); `why`
              carries the reason.
     tp     — true where only Test Pilots fly it. The option is MARKED, never
              hidden: this application's test_pilot flag comes from the shared
              roster, and an unset one must not stop a man recording a flight.
     dp     — true where only the DEMO PILOT flies it (round 21 — the tp
              mechanism, second instance). Marked, never hidden: this roster has
              no demo_pilot flag at all — FDMS's is the curated one — so hiding
              would need an invented flag, and an unset invented flag would stop
              a man recording a flight he really flew.
     legacy — true for a value that may be STORED and must never be OFFERED.

   MIRROR: db/schema.sql → wa.e_item_ids() / wa.e_item_name() /
   wa.s_category_ids() / wa.s_category_name() / wa.s_category_group() /
   wa.s_category_legacy_ids(), written by the same run of the same script, so the
   closed lists the form offers and the closed lists the server enforces cannot
   drift.
   ════════════════════════════════════════════════════════════════════════ */
var WA_E_ITEMS = {
  source: "FDMS instructor currency catalogue (instructor_currency.json, 2026-08-14) — 3-01/2025 ΔΑΕ Ch.4 §48, EVENTS table",
  total: 27,
  excluded: [{ id: "e-1d-demo", why: "Chapter 5 of the 3-01 — the display pilot's own currency, which FDMS shows only to the instructor who holds the post" }],
  items: [
    { id: "e-1a-aerobatics", c: "Ε-1α", n: "Aerobatics (Ακροβατικά)", seat: "A&B" },
    { id: "e-1b-spin", c: "Ε-1β", n: "SPIN", seat: "A&B", d: 180 },
    { id: "e-1c-aircraft-test-fcf", c: "Ε-1γ", n: "Aircraft test flight (FCF / Δοκιμή Α/Φ)", seat: "A", d: 90 },
    { id: "e-2-practice-forced-landing", c: "Ε-2", n: "Practice forced landing (Εικονική Αναγκαστική Π/Γ)", seat: "A&B" },
    { id: "e-3-in-cloud-flight", c: "Ε-3", n: "Flight inside cloud (Πτήση εντός νεφών)", seat: "A&B", d: 60 },
    { id: "e-4-ifr-approach", c: "Ε-4", n: "IFR approach (Προσέγγιση IFR)", seat: "A&B" },
    { id: "e-5-formation-descent", c: "Ε-5", n: "Descent in formation (Κάθοδος σε σχηματισμό)", seat: "A&B" },
    { id: "e-6c-landing-light-off-night", c: "Ε-6γ", n: "Approach with landing light OFF (night)", seat: "A&B" },
    { id: "e-9a-no-flap-approach", c: "Ε-9α", n: "Approach without FLAPS", seat: "A&B" },
    { id: "e-9c-heavy-aircraft-approach", c: "Ε-9γ", n: "Approach with a heavy aircraft (Προσέγγιση με βαρύ Α/Φ)", seat: "A&B" },
    { id: "e-10a-foreign-airfield", c: "Ε-10α", n: "Landing, touch & go or approach at a foreign airfield", seat: "A&B" },
    { id: "e-10b-both-runway-directions", c: "Ε-10β", n: "Landing or approach on both runway directions", seat: "A&B" },
    { id: "e-14a-live-weapons-air-to-ground", c: "Ε-14α", n: "Release of live air-to-ground weapons", seat: "A" },
    { id: "e-14b-live-weapons-air-to-air", c: "Ε-14β", n: "Release of live air-to-air weapons", seat: "A" },
    { id: "e-18-formation-takeoff", c: "Ε-18", n: "Formation takeoff (Α/Γ σε σχηματισμό)", seat: "A&B" },
    { id: "e-21-flight-300ft", c: "Ε-21", n: "Flight at 300 ft (LOW ALTITUDE)", seat: "A&B", d: 120 },
    { id: "e-30a-high-altitude-intercept-day", c: "Ε-30α", n: "High-altitude interception, day (Υ.Α.Η.)", seat: "A&B" },
    { id: "e-31a-low-altitude-intercept-day", c: "Ε-31α", n: "Low-altitude interception, day (Χ.Α.Η.)", seat: "A&B", d: 120 },
    { id: "e-32-bfm", c: "Ε-32", n: "BFM (Basic Fighter Manoeuvres)", seat: "A&B", d: 150 },
    { id: "e-40-training-munitions-release", c: "Ε-40", n: "Release of training munitions (Άφεση εκπαιδευτικών πυρομαχικών)", seat: "A", d: 360 },
    { id: "e-41a-range-firing-day", c: "Ε-41α", n: "Range firing, day (Π.ΒΟΛΗΣ (Η))", seat: "A&B" },
    { id: "e-45-visual-delivery-med-hi-apex-day", c: "Ε-45", n: "VISUAL DELIVERY MED/HI APEX, day", seat: "A&B", d: 150 },
    { id: "e-46-visual-delivery-low-apex-day", c: "Ε-46", n: "VISUAL DELIVERY LOW APEX, day", seat: "A&B", d: 120 },
    { id: "e-49a-has-day", c: "Ε-49Α", n: "HAS (High Angle Strafe), day", seat: "A&B" },
    { id: "e-49c-las-day", c: "Ε-49Γ", n: "LAS (Low Angle Strafe), day", seat: "A&B", d: 150 },
    { id: "e-62-oca-strike", c: "Ε-62", n: "OCA (STRIKE)", seat: "A&B" },
    { id: "e-67-cas", c: "Ε-67", n: "CAS (Close Air Support)", seat: "A&B" },
  ],
};

var WA_S_CATEGORIES = {
  source: "FDMS instructor currency catalogue (instructor_currency.json, 2026-08-14) — 3-01/2025 ΔΑΕ Ch.4, Πίνακας 9 (ΑΕΡΟΣ) and Πίνακας 6 (F/S), plus the two recording aids FDMS carries as columns of its own",
  total: 17,
  excluded: [{ id: "sim-refresh-after-abstention", why: "§49 prints a THRESHOLD IN DAYS, not a category — the sortie it demands is a SIM-1, which is in the list already" }, { id: "semiannual-air-total-t6", why: "the printed ΣΥΝΟΛΟ ΕΞΟΔΩΝ row of Πίνακας 9 — a total is not a sortie anybody flies" }, { id: "semiannual-fs-total-t6", why: "the printed ΣΥΝΟΛΑ row of Πίνακας 6 — a total is not a sortie anybody flies" }],
  legacyWhy: "a round-19 row that stored only the programme. The Σ was never recorded and cannot be guessed from a date — it is shown marked, everywhere, and needs the developer's hand",
  items: [
    { id: "s-1-general-adaptation", c: "Σ-1", n: "General Adaptation", g: "aeros", p: 1, a: 1 },
    { id: "s-2-pdo-day", c: "Σ-2", n: "Instrument flight (PDO), day", g: "aeros", p: 1, a: 1 },
    { id: "s-2-pdo-night", c: "Σ-2", n: "Instrument flight (PDO), night", g: "aeros", p: 1 },
    { id: "s-3-air-to-ground", c: "Σ-3", n: "Air-to-Ground missions, day/night", g: "aeros", p: 2, a: 1 },
    { id: "s-4-air-to-air", c: "Σ-4", n: "Air-to-Air missions, day/night", g: "aeros", p: 1 },
    { id: "s-20-no-requirements", c: "Σ-20", n: "No-requirements missions", g: "aeros" },
    { id: "x-night-students", c: "Νυχτερινή με μαθητές", n: "Night sortie flown with students", g: "aeros", aid: true, why: "the 3-01 prints no such requirement — FDMS carries it as a column of its own because the squadron flies it, and because a night sortie is what keeps the night-landing currency alive" },
    { id: "x-fcf-flight", c: "Πτήση δοκιμής (FCF)", n: "Aircraft test flight", g: "aeros", aid: true, why: "a functional check flight is flown by the squadron's Test Pilots and is not a Πίνακας 9 requirement — FDMS carries it as a column of its own, and it is what dates the Ε-1γ row of the EVENTS table", tp: true },
    { id: "x-demo-flight", c: "Πτήση επίδειξης (DEMO)", n: "Display flight (demo sortie)", g: "aeros", aid: true, why: "the 3-01 prints it in Chapter 5 — the display pilot's own sortie. FDMS carries demo as a table of its own, gated on the demo_pilot flag, and §37α counts it (with the FCF) inside Σ-1 for those available. Wings Ahead has no demo-pilot flag, so the option is MARKED, never hidden — the x-fcf reasoning, verbatim", dp: true },
    { id: "legacy-aeros-unspecified", c: "ΑΕΡΟΣ", n: "unspecified (recorded before the Σ taxonomy)", g: "aeros", legacy: true },
    { id: "sim-1", c: "SIM-1", n: "Precision handling / ACRO (F/S)", g: "fs", p: 1, a: 1 },
    { id: "sim-2", c: "SIM-2", n: "IFR (F/S)", g: "fs", p: 1, a: 1 },
    { id: "sim-3", c: "SIM-3", n: "Air-to-Ground missions (F/S)", g: "fs", p: 1 },
    { id: "sim-4", c: "SIM-4", n: "Air-to-Air missions (F/S)", g: "fs" },
    { id: "sim-5", c: "SIM-5", n: "Emergency procedures (F/S)", g: "fs", p: 1, a: 1 },
    { id: "sim-da", c: "SIM-ΔΑ", n: "Aircraft test in the simulator (Test Pilots only)", g: "fs", p: 1, a: 1, tp: true },
    { id: "legacy-fs-unspecified", c: "F/S", n: "unspecified (recorded before the Σ taxonomy)", g: "fs", legacy: true },
  ],
};

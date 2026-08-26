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

   MIRROR: db/schema.sql → wa.e_item_ids() / wa.e_item_name(), written by the
   same run of the same script, so the closed list the form offers and the
   closed list the server enforces cannot drift.
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

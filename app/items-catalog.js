"use strict";
/* ════════════════════════════════════════════════════════════════════════
   Wings Ahead — syllabus catalogue.  GENERATED FILE — DO NOT EDIT.
   ────────────────────────────────────────────────────────────────────────
   WA_ITEMS   — the printed gradesheet items per category, from the FDMS
                Phase II syllabus item list (data/observations/master_index.json
                → contact / instrument / formation / vfr_navigation).
   WA_SORTIES — the Phase II sortie codes per category, from the FDMS
                flow chart (data/flowchart2.json → sorties[]).
   Regenerate with:  python tools/gen-items-catalog.py

   WA_ITEMS.categories[].items[]
     id    — syllabus item id (e.g. contact-12)
     n     — printed item number(s), '12–20' when the printed item spans rows,
             null for CRM (no numbered row)
     name  — the printed item name, verbatim
   WA_SORTIES[categoryId][]
     c     — sortie code (e.g. C4302)      n — printed sortie name
     b     — band: 'flights' | 'fs' (simulator)   k — checkride?
   WA_SOLO_SLOTS[]  — the FIXED solo rows of the stage
     id    — slot id, stored in solo_flights[].slot (e.g. C4801-04-S1)
     sec   — Training Section        track — syllabus track
     n/of  — which solo of that section (F4301-06 prescribes 2)
     req   — the section REQUIRES the solo (C4790-91: the 1st SOLO)
     codes — the sorties the syllabus names as its solo candidates
   WA_EVAL_ORDER[]  — the eight checkrides in SYLLABUS ORDER: the FILE
             ORDER of the sortie entries of flowchart2.json, i.e. the order
             of the printed Training Flow Chart. A later evaluation cannot
             be filled while an earlier one has not been flown (round 6).

   ROUND 12 — THE LOG TABLES
   WA_LOG_SORTIES[band][track][]  — the sorties of ONE log table, in
             FLOW-CHART ORDER (not code order: WA_SORTIES above is sorted by
             code, and in ('flights','instrument') the chart runs
             … I4602 I4701 I4603 I4890).
     c/n   — code and printed name          g — Training Section
     o     — flow-chart position, 1-based    h — prescribed hours or null
     nt    — night     k — checkride     f1 — first solo     sc — solo candidate
   WA_GROUND[]  — the 12 theory groups and their 47 courses. The join key
             for a course is the PAIR (g, c) — OJT is a course of four groups.
     g/name/track/p   — group id, printed name, track, total periods
     courses[] {c, n, p, cond}  — code, name, periods, conditional (foreign SPs)
   WA_EXAMS[]   — the 8 ground-exam groups {id, name, track, p, cond}.
             ONLY these: the nested exams[] of four theory groups (FF 190 ·
             PT 190 · AΕ 190 · JX 190 · JX 191 · NA 191) are COURSES of their
             group in FDMS, and filing them here too would make the two
             systems disagree about what a student is owed.

   117 items, 133 sortie codes and 8 solo slots across 4 categories,
   133 log sorties in 8 (band, track) tables, 47 ground courses in 12
   theory groups and 8 ground exams,
   generated from master_index 2026-08-08T22:10:34 / flow chart 2026-08-09.
   ════════════════════════════════════════════════════════════════════════ */
var WA_ITEMS = {
  source: "FDMS Phase II syllabus item list (master_index.json, 2026-08-08T22:10:34)",
  total: 117,
  categories: [
    { id: "contact", label: "Contact", items: [
      { id: "contact-01", n: "01", name: "GROUND PROCEDURES" },
      { id: "contact-02", n: "02", name: "TAKE OFF" },
      { id: "contact-03", n: "03", name: "DEPARTURE / TRANSITION TO FLIGHT AREAS" },
      { id: "contact-04", n: "04", name: "AREA AWARENESS" },
      { id: "contact-05", n: "05", name: "BASIC A/C CONTROL" },
      { id: "contact-06", n: "06", name: "G –AWARENESS" },
      { id: "contact-07", n: "07", name: "SLOW FLIGHT" },
      { id: "contact-08", n: "08", name: "POWER ON / ELP STALLS" },
      { id: "contact-09", n: "09", name: "TRAFFIC PATTERN STALLS" },
      { id: "contact-10", n: "10", name: "SPIN PREVENTION /SPIN RECOVERY" },
      { id: "contact-11", n: "11", name: "UNUSUAL ATTITUDES RECOVERY" },
      { id: "contact-12", n: "12–20", name: "PRECISION - AEROBATIC MANEUVERS" },
      { id: "contact-21", n: "21", name: "DESCENT - TRAFFIC PATTERN ENTRY" },
      { id: "contact-22", n: "22", name: "AIRPORT TRAFFIC PATTERN" },
      { id: "contact-23", n: "23, 25, 27, 32", name: "LANDING PATTERN (NORMAL, NO FLAP, FLAP T/O - AΟA)" },
      { id: "contact-24", n: "24, 26, 28, 33", name: "LANDING (FLAPS LDG - FLAPS UP - FLAPS Τ/Ο - ELP - AΟA)" },
      { id: "contact-29", n: "29", name: "STRAIGHT-IN (FLAPS LDG, FLAPS UP, FLAPS Τ/Ο)." },
      { id: "contact-30", n: "30", name: "EMERGENCY LANDING PATTERN (ELP)" },
      { id: "contact-34", n: "34", name: "GO AROUND" },
      { id: "contact-35", n: "35", name: "CLOSED PATTERN" },
      { id: "contact-36", n: "36", name: "CLEARING" },
      { id: "contact-37", n: "37", name: "RADIO COMMUNICATION" },
      { id: "contact-38", n: "38", name: "AIRMANSHIP" },
      { id: "contact-39", n: "39", name: "EMERGENCY PROCEDURES" },
      { id: "contact-40", n: "40", name: "GENERAL KNOWLEDGE" },
      { id: "contact-41", n: "41", name: "SPECIAL REQUIREMENTS" },
      { id: "contact-crm", n: null, name: "CRM" },
    ] },
    { id: "instrument", label: "Instrument", items: [
      { id: "instrument-01", n: "01", name: "GROUND PROCEDURES" },
      { id: "instrument-02", n: "02", name: "TAKE OFF" },
      { id: "instrument-03", n: "03", name: "STANDARD INSTRUMENT DEPARTURE (SID)" },
      { id: "instrument-04", n: "04", name: "BASIC A/C CONTROL" },
      { id: "instrument-05", n: "05", name: "STEEP TURNS" },
      { id: "instrument-06", n: "06", name: "AIRSPEED CHANGES" },
      { id: "instrument-07", n: "07–09", name: "CONSTANT AIRSPEED - CONSTANT RATE CLIMBS / DESCENTS AND VERTICAL \"S\"" },
      { id: "instrument-10", n: "10", name: "UNUSUAL ATTITUDES RECOVERY" },
      { id: "instrument-11", n: "11", name: "CONFIDENCE MANEUVERS" },
      { id: "instrument-12", n: "12", name: "COURSE INTERCEPTS" },
      { id: "instrument-13", n: "13", name: "MAINTAINING COURSE" },
      { id: "instrument-14", n: "14", name: "ARC INTERCEPT" },
      { id: "instrument-15", n: "15", name: "MAINTAINING ARC" },
      { id: "instrument-16", n: "16", name: "POINT TO POINT" },
      { id: "instrument-17", n: "17", name: "HOLDING" },
      { id: "instrument-18", n: "18", name: "INSTRUMENT DESCENT (PENETRATION)" },
      { id: "instrument-19", n: "19", name: "EN-ROUTE DESCENT" },
      { id: "instrument-20", n: "20", name: "VOR / TACAN APPROACH" },
      { id: "instrument-21", n: "21", name: "ILS APPROACH" },
      { id: "instrument-22", n: "22", name: "LOCALIZER APPROACH" },
      { id: "instrument-23", n: "23", name: "GCA APPROACH (ASR)" },
      { id: "instrument-24", n: "24", name: "GCA APPROACH (PAR)" },
      { id: "instrument-25", n: "25", name: "GCA APPROACH (GYRO OUT)" },
      { id: "instrument-26", n: "26", name: "STANDBY INSTRUMENTS APPROACH" },
      { id: "instrument-27", n: "27", name: "CIRCLING APPROACH" },
      { id: "instrument-28", n: "28", name: "LANDING" },
      { id: "instrument-29", n: "29", name: "MISSED APPROACH" },
      { id: "instrument-30", n: "30–33", name: "RADIO COMMUNICATION, AIRMANSHIP, EMERGENCY PROCEDURES, GENERAL KNOWLEDGE." },
      { id: "instrument-34", n: "34", name: "SPECIAL REQUIREMENTS" },
      { id: "instrument-crm", n: null, name: "CRM" },
    ] },
    { id: "formation", label: "Formation", items: [
      { id: "formation-01", n: "01–02", name: "TAKE OFF (FORMATION - INTERVAL)" },
      { id: "formation-03", n: "03", name: "DEPARTURE" },
      { id: "formation-04", n: "04", name: "IN FLIGHT PLANNING / FORMATION CONSISTENCY" },
      { id: "formation-05", n: "05", name: "RETURN / DESCENT / TRAFFIC PATTERN ENTRY" },
      { id: "formation-06", n: "06", name: "FORMATION APPROACH" },
      { id: "formation-07", n: "07", name: "FORMATION TAKE OFF" },
      { id: "formation-08", n: "08", name: "INTERVAL TAKE OFF" },
      { id: "formation-09", n: "09", name: "TURNING REJOIN" },
      { id: "formation-10", n: "10", name: "STRAIGHT AHEAD REJOIN" },
      { id: "formation-11", n: "11", name: "OVERSHOOT" },
      { id: "formation-12", n: "12", name: "BREAK OUT" },
      { id: "formation-13", n: "13", name: "FORMATION APPROACH." },
      { id: "formation-14", n: "14", name: "MISSION PLANNING / BRIEFING." },
      { id: "formation-15", n: "15", name: "GROUND PROCEDURES." },
      { id: "formation-16", n: "16", name: "PITCH OUT / SPACING" },
      { id: "formation-17", n: "17", name: "FINGERTIP" },
      { id: "formation-18", n: "18", name: "ROUTE / FIGHTING WING FORMATION" },
      { id: "formation-19", n: "19", name: "ECHELON TURN (AS WINGMAN)" },
      { id: "formation-20", n: "20", name: "CROSS UNDER" },
      { id: "formation-21", n: "21", name: "LEAD CHANGE" },
      { id: "formation-22", n: "22", name: "CLOSE TRAIL" },
      { id: "formation-23", n: "23", name: "EXTENDED TRAIL" },
      { id: "formation-24", n: "24", name: "TACTICAL FORMATION" },
      { id: "formation-24b", n: "24–28", name: "TACTICAL TURNS DELAY 90°, DELAY 45°, IN PLACE, CROSS / HOOK / SHACKLE/ CHECK TURNS" },
      { id: "formation-29", n: "29", name: "BASIC A/C - FORMATION CONTROL" },
      { id: "formation-30", n: "30", name: "LANDING PATTERN" },
      { id: "formation-31", n: "31", name: "LANDING" },
      { id: "formation-32", n: "32", name: "VISUAL SIGNALS" },
      { id: "formation-33", n: "33", name: "CLEARING" },
      { id: "formation-34", n: "34", name: "RADIO COMMUNICATION" },
      { id: "formation-35", n: "35", name: "AIRMANSHIP" },
      { id: "formation-36", n: "36", name: "EMERGENCY PROCEDURES" },
      { id: "formation-37", n: "37", name: "GENERAL KNOWLEDGE" },
      { id: "formation-crm", n: null, name: "CRM" },
    ] },
    { id: "vfr_navigation", label: "VFR Navigation", items: [
      { id: "vfr_navigation-01", n: "01", name: "MISSION PLANNING / BRIEFING - DEBRIEFING" },
      { id: "vfr_navigation-02", n: "02", name: "GROUND PROCEDURES" },
      { id: "vfr_navigation-03", n: "03", name: "TAKEOFF" },
      { id: "vfr_navigation-04", n: "04", name: "VFR DEPARTURE / SID" },
      { id: "vfr_navigation-05", n: "05", name: "BASIC A/C CONTROL / WINGMAN CONSIDERATION" },
      { id: "vfr_navigation-06", n: "06", name: "IN-FLIGHT PLANNING / FORMATION INTERGRITY" },
      { id: "vfr_navigation-07", n: "07", name: "FINGERTIP" },
      { id: "vfr_navigation-08", n: "08", name: "TACTICAL FORMATION" },
      { id: "vfr_navigation-09", n: "09", name: "TACTICAL TURNS" },
      { id: "vfr_navigation-10", n: "10", name: "MAINTAIN TRACK" },
      { id: "vfr_navigation-11", n: "11", name: "MAP READING" },
      { id: "vfr_navigation-12", n: "12", name: "PILOTAGE" },
      { id: "vfr_navigation-13", n: "13", name: "NAVIGATION WITH GPS" },
      { id: "vfr_navigation-14", n: "14", name: "VFR ARRIVAL / TRAFFIC PATTERN ENTRY" },
      { id: "vfr_navigation-15", n: "15", name: "INSTRUMET PROCEDURES" },
      { id: "vfr_navigation-16", n: "16", name: "FORMATION APPROACH" },
      { id: "vfr_navigation-17", n: "17", name: "TRAFFIC PATTERN PROCEDURES" },
      { id: "vfr_navigation-18", n: "18", name: "OVERHEAD PATTERN" },
      { id: "vfr_navigation-19", n: "19", name: "LANDING" },
      { id: "vfr_navigation-20", n: "20", name: "INSTRUMENT PROCEDURES" },
      { id: "vfr_navigation-21", n: "21", name: "CLEARING" },
      { id: "vfr_navigation-22", n: "22", name: "COMMUNICATION" },
      { id: "vfr_navigation-23", n: "23", name: "AIRMANSHIP" },
      { id: "vfr_navigation-24", n: "24", name: "EMERGENCY PROCEDURES" },
      { id: "vfr_navigation-25", n: "25", name: "GENERAL KNOWLEDGE" },
      { id: "vfr_navigation-crm", n: null, name: "CRM" },
    ] }
  ],
};

/* Phase II sortie codes per category — the FAIL / ALMOST GOOD flight-code
   picker (searchable; free text is always accepted as a fallback). */
var WA_SORTIES = {
  "contact": [
    { c: "B1001", n: "Basic exercises (Familiarization) — normal procedures", b: "fs" },
    { c: "B1002", n: "Basic exercises (Familiarization) — normal procedures", b: "fs" },
    { c: "C1101", n: "Contact — basic A/C control and familiarization with flight characteristics", b: "fs" },
    { c: "C2101", n: "Emergency Procedures", b: "fs" },
    { c: "C2201", n: "Contact — fundamental flight maneuvers", b: "fs" },
    { c: "C2202", n: "Contact — fundamental flight maneuvers", b: "fs" },
    { c: "C2301", n: "Emergency Procedures training in a mission profile", b: "fs" },
    { c: "C2302", n: "Emergency Procedures training in a mission profile", b: "fs" },
    { c: "C2401", n: "Contact — fundamental flight maneuvers and landings", b: "fs" },
    { c: "C2402", n: "Contact — fundamental flight maneuvers and landings", b: "fs" },
    { c: "C2403", n: "Contact — fundamental flight maneuvers and landings", b: "fs" },
    { c: "C2501", n: "Emergency Procedures training in a mission profile", b: "fs" },
    { c: "C2502", n: "Emergency Procedures training in a mission profile", b: "fs" },
    { c: "C2503", n: "Emergency Procedures training in a mission profile", b: "fs" },
    { c: "C2601", n: "Contact — fundamental flight maneuvers and landings", b: "fs" },
    { c: "C2602", n: "Contact — fundamental flight maneuvers and landings", b: "fs" },
    { c: "C2603", n: "Contact — fundamental flight maneuvers and landings", b: "fs" },
    { c: "C2604", n: "Contact — fundamental flight maneuvers and landings", b: "fs" },
    { c: "C4101", n: "Contact – Familiarization", b: "flights" },
    { c: "C4201", n: "Contact – fundamental flight maneuvers", b: "flights" },
    { c: "C4202", n: "Contact – fundamental flight maneuvers", b: "flights" },
    { c: "C4203", n: "Contact – fundamental flight maneuvers", b: "flights" },
    { c: "C4301", n: "Contact – Basic Maneuvers", b: "flights" },
    { c: "C4302", n: "Contact – Basic Maneuvers", b: "flights" },
    { c: "C4303", n: "Contact – Basic Maneuvers", b: "flights" },
    { c: "C4401", n: "Contact – Basic Maneuvers", b: "flights" },
    { c: "C4402", n: "Contact – Basic Maneuvers", b: "flights" },
    { c: "C4403", n: "Contact – Basic Maneuvers", b: "flights" },
    { c: "C4590", n: "Contact checkride", b: "flights", k: true },
    { c: "C4601", n: "Contact – Overhead Traffic Pattern", b: "flights" },
    { c: "C4602", n: "Contact – Overhead Traffic Pattern", b: "flights" },
    { c: "C4790", n: "Contact checkride for SOLO (C4790) and 1st SOLO (C4791)", b: "flights", k: true },
    { c: "C4791", n: "Contact checkride for SOLO (C4790) and 1st SOLO (C4791)", b: "flights" },
    { c: "C4801", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C4802", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C4803", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C4804", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C4901", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C4902", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C4903", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C4904", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C4905", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5090", n: "Contact Checkride", b: "flights", k: true },
    { c: "C5101", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5102", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5201", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5202", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5203", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5204", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5301", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5302", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5303", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5304", n: "Contact – Basic/Advanced Maneuvers", b: "flights" },
    { c: "C5490", n: "Final Contact Checkride", b: "flights", k: true },
  ],
  "instrument": [
    { c: "I3101", n: "Basic Instruments procedures", b: "fs" },
    { c: "I3102", n: "Basic Instruments procedures", b: "fs" },
    { c: "I3201", n: "Basic and Advanced Instruments", b: "fs" },
    { c: "I3202", n: "Basic and Advanced Instruments", b: "fs" },
    { c: "I3203", n: "Basic and Advanced Instruments", b: "fs" },
    { c: "I3301", n: "Basic and Advanced Instruments", b: "fs" },
    { c: "I3302", n: "Basic and Advanced Instruments", b: "fs" },
    { c: "I3303", n: "Basic and Advanced Instruments", b: "fs" },
    { c: "I3304", n: "Basic and Advanced Instruments", b: "fs" },
    { c: "I3401", n: "IFR Navigation", b: "fs" },
    { c: "I3402", n: "IFR Navigation", b: "fs" },
    { c: "I3403", n: "IFR Navigation", b: "fs" },
    { c: "I3404", n: "IFR Navigation", b: "fs" },
    { c: "I3501", n: "IFR Navigation", b: "fs" },
    { c: "I3502", n: "IFR Navigation", b: "fs" },
    { c: "I3503", n: "IFR Navigation", b: "fs" },
    { c: "I3504", n: "IFR Navigation", b: "fs" },
    { c: "I3601", n: "Night IFR Navigation", b: "fs" },
    { c: "I4101", n: "Basic Instrument", b: "flights" },
    { c: "I4102", n: "Basic Instrument", b: "flights" },
    { c: "I4201", n: "Advanced Instrument", b: "flights" },
    { c: "I4202", n: "Advanced Instrument", b: "flights" },
    { c: "I4301", n: "Advanced Instrument", b: "flights" },
    { c: "I4302", n: "Advanced Instrument", b: "flights" },
    { c: "I4490", n: "Instrument Checkride", b: "flights", k: true },
    { c: "I4501", n: "IFR navigation flights through airways or Approach to Approach", b: "flights" },
    { c: "I4502", n: "IFR navigation flights through airways or Approach to Approach", b: "flights" },
    { c: "I4601", n: "IFR navigation flights through airways or Approach to Approach", b: "flights" },
    { c: "I4602", n: "IFR navigation flights through airways or Approach to Approach", b: "flights" },
    { c: "I4603", n: "IFR navigation flights through airways or Approach to Approach", b: "flights" },
    { c: "I4701", n: "Night IFR navigation flight through airways", b: "flights" },
    { c: "I4890", n: "Final Instruments Checkride", b: "flights", k: true },
  ],
  "formation": [
    { c: "F3101", n: "Two-ship Formation", b: "fs" },
    { c: "F3102", n: "Two-ship Formation", b: "fs" },
    { c: "F3201", n: "Two-ship Formation", b: "fs" },
    { c: "F3202", n: "Two-ship Formation", b: "fs" },
    { c: "F3203", n: "Two-ship Formation", b: "fs" },
    { c: "F4101", n: "Two-ship Formation", b: "flights" },
    { c: "F4102", n: "Two-ship Formation", b: "flights" },
    { c: "F4103", n: "Two-ship Formation", b: "flights" },
    { c: "F4104", n: "Two-ship Formation", b: "flights" },
    { c: "F4201", n: "Two-ship Formation", b: "flights" },
    { c: "F4202", n: "Two-ship Formation", b: "flights" },
    { c: "F4203", n: "Two-ship Formation", b: "flights" },
    { c: "F4204", n: "Two-ship Formation", b: "flights" },
    { c: "F4301", n: "Two-ship Formation", b: "flights" },
    { c: "F4302", n: "Two-ship Formation", b: "flights" },
    { c: "F4303", n: "Two-ship Formation", b: "flights" },
    { c: "F4304", n: "Two-ship Formation", b: "flights" },
    { c: "F4305", n: "Two-ship Formation", b: "flights" },
    { c: "F4306", n: "Two-ship Formation", b: "flights" },
    { c: "F4401", n: "Two-ship Formation (Closed and Tactical)", b: "flights" },
    { c: "F4402", n: "Two-ship Formation (Closed and Tactical)", b: "flights" },
    { c: "F4403", n: "Two-ship Formation (Closed and Tactical)", b: "flights" },
    { c: "F4404", n: "Two-ship Formation (Closed and Tactical)", b: "flights" },
    { c: "F4501", n: "Two-ship Formation (Closed and Tactical)", b: "flights" },
    { c: "F4502", n: "Two-ship Formation (Closed and Tactical)", b: "flights" },
    { c: "F4503", n: "Two-ship Formation (Closed and Tactical)", b: "flights" },
    { c: "F4690", n: "Final Formation Checkride", b: "flights", k: true },
  ],
  "vfr_navigation": [
    { c: "N2101", n: "VFR Navigation (Medium Level)", b: "fs" },
    { c: "N2201", n: "VFR Navigation (Low Level)", b: "fs" },
    { c: "N2202", n: "VFR Navigation (Low Level)", b: "fs" },
    { c: "N2301", n: "VFR Navigation (Low Level)", b: "fs" },
    { c: "N2302", n: "VFR Navigation (Low Level)", b: "fs" },
    { c: "N2303", n: "VFR Navigation (Low Level)", b: "fs" },
    { c: "N2304", n: "VFR Navigation (Low Level)", b: "fs" },
    { c: "N4101", n: "VFR Navigation (Medium Altitude)", b: "flights" },
    { c: "N4102", n: "VFR Navigation (Medium Altitude)", b: "flights" },
    { c: "N4201", n: "VFR Navigation (Low Altitude)", b: "flights" },
    { c: "N4202", n: "VFR Navigation (Low Altitude)", b: "flights" },
    { c: "N4301", n: "VFR Navigation (Low Altitude)", b: "flights" },
    { c: "N4302", n: "VFR Navigation (Low Altitude)", b: "flights" },
    { c: "N4401", n: "Medium Level VFR Navigation (Two Ship Formation)", b: "flights" },
    { c: "N4402", n: "Medium Level VFR Navigation (Two Ship Formation)", b: "flights" },
    { c: "N4403", n: "Medium Level VFR Navigation (Two Ship Formation)", b: "flights" },
    { c: "N4501", n: "Low Level VFR Navigation (Two Ship Formation)", b: "flights" },
    { c: "N4502", n: "Low Level VFR Navigation (Two Ship Formation)", b: "flights" },
    { c: "N4503", n: "Low Level VFR Navigation (Two Ship Formation)", b: "flights" },
    { c: "N4690", n: "Final Navigation Checkride", b: "flights", k: true },
  ]
};

/* The FIXED solo slots of the stage — one row per solo the syllabus
   prescribes (flow chart groups with SOLO SORTIES > 0). The Solo flights
   section renders exactly these, always, and nothing can add or remove one.
   MIRROR: db/schema.sql → wa.solo_slots(). Change one, change the other. */
var WA_SOLO_SLOTS = [
  { id: "C4790-91-S1", sec: "C4790-91", track: "contact", n: 1, of: 1, req: true,
    name: "Contact checkride for SOLO (C4790) and 1st SOLO (C4791)",
    codes: ["C4791"] },
  { id: "C4801-04-S1", sec: "C4801-04", track: "contact", n: 1, of: 1, req: false,
    name: "Contact – Basic/Advanced Maneuvers",
    codes: ["C4802", "C4803"] },
  { id: "C4901-05-S1", sec: "C4901-05", track: "contact", n: 1, of: 1, req: false,
    name: "Contact – Basic/Advanced Maneuvers",
    codes: ["C4902", "C4903", "C4904"] },
  { id: "C5201-04-S1", sec: "C5201-04", track: "contact", n: 1, of: 1, req: false,
    name: "Contact – Basic/Advanced Maneuvers",
    codes: ["C5202", "C5203"] },
  { id: "C5301-04-S1", sec: "C5301-04", track: "contact", n: 1, of: 1, req: false,
    name: "Contact – Basic/Advanced Maneuvers",
    codes: ["C5302", "C5303"] },
  { id: "F4301-06-S1", sec: "F4301-06", track: "formation", n: 1, of: 2, req: false,
    name: "Two-ship Formation",
    codes: ["F4301", "F4302", "F4303", "F4304", "F4305"] },
  { id: "F4301-06-S2", sec: "F4301-06", track: "formation", n: 2, of: 2, req: false,
    name: "Two-ship Formation",
    codes: ["F4301", "F4302", "F4303", "F4304", "F4305"] },
  { id: "F4501-03-S1", sec: "F4501-03", track: "formation", n: 1, of: 1, req: false,
    name: "Two-ship Formation (Closed and Tactical)",
    codes: ["F4501", "F4502"] },
];

/* THE SYLLABUS ORDER OF THE EIGHT CHECKRIDES (round 6) — the FILE ORDER of
   the sortie entries in flowchart2.json, which is the order the printed
   Training Flow Chart lays the stage out in. Never date order: a later
   evaluation cannot be FILLED while an earlier one has not been flown, on the
   client and on the server alike.
   MIRROR: db/schema.sql → wa.eval_ids() / wa.eval_pos(). */
var WA_EVAL_ORDER = ["C4590", "C4790", "C5090", "C5490", "I4490", "I4890", "F4690", "N4690"];

/* ROUND 12 — THE SORTIES OF ONE LOG TABLE, IN FLOW-CHART ORDER.
   Eight lists, one per (band, track): the 4+4 tables the directive asks
   for. The order is the FILE ORDER of flowchart2.json — the order the
   printed Training Flow Chart lays the stage out in — and NOT the code
   order WA_SORTIES above carries: in ('flights','instrument') the chart
   runs … I4602 I4701 I4603 I4890, the night sortie BEFORE I4603, and
   sorting by code reorders the stage silently. Both lists exist on
   purpose: the round-5 pickers keep the order they have always had.
   NOTHING IS PRE-SEEDED FROM THIS. It is the closed list a sortie is
   CHOSEN from, never a skeleton of rows: an unflown sortie is not an
   entry, so wa.slot_empty needs no branch for these sections.
   MIRROR: db/schema.sql → wa.sortie_codes() / wa.sortie_band(). */
var WA_LOG_SORTIES = {
  "flights": {
    "contact": [
      { c: "C4101", n: "Contact – Familiarization", g: "C4101", o: 1, h: 1.0 },
      { c: "C4201", n: "Contact – fundamental flight maneuvers", g: "C4201-03", o: 2, h: 1.3 },
      { c: "C4202", n: "Contact – fundamental flight maneuvers", g: "C4201-03", o: 3, h: 1.3 },
      { c: "C4203", n: "Contact – fundamental flight maneuvers", g: "C4201-03", o: 4, h: 1.3 },
      { c: "C4301", n: "Contact – Basic Maneuvers", g: "C4301-03", o: 5, h: 1.3 },
      { c: "C4302", n: "Contact – Basic Maneuvers", g: "C4301-03", o: 6, h: 1.3 },
      { c: "C4303", n: "Contact – Basic Maneuvers", g: "C4301-03", o: 7, h: 1.3 },
      { c: "C4401", n: "Contact – Basic Maneuvers", g: "C4401-03", o: 8, h: 1.3 },
      { c: "C4402", n: "Contact – Basic Maneuvers", g: "C4401-03", o: 9, h: 1.3 },
      { c: "C4403", n: "Contact – Basic Maneuvers", g: "C4401-03", o: 10, h: 1.3 },
      { c: "C4590", n: "Contact checkride", g: "C4590", o: 11, h: 1.4, k: true },
      { c: "C4601", n: "Contact – Overhead Traffic Pattern", g: "C4601-02", o: 12, h: 1.3 },
      { c: "C4602", n: "Contact – Overhead Traffic Pattern", g: "C4601-02", o: 13, h: 1.3 },
      { c: "C4790", n: "Contact checkride for SOLO (C4790) and 1st SOLO (C4791)", g: "C4790-91", o: 14, h: 0.8, k: true },
      { c: "C4791", n: "Contact checkride for SOLO (C4790) and 1st SOLO (C4791)", g: "C4790-91", o: 15, h: 0.3, f1: true, sc: true },
      { c: "C4801", n: "Contact – Basic/Advanced Maneuvers", g: "C4801-04", o: 16, h: 1.2 },
      { c: "C4802", n: "Contact – Basic/Advanced Maneuvers", g: "C4801-04", o: 17, h: 1.2, sc: true },
      { c: "C4803", n: "Contact – Basic/Advanced Maneuvers", g: "C4801-04", o: 18, h: 1.2, sc: true },
      { c: "C4804", n: "Contact – Basic/Advanced Maneuvers", g: "C4801-04", o: 19, h: 1.2 },
      { c: "C4901", n: "Contact – Basic/Advanced Maneuvers", g: "C4901-05", o: 20, h: 1.2 },
      { c: "C4902", n: "Contact – Basic/Advanced Maneuvers", g: "C4901-05", o: 21, h: 1.2, sc: true },
      { c: "C4903", n: "Contact – Basic/Advanced Maneuvers", g: "C4901-05", o: 22, h: 1.2, sc: true },
      { c: "C4904", n: "Contact – Basic/Advanced Maneuvers", g: "C4901-05", o: 23, h: 1.2, sc: true },
      { c: "C4905", n: "Contact – Basic/Advanced Maneuvers", g: "C4901-05", o: 24, h: 1.2 },
      { c: "C5090", n: "Contact Checkride", g: "C5090", o: 25, h: 1.4, k: true },
      { c: "C5101", n: "Contact – Basic/Advanced Maneuvers", g: "C5101-02", o: 26, h: 1.2 },
      { c: "C5102", n: "Contact – Basic/Advanced Maneuvers", g: "C5101-02", o: 27, h: 1.2 },
      { c: "C5201", n: "Contact – Basic/Advanced Maneuvers", g: "C5201-04", o: 28, h: 1.2 },
      { c: "C5202", n: "Contact – Basic/Advanced Maneuvers", g: "C5201-04", o: 29, h: 1.2, sc: true },
      { c: "C5203", n: "Contact – Basic/Advanced Maneuvers", g: "C5201-04", o: 30, h: 1.2, sc: true },
      { c: "C5204", n: "Contact – Basic/Advanced Maneuvers", g: "C5201-04", o: 31, h: 1.2 },
      { c: "C5301", n: "Contact – Basic/Advanced Maneuvers", g: "C5301-04", o: 32, h: 1.2 },
      { c: "C5302", n: "Contact – Basic/Advanced Maneuvers", g: "C5301-04", o: 33, h: 1.2, sc: true },
      { c: "C5303", n: "Contact – Basic/Advanced Maneuvers", g: "C5301-04", o: 34, h: 1.2, sc: true },
      { c: "C5304", n: "Contact – Basic/Advanced Maneuvers", g: "C5301-04", o: 35, h: 1.2 },
      { c: "C5490", n: "Final Contact Checkride", g: "C5490", o: 36, h: 1.3, k: true },
    ],
    "instrument": [
      { c: "I4101", n: "Basic Instrument", g: "I4101-02", o: 1 },
      { c: "I4102", n: "Basic Instrument", g: "I4101-02", o: 2 },
      { c: "I4201", n: "Advanced Instrument", g: "I4201-02", o: 3, h: 1.3 },
      { c: "I4202", n: "Advanced Instrument", g: "I4201-02", o: 4, h: 1.3 },
      { c: "I4301", n: "Advanced Instrument", g: "I4301-02", o: 5, h: 1.3 },
      { c: "I4302", n: "Advanced Instrument", g: "I4301-02", o: 6, h: 1.3 },
      { c: "I4490", n: "Instrument Checkride", g: "I4490", o: 7, h: 1.4, k: true },
      { c: "I4501", n: "IFR navigation flights through airways or Approach to Approach", g: "I4501-02", o: 8, h: 1.3 },
      { c: "I4502", n: "IFR navigation flights through airways or Approach to Approach", g: "I4501-02", o: 9, h: 1.3 },
      { c: "I4601", n: "IFR navigation flights through airways or Approach to Approach", g: "I4601-03", o: 10, h: 1.3 },
      { c: "I4602", n: "IFR navigation flights through airways or Approach to Approach", g: "I4601-03", o: 11, h: 1.3 },
      { c: "I4701", n: "Night IFR navigation flight through airways", g: "I4701", o: 12, h: 1.4, nt: true },
      { c: "I4603", n: "IFR navigation flights through airways or Approach to Approach", g: "I4601-03", o: 13, h: 1.3 },
      { c: "I4890", n: "Final Instruments Checkride", g: "I4890", o: 14, h: 1.3, k: true },
    ],
    "formation": [
      { c: "F4101", n: "Two-ship Formation", g: "F4101-04", o: 1, h: 1.2 },
      { c: "F4102", n: "Two-ship Formation", g: "F4101-04", o: 2, h: 1.2 },
      { c: "F4103", n: "Two-ship Formation", g: "F4101-04", o: 3, h: 1.2 },
      { c: "F4104", n: "Two-ship Formation", g: "F4101-04", o: 4, h: 1.2 },
      { c: "F4201", n: "Two-ship Formation", g: "F4201-04", o: 5, h: 1.2 },
      { c: "F4202", n: "Two-ship Formation", g: "F4201-04", o: 6, h: 1.2 },
      { c: "F4203", n: "Two-ship Formation", g: "F4201-04", o: 7, h: 1.2 },
      { c: "F4204", n: "Two-ship Formation", g: "F4201-04", o: 8, h: 1.2 },
      { c: "F4301", n: "Two-ship Formation", g: "F4301-06", o: 9, h: 1.2, sc: true },
      { c: "F4302", n: "Two-ship Formation", g: "F4301-06", o: 10, h: 1.2, sc: true },
      { c: "F4303", n: "Two-ship Formation", g: "F4301-06", o: 11, h: 1.2, sc: true },
      { c: "F4304", n: "Two-ship Formation", g: "F4301-06", o: 12, h: 1.2, sc: true },
      { c: "F4305", n: "Two-ship Formation", g: "F4301-06", o: 13, h: 1.2, sc: true },
      { c: "F4306", n: "Two-ship Formation", g: "F4301-06", o: 14, h: 1.2 },
      { c: "F4401", n: "Two-ship Formation (Closed and Tactical)", g: "F4401-04", o: 15, h: 1.2 },
      { c: "F4402", n: "Two-ship Formation (Closed and Tactical)", g: "F4401-04", o: 16, h: 1.2 },
      { c: "F4403", n: "Two-ship Formation (Closed and Tactical)", g: "F4401-04", o: 17, h: 1.2 },
      { c: "F4404", n: "Two-ship Formation (Closed and Tactical)", g: "F4401-04", o: 18, h: 1.2 },
      { c: "F4501", n: "Two-ship Formation (Closed and Tactical)", g: "F4501-03", o: 19, h: 1.2, sc: true },
      { c: "F4502", n: "Two-ship Formation (Closed and Tactical)", g: "F4501-03", o: 20, h: 1.2, sc: true },
      { c: "F4503", n: "Two-ship Formation (Closed and Tactical)", g: "F4501-03", o: 21, h: 1.2 },
      { c: "F4690", n: "Final Formation Checkride", g: "F4690", o: 22, h: 1.3, k: true },
    ],
    "vfr_navigation": [
      { c: "N4101", n: "VFR Navigation (Medium Altitude)", g: "N4101-02", o: 1, h: 1.1 },
      { c: "N4102", n: "VFR Navigation (Medium Altitude)", g: "N4101-02", o: 2, h: 1.1 },
      { c: "N4201", n: "VFR Navigation (Low Altitude)", g: "N4201-02", o: 3, h: 1.1 },
      { c: "N4202", n: "VFR Navigation (Low Altitude)", g: "N4201-02", o: 4, h: 1.1 },
      { c: "N4301", n: "VFR Navigation (Low Altitude)", g: "N4301-02", o: 5, h: 1.1 },
      { c: "N4302", n: "VFR Navigation (Low Altitude)", g: "N4301-02", o: 6, h: 1.1 },
      { c: "N4401", n: "Medium Level VFR Navigation (Two Ship Formation)", g: "N4401-03", o: 7, h: 1.1 },
      { c: "N4402", n: "Medium Level VFR Navigation (Two Ship Formation)", g: "N4401-03", o: 8, h: 1.1 },
      { c: "N4403", n: "Medium Level VFR Navigation (Two Ship Formation)", g: "N4401-03", o: 9, h: 1.1 },
      { c: "N4501", n: "Low Level VFR Navigation (Two Ship Formation)", g: "N4501-03", o: 10, h: 1.1 },
      { c: "N4502", n: "Low Level VFR Navigation (Two Ship Formation)", g: "N4501-03", o: 11, h: 1.1 },
      { c: "N4503", n: "Low Level VFR Navigation (Two Ship Formation)", g: "N4501-03", o: 12, h: 1.1 },
      { c: "N4690", n: "Final Navigation Checkride", g: "N4690", o: 13, h: 1.2, k: true },
    ]
  },
  "fs": {
    "contact": [
      { c: "B1001", n: "Basic exercises (Familiarization) — normal procedures", g: "B1001-02", o: 1, h: 1.0 },
      { c: "B1002", n: "Basic exercises (Familiarization) — normal procedures", g: "B1001-02", o: 2, h: 1.0 },
      { c: "C1101", n: "Contact — basic A/C control and familiarization with flight characteristics", g: "C1101", o: 3, h: 1.3 },
      { c: "C2101", n: "Emergency Procedures", g: "C2101", o: 4, h: 1.3 },
      { c: "C2201", n: "Contact — fundamental flight maneuvers", g: "C2201-02", o: 5, h: 1.3 },
      { c: "C2202", n: "Contact — fundamental flight maneuvers", g: "C2201-02", o: 6, h: 1.3 },
      { c: "C2301", n: "Emergency Procedures training in a mission profile", g: "C2301-02", o: 7, h: 1.3 },
      { c: "C2302", n: "Emergency Procedures training in a mission profile", g: "C2301-02", o: 8, h: 1.3 },
      { c: "C2401", n: "Contact — fundamental flight maneuvers and landings", g: "C2401-03", o: 9, h: 1.3 },
      { c: "C2402", n: "Contact — fundamental flight maneuvers and landings", g: "C2401-03", o: 10, h: 1.3 },
      { c: "C2403", n: "Contact — fundamental flight maneuvers and landings", g: "C2401-03", o: 11, h: 1.3 },
      { c: "C2501", n: "Emergency Procedures training in a mission profile", g: "C2501-03", o: 12, h: 1.3 },
      { c: "C2502", n: "Emergency Procedures training in a mission profile", g: "C2501-03", o: 13, h: 1.3 },
      { c: "C2503", n: "Emergency Procedures training in a mission profile", g: "C2501-03", o: 14, h: 1.3 },
      { c: "C2601", n: "Contact — fundamental flight maneuvers and landings", g: "C2601-04", o: 15, h: 1.3 },
      { c: "C2602", n: "Contact — fundamental flight maneuvers and landings", g: "C2601-04", o: 16, h: 1.3 },
      { c: "C2603", n: "Contact — fundamental flight maneuvers and landings", g: "C2601-04", o: 17, h: 1.3 },
      { c: "C2604", n: "Contact — fundamental flight maneuvers and landings", g: "C2601-04", o: 18, h: 1.3 },
    ],
    "instrument": [
      { c: "I3101", n: "Basic Instruments procedures", g: "I3101-02", o: 1, h: 1.2 },
      { c: "I3102", n: "Basic Instruments procedures", g: "I3101-02", o: 2, h: 1.2 },
      { c: "I3201", n: "Basic and Advanced Instruments", g: "I3201-03", o: 3, h: 1.3 },
      { c: "I3202", n: "Basic and Advanced Instruments", g: "I3201-03", o: 4, h: 1.3 },
      { c: "I3203", n: "Basic and Advanced Instruments", g: "I3201-03", o: 5, h: 1.3 },
      { c: "I3301", n: "Basic and Advanced Instruments", g: "I3301-04", o: 6, h: 1.3 },
      { c: "I3302", n: "Basic and Advanced Instruments", g: "I3301-04", o: 7, h: 1.3 },
      { c: "I3303", n: "Basic and Advanced Instruments", g: "I3301-04", o: 8, h: 1.3 },
      { c: "I3304", n: "Basic and Advanced Instruments", g: "I3301-04", o: 9, h: 1.3 },
      { c: "I3401", n: "IFR Navigation", g: "I3401-04", o: 10, h: 1.3 },
      { c: "I3402", n: "IFR Navigation", g: "I3401-04", o: 11, h: 1.3 },
      { c: "I3403", n: "IFR Navigation", g: "I3401-04", o: 12, h: 1.3 },
      { c: "I3404", n: "IFR Navigation", g: "I3401-04", o: 13, h: 1.3 },
      { c: "I3501", n: "IFR Navigation", g: "I3501-04", o: 14, h: 1.3 },
      { c: "I3502", n: "IFR Navigation", g: "I3501-04", o: 15, h: 1.3 },
      { c: "I3503", n: "IFR Navigation", g: "I3501-04", o: 16, h: 1.3 },
      { c: "I3504", n: "IFR Navigation", g: "I3501-04", o: 17, h: 1.3 },
      { c: "I3601", n: "Night IFR Navigation", g: "I3601", o: 18, h: 1.3, nt: true },
    ],
    "formation": [
      { c: "F3101", n: "Two-ship Formation", g: "F3101-2", o: 1, h: 1.3 },
      { c: "F3102", n: "Two-ship Formation", g: "F3101-2", o: 2, h: 1.3 },
      { c: "F3201", n: "Two-ship Formation", g: "F3201-3", o: 3, h: 1.3 },
      { c: "F3202", n: "Two-ship Formation", g: "F3201-3", o: 4, h: 1.3 },
      { c: "F3203", n: "Two-ship Formation", g: "F3201-3", o: 5, h: 1.3 },
    ],
    "vfr_navigation": [
      { c: "N2101", n: "VFR Navigation (Medium Level)", g: "N2101", o: 1, h: 1.3 },
      { c: "N2201", n: "VFR Navigation (Low Level)", g: "N2201-02", o: 2, h: 1.3 },
      { c: "N2202", n: "VFR Navigation (Low Level)", g: "N2201-02", o: 3, h: 1.3 },
      { c: "N2301", n: "VFR Navigation (Low Level)", g: "N2301-04", o: 4, h: 1.3 },
      { c: "N2302", n: "VFR Navigation (Low Level)", g: "N2301-04", o: 5, h: 1.3 },
      { c: "N2303", n: "VFR Navigation (Low Level)", g: "N2301-04", o: 6, h: 1.3 },
      { c: "N2304", n: "VFR Navigation (Low Level)", g: "N2301-04", o: 7, h: 1.3 },
    ]
  }
};

/* THE 12 THEORY GROUPS AND THEIR 47 COURSES (round 12) — derived by a PORT
   of the FDMS parser (app/scheduler.js parseGroupCourses) over the printed
   duration block of each group, and asserted against the four totals it
   must reproduce: 47 courses · 45 required + 2 conditional · 514 required
   periods · 26 supplementary. THE JOIN KEY IS THE PAIR (group, course) —
   never the code alone, because OJT is a course of four different groups.
   `cond` marks a [suppl.] course (foreign SPs who did not cover it at their
   Air Force Academy): it is offered and it never blocks anything.
   MIRROR: db/schema.sql → wa.lesson_groups() / wa.lesson_courses(). */
var WA_GROUND = [
  { g: "GT-WSGES", track: "shared", p: 60,
    name: "A/C systems training — Weapon System Ground Equipment School",
    courses: [
      { c: "A/C Systems (WSGES)", n: "A/C systems training — Weapon System Ground Equipment School", p: 60 },
    ] },
  { g: "GT-INITIAL", track: "shared", p: 34,
    name: "Initial academics: orientation, CAI, flight physiology, local area procedures, normal & emergency procedures",
    courses: [
      { c: "OP 101-115", n: "Orientation to training.", p: 2 },
      { c: "IC 101", n: "Introduction to CAI (Computer Assisted Instruction)", p: 1 },
      { c: "LP 101-108", n: "Flight Safety – Local Area Procedures (LAP)", p: 10 },
      { c: "PR 101-113", n: "Normal and Emergency procedures", p: 21 },
      { c: "JP 101-110*", n: "Flight physiology", p: 18, cond: true },
    ] },
  { g: "GT-FLYPRIN", track: "contact", p: 64,
    name: "Flying principles, contact maneuvers, performance tables, ejection/survival, SOPs & In-Flight Guide",
    courses: [
      { c: "FF 101-108", n: "Basic principles of flying", p: 17 },
      { c: "FF 190", n: "Exams on Basic principles of flying", p: 2 },
      { c: "CO 101-105", n: "Basic Contact maneuvers", p: 8 },
      { c: "CO 106-108", n: "Advanced Contact maneuvers", p: 6 },
      { c: "OJT", n: "OJT (On the Job Training)", p: 11 },
      { c: "PT 101-104", n: "A/C’s Performance Tables", p: 4 },
      { c: "PT 190", n: "Exams on A/C’s Performance Tables", p: 2 },
      { c: "BB 101-102", n: "Ejection – Survival procedures", p: 2 },
      { c: "SOPs 101-104", n: "Standard Operation Procedures (SOP)", p: 8 },
      { c: "IFG 101-102", n: "In Flight Guide (IFG) analysis", p: 4 },
    ] },
  { g: "GT-AERO-CRM", track: "shared", p: 30,
    name: "Aerodynamics & Crew Resource Management",
    courses: [
      { c: "AE 101-108", n: "Aerodynamics", p: 17 },
      { c: "AE 190", n: "Exams on Aerodynamics", p: 2 },
      { c: "OJT", n: "OJT (On the Job Training)", p: 11 },
      { c: "CR 201-202*", n: "Crew Resource Management (CRM)", p: 8, cond: true },
    ] },
  { g: "GT-METEO-BA", track: "shared", p: 62,
    name: "Meteorology (I & II) and Briefing Analysis",
    courses: [
      { c: "JX 101-109", n: "Meteorology", p: 12 },
      { c: "JX 190", n: "Exams on Meteorology", p: 3 },
      { c: "OJT", n: "OJT (On the Job Training)", p: 15 },
      { c: "Meteo Briefing", n: "Meteo Briefing", p: 29 },
      { c: "JX 191", n: "Exams on Meteorology", p: 1 },
      { c: "BA 101-103", n: "Briefing Analysis", p: 2 },
    ] },
  { g: "GT-INSTR", track: "instrument", p: 31,
    name: "Instruments academics (Basic & Advanced) — IN 190 exam is flown between the two blocks",
    courses: [
      { c: "IN 101-105", n: "Basic Instruments", p: 8 },
      { c: "IN 201-210", n: "Advanced Instruments", p: 23 },
    ] },
  { g: "GT-IFRNAV-GPS", track: "instrument", p: 45,
    name: "IFR navigation, air traffic rules, mission planning & use of GPS in flight",
    courses: [
      { c: "NA 101-103", n: "Navigation IFR", p: 8 },
      { c: "ATR", n: "Air Traffic Rules", p: 2 },
      { c: "NA 191", n: "IFR Navigation Examination", p: 1 },
      { c: "IPR PL2", n: "Planning Procedure", p: 7 },
      { c: "OJT", n: "OJT (On the Job Training)", p: 25 },
      { c: "GPS", n: "Use of GPS in flight", p: 2 },
    ] },
  { g: "GT-CO110", track: "contact", p: 2,
    name: "Landing Pattern and AOA Landing",
    courses: [
      { c: "CO 110", n: "Landing Pattern and AOA Landing", p: 2 },
    ] },
  { g: "GT-CO109", track: "instrument", p: 2,
    name: "Night Flight",
    courses: [
      { c: "CO 109", n: "Night Flight", p: 2 },
    ] },
  { g: "GT-FORM", track: "formation", p: 39,
    name: "Formation, Extended Trail & Tactical Formation academics",
    courses: [
      { c: "FO 101-104", n: "Formation", p: 11 },
      { c: "FO 201", n: "Extended Trail", p: 2 },
      { c: "TACFOR 501-506", n: "Tactical Formation", p: 6 },
      { c: "OJT", n: "OJT (On the Job Training)", p: 20 },
    ] },
  { g: "GT-VFRNAV", track: "vfr_navigation", p: 20,
    name: "VFR Navigation & Low Altitude Navigation academics",
    courses: [
      { c: "NA 104-111", n: "VFR Navigation", p: 15 },
      { c: "LNAV 701-705", n: "Low Altitude Navigation", p: 5 },
    ] },
  { g: "GT-GENBRIEF", track: "shared", p: 125,
    name: "General Briefing: Flying Technique · Airmanship Basics Analysis · Flying Procedures · Emergency Procedures · Flight Safety",
    courses: [
      { c: "FT", n: "Flying Technique", p: 25 },
      { c: "ABA", n: "Airmanship Basics Analysis", p: 20 },
      { c: "FP", n: "Flying Procedures", p: 25 },
      { c: "EP", n: "Emergency Procedures", p: 30 },
      { c: "FS", n: "Flight Safety", p: 25 },
    ] },
];

/* THE 8 GROUND-EXAM GROUPS (round 12) — and only these. Four theory groups
   carry a nested exams[] (FF 190 · PT 190 · AΕ 190 · JX 190 · JX 191 ·
   NA 191) that a human would naturally file under "exams"; FDMS does not,
   its parser picks them up as COURSES OF THEIR GROUP, and filing them here
   as well would make the two systems disagree about what is owed.
   `cond` is JP190 — «Exams on Flight physiology (foreign SPs only)» — which
   a HAF student does not owe. (FDMS's own SchedReady never reads that flag
   and leaves JP190 pending for ever; the defect is not mirrored here.)
   MIRROR: db/schema.sql → wa.exam_ids() / wa.exam_conditional(). */
var WA_EXAMS = [
  { id: "CO190", track: "contact", p: 2, name: "Exams on Basic Contact maneuvers" },
  { id: "JP190", track: "shared", p: 1, cond: true, name: "Exams on Flight physiology (foreign SPs only)" },
  { id: "IN190", track: "instrument", p: 2, name: "Exams on Basic Instruments" },
  { id: "IN290", track: "instrument", p: 2, name: "Exams on Advanced Instruments" },
  { id: "FO190", track: "formation", p: 1, name: "Formation Examination" },
  { id: "TACFOR590", track: "formation", p: 1, name: "Tactical Formation Examination" },
  { id: "NA190", track: "vfr_navigation", p: 1, name: "VFR Navigation Examination" },
  { id: "LNAV790", track: "vfr_navigation", p: 1, name: "Low Altitude Navigation Examination" },
];

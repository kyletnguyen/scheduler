import { useState, useMemo } from 'react';

/* ── Section registry ── */
interface HelpSection { id: string; title: string; tags: string; render: () => React.ReactNode }

const SECTIONS: HelpSection[] = [

  // ────────────────────────────────────────────
  // OVERVIEW
  // ────────────────────────────────────────────
  { id: 'overview', title: 'Overview', tags: 'getting started workflow intro',
    render: () => <>
      <P>The Lab Shift Scheduler automates monthly schedule generation for clinical lab staff across multiple stations and shifts.</P>
      <H3>Typical Workflow</H3>
      <OL items={[
        'Configure stations with staffing minimums.',
        'Add employees — set role, default shift, employment type, and station preferences.',
        'Define rules — weekend availability, blocked days, required shifts.',
        'Mark time off — full-day or partial (half-day) PTO.',
        'Auto-generate the monthly schedule.',
        'Review warnings, make manual adjustments, export to PDF.',
      ]} />
    </>,
  },

  // ────────────────────────────────────────────
  // STATIONS PAGE
  // ────────────────────────────────────────────
  { id: 'stations-page', title: 'Stations Page', tags: 'station setup configure min staff add remove',
    render: () => <>
      <P>Navigate to <B>Stations</B> in the sidebar.</P>
      <H3>Adding a Station</H3>
      <P>Enter the station name and click <B>Add Station</B> or press <Kbd>Enter</Kbd>.</P>
      <H3>Configuration Fields</H3>
      <DL items={[
        ['CLS Needed (AM / PM / Night)', 'Minimum CLS required per shift. These are hard constraints — the scheduler generates CRITICAL warnings when unmet.'],
        ['Allows MLT', <>
          <Pill className="bg-cyan-100 text-cyan-700">Yes — MLTs allowed</Pill> &mdash; exactly 1 MLT is assigned per AM shift in addition to CLS staff. Applies to stations with <code>Require CLS</code> enabled.<br />
          <Pill className="bg-gray-100 text-gray-400">No — CLS only</Pill> &mdash; only CLS employees are assigned.
        </>],
      ]} />
      <H3>Admin Station</H3>
      <P>The station named <code>Admin</code> is reserved. Admin-role employees default here and are only pulled to bench when critical gaps exist.</P>
      <H3>Removing a Station</H3>
      <P>Click the remove button. A confirmation dialog appears. All employee qualifications for that station are unlinked.</P>
    </>,
  },

  // ────────────────────────────────────────────
  // STATION STYLE EDITOR
  // ────────────────────────────────────────────
  { id: 'station-style', title: 'Station Colors & Abbreviations', tags: 'color abbreviation badge legend customize hex',
    render: () => <>
      <P>On the <B>Schedule</B> page, click any station badge in the legend bar to open the <B>Station Style Editor</B>.</P>
      <DL items={[
        ['Abbreviation', 'A 2–4 character short label displayed in grid cells and PDF badges (e.g., HM, CH, BB, MC, AD).'],
        ['Color', 'Hex color code applied to the badge background everywhere — grid, PDF, modals, pie charts. Use the color picker or type a hex value.'],
      ]} />
      <H3>Default Station Styles</H3>
      <div className="flex flex-wrap gap-2 mt-2">
        <StationBadge abbr="HM" color="#8b5cf6" label="Hematology/UA" />
        <StationBadge abbr="CH" color="#d97706" label="Chemistry" />
        <StationBadge abbr="MC" color="#059669" label="Microbiology" />
        <StationBadge abbr="BB" color="#dc2626" label="Blood Bank" />
        <StationBadge abbr="AD" color="#0ea5e9" label="Admin" />
      </div>
    </>,
  },

  // ────────────────────────────────────────────
  // EMPLOYEES PAGE
  // ────────────────────────────────────────────
  { id: 'employees-page', title: 'Employees Page', tags: 'add employee search filter list delete remove breakdown expand',
    render: () => <>
      <P>Navigate to <B>Employees</B> in the sidebar.</P>
      <H3>Search & Filters</H3>
      <UL items={[
        <><B>Search</B> — type a name to filter in real-time.</>,
        <>
          <B>Shift</B> — <Pill className="bg-amber-100 text-amber-800">AM</Pill> <Pill className="bg-indigo-100 text-indigo-800">PM</Pill> <Pill className="bg-gray-200 text-gray-800">Night</Pill> <Pill className="bg-teal-100 text-teal-800">Floater</Pill>
        </>,
        <>
          <B>Role</B> — <Pill className="bg-blue-100 text-blue-800">CLS</Pill> <Pill className="bg-cyan-100 text-cyan-800">MLT</Pill> <Pill className="bg-orange-100 text-orange-800">Admin</Pill>
        </>,
        <>
          <B>Type</B> — <Pill className="bg-green-100 text-green-800">Full-time</Pill> <Pill className="bg-yellow-100 text-yellow-800">Part-time</Pill> <Pill className="bg-purple-100 text-purple-800">Per-diem</Pill>
        </>,
        <><B>On PTO</B> — shows only employees with upcoming time off.</>,
        <><B>Clear All</B> — resets every active filter.</>,
      ]} />
      <H3>Employee Row</H3>
      <P>Each row shows: name (clickable), role/shift/type badges, target hours, upcoming PTO dates, constraint tags, and station qualifications. Click the <B>expand arrow</B> for a monthly breakdown (total days, per-station distribution with day counts).</P>
      <H3>Employee Fields</H3>
      <DL items={[
        ['Role', <>
          <Pill className="bg-blue-100 text-blue-700 border border-blue-200">CLS</Pill> Clinical Lab Scientist — works any bench station.<br />
          <Pill className="bg-purple-100 text-purple-700 border border-purple-200">MLT</Pill> Medical Lab Technician — 1 slot per station, only covered by other MLTs.<br />
          <Pill className="bg-amber-100 text-amber-700 border border-amber-200">Admin</Pill> Supervisor — defaults to Admin desk, can cover CLS positions.
        </>],
        ['Default Shift', <>
          <ShiftBadge shift="AM" /> Day shift &nbsp; <ShiftBadge shift="PM" /> Evening &nbsp; <ShiftBadge shift="Night" /> Overnight &nbsp; <Pill className="bg-teal-100 text-teal-800">Floater</Pill> Flexible
        </>],
        ['Employment Type', <>
          <Pill className="bg-green-100 text-green-800">Full-time</Pill> highest priority, meets weekly hour target.<br />
          <Pill className="bg-yellow-100 text-yellow-800">Part-time</Pill> lower weekly target.<br />
          <Pill className="bg-purple-100 text-purple-800">Per-diem</Pill> fills remaining gaps, lowest priority.
        </>],
        ['Target Hours/Week', 'Weekly hour goal (0–80). The scheduler distributes days to approximate this target.'],
      ]} />
    </>,
  },

  // ────────────────────────────────────────────
  // STATION PREFERENCES
  // ────────────────────────────────────────────
  { id: 'station-prefs', title: 'Station Preferences (Weights)', tags: 'weight slider pie chart percentage qualified proportional',
    render: () => <>
      <P>Open an employee and navigate to the <B>Stations</B> tab.</P>
      <H3>Setting Preferences</H3>
      <OL items={[
        'Click station pills to toggle qualification.',
        'Drag sliders or click the number to type a value. Moving one slider auto-adjusts the others to maintain 100%.',
        'The pie chart updates in real-time showing the proportional split.',
      ]} />
      <H3>How the Algorithm Uses Weights</H3>
      <P>The scheduler tracks placements within each generated month and targets the weight ratios. Example: 70% Micro / 30% Hema ≈ 14 of 20 working days at Micro, 6 at Hema. Early in the month Micro wins on pure weight; once the target ratio is reached, the algorithm shifts to under-represented stations.</P>
      <Callout type="info">Weights are proportional — 70/30, 7/3, and 140/60 all produce the same distribution.</Callout>
      <H3>Default Qualifications</H3>
      <UL items={[
        <><B>Admin</B> with no stations configured → qualifies for ALL stations.</>,
        <><B>CLS / MLT</B> with no stations → qualifies for all bench stations (excluding Admin).</>,
      ]} />
    </>,
  },

  // ────────────────────────────────────────────
  // RULES & CONSTRAINTS
  // ────────────────────────────────────────────
  { id: 'rules', title: 'Rules & Constraints', tags: 'weekend alternating swing blocked days required shift group A B thursday friday monday tuesday',
    render: () => <>
      <P>Open an employee and navigate to the <B>Rules</B> tab.</P>
      <H3>Weekend Availability</H3>
      <DL items={[
        ['All Weekends', 'Available every Saturday and Sunday.'],
        ['Alternating', 'Every other weekend. Employees split into Group A (1st & 3rd) and Group B (2nd & 4th).'],
        ['Once a Month', 'One weekend per month.'],
        ['No Weekends', 'Never scheduled Saturday or Sunday.'],
      ]} />
      <H3>Swing Shift Pattern</H3>
      <P>When alternating is selected, compensating days off are assigned around ON-weekends:</P>
      <UL items={[
        <><B>Day off before weekend</B> — configurable: Auto, Thursday, or Friday.</>,
        <><B>Day off after weekend</B> — configurable: Auto, Monday, or Tuesday.</>,
      ]} />
      <P>Default auto pattern: Group A = Thursday + Monday off. Group B = Friday + Tuesday off.</P>
      <H3>Blocked Days</H3>
      <P>Toggle day-of-week buttons (Sun–Sat). Blocked days are absolute — the employee is never scheduled on them.</P>
      <H3>Required Shifts</H3>
      <P>Add date + shift combinations where the employee must be scheduled. These are honored before remaining days are filled. Remove by clicking the ✕ on the chip.</P>
    </>,
  },

  // ────────────────────────────────────────────
  // TIME OFF / PTO
  // ────────────────────────────────────────────
  { id: 'time-off', title: 'Time Off / PTO', tags: 'pto vacation partial half day full day coverage backup impact warning conflict drag select calendar clear',
    render: () => <>
      <P>Open an employee and navigate to the <B>Time Off</B> tab.</P>
      <H3>Full Day PTO</H3>
      <P>Select <B>Full Day</B>, click or drag across calendar dates to mark. The employee will not be scheduled.</P>
      <div className="flex items-center gap-2 my-2">
        <span className="text-xs text-gray-500">Appears as:</span>
        <InlineBadge bg="#fecaca" text="#991b1b">P</InlineBadge>
        <span className="text-xs text-gray-500">on the grid</span>
      </div>

      <H3>Partial Day (Half Day) PTO</H3>
      <P>Select <B>Partial Day</B>, set the off-hours (e.g., 09:00–13:00), click or drag dates. The employee is still assigned to their station for the hours present.</P>
      <div className="flex items-center gap-2 my-2">
        <span className="text-xs text-gray-500">Appears as:</span>
        <InlineBadge bg="#fca5a5" text="#7f1d1d">BB/2</InlineBadge>
        <span className="text-xs text-gray-500">on the grid (station abbreviation + /2)</span>
      </div>

      <H3>Drag to Select</H3>
      <P>Click and drag across multiple calendar dates to mark a range in one gesture.</P>

      <H3>PTO Impact Warnings</H3>
      <P>When marking PTO for a scheduled employee, the app checks staffing impact:</P>
      <UL items={[
        <><span className="font-bold text-red-600">Critical</span> — not enough staff for that shift.</>,
        <><span className="font-bold text-amber-600">Warning</span> — staffing is tight (1–2 extra beyond minimum).</>,
        <>Shows who else is already off that day so you can assess total impact.</>,
      ]} />
      <Callout type="warn">Impact warnings help you decide <em>before</em> creating a conflict. If critical, consider denying the PTO or arranging manual coverage.</Callout>

      <H3>Automatic Partial PTO Coverage</H3>
      <P>The scheduler finds a <B>same-role</B> backup for partial PTO employees:</P>
      <UL items={[
        <>CLS leaving → another CLS or Admin covers.</>,
        <>MLT leaving → another MLT covers (including admin-parked MLTs).</>,
        <>Compares against station minimum — a station needing 2 CLS still gets a backup even if 1 full-day CLS is present.</>,
      ]} />

      <H3>Clearing PTO</H3>
      <P>Click <B>Clear All</B> to remove all entries for the displayed month (with confirmation).</P>
    </>,
  },

  // ────────────────────────────────────────────
  // GENERATING A SCHEDULE
  // ────────────────────────────────────────────
  { id: 'generating', title: 'Generating a Schedule', tags: 'auto-generate algorithm multi-pass layer pipeline clear confirmation',
    render: () => <>
      <P>On the <B>Schedule</B> page, click <B>Auto-Generate</B>.</P>
      <Callout type="warn">A confirmation dialog warns that existing assignments for the month will be cleared. Click <B>Generate</B> to proceed.</Callout>
      <H3>Algorithm Summary</H3>
      <OL items={[
        'Day assignment — assigns employees to shifts based on default shift, hour targets, weekend rules, blocked days, required shifts, and PTO.',
        <>Station assignment — 7-layer pipeline:<br />
          <span className="text-xs text-gray-500 leading-relaxed">
            L1: Blood Bank (1 CLS, weighted) → L2: MLT placement (1 per station) → L3: Admin default → L4: CLS rotation (proportional weights) → L5: Admin-parked MLT fill → L6: Per-diem fill → L7: Overflow placement.
          </span>
        </>,
        'Repair pass — iteratively fixes understaffing, overstaffing, missing CLS, duplicate MLTs.',
        'Partial PTO coverage — finds same-role backups (runs last so nothing undoes it).',
        'Multi-pass optimization — runs 25 passes with randomized orderings, keeps the best-scoring result.',
      ]} />
    </>,
  },

  // ────────────────────────────────────────────
  // READING THE GRID
  // ────────────────────────────────────────────
  { id: 'grid', title: 'Reading the Schedule Grid', tags: 'grid shift group role banner tint drag reorder cross-shift guest navigate month',
    render: () => <>
      <H3>Monthly Navigation</H3>
      <P>Use <B>← / →</B> arrows at the top to change months. Assignments, warnings, and PTO update automatically.</P>

      <H3>Shift Groups</H3>
      <P>Gray banners separate shifts: <B>AM Shift</B>, <B>PM Shift</B>, <B>Night Shift</B>, <B>Floater</B>. Each includes its own date header row and inline warnings.</P>

      <H3>Role Sub-Groups</H3>
      <P>Within each shift, colored banners and row tints group employees by role:</P>
      <div className="space-y-1.5 mt-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-16 py-0.5 rounded text-center text-[10px] font-bold bg-amber-400 text-white">ADMIN</span>
          <span className="text-xs text-gray-500">Amber rows</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-16 py-0.5 rounded text-center text-[10px] font-bold bg-blue-500 text-white">CLS</span>
          <span className="text-xs text-gray-500">Blue rows</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-16 py-0.5 rounded text-center text-[10px] font-bold bg-purple-600 text-white">MLT</span>
          <span className="text-xs text-gray-500">Purple rows</span>
        </div>
      </div>

      <H3>Employee Rows</H3>
      <P>Each row shows a drag handle (<B>&#x2630;</B>), employee name (clickable), and role badge. Drag within the same role group to reorder — the custom order persists and is reflected in PDF exports.</P>

      <H3>Date Column Headers</H3>
      <P>Weekends are highlighted orange. Red backgrounds indicate critical coverage issues; amber indicates warnings; blue indicates today. Click any date header to open the <B>Day Detail Modal</B>.</P>

      <H3>Cross-Shift Guest Rows</H3>
      <P>Employees working a shift other than their default appear as guest rows at the bottom of that shift section, labeled with their home shift (e.g., "John (PM)").</P>

      <H3>Show / Hide Warnings</H3>
      <P>Toggle inline warnings below each shift header using the button in the top bar.</P>
    </>,
  },

  // ────────────────────────────────────────────
  // GRID SYMBOLS REFERENCE
  // ────────────────────────────────────────────
  { id: 'grid-symbols', title: 'Grid Symbols & Badges Reference', tags: 'badge symbol icon abbreviation pto half day arrow asterisk star cover shift cross',
    render: () => <>
      <P>Every cell in the schedule grid uses one of the following visual indicators:</P>
      <div className="overflow-x-auto mt-3">
        <table className="text-sm border border-gray-200 w-full">
          <thead><tr className="bg-gray-50">
            <th className="px-3 py-2.5 text-left border-b font-semibold w-44">Badge</th>
            <th className="px-3 py-2.5 text-left border-b font-semibold">Description</th>
          </tr></thead>
          <tbody>
            <SymRow badge={<InlineBadge bg="#8b5cf6" text="white">HM</InlineBadge>} desc="Station assignment. Each station has a unique color and 2–4 character abbreviation. The employee works this station for the full day." />
            <SymRow badge={<InlineBadge bg="#fecaca" text="#991b1b">P</InlineBadge>} desc="Full-day PTO. The employee is completely off and not scheduled." />
            <SymRow badge={<InlineBadge bg="#fca5a5" text="#7f1d1d">BB/2</InlineBadge>} desc="Partial PTO (half day). The employee works the first half of their shift at Blood Bank, then leaves. Station abbreviation followed by /2." />
            <SymRow badge={<InlineBadge bg="#059669" text="white">AD→BB</InlineBadge>} desc={<>Split duty (partial PTO coverage). This employee starts at their home station (AD = Admin) then moves to Blood Bank to cover after the partial-PTO employee leaves. Only shown when the covering employee's home station differs from the coverage station, and the roles match (CLS covers CLS, MLT covers MLT).</>} />
            <SymRow badge={<InlineBadge bg="#059669" text="white">BB*</InlineBadge>} desc={<><B>PDF only.</B> Same as the arrow notation but space-constrained. The asterisk indicates partial PTO coverage. See the PDF legend: <code>* = covers 2nd half (partial PTO)</code>.</>} />
            <SymRow badge={<InlineBadge bg="#facc15" text="#713f12">AM</InlineBadge>} desc="Cross-shift badge. This employee normally works a different shift (e.g., PM) but is assigned to AM today. Shown in the employee's home shift row." />
            <SymRow badge={<InlineBadge bg="#4f46e5" text="white">PM</InlineBadge>} desc="Cross-shift badge for PM assignment." />
            <SymRow badge={<InlineBadge bg="#374151" text="white">NS</InlineBadge>} desc="Cross-shift badge for Night Shift assignment." />
            <SymRow badge={<span className="text-gray-300 text-base">&mdash;</span>} desc="Not scheduled. The employee has this day off (not PTO — just not assigned)." />
          </tbody>
        </table>
      </div>
    </>,
  },

  // ────────────────────────────────────────────
  // DAY DETAIL MODAL
  // ────────────────────────────────────────────
  { id: 'day-modal', title: 'Day Detail Modal', tags: 'modal coverage station breakdown who working off navigate arrow escape',
    render: () => <>
      <P>Click any date column header on the grid to open the day detail view.</P>
      <H3>Navigation</H3>
      <P>Use <B>← / →</B> arrows or keyboard to move between days. Press <Kbd>Escape</Kbd> to close.</P>
      <H3>Header</H3>
      <P>Color-coded by severity: <span className="inline-block w-3 h-3 rounded bg-red-500" /> red = critical issues, <span className="inline-block w-3 h-3 rounded bg-amber-500" /> amber = warnings, <span className="inline-block w-3 h-3 rounded bg-emerald-500" /> green = no issues.</P>
      <H3>Who's Working (by Station)</H3>
      <P>Employees grouped under their assigned station badge. Each person shows:</P>
      <UL items={[
        <>Name + role badge (<Pill className="bg-blue-100 text-blue-700 border border-blue-200">CLS</Pill> <Pill className="bg-purple-100 text-purple-700 border border-purple-200">MLT</Pill> <Pill className="bg-amber-100 text-amber-700 border border-amber-200">Admin</Pill>)</>,
        <><Pill className="bg-red-100 text-red-700 border border-red-200">1/2 DAY</Pill> — this employee has partial PTO and leaves mid-shift.</>,
        <><Pill className="bg-amber-100 text-amber-700 border border-amber-200">covers 2nd half for [employee]</Pill> — this person is the same-role backup covering after the partial-PTO employee leaves.</>,
      ]} />
      <H3>Who's Off / PTO</H3>
      <P>Lists employees with time off on this date, with role badges.</P>
    </>,
  },

  // ────────────────────────────────────────────
  // MANUAL ADJUSTMENTS
  // ────────────────────────────────────────────
  { id: 'manual', title: 'Manual Adjustments', tags: 'change station swap remove delete assign click cell empty weekend back-to-back force',
    render: () => <>
      <H3>Clicking an Assigned Cell</H3>
      <P>Opens the actions modal:</P>
      <DL items={[
        ['Change Station', 'Pick from the employee\'s qualified stations, or "No station."'],
        ['Swap Stations', <>
          Exchange with another same-shift employee. Role rules apply:<br />
          <Pill className="bg-blue-100 text-blue-700 border border-blue-200">CLS</Pill> ↔ <Pill className="bg-blue-100 text-blue-700 border border-blue-200">CLS</Pill> only.<br />
          <Pill className="bg-purple-100 text-purple-700 border border-purple-200">MLT</Pill> ↔ <Pill className="bg-purple-100 text-purple-700 border border-purple-200">MLT</Pill> only.<br />
          <Pill className="bg-amber-100 text-amber-700 border border-amber-200">Admin</Pill> → <Pill className="bg-blue-100 text-blue-700 border border-blue-200">CLS</Pill> (one-directional: admin can take CLS position, but CLS cannot take admin duties).
        </>],
        ['Remove Assignment', 'Deletes the assignment. The employee becomes unscheduled for that day.'],
      ]} />
      <H3>Clicking an Empty Cell (—)</H3>
      <P>Opens the assignment modal. Select an employee, shift, and optionally a station to schedule them.</P>
      <H3>Weekend Back-to-Back Warning</H3>
      <P>If assigning someone to a weekend would create consecutive weekends, a warning dialog appears. Click <B>Force Assign</B> to override or Cancel to abort.</P>
    </>,
  },

  // ────────────────────────────────────────────
  // PDF EXPORT
  // ────────────────────────────────────────────
  { id: 'pdf', title: 'PDF Export', tags: 'export download print pdf landscape letter legend',
    render: () => <>
      <P>Click <B>Export PDF</B> on the schedule page.</P>
      <H3>Layout</H3>
      <UL items={[
        'Landscape letter-size. One page per shift.',
        <>Employees grouped by role with colored header rows: <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-white">ADMIN</span> <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500 text-white">CLS</span> <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white">MLT</span></>,
        'Custom drag order from the grid is preserved.',
        'Weekend columns highlighted in orange.',
      ]} />
      <H3>Legend</H3>
      <P><B>Row 1</B> — Station colors and abbreviations + shift badges:</P>
      <div className="flex flex-wrap items-center gap-2 my-2">
        <StationBadge abbr="HM" color="#8b5cf6" label="Hematology" />
        <StationBadge abbr="CH" color="#d97706" label="Chemistry" />
        <StationBadge abbr="MC" color="#059669" label="Micro" />
        <StationBadge abbr="BB" color="#dc2626" label="Blood Bank" />
        <StationBadge abbr="AD" color="#0ea5e9" label="Admin" />
        <span className="text-gray-300">|</span>
        <ShiftBadge shift="AM" /> <ShiftBadge shift="PM" /> <ShiftBadge shift="Night" />
      </div>
      <P><B>Row 2</B> — Status indicators:</P>
      <div className="flex flex-wrap items-center gap-3 my-2">
        <span className="flex items-center gap-1"><InlineBadge bg="#fecaca" text="#b91c1c">P</InlineBadge> <span className="text-xs text-gray-500">PTO</span></span>
        <span className="flex items-center gap-1"><InlineBadge bg="#fca5a5" text="#991b1b">&frac12;</InlineBadge> <span className="text-xs text-gray-500">Half Day</span></span>
        <span className="flex items-center gap-1"><InlineBadge bg="#e5e7eb" text="#9ca3af">&mdash;</InlineBadge> <span className="text-xs text-gray-500">Off</span></span>
        <span className="flex items-center gap-1"><span className="font-bold text-gray-700">*</span> <span className="text-xs text-gray-500">= covers 2nd half (partial PTO)</span></span>
      </div>
    </>,
  },

  // ────────────────────────────────────────────
  // WARNINGS
  // ────────────────────────────────────────────
  { id: 'warnings', title: 'Warnings & Coverage Issues', tags: 'critical pivotal suggestion warning understaffed overstaffed missing inline toggle',
    render: () => <>
      <P>Warnings appear inline below each shift header (toggle with <B>Show/Hide Warnings</B>) and in the day detail modal.</P>
      <H3>Severity Levels</H3>
      <div className="space-y-2 mt-2">
        <div className="flex items-start gap-2"><span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">CRITICAL</span><span className="text-sm text-gray-600">Station understaffed, missing CLS, or no partial PTO coverage. Must resolve.</span></div>
        <div className="flex items-start gap-2"><span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">PIVOTAL</span><span className="text-sm text-gray-600">Missing MLT, or only one qualified employee for a station (no backup).</span></div>
        <div className="flex items-start gap-2"><span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-400 text-white">WARNING</span><span className="text-sm text-gray-600">Staffing tight, employee over/under weekly hours, overstaffed station.</span></div>
        <div className="flex items-start gap-2"><span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500 text-white">SUGGESTION</span><span className="text-sm text-gray-600">Optimization hint — extra CLS that could be moved, MLT without bench station.</span></div>
      </div>
      <H3>Common Warning Messages</H3>
      <UL items={[
        <><code>"needs X staff but only Y assigned"</code> — station below minimum.</>,
        <><code>"has no CLS assigned"</code> — require-CLS station has only MLTs.</>,
        <><code>"has partial PTO with no coverage"</code> — no same-role backup found for the second half.</>,
        <><code>"is the ONLY person qualified"</code> — single point of failure. Cross-train another employee.</>,
        <><code>"is off but no other qualified employee is scheduled"</code> — PTO approved with no backup available.</>,
      ]} />
    </>,
  },

  // ────────────────────────────────────────────
  // BREAKDOWN PANEL
  // ────────────────────────────────────────────
  { id: 'breakdown', title: 'Schedule Breakdown Panel', tags: 'bottom panel hours weekly target station distribution summary stats weekend',
    render: () => <>
      <P>Below the schedule grid, the breakdown table provides per-employee statistics.</P>
      <H3>Columns</H3>
      <DL items={[
        ['Employee', 'Name with role and employment type badges.'],
        ['Target', 'Weekly hour goal.'],
        ['Week columns', 'Actual hours scheduled per week. Red highlighting when over target.'],
        ['Total', 'Total hours for the month.'],
        ['Wknd', 'Number of weekend days worked.'],
        ['Stations', 'Colored badges showing how many days at each station (e.g., HM: 14, CH: 6). Useful for verifying weight preferences are being respected.'],
      ]} />
    </>,
  },

  // ────────────────────────────────────────────
  // ROLE COMPATIBILITY
  // ────────────────────────────────────────────
  { id: 'roles', title: 'Role Compatibility Matrix', tags: 'cls mlt admin swap cover bench pull compatibility',
    render: () => <>
      <P>Reference table for which roles can perform which actions:</P>
      <div className="overflow-x-auto mt-3">
        <table className="text-sm border border-gray-200 w-full">
          <thead><tr className="bg-gray-50">
            <th className="px-3 py-2.5 text-left border-b font-semibold">Action</th>
            <th className="px-3 py-2.5 text-center border-b font-semibold"><Pill className="bg-blue-100 text-blue-700 border border-blue-200">CLS</Pill></th>
            <th className="px-3 py-2.5 text-center border-b font-semibold"><Pill className="bg-purple-100 text-purple-700 border border-purple-200">MLT</Pill></th>
            <th className="px-3 py-2.5 text-center border-b font-semibold"><Pill className="bg-amber-100 text-amber-700 border border-amber-200">Admin</Pill></th>
          </tr></thead>
          <tbody>
            <RoleRow a="Works bench stations" c="Yes" m="Yes (1 per station)" ad="When needed" />
            <RoleRow a="Covers CLS partial PTO" c="Yes" m="No" ad="Yes" />
            <RoleRow a="Covers MLT partial PTO" c="No" m="Yes" ad="No" />
            <RoleRow a="Swap with CLS" c="Yes" m="No" ad="Yes" />
            <RoleRow a="Swap with MLT" c="No" m="Yes" ad="No" />
            <RoleRow a="Swap with Admin" c="No" m="No" ad="No" />
            <RoleRow a="Pulled to bench when short" c="—" m="—" ad="Yes" />
            <RoleRow a="Default station" c="Bench" m="Bench" ad="Admin desk" />
          </tbody>
        </table>
      </div>
    </>,
  },

  // ────────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ────────────────────────────────────────────
  { id: 'keyboard', title: 'Keyboard Shortcuts & Interactions', tags: 'keyboard shortcut escape enter drag click hotkey',
    render: () => <>
      <div className="overflow-x-auto mt-2">
        <table className="text-sm border border-gray-200 w-full">
          <thead><tr className="bg-gray-50">
            <th className="px-3 py-2.5 text-left border-b font-semibold w-48">Input</th>
            <th className="px-3 py-2.5 text-left border-b font-semibold">Action</th>
          </tr></thead>
          <tbody>
            <KbRow input={<Kbd>Escape</Kbd>} action="Close modal or cancel edit." />
            <KbRow input={<Kbd>Enter</Kbd>} action="Submit (station name, search, percentage input)." />
            <KbRow input={<><Kbd>←</Kbd> <Kbd>→</Kbd></>} action="Navigate days in the day detail modal." />
            <KbRow input="Click + drag (calendar)" action="Select a date range for PTO." />
            <KbRow input={<>Drag <B>&#x2630;</B> handle</>} action="Reorder employee within their role group. Persists across sessions." />
            <KbRow input="Click date header" action="Open day detail modal for that date." />
            <KbRow input="Click employee name" action="Open employee detail panel (grid) or modal (employees page)." />
            <KbRow input="Click station badge (legend)" action="Open station style editor (color + abbreviation)." />
            <KbRow input="Click assigned cell" action="Open actions modal (change station, swap, remove)." />
            <KbRow input="Click empty cell (—)" action="Open assignment modal to schedule someone." />
          </tbody>
        </table>
      </div>
    </>,
  },
];

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */
export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) || s.tags.includes(q)
    );
  }, [search]);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Help & Reference Guide</h1>
      <p className="text-sm text-gray-400 mb-5">Lab Shift Scheduler &mdash; complete documentation</p>

      {/* Search */}
      <div className="relative mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpenId(null); }}
          placeholder="Search help topics..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {search && <p className="text-[11px] text-gray-400 mt-1 pl-1">{filtered.length} of {SECTIONS.length} sections</p>}
      </div>

      {/* TOC */}
      {!search && (
        <nav className="mb-6 bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Table of Contents</h2>
          <div className="columns-2 sm:columns-3 gap-x-4">
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { setOpenId(s.id); setTimeout(() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }}
                className="block text-left text-[13px] text-blue-600 hover:text-blue-800 hover:underline py-0.5 break-inside-avoid"
              >
                <span className="text-gray-400 text-[11px] mr-1">{i + 1}.</span>{s.title}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Sections */}
      <div className="space-y-2">
        {filtered.map(s => {
          const isOpen = openId === s.id || (!!search && filtered.length <= 3);
          return (
            <div key={s.id} id={s.id} className={`border rounded-lg overflow-hidden transition-colors ${isOpen ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
              <button
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50/80"
              >
                <span className="text-sm font-semibold text-gray-800">{s.title}</span>
                <span className={`text-gray-400 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}>&#x25BC;</span>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-1 text-[13px] text-gray-600 leading-relaxed border-t border-gray-100">
                  {s.render()}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">No matching topics found.</p>
            <button onClick={() => setSearch('')} className="text-blue-500 text-sm mt-1 hover:underline">Clear search</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   SHARED PRIMITIVES
   ══════════════════════════════════════════════ */

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5">{children}</p>;
}
function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-gray-800">{children}</strong>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-bold text-gray-800 mt-5 mb-1 border-b border-gray-100 pb-1">{children}</h3>;
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="px-1.5 py-0.5 rounded border border-gray-300 bg-gray-100 text-[11px] font-mono text-gray-700 shadow-sm">{children}</kbd>;
}
function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${className}`}>{children}</span>;
}
function InlineBadge({ bg, text, children }: { bg: string; text: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[10px] font-bold shadow-sm"
      style={{ backgroundColor: bg, color: text }}
    >
      {children}
    </span>
  );
}
function ShiftBadge({ shift }: { shift: 'AM' | 'PM' | 'Night' }) {
  const map = {
    AM: { label: 'AM', bg: '#facc15', text: '#713f12' },
    PM: { label: 'PM', bg: '#4f46e5', text: '#ffffff' },
    Night: { label: 'NS', bg: '#374151', text: '#ffffff' },
  };
  const s = map[shift];
  return <InlineBadge bg={s.bg} text={s.text}>{s.label}</InlineBadge>;
}
function StationBadge({ abbr, color, label }: { abbr: string; color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: color }}>{abbr}</span>
      <span className="text-xs text-gray-600">{label}</span>
    </span>
  );
}
function Callout({ type, children }: { type: 'info' | 'warn'; children: React.ReactNode }) {
  const s = type === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800';
  return <div className={`mt-3 px-3 py-2.5 rounded-lg border text-xs leading-relaxed ${s}`}>{children}</div>;
}
function OL({ items }: { items: React.ReactNode[] }) {
  return <ol className="list-decimal pl-5 space-y-1.5 mt-2">{items.map((item, i) => <li key={i}>{item}</li>)}</ol>;
}
function UL({ items }: { items: React.ReactNode[] }) {
  return <ul className="list-disc pl-5 space-y-1.5 mt-2">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}
function DL({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="mt-2 space-y-3">
      {items.map(([t, d], i) => (
        <div key={i}><dt className="text-[13px] font-semibold text-gray-700">{t}</dt><dd className="text-[13px] text-gray-600 pl-4 mt-0.5">{d}</dd></div>
      ))}
    </dl>
  );
}
function SymRow({ badge, desc }: { badge: React.ReactNode; desc: React.ReactNode }) {
  return <tr className="border-b border-gray-100"><td className="px-3 py-2.5 align-top">{badge}</td><td className="px-3 py-2.5 text-gray-600">{desc}</td></tr>;
}
function RoleRow({ a, c, m, ad }: { a: string; c: string; m: string; ad: string }) {
  const cell = (v: string) => {
    const color = v === 'Yes' ? 'text-green-600 font-semibold' : v === 'No' ? 'text-red-400' : 'text-gray-500';
    return <td className={`px-3 py-2 text-center border-b border-gray-100 ${color}`}>{v}</td>;
  };
  return <tr><td className="px-3 py-2 font-medium border-b border-gray-100 text-gray-700">{a}</td>{cell(c)}{cell(m)}{cell(ad)}</tr>;
}
function KbRow({ input, action }: { input: React.ReactNode; action: string }) {
  return <tr className="border-b border-gray-100"><td className="px-3 py-2.5 align-top">{input}</td><td className="px-3 py-2.5 text-gray-600">{action}</td></tr>;
}

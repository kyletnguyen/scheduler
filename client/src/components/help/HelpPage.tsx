import { useState, useMemo } from 'react';

/* ── Section data ── */
interface HelpSection {
  id: string;
  title: string;
  keywords: string; // extra search terms not in the content
  content: () => React.ReactNode;
}

const sections: HelpSection[] = [
  /* ─── Overview ─── */
  {
    id: 'overview', title: 'Overview', keywords: 'getting started intro workflow',
    content: () => <>
      <p>
        The Lab Shift Scheduler automates monthly schedule generation for clinical lab staff across
        multiple stations and shifts.
      </p>
      <H3>Workflow</H3>
      <ol className="list-decimal pl-5 space-y-1 mt-2">
        <li>Configure <strong>Stations</strong> with staffing minimums.</li>
        <li>Add <strong>Employees</strong> with their role, shift, and station preferences.</li>
        <li>Set <strong>Rules</strong> (weekend availability, blocked days, required shifts).</li>
        <li>Mark <strong>Time Off</strong> (full day or partial/half day).</li>
        <li>Click <strong>Auto-Generate</strong> to create the monthly schedule.</li>
        <li>Review <strong>Warnings</strong>, make manual adjustments, and <strong>Export PDF</strong>.</li>
      </ol>
    </>,
  },

  /* ─── Stations Page ─── */
  {
    id: 'stations', title: 'Stations Page', keywords: 'station setup configure min staff mlt allowed cls required color abbreviation',
    content: () => <>
      <p>Navigate to <strong>Stations</strong> in the sidebar to configure lab stations.</p>

      <H3>Adding a Station</H3>
      <p>Type the station name and click <strong>Add Station</strong> (or press Enter).</p>

      <H3>Station Fields</H3>
      <DefList items={[
        ['Name', 'Station name (e.g., Hematology/UA, Chemistry, Blood Bank, Microbiology).'],
        ['CLS Needed (AM / PM / Night)', 'Minimum number of CLS employees required per shift. The scheduler treats these as hard constraints — a CRITICAL warning fires if unmet.'],
        ['Allows MLT', <>
          When set to <strong>Yes</strong>, exactly 1 MLT will be assigned to this station per AM shift (in addition to CLS staff).
          This corresponds to the <code>require_cls</code> setting — stations that require CLS also get an MLT slot.<br />
          When <strong>No</strong>, only CLS employees are assigned.
        </>],
        ['Color & Abbreviation', <>
          Customize from the schedule grid — click a station badge in the legend bar to open the <strong>Station Style Editor</strong>.
          Set a 2-3 character abbreviation and a hex color. Changes apply everywhere: grid, PDF, modals.
        </>],
      ]} />

      <H3>Admin Station</H3>
      <p>
        The station named <code>Admin</code> is special. Admin-role employees default here.
        They are only pulled to bench stations when no CLS/MLT can fill a critical gap.
      </p>

      <H3>Removing a Station</H3>
      <p>Click the remove button on the station row. A confirmation dialog appears. Removing a station
        unlinks all employee qualifications for that station.</p>
    </>,
  },

  /* ─── Station Style Editor ─── */
  {
    id: 'station-style', title: 'Station Style Editor (Color & Abbreviation)', keywords: 'color picker abbreviation badge customize legend',
    content: () => <>
      <p>
        On the <strong>Schedule</strong> page, click any station badge in the legend bar (below the title)
        to open the Station Style Editor.
      </p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li><strong>Color</strong> &mdash; enter a hex color code or use the color picker. This colors the station badge everywhere (grid cells, PDF, modals, pie chart).</li>
        <li><strong>Abbreviation</strong> &mdash; set a 2-3 character short label (e.g., HM, CH, BB, MC, AD). Shown in grid cells and PDF badges.</li>
      </ul>
      <p className="mt-2">Changes save immediately and update the grid in real-time.</p>
    </>,
  },

  /* ─── Employees Page ─── */
  {
    id: 'employees', title: 'Employees Page', keywords: 'add employee search filter role shift type per-diem part-time full-time delete remove',
    content: () => <>
      <p>Navigate to <strong>Employees</strong> in the sidebar to manage your team.</p>

      <H3>Adding an Employee</H3>
      <p>Click <strong>Add Employee</strong>, fill in name, role, shift, employment type, and weekly hour target.</p>

      <H3>Search & Filter</H3>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li><strong>Search</strong> &mdash; type a name to filter the list in real-time.</li>
        <li><strong>Shift filter</strong> &mdash; click AM / PM / Night / Floater buttons (multi-select).</li>
        <li><strong>Role filter</strong> &mdash; click CLS / MLT / Admin buttons (multi-select).</li>
        <li><strong>Type filter</strong> &mdash; click Full-time / Part-time / Per-diem buttons.</li>
        <li><strong>Clear All</strong> &mdash; resets all active filters.</li>
      </ul>

      <H3>Employee Row</H3>
      <p>Each row shows:</p>
      <ul className="list-disc pl-5 space-y-1 mt-1">
        <li>Name (click to open detail modal), role/shift/type badges.</li>
        <li>Target hours per week.</li>
        <li>Info column: upcoming PTO dates, constraint tags (alternating weekends, blocked days, etc.), station qualifications.</li>
        <li><strong>Expand arrow</strong> &mdash; click to reveal a monthly breakdown showing total days scheduled, station distribution with colored badges and day counts.</li>
      </ul>

      <H3>Employee Fields</H3>
      <DefList items={[
        ['Role', <>
          <strong>CLS</strong> &mdash; Clinical Lab Scientist. Works any bench station.<br />
          <strong>MLT</strong> &mdash; Medical Lab Technician. Gets 1 slot per station. Only covered by other MLTs.<br />
          <strong>Admin</strong> &mdash; Supervisor. Defaults to Admin desk. Can cover CLS positions.
        </>],
        ['Default Shift', 'AM, PM, Night, or Floater. Determines grid grouping and which shift they are scheduled for.'],
        ['Employment Type', <>
          <strong>Full-time</strong> &mdash; highest scheduling priority, meets weekly hour target.<br />
          <strong>Part-time</strong> &mdash; lower weekly hour target.<br />
          <strong>Per-diem</strong> &mdash; fills remaining gaps after full/part-time staff. Lowest priority.
        </>],
        ['Target Hours/Week', 'Weekly hour goal (0-80). The scheduler balances days to approximate this target.'],
      ]} />

      <H3>Removing an Employee</H3>
      <p>Click the remove button. A confirmation dialog appears. This deletes all their assignments, PTO, and constraints.</p>
    </>,
  },

  /* ─── Station Preferences ─── */
  {
    id: 'station-prefs', title: 'Station Preferences (Weights)', keywords: 'weight slider pie chart percentage qualified stations',
    content: () => <>
      <p>Open an employee's <strong>Stations</strong> tab to configure station preferences.</p>

      <H3>Setting Up Stations</H3>
      <ol className="list-decimal pl-5 space-y-1 mt-2">
        <li><strong>Toggle stations</strong> &mdash; click station pills to add/remove from the employee's qualified list.</li>
        <li><strong>Set percentages</strong> &mdash; drag sliders or click the number to type a value directly.</li>
        <li><strong>Auto-balance</strong> &mdash; moving one slider automatically adjusts the others to keep the total at 100%.</li>
        <li><strong>Pie chart</strong> &mdash; visual breakdown updates in real-time.</li>
      </ol>

      <H3>How the Algorithm Uses Weights</H3>
      <p>
        The scheduler uses <strong>proportional tracking</strong> within each generated month.
        For example, 70% Micro / 30% Hema means roughly 14 of 20 working days at Micro, 6 at Hema.
        The algorithm tracks placements and shifts to under-represented stations as the month progresses.
      </p>
      <Callout type="info">
        Weights are proportional — 70/30 gives the same result as 7/3 or 140/60. What matters is the ratio.
      </Callout>

      <H3>Default Qualifications</H3>
      <ul className="list-disc pl-5 space-y-1 mt-1">
        <li><strong>Admin</strong> with no stations configured &rarr; qualifies for ALL stations.</li>
        <li><strong>CLS / MLT</strong> with no stations &rarr; qualifies for all bench stations (excluding Admin).</li>
      </ul>
    </>,
  },

  /* ─── Rules & Constraints ─── */
  {
    id: 'rules', title: 'Rules & Constraints', keywords: 'weekend alternating swing blocked days required shift group A group B thursday friday monday tuesday',
    content: () => <>
      <p>Open an employee's <strong>Rules</strong> tab to set scheduling constraints.</p>

      <H3>Weekend Availability</H3>
      <DefList items={[
        ['All Weekends', 'Available every Saturday and Sunday.'],
        ['Alternating', 'Works every other weekend. Employees split into Group A (1st & 3rd weekends) and Group B (2nd & 4th).'],
        ['Once a Month', 'Works one weekend per month.'],
        ['No Weekends', 'Never scheduled on Saturday or Sunday.'],
      ]} />

      <H3>Swing Shift Pattern (Alternating Weekends)</H3>
      <p>When alternating is selected, the scheduler assigns compensating days off around ON-weekends:</p>
      <ul className="list-disc pl-5 space-y-1 mt-1">
        <li><strong>Day off before weekend</strong> &mdash; configurable: Auto, Thursday, or Friday.</li>
        <li><strong>Day off after weekend</strong> &mdash; configurable: Auto, Monday, or Tuesday.</li>
      </ul>
      <p className="mt-1">
        Default auto pattern: Group A gets Thursday + Monday off, Group B gets Friday + Tuesday off.
        This ensures coverage on both Thursday and Friday leading into the weekend.
      </p>

      <H3>Blocked Days</H3>
      <p>
        Click day-of-week buttons (Sun-Sat) to block specific days. The employee will <strong>never</strong> be
        scheduled on blocked days. Shown as red/inactive buttons.
      </p>

      <H3>Required Shifts</H3>
      <p>
        Add specific dates where the employee <strong>must</strong> be scheduled. Select a date, pick a shift
        (AM/PM/Night), and click Add. These are honored before the scheduler fills remaining days.
        Remove entries by clicking the X on the chip.
      </p>
    </>,
  },

  /* ─── Time Off ─── */
  {
    id: 'time-off', title: 'Time Off / PTO', keywords: 'pto vacation partial half day full day coverage backup impact warning conflict drag select calendar',
    content: () => <>
      <p>Open an employee's <strong>Time Off</strong> tab.</p>

      <H3>Full Day PTO</H3>
      <p>
        Click the <strong>Full Day</strong> button, then click or drag across dates on the calendar to mark them.
        Click a marked date to remove it. Full PTO shows as <Badge bg="bg-red-200" text="text-red-800">P</Badge> on the grid.
        The employee will not be scheduled.
      </p>

      <H3>Partial Day (Half Day) PTO</H3>
      <p>
        Click <strong>Partial Day</strong>, set the off-hours (e.g., 09:00 to 13:00), then click/drag dates.
        Partial PTO shows as <Badge bg="bg-red-300" text="text-red-900">BB/2</Badge> on the grid.
        The employee is still assigned to their station for the hours they're present.
      </p>

      <H3>Drag to Select</H3>
      <p>Click and drag across multiple dates on the calendar to mark a range in one gesture.</p>

      <H3>PTO Impact Warnings</H3>
      <p>
        When marking PTO for an employee who is already scheduled, the app automatically checks
        whether the PTO would cause staffing conflicts:
      </p>
      <ul className="list-disc pl-5 space-y-1 mt-1">
        <li><strong className="text-red-600">Critical</strong> &mdash; not enough staff to cover all stations on that shift.</li>
        <li><strong className="text-amber-600">Warning</strong> &mdash; staffing is tight (1-2 extra beyond minimum).</li>
        <li>Shows who else is already off that day and how many staff remain.</li>
      </ul>
      <Callout type="warn">
        Impact warnings help you decide whether to approve PTO <em>before</em> creating a conflict.
        If a critical impact is shown, consider denying the PTO or arranging manual coverage.
      </Callout>

      <H3>Partial PTO Coverage (Automatic)</H3>
      <p>The scheduler automatically finds a <strong>same-role</strong> backup for partial PTO:</p>
      <ul className="list-disc pl-5 space-y-1 mt-1">
        <li>CLS leaving &rarr; another CLS or Admin covers.</li>
        <li>MLT leaving &rarr; another MLT covers (including admin-parked MLTs).</li>
        <li>Backup shows as <Badge bg="bg-green-600" text="text-white">AD&rarr;BB</Badge> on the grid (home &rarr; coverage station).</li>
        <li>In PDF: <code>BB*</code> with legend note <code>* = covers 2nd half (partial PTO)</code>.</li>
        <li>In day modal: amber <Badge bg="bg-amber-100" text="text-amber-700">covers 2nd half for Randy</Badge> badge.</li>
      </ul>

      <H3>Clearing PTO</H3>
      <p>Click <strong>Clear All</strong> to remove all time-off entries for the displayed month (with confirmation).</p>
    </>,
  },

  /* ─── Generating ─── */
  {
    id: 'generating', title: 'Generating a Schedule', keywords: 'auto-generate algorithm multi-pass 25 passes layer pipeline clear assignments',
    content: () => <>
      <p>On the <strong>Schedule</strong> page, click <strong>Auto-Generate</strong>.</p>

      <H3>Confirmation Dialog</H3>
      <p>
        A dialog warns: "This will remove all existing assignments for this month." Click <strong>Generate</strong> to
        proceed or Cancel to abort.
      </p>

      <H3>Algorithm Overview</H3>
      <ol className="list-decimal pl-5 space-y-1.5 mt-2">
        <li><strong>Day assignment</strong> &mdash; assigns employees to shifts based on default shift, hour targets, weekend rules, blocked days, required shifts, and PTO.</li>
        <li><strong>Station assignment (7-layer pipeline)</strong>:
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
            <li>Layer 1: Blood Bank &mdash; 1 CLS, weighted by preference.</li>
            <li>Layer 2: MLT placement &mdash; 1 MLT per require-CLS station.</li>
            <li>Layer 3: Admin placement &mdash; admins to Admin desk, pulled to bench if critical.</li>
            <li>Layer 4: CLS rotation &mdash; fills bench using proportional weight targeting.</li>
            <li>Layer 5: Admin-parked fill &mdash; re-optimizes MLT placements.</li>
            <li>Layer 6: Per-diem fill &mdash; fills remaining gaps.</li>
            <li>Layer 7: Overflow &mdash; places remaining employees.</li>
          </ul>
        </li>
        <li><strong>Repair pass</strong> &mdash; fixes understaffing, overstaffing, missing CLS, duplicate MLTs.</li>
        <li><strong>Partial PTO coverage</strong> &mdash; finds same-role backups (runs last).</li>
        <li><strong>Multi-pass optimization</strong> &mdash; runs 25 passes with randomized orderings, keeps the best.</li>
      </ol>
    </>,
  },

  /* ─── Monthly Navigation ─── */
  {
    id: 'navigation', title: 'Monthly Navigation', keywords: 'month navigate previous next arrow calendar',
    content: () => <>
      <p>At the top of the <strong>Schedule</strong> page:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li><strong>&larr; / &rarr; arrows</strong> &mdash; navigate to the previous or next month.</li>
        <li><strong>Month/Year display</strong> &mdash; shows the currently selected month.</li>
        <li>Assignments, warnings, and PTO all update when you change months.</li>
      </ul>
    </>,
  },

  /* ─── Grid ─── */
  {
    id: 'grid', title: 'Reading the Schedule Grid', keywords: 'grid row column shift group role banner tint drag reorder cross-shift guest',
    content: () => <>
      <H3>Shift Groups</H3>
      <p>Gray banners separate <strong>AM</strong>, <strong>PM</strong>, <strong>Night</strong>, and <strong>Floater</strong>.</p>

      <H3>Role Sub-Groups</H3>
      <p>Within each shift, colored banners group employees by role:</p>
      <ul className="list-disc pl-5 space-y-1 mt-1">
        <li><span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">ADMIN / SUPERVISOR</span> &mdash; amber rows</li>
        <li><span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">CLS</span> &mdash; blue rows</li>
        <li><span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">MLT</span> &mdash; purple rows</li>
      </ul>

      <H3>Reordering Employees</H3>
      <p>Drag the <strong>&#x2630;</strong> handle to reorder within the same role group. Order persists across sessions and is used in PDF exports.</p>

      <H3>Date Headers</H3>
      <p>Weekends are orange. Red = critical issues, amber = warnings, blue = today. Click any date header to open the day detail modal.</p>

      <H3>Cross-Shift Guest Rows</H3>
      <p>If an employee is assigned to a shift other than their default (e.g., a PM employee covering AM),
        they appear as a guest row at the bottom of that shift section with a shift badge label.</p>

      <H3>Show/Hide Warnings</H3>
      <p>Toggle the warnings display with the <strong>Show Warnings</strong> / <strong>Hide Warnings</strong> button in the header.</p>
    </>,
  },

  /* ─── Grid Symbols ─── */
  {
    id: 'grid-symbols', title: 'Grid Symbols Reference', keywords: 'badge symbol icon PTO half day arrow asterisk star cover',
    content: () => <>
      <div className="overflow-x-auto">
        <table className="text-sm border border-gray-200 w-full mt-2">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left border-b w-36">Symbol</th>
              <th className="px-3 py-2 text-left border-b">Meaning</th>
            </tr>
          </thead>
          <tbody>
            <SymRow sym={<Badge bg="bg-purple-500" text="text-white">HM</Badge>} text="Assigned to a station (color + abbreviation). Each station has a unique color." />
            <SymRow sym={<Badge bg="bg-red-200" text="text-red-800">P</Badge>} text="Full-day PTO. Employee is completely off." />
            <SymRow sym={<Badge bg="bg-red-300" text="text-red-900">BB/2</Badge>} text="Partial PTO at station. Employee works first half then leaves." />
            <SymRow sym={<Badge bg="bg-green-600" text="text-white">AD&rarr;BB</Badge>} text="Split duty. Starts at home station (AD), moves to cover Blood Bank after partial PTO employee leaves." />
            <SymRow sym={<code className="text-xs bg-gray-100 px-1 rounded">BB*</code>} text="(PDF only) Covers 2nd half at Blood Bank. Legend: * = covers 2nd half (partial PTO)." />
            <SymRow sym={<Badge bg="bg-amber-200" text="text-amber-800">AM</Badge>} text="Cross-shift badge. Employee normally works a different shift but is covering this one today." />
            <SymRow sym={<span className="text-gray-300">&mdash;</span>} text="Not scheduled (day off)." />
          </tbody>
        </table>
      </div>
    </>,
  },

  /* ─── Day Detail Modal ─── */
  {
    id: 'day-modal', title: 'Day Detail Modal', keywords: 'modal coverage who working station breakdown off pto navigate arrow escape',
    content: () => <>
      <p>Click any date column header to open the day detail modal.</p>

      <H3>Navigation</H3>
      <p>Use <strong>&larr; / &rarr;</strong> arrows (or keyboard) to move between days. Press <strong>Escape</strong> to close.</p>

      <H3>Coverage Issues</H3>
      <p>Red/amber alerts at the top listing staffing problems for this day+shift.</p>

      <H3>Who's Working (by Station)</H3>
      <p>Employees grouped by station with:</p>
      <ul className="list-disc pl-5 space-y-1 mt-1">
        <li>Name + role badge (CLS / MLT / Admin)</li>
        <li><Badge bg="bg-red-100" text="text-red-700">1/2 DAY</Badge> &mdash; has partial PTO, leaving mid-shift.</li>
        <li><Badge bg="bg-amber-100" text="text-amber-700">covers 2nd half for Randy</Badge> &mdash; same-role backup for the partial PTO employee.</li>
      </ul>

      <H3>Who's Off / PTO</H3>
      <p>Lists employees with time off, with their role badge.</p>
    </>,
  },

  /* ─── Manual Adjustments ─── */
  {
    id: 'manual', title: 'Manual Adjustments', keywords: 'change station swap remove delete assign specific day click cell empty',
    content: () => <>
      <H3>Clicking an Assigned Cell</H3>
      <p>Opens the actions modal with three options:</p>
      <DefList items={[
        ['Change Station', 'Pick a different station from the employee\'s qualified list. Includes "No station" option.'],
        ['Swap Stations', <>
          Exchange stations with another same-shift employee. Role rules:<br />
          <strong>CLS</strong> swaps with CLS only.<br />
          <strong>MLT</strong> swaps with MLT only.<br />
          <strong>Admin</strong> can swap into CLS positions (but CLS cannot take Admin duties).
        </>],
        ['Remove Assignment', 'Delete the assignment. Employee is unscheduled for that day.'],
      ]} />

      <H3>Clicking an Empty Cell (&mdash;)</H3>
      <p>
        Opens the assignment modal to schedule someone on that day. Select an employee,
        shift, and optionally a station.
      </p>

      <H3>Weekend Back-to-Back Warning</H3>
      <p>
        If assigning someone to a weekend day would create back-to-back weekends,
        a warning dialog appears. You can <strong>Force Assign</strong> to override or cancel.
      </p>
    </>,
  },

  /* ─── PDF Export ─── */
  {
    id: 'pdf', title: 'PDF Export', keywords: 'export download print pdf landscape letter',
    content: () => <>
      <p>Click <strong>Export PDF</strong> on the schedule page.</p>

      <H3>Layout</H3>
      <ul className="list-disc pl-5 space-y-1 mt-1">
        <li>Landscape letter-size, one page per shift.</li>
        <li>Employees grouped by role (Admin &rarr; CLS &rarr; MLT) with colored header rows.</li>
        <li>Custom drag order from the grid is preserved.</li>
        <li>Weekend columns highlighted in orange.</li>
      </ul>

      <H3>Legend (Two Rows)</H3>
      <p><strong>Row 1:</strong> Station colors + shift badges.</p>
      <p><strong>Row 2:</strong> <Badge bg="bg-red-200" text="text-red-800">P</Badge> PTO,{' '}
        <Badge bg="bg-red-300" text="text-red-900">&frac12;</Badge> Half Day,{' '}
        <span className="text-gray-400">&mdash;</span> Off,{' '}
        <code>*</code> = covers 2nd half (partial PTO).</p>
    </>,
  },

  /* ─── Warnings ─── */
  {
    id: 'warnings', title: 'Warnings & Coverage Issues', keywords: 'critical pivotal suggestion understaffed overstaffed missing cls mlt debug',
    content: () => <>
      <H3>Severity Levels</H3>
      <DefList items={[
        [<span className="text-red-600 font-bold">CRITICAL</span>, 'Station understaffed, missing CLS, or no partial PTO coverage. Must resolve.'],
        [<span className="text-amber-600 font-bold">PIVOTAL</span>, 'Missing MLT, or only one qualified employee (no backup).'],
        [<span className="text-gray-600 font-bold">WARNING</span>, 'Staffing tight, employee over/under weekly hours, overstaffed station.'],
        [<span className="text-blue-600 font-bold">SUGGESTION</span>, 'Optimization hints — extra CLS, MLT without bench station.'],
      ]} />

      <H3>Common Warnings</H3>
      <ul className="list-disc pl-5 space-y-1.5 mt-2">
        <li><strong>"needs X staff but only Y assigned"</strong> &mdash; station below minimum.</li>
        <li><strong>"has no CLS assigned"</strong> &mdash; require-CLS station has only MLTs.</li>
        <li><strong>"has partial PTO with no coverage"</strong> &mdash; no same-role backup found.</li>
        <li><strong>"is the ONLY person qualified"</strong> &mdash; single point of failure. Cross-train someone.</li>
        <li><strong>"is off but no other qualified employee is scheduled"</strong> &mdash; PTO approved with no backup.</li>
      </ul>

      <H3>Inline Warnings</H3>
      <p>Warnings appear below each shift header on the grid. Toggle visibility with <strong>Show/Hide Warnings</strong>.</p>
    </>,
  },

  /* ─── Breakdown Panel ─── */
  {
    id: 'breakdown', title: 'Schedule Breakdown Panel', keywords: 'bottom panel hours weekly target station distribution summary stats',
    content: () => <>
      <p>Below the schedule grid, the breakdown panel shows per-employee statistics:</p>

      <H3>Weekly Hours Table</H3>
      <ul className="list-disc pl-5 space-y-1 mt-1">
        <li><strong>Target column</strong> &mdash; weekly hour goal.</li>
        <li><strong>Week columns</strong> &mdash; actual hours scheduled per week. Red highlighting if over target.</li>
        <li><strong>Total</strong> &mdash; total hours for the month.</li>
        <li><strong>Weekend count</strong> &mdash; number of weekend days worked.</li>
      </ul>

      <H3>Station Distribution</H3>
      <p>
        For each employee, colored badges show how many days they're assigned to each station.
        Helps verify that weight preferences are being respected (e.g., 14 days Micro, 6 days Hema
        for a 70/30 split).
      </p>

      <H3>Employment Type Badges</H3>
      <p>Per-Diem and Part-Time employees are labeled so you can quickly identify staffing composition.</p>
    </>,
  },

  /* ─── Role Compatibility ─── */
  {
    id: 'roles', title: 'Role Compatibility Reference', keywords: 'cls mlt admin swap cover bench pull',
    content: () => <>
      <div className="overflow-x-auto mt-2">
        <table className="text-sm border border-gray-200 w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left border-b">Action</th>
              <th className="px-3 py-2 text-center border-b">CLS</th>
              <th className="px-3 py-2 text-center border-b">MLT</th>
              <th className="px-3 py-2 text-center border-b">Admin</th>
            </tr>
          </thead>
          <tbody>
            <RoleRow action="Works bench stations" cls="Yes" mlt="Yes (1 per station)" admin="When needed" />
            <RoleRow action="Covers CLS position" cls="Yes" mlt="No" admin="Yes" />
            <RoleRow action="Covers MLT position" cls="No" mlt="Yes" admin="No" />
            <RoleRow action="Swap with CLS" cls="Yes" mlt="No" admin="Yes" />
            <RoleRow action="Swap with MLT" cls="No" mlt="Yes" admin="No" />
            <RoleRow action="Swap with Admin" cls="No" mlt="No" admin="No" />
            <RoleRow action="Pulled to bench when short" cls="N/A" mlt="N/A" admin="Yes" />
            <RoleRow action="Covers partial PTO (CLS)" cls="Yes" mlt="No" admin="Yes" />
            <RoleRow action="Covers partial PTO (MLT)" cls="No" mlt="Yes" admin="No" />
            <RoleRow action="Default station" cls="Bench" mlt="Bench" admin="Admin desk" />
          </tbody>
        </table>
      </div>
    </>,
  },

  /* ─── Keyboard Shortcuts ─── */
  {
    id: 'keyboard', title: 'Keyboard Shortcuts & Interactions', keywords: 'keyboard shortcut escape enter drag click',
    content: () => <>
      <div className="overflow-x-auto mt-2">
        <table className="text-sm border border-gray-200 w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left border-b w-40">Input</th>
              <th className="px-3 py-2 text-left border-b">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b"><td className="px-3 py-2 font-mono text-xs">Escape</td><td className="px-3 py-2">Close modal / cancel edit</td></tr>
            <tr className="border-b"><td className="px-3 py-2 font-mono text-xs">Enter</td><td className="px-3 py-2">Submit (station name, search, percentage input)</td></tr>
            <tr className="border-b"><td className="px-3 py-2 font-mono text-xs">&larr; / &rarr;</td><td className="px-3 py-2">Navigate days in day detail modal</td></tr>
            <tr className="border-b"><td className="px-3 py-2 font-mono text-xs">Click + Drag (calendar)</td><td className="px-3 py-2">Select date range for PTO</td></tr>
            <tr className="border-b"><td className="px-3 py-2 font-mono text-xs">Drag &#x2630; handle</td><td className="px-3 py-2">Reorder employee within role group</td></tr>
            <tr><td className="px-3 py-2 font-mono text-xs">Click date header</td><td className="px-3 py-2">Open day detail modal</td></tr>
          </tbody>
        </table>
      </div>
    </>,
  },
];

/* ── Main Component ── */
export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections.filter(s =>
      s.title.toLowerCase().includes(q)
      || s.keywords.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Help & Reference Guide</h1>
      <p className="text-sm text-gray-500 mb-4">Complete documentation for the Lab Shift Scheduler.</p>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpenId(null); }}
          placeholder="Search help topics..."
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
        {search && (
          <p className="text-xs text-gray-400 mt-1">{filtered.length} of {sections.length} sections match</p>
        )}
      </div>

      {/* Table of Contents (hidden when searching) */}
      {!search && (
        <nav className="mb-6 bg-gray-50 rounded-lg border border-gray-200 p-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Contents</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => { setOpenId(s.id); setTimeout(() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }), 50); }}
                className="text-left text-sm text-blue-600 hover:text-blue-800 hover:underline px-2 py-1 rounded hover:bg-blue-50"
              >
                {s.title}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {filtered.map(s => (
          <div key={s.id} id={s.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setOpenId(openId === s.id ? null : s.id)}
              className="w-full text-left px-4 py-3 bg-white hover:bg-gray-50 flex items-center justify-between"
            >
              <span className="text-sm font-semibold text-gray-800">{s.title}</span>
              <span className={`text-gray-400 transition-transform ${openId === s.id ? 'rotate-180' : ''}`}>&#x25BE;</span>
            </button>
            {(openId === s.id || (search && filtered.length <= 3)) && (
              <div className="px-4 pb-4 pt-1 text-sm text-gray-600 leading-relaxed border-t border-gray-100">
                {s.content()}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No matching help topics found.</p>
        )}
      </div>
    </div>
  );
}

/* ── Shared subcomponents ── */
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-1">{children}</h3>;
}
function Badge({ bg, text, children }: { bg: string; text: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${bg} ${text}`}>{children}</span>;
}
function Callout({ type, children }: { type: 'info' | 'warn'; children: React.ReactNode }) {
  const s = type === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800';
  return <div className={`mt-2 px-3 py-2 rounded border text-xs ${s}`}>{children}</div>;
}
function DefList({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="mt-2 space-y-2">
      {items.map(([t, d], i) => (
        <div key={i}><dt className="text-sm font-semibold text-gray-700">{t}</dt><dd className="text-sm text-gray-600 pl-4">{d}</dd></div>
      ))}
    </dl>
  );
}
function SymRow({ sym, text }: { sym: React.ReactNode; text: string }) {
  return <tr className="border-b"><td className="px-3 py-2">{sym}</td><td className="px-3 py-2 text-gray-600">{text}</td></tr>;
}
function RoleRow({ action, cls, mlt, admin }: { action: string; cls: string; mlt: string; admin: string }) {
  const c = (v: string) => <td className={`px-3 py-2 text-center border-b ${v === 'Yes' ? 'text-green-600' : v === 'No' ? 'text-red-500' : 'text-gray-500'}`}>{v}</td>;
  return <tr><td className="px-3 py-2 font-medium border-b">{action}</td>{c(cls)}{c(mlt)}{c(admin)}</tr>;
}

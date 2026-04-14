export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Help & Guide</h1>

      <div className="space-y-8">
        {/* Getting Started */}
        <Section title="Getting Started">
          <p>
            The Lab Shift Scheduler helps you manage employee schedules across multiple stations and shifts.
            The main workflow is: set up your stations, add employees with their roles and preferences, then
            auto-generate a monthly schedule.
          </p>
        </Section>

        {/* Stations */}
        <Section title="Stations">
          <p>
            Go to the <strong>Stations</strong> page to configure your lab stations (e.g., Hematology, Chemistry,
            Blood Bank, Microbiology, Admin).
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Min Staff (AM/PM/Night)</strong> &mdash; the minimum number of employees required at each station per shift. The scheduler uses these to ensure coverage.</li>
            <li><strong>Require CLS</strong> &mdash; if enabled, at least one CLS (or Admin) must be assigned to this station. An MLT alone is not sufficient.</li>
            <li><strong>Color & Abbreviation</strong> &mdash; customize how each station appears on the schedule grid and PDF export.</li>
          </ul>
        </Section>

        {/* Employees */}
        <Section title="Employees">
          <p>
            Go to the <strong>Employees</strong> page to add and manage your team. Each employee has:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Role</strong> &mdash; CLS, MLT, or Admin. This controls which stations they can be assigned to and who can cover for whom.</li>
            <li><strong>Default Shift</strong> &mdash; AM, PM, Night, or Floater. Employees are grouped by their default shift on the schedule.</li>
            <li><strong>Employment Type</strong> &mdash; Full-time, Part-time, or Per-diem. Affects weekly hour targets and scheduling priority.</li>
            <li><strong>Target Hours/Week</strong> &mdash; how many hours per week this employee should be scheduled.</li>
          </ul>
        </Section>

        {/* Station Preferences */}
        <Section title="Station Preferences (Weights)">
          <p>
            Click an employee's station preferences to open the editor. Here you can:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Toggle stations</strong> &mdash; click a station pill to add/remove it from the employee's qualified stations.</li>
            <li><strong>Set percentages</strong> &mdash; use the sliders or type a value to set how often the employee should work at each station. The pie chart shows the proportional split.</li>
            <li><strong>Auto-balance</strong> &mdash; moving one slider automatically adjusts the others to keep the total at 100%.</li>
          </ul>
          <p className="mt-2">
            For example, setting Microbiology to 70% and Hematology to 30% means the employee will be assigned
            to Micro roughly 70% of the month and Hematology 30%. The algorithm targets these ratios over the
            full month.
          </p>
        </Section>

        {/* Employee Rules */}
        <Section title="Employee Rules & Constraints">
          <p>Click an employee to open their detail panel. Under the <strong>Rules</strong> tab you can set:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Weekend Availability</strong> &mdash; All weekends, alternating, once a month, or none.</li>
            <li><strong>Blocked Days</strong> &mdash; specific days of the week the employee cannot work (e.g., every Tuesday off).</li>
            <li><strong>Required Shifts</strong> &mdash; specific dates where the employee must be scheduled.</li>
          </ul>
        </Section>

        {/* Time Off / PTO */}
        <Section title="Time Off / PTO">
          <p>Under the employee's <strong>Time Off</strong> tab:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Full Day PTO</strong> &mdash; the employee is completely off. They will not be scheduled.</li>
            <li><strong>Partial Day (Half Day)</strong> &mdash; the employee works part of the shift, then leaves. The scheduler will try to find a same-role backup to cover the rest of the shift.</li>
          </ul>
          <p className="mt-2">
            On the schedule grid, partial PTO shows as a red badge (e.g., <code>BB/2</code>). The backup
            person shows an arrow label (e.g., <code>AD→BB</code>) indicating they move from their home
            station to cover. In the PDF export, backups show as <code>BB*</code> with a legend note.
          </p>
        </Section>

        {/* Generating a Schedule */}
        <Section title="Generating a Schedule">
          <p>
            On the <strong>Schedule</strong> page, click <strong>Auto-Generate</strong> to create a schedule
            for the selected month. The algorithm:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 mt-2">
            <li>Assigns employees to shifts based on their default shift, weekly hour targets, and availability.</li>
            <li>Assigns stations based on role (MLT gets one per station, CLS fills the rest) and your weight preferences.</li>
            <li>Ensures minimum staffing requirements are met at each station.</li>
            <li>Handles partial PTO coverage by finding same-role backups.</li>
            <li>Admins/supervisors fill in at bench stations when no CLS or MLT is available.</li>
          </ol>
          <p className="mt-2">
            After generating, review the warnings panel for any coverage gaps or staffing issues. You can
            manually adjust assignments by clicking on any cell in the grid.
          </p>
        </Section>

        {/* Reading the Schedule Grid */}
        <Section title="Reading the Schedule Grid">
          <p>The grid is organized by shift (AM, PM, Night) and then by role (Admin, CLS, MLT) within each shift.</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Colored badges</strong> &mdash; each station has a unique color and abbreviation (e.g., purple <code>HM</code> for Hematology).</li>
            <li><strong>P</strong> (red) &mdash; full-day PTO.</li>
            <li><strong>BB/2</strong> (red) &mdash; partial PTO at that station (half day).</li>
            <li><strong>AD→BB</strong> &mdash; employee moves from Admin to Blood Bank to cover a half-day absence.</li>
            <li><strong>&mdash;</strong> (gray) &mdash; not scheduled this day.</li>
          </ul>
          <p className="mt-2">
            Click any date column header to open the day detail modal, which shows who's at each station,
            staffing issues, and who's off.
          </p>
        </Section>

        {/* Manual Adjustments */}
        <Section title="Manual Adjustments">
          <p>Click on any employee's assignment cell to open the actions modal where you can:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Change station</strong> &mdash; move the employee to a different station for that day.</li>
            <li><strong>Swap</strong> &mdash; swap stations with another same-role employee on the same shift. MLT swaps with MLT, CLS with CLS. Admins can swap into CLS positions.</li>
            <li><strong>Remove</strong> &mdash; delete the assignment entirely.</li>
          </ul>
        </Section>

        {/* Exporting */}
        <Section title="Exporting to PDF">
          <p>
            Click <strong>Export PDF</strong> to download the schedule as a formatted PDF. Each shift gets its
            own page, with employees grouped by role. The legend at the top explains all badges and symbols.
          </p>
        </Section>

        {/* Warnings */}
        <Section title="Warnings & Coverage Issues">
          <p>The schedule shows coverage issues inline and in the day detail modal:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong className="text-red-600">CRITICAL</strong> &mdash; a station is understaffed or has no coverage. Must be resolved.</li>
            <li><strong className="text-amber-600">PIVOTAL</strong> &mdash; a station is missing a required CLS or MLT. Should be addressed.</li>
            <li><strong className="text-gray-600">WARNING</strong> &mdash; staffing is tight but not critical (e.g., employee over/under weekly hours).</li>
            <li><strong className="text-blue-600">SUGGESTION</strong> &mdash; optimization hints (e.g., an extra CLS that could be moved).</li>
          </ul>
        </Section>

        {/* Role Rules */}
        <Section title="Role Rules Summary">
          <div className="overflow-x-auto mt-2">
            <table className="text-sm border border-gray-200 w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left border-b">Rule</th>
                  <th className="px-3 py-2 text-left border-b">CLS</th>
                  <th className="px-3 py-2 text-left border-b">MLT</th>
                  <th className="px-3 py-2 text-left border-b">Admin</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium">Covers CLS position</td>
                  <td className="px-3 py-2 text-green-600">Yes</td>
                  <td className="px-3 py-2 text-red-600">No</td>
                  <td className="px-3 py-2 text-green-600">Yes</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium">Covers MLT position</td>
                  <td className="px-3 py-2 text-red-600">No</td>
                  <td className="px-3 py-2 text-green-600">Yes</td>
                  <td className="px-3 py-2 text-red-600">No</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium">Swap with CLS</td>
                  <td className="px-3 py-2 text-green-600">Yes</td>
                  <td className="px-3 py-2 text-red-600">No</td>
                  <td className="px-3 py-2 text-green-600">Yes</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium">Swap with MLT</td>
                  <td className="px-3 py-2 text-red-600">No</td>
                  <td className="px-3 py-2 text-green-600">Yes</td>
                  <td className="px-3 py-2 text-red-600">No</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-medium">Pulled to bench when short</td>
                  <td className="px-3 py-2 text-gray-400">N/A</td>
                  <td className="px-3 py-2 text-gray-400">N/A</td>
                  <td className="px-3 py-2 text-green-600">Yes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-800 mb-2 border-b border-gray-200 pb-1">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

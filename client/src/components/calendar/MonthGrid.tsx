import React, { useState, useEffect, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, addDays as addDaysFns, subDays } from 'date-fns';
import { useSchedule, useShifts, useWarnings, useDeleteAssignment, useUpdateAssignment, useSwapAssignments, useGenerateSchedule } from '../../hooks/useSchedule';
import { useEmployees } from '../../hooks/useEmployees';
import { useTimeOff } from '../../hooks/useTimeOff';
import { useStations, useUpdateStation } from '../../hooks/useStations';
import AssignmentModal from './AssignmentModal';
import AssignmentActionsModal from './AssignmentActionsModal';
import StationStyleEditor from './StationStyleEditor';
import type { Shift, ScheduleAssignment, Employee, Station } from '../../types';
import { buildStationStyleMap, getStationStyle, type StationDisplay } from '../../utils/stationStyles';
import toast from 'react-hot-toast';


const SHIFT_ICONS: Record<string, { label: string; bg: string; text: string; rgb: [number, number, number] }> = {
  AM:        { label: 'AM', bg: 'bg-yellow-400',   text: 'text-yellow-900', rgb: [250, 204, 21] },
  PM:        { label: 'PM', bg: 'bg-indigo-600',  text: 'text-white', rgb: [79, 70, 229] },
  Night:     { label: 'NS', bg: 'bg-gray-700',    text: 'text-white', rgb: [55, 65, 81] },
};

export default function MonthGrid() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const month = format(currentDate, 'yyyy-MM');

  const { data: assignments = [] } = useSchedule(month);
  const { data: shifts = [] } = useShifts();
  const { data: rawEmployees = [] } = useEmployees();
  const { data: timeOff = [] } = useTimeOff({ month });
  const { data: liveWarnings = [] } = useWarnings(month);
  const { data: stationsData = [] } = useStations();
  const updateStation = useUpdateStation();
  const deleteAssignment = useDeleteAssignment(month);
  const updateAssignment = useUpdateAssignment(month);
  const swapAssignments = useSwapAssignments(month);
  const generateSchedule = useGenerateSchedule(month);

  const stationStyleMap = React.useMemo(() => buildStationStyleMap(stationsData), [stationsData]);
  const getStationDisplay = React.useCallback((name: string): StationDisplay => {
    if (stationStyleMap[name]) return stationStyleMap[name];
    return getStationStyle(name, stationsData);
  }, [stationStyleMap, stationsData]);

  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [actionsModal, setActionsModal] = useState<{ assignment: ScheduleAssignment; employee: Employee } | null>(null);

  // Sort employees: group by shift (AM → PM → Night → Floater), then alphabetize within group
  const SHIFT_ORDER: Record<string, number> = { am: 0, pm: 1, night: 2, floater: 3 };
  const employees = [...rawEmployees].sort((a, b) => {
    const shiftDiff = (SHIFT_ORDER[a.default_shift] ?? 9) - (SHIFT_ORDER[b.default_shift] ?? 9);
    if (shiftDiff !== 0) return shiftDiff;
    return a.name.localeCompare(b.name);
  });

  const [modal, setModal] = useState<{ date: string; shift: Shift; employee?: Employee } | null>(null);
  const [showWarnings, setShowWarnings] = useState(true);
  const [coverageModal, setCoverageModal] = useState<{ date: string; shift: string } | null>(null);
  const [employeeDetail, setEmployeeDetail] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmColor?: string;
    onConfirm: () => void;
  } | null>(null);
  const warnings = liveWarnings;

  // Arrow key navigation for coverage modal
  const navigateCoverageDay = useCallback((direction: 'prev' | 'next') => {
    if (!coverageModal) return;
    const current = new Date(coverageModal.date + 'T00:00:00');
    const newDate = direction === 'next' ? addDaysFns(current, 1) : subDays(current, 1);
    const newDateStr = format(newDate, 'yyyy-MM-dd');
    // Stay within the current month
    const monthStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');
    if (newDateStr >= monthStart && newDateStr <= monthEnd) {
      setCoverageModal({ date: newDateStr, shift: coverageModal.shift });
    }
  }, [coverageModal, currentDate]);

  useEffect(() => {
    if (!coverageModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigateCoverageDay('prev'); }
      if (e.key === 'ArrowRight') { e.preventDefault(); navigateCoverageDay('next'); }
      if (e.key === 'Escape') { setCoverageModal(null); setEmployeeDetail(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [coverageModal, navigateCoverageDay]);

  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start, end });

  // Index: employee_id -> date -> assignment
  const assignmentIndex = new Map<string, ScheduleAssignment>();
  for (const a of assignments) {
    assignmentIndex.set(`${a.employee_id}-${a.date}`, a);
  }

  // Index: employee_id -> date -> off_type
  const timeOffIndex = new Map<number, Map<string, string>>();
  for (const t of timeOff) {
    if (!timeOffIndex.has(t.employee_id)) timeOffIndex.set(t.employee_id, new Map());
    timeOffIndex.get(t.employee_id)!.set(t.date, t.off_type);
  }

  // Index: date -> list of coverage issues (parsed from warnings)
  const stationNames = stationsData.map(s => s.name);
  const coverageByDate = new Map<string, { shift: string; station: string; severity: 'critical' | 'warn' | 'info' | 'suggestion'; message: string }[]>();
  for (const w of warnings) {
    const dateMatch = w.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];

    // Determine shift from warning text
    const shiftMatch = w.match(/\((\w+)\)\s*$/) || w.match(/\b(AM|PM|Night)\b\s+shift/i);
    const shift = shiftMatch ? shiftMatch[1] : '';

    // Determine station
    let station = '';
    for (const sn of stationNames) {
      if (w.includes(sn)) { station = sn; break; }
    }

    const severity: 'critical' | 'warn' | 'info' | 'suggestion' =
      (w.startsWith('CRITICAL:') || w.startsWith('SCHEDULE ERROR:')) ? 'critical'
      : w.startsWith('INFO:') ? 'info'
      : w.startsWith('SUGGESTION:') ? 'suggestion'
      : 'warn';

    // Simplified message
    let msg = w
      .replace(/^(CRITICAL|SCHEDULE ERROR|PIVOTAL|SUGGESTION|INFO): /, '')
      .replace(/on\s+\d{4}-\d{2}-\d{2}/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!coverageByDate.has(date)) coverageByDate.set(date, []);
    coverageByDate.get(date)!.push({ shift, station, severity, message: msg });
  }

  // Cross-shift index: employees assigned to a shift different from their default
  // Maps target shift group (lowercase) -> list of { employee, cross-shift assignments for that group }
  const crossShiftByGroup = new Map<string, { emp: Employee; assignments: ScheduleAssignment[] }[]>();
  for (const emp of employees) {
    if (emp.default_shift === 'floater') continue;
    const crossAssignments = assignments.filter(a => {
      if (a.employee_id !== emp.id) return false;
      const assignedShift = a.shift_name.toLowerCase();
      return assignedShift !== emp.default_shift;
    });
    if (crossAssignments.length === 0) continue;
    // Group by target shift
    const byShift = new Map<string, ScheduleAssignment[]>();
    for (const a of crossAssignments) {
      const s = a.shift_name.toLowerCase();
      if (!byShift.has(s)) byShift.set(s, []);
      byShift.get(s)!.push(a);
    }
    for (const [shiftGroup, shiftAssignments] of byShift) {
      if (!crossShiftByGroup.has(shiftGroup)) crossShiftByGroup.set(shiftGroup, []);
      crossShiftByGroup.get(shiftGroup)!.push({ emp, assignments: shiftAssignments });
    }
  }

  const handleCellClick = (emp: Employee, dateStr: string) => {
    const key = `${emp.id}-${dateStr}`;
    const existing = assignmentIndex.get(key);

    if (existing) {
      setActionsModal({ assignment: existing, employee: emp });
      return;
    }

    // Find the shift to assign based on employee's default
    const shiftName = emp.default_shift === 'floater' ? null : emp.default_shift;
    const shift = shiftName
      ? shifts.find((s) => s.name.toLowerCase() === shiftName)
      : null;

    if (shift) {
      setModal({ date: dateStr, shift, employee: emp });
    } else {
      // Floater — show modal to pick shift
      setModal({ date: dateStr, shift: shifts[0], employee: emp });
    }
  };

  const handleExportPDF = () => {
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageWidth = pdf.internal.pageSize.width;
      const pageHeight = pdf.internal.pageSize.height;

      // Group employees by shift
      const SHIFT_ORDER: Record<string, number> = { am: 0, pm: 1, night: 2, floater: 3 };
      const shiftGroups: { key: string; label: string; emps: typeof employees }[] = [];
      const groupMap = new Map<string, typeof employees>();
      for (const emp of employees) {
        const key = emp.default_shift;
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(emp);
      }
      for (const [key, emps] of [...groupMap.entries()].sort((a, b) => (SHIFT_ORDER[a[0]] ?? 9) - (SHIFT_ORDER[b[0]] ?? 9))) {
        const label = key === 'am' ? 'AM' : key === 'pm' ? 'PM' : key.charAt(0).toUpperCase() + key.slice(1);
        shiftGroups.push({ key, label, emps });
      }

      // Legend renderer (used on each page)
      const drawLegend = () => {
        pdf.setFontSize(8);
        const ly = 46;
        let lx = 40;

        // Stations + Admin
        pdf.setTextColor(100, 100, 100);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Stations:', lx, ly);
        lx += pdf.getTextWidth('Stations:') + 6;

        const legendItems: { abbr: string; rgb: [number, number, number]; label: string }[] =
          stationsData.map(s => {
            const style = getStationDisplay(s.name);
            return { abbr: style.abbr, rgb: style.rgb, label: s.name };
          });
        for (const item of legendItems) {
          const [r, g, b] = item.rgb;
          pdf.setFillColor(r, g, b);
          pdf.roundedRect(lx, ly - 8, 18, 10, 1.5, 1.5, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.text(item.abbr, lx + 9, ly - 1, { align: 'center' });
          pdf.setTextColor(80, 80, 80);
          pdf.setFont('helvetica', 'normal');
          pdf.text(item.label, lx + 22, ly);
          lx += pdf.getTextWidth(item.label) + 32;
        }

        // Shift badges (for cross-shift days)
        lx += 6;
        pdf.setTextColor(100, 100, 100);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Shifts:', lx, ly);
        lx += pdf.getTextWidth('Shifts:') + 6;

        const shiftLegend: { label: string; rgb: [number, number, number]; textRgb: [number, number, number]; name: string }[] = [
          { label: 'AM', rgb: SHIFT_ICONS.AM.rgb, textRgb: [120, 80, 0], name: 'AM' },
          { label: 'PM', rgb: SHIFT_ICONS.PM.rgb, textRgb: [255, 255, 255], name: 'PM' },
          { label: 'NS', rgb: SHIFT_ICONS.Night.rgb, textRgb: [255, 255, 255], name: 'Night' },
        ];
        for (const item of shiftLegend) {
          const [r, g, b] = item.rgb;
          pdf.setFillColor(r, g, b);
          pdf.roundedRect(lx, ly - 8, 18, 10, 1.5, 1.5, 'F');
          pdf.setTextColor(item.textRgb[0], item.textRgb[1], item.textRgb[2]);
          pdf.setFont('helvetica', 'bold');
          pdf.text(item.label, lx + 9, ly - 1, { align: 'center' });
          pdf.setTextColor(80, 80, 80);
          pdf.setFont('helvetica', 'normal');
          pdf.text(item.name, lx + 22, ly);
          lx += pdf.getTextWidth(item.name) + 32;
        }

        // PTO + Off on the same row
        pdf.setFillColor(254, 226, 226);
        pdf.roundedRect(lx, ly - 8, 18, 10, 1.5, 1.5, 'F');
        pdf.setTextColor(220, 38, 38);
        pdf.setFont('helvetica', 'bold');
        pdf.text('P', lx + 9, ly - 1, { align: 'center' });
        pdf.setTextColor(80, 80, 80);
        pdf.setFont('helvetica', 'normal');
        pdf.text('PTO', lx + 22, ly);
        lx += pdf.getTextWidth('PTO') + 32;

        pdf.setFillColor(254, 178, 178);
        pdf.roundedRect(lx, ly - 8, 18, 10, 1.5, 1.5, 'F');
        pdf.setTextColor(153, 27, 27);
        pdf.setFont('helvetica', 'bold');
        pdf.text('½', lx + 9, ly - 1, { align: 'center' });
        pdf.setTextColor(80, 80, 80);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Half Day', lx + 22, ly);
        lx += pdf.getTextWidth('Half Day') + 32;

        pdf.setFillColor(240, 240, 240);
        pdf.roundedRect(lx, ly - 8, 18, 10, 1.5, 1.5, 'F');
        pdf.setTextColor(180, 180, 180);
        pdf.setFont('helvetica', 'normal');
        pdf.text('—', lx + 9, ly - 1, { align: 'center' });
        pdf.setTextColor(80, 80, 80);
        pdf.text('Off', lx + 22, ly);
        lx += pdf.getTextWidth('Off') + 32;

        pdf.setTextColor(100, 100, 100);
        pdf.setFont('helvetica', 'bold');
        pdf.text('*', lx + 2, ly);
        pdf.setTextColor(80, 80, 80);
        pdf.setFont('helvetica', 'normal');
        pdf.text('= covers 2nd half (partial PTO)', lx + 9, ly);
      };

      // Footer renderer
      const drawFooter = (pageNum: number, totalPages: number) => {
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.setFont('helvetica', 'normal');
        pdf.text(
          `Generated ${format(new Date(), 'MM/dd/yyyy h:mm a')}`,
          pageWidth - 30, pageHeight - 14, { align: 'right' }
        );
        pdf.text(`Page ${pageNum} of ${totalPages}`, 30, pageHeight - 14);
      };

      // Use single-letter day abbreviations so columns don't clip
      const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      const head = ['Employee', ...days.map(d => DAY_LETTERS[getDay(d)] + '\n' + format(d, 'd'))];
      const totalPages = shiftGroups.length;

      // Generate one page per shift group
      shiftGroups.forEach((group, pageIndex) => {
        if (pageIndex > 0) pdf.addPage();

        // Title
        pdf.setFontSize(18);
        pdf.setTextColor(30, 30, 30);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${format(currentDate, 'MMMM yyyy')} — ${group.label} Shift`, 30, 28);

        drawLegend();

        // Build table data for this shift group + cross-shift guests
        const cellData: Map<string, { shiftName: string; stationName: string | null; isCrossShift: boolean; isCoveringPTO?: boolean }> = new Map();
        const body: string[][] = [];
        const guestRowIndices = new Set<number>();

        group.emps.forEach((emp, ri) => {
          const cells = [emp.name];
          for (let ci = 0; ci < days.length; ci++) {
            const dateStr = format(days[ci], 'yyyy-MM-dd');
            const assignment = assignmentIndex.get(`${emp.id}-${dateStr}`);
            const offType = timeOffIndex.get(emp.id)?.get(dateStr);

            if (offType === 'full') {
              cells.push('PTO');
            } else if (offType === 'custom' && assignment) {
              const stationDisplay = assignment.station_name ? getStationDisplay(assignment.station_name) : null;
              cells.push(stationDisplay ? `${stationDisplay.abbr}/2` : '½');
            } else if (offType === 'custom') {
              cells.push('½');
            } else if (assignment) {
              const isCrossShift = emp.default_shift !== 'floater' && assignment.shift_name.toLowerCase() !== emp.default_shift;
              const icon = SHIFT_ICONS[assignment.shift_name];
              const stationDisplay = assignment.station_name ? getStationDisplay(assignment.station_name) : null;

              // Check if covering partial PTO — same logic as web view
              const homeStationName = emp.role === 'admin' ? 'Admin'
                : emp.stations?.[0]?.name ?? null;
              const isAtHomeStation = homeStationName === assignment.station_name;
              const hasPTOCoworker = assignment.station_id != null && assignments.some(other =>
                other.id !== assignment.id
                && other.date === dateStr
                && other.station_id === assignment.station_id
                && timeOffIndex.get(other.employee_id)?.get(dateStr) === 'custom'
              );
              const isCoveringPTO = hasPTOCoworker && !isAtHomeStation;

              if (isCrossShift && icon) {
                cells.push(icon.label);
              } else if (stationDisplay && isCoveringPTO) {
                cells.push(`${stationDisplay.abbr}*`);
              } else {
                cells.push(stationDisplay ? stationDisplay.abbr : (icon ? icon.label : assignment.shift_name.charAt(0)));
              }
              cellData.set(`${ri}-${ci}`, {
                shiftName: assignment.shift_name,
                stationName: assignment.station_name ?? null,
                isCrossShift,
                isCoveringPTO,
              });
            } else {
              cells.push('—');
            }
          }
          body.push(cells);
        });

        // Add cross-shift guests (e.g., John PM appearing on AM page)
        const guests = crossShiftByGroup.get(group.key) ?? [];
        for (const { emp: guestEmp, assignments: guestAssignments } of guests) {
          const ri = body.length;
          guestRowIndices.add(ri);
          const guestIndex = new Map<string, ScheduleAssignment>();
          for (const a of guestAssignments) guestIndex.set(a.date, a);

          const cells = [`${guestEmp.name} (${guestEmp.default_shift.toUpperCase()})`];
          for (let ci = 0; ci < days.length; ci++) {
            const dateStr = format(days[ci], 'yyyy-MM-dd');
            const ga = guestIndex.get(dateStr);
            if (ga) {
              const stationDisplay = ga.station_name ? getStationDisplay(ga.station_name) : null;
              cells.push(stationDisplay ? stationDisplay.abbr : (SHIFT_ICONS[ga.shift_name]?.label ?? ga.shift_name.charAt(0)));
              cellData.set(`${ri}-${ci}`, {
                shiftName: ga.shift_name,
                stationName: ga.station_name ?? null,
                isCrossShift: false,
              });
            } else {
              cells.push('—');
            }
          }
          body.push(cells);
        }

        // Calculate sizing to fill page width evenly
        const margin = 16;
        const usableWidth = pageWidth - margin * 2;
        const empColWidth = 85;
        const dayColWidth = (usableWidth - empColWidth) / days.length;

        // Scale font based on available column width and employee count
        const fontSize = group.emps.length <= 5 ? 9 : group.emps.length <= 10 ? 8 : 7;
        const cellHeight = group.emps.length <= 5 ? 28 : group.emps.length <= 10 ? 22 : 18;

        // Build column styles — explicitly set width for every column
        const colStyles: Record<number, { halign?: string; cellWidth?: number; fontSize?: number; fontStyle?: string; overflow?: string }> = {
          0: { halign: 'left', cellWidth: empColWidth, fontSize: fontSize + 1, fontStyle: 'bold', overflow: 'ellipsize' },
        };
        for (let i = 0; i < days.length; i++) {
          colStyles[i + 1] = { cellWidth: dayColWidth, overflow: 'visible' };
        }

        autoTable(pdf, {
          startY: 56,
          margin: { left: margin, right: margin },
          head: [head],
          body,
          theme: 'grid',
          tableWidth: usableWidth,
          styles: {
            fontSize,
            cellPadding: 1,
            halign: 'center',
            valign: 'middle',
            lineWidth: 0.4,
            lineColor: [190, 190, 190],
            minCellHeight: cellHeight,
            overflow: 'visible',
          },
          headStyles: {
            fillColor: [235, 240, 248],
            textColor: [40, 40, 40],
            fontStyle: 'bold',
            fontSize: fontSize,
            minCellHeight: 26,
            cellPadding: { top: 2, bottom: 2, left: 1, right: 1 },
            lineWidth: 0.5,
            lineColor: [160, 160, 160],
          },
          columnStyles: colStyles as any,
          didParseCell: (data) => {
            // Weekend header columns
            if (data.section === 'head' && data.column.index > 0) {
              const day = days[data.column.index - 1];
              if (day && (getDay(day) === 0 || getDay(day) === 6)) {
                data.cell.styles.fillColor = [255, 237, 213];
                data.cell.styles.textColor = [180, 50, 0];
                data.cell.styles.fontStyle = 'bold';
              }
            }
            if (data.section !== 'body') return;

            const isOddRow = data.row.index % 2 === 1;
            const dayIdx = data.column.index - 1;

            // Alternate row colors for readability
            if (data.column.index === 0) {
              data.cell.styles.fillColor = isOddRow ? [245, 247, 250] : [255, 255, 255];
              return;
            }

            const day = days[dayIdx];
            if (!day) return;
            const isWknd = getDay(day) === 0 || getDay(day) === 6;
            const text = data.cell.text.join('');

            // Alternate row tint + weekend tint
            if (isWknd) {
              data.cell.styles.fillColor = isOddRow ? [250, 242, 234] : [253, 248, 243];
            } else {
              data.cell.styles.fillColor = isOddRow ? [245, 247, 250] : [255, 255, 255];
            }

            // Off days just show faded dash — no badge needed
            if (text === '—') {
              data.cell.styles.textColor = [200, 200, 200];
            } else {
              // Hide default text — we'll draw badge + text manually in didDrawCell
              data.cell.styles.textColor = [255, 255, 255, 0] as any;
            }
          },
          didDrawCell: (data) => {
            if (data.section !== 'body') return;
            if (data.column.index === 0) return;

            const text = data.cell.text.join('');
            if (text === '—') return; // dashes rendered normally

            const dayIdx = data.column.index - 1;
            const ri = data.row.index;
            const cellX = data.cell.x;
            const cellY = data.cell.y;
            const cellW = data.cell.width;
            const cellH = data.cell.height;

            const cd = cellData.get(`${ri}-${dayIdx}`);
            const badgeW = Math.min(cellW - 4, 20);
            const badgeH = Math.min(cellH - 6, 14);
            const badgeX = cellX + (cellW - badgeW) / 2;
            const badgeY = cellY + (cellH - badgeH) / 2;

            let bgColor: [number, number, number] | null = null;
            let textColor: [number, number, number] = [255, 255, 255];
            let label = text;

            if (text === 'PTO') {
              bgColor = [254, 202, 202];
              textColor = [185, 28, 28];
            } else if (text === '½' || text.endsWith('/2')) {
              bgColor = [254, 178, 178];
              textColor = [153, 27, 27];
            } else {
              if (cd) {
                if (cd.isCrossShift) {
                  const icon = SHIFT_ICONS[cd.shiftName];
                  if (icon) bgColor = [...icon.rgb] as [number, number, number];
                } else if (cd.stationName) {
                  bgColor = [...getStationDisplay(cd.stationName).rgb] as [number, number, number];
                } else {
                  const icon = SHIFT_ICONS[cd.shiftName];
                  if (icon) bgColor = [...icon.rgb] as [number, number, number];
                }
              }
            }

            if (!bgColor) return;

            // Draw rounded badge
            const [r, g, b] = bgColor;
            pdf.setFillColor(r, g, b);
            pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'F');

            // Draw label text centered on badge
            pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(fontSize - 1);
            pdf.text(label, badgeX + badgeW / 2, badgeY + badgeH / 2 + (fontSize - 1) * 0.35, { align: 'center' });
          },
        });

        drawFooter(pageIndex + 1, totalPages);
      });

      pdf.save(`schedule-${month}.pdf`);
      toast.success('PDF exported');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to export PDF');
    }
  };


  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Pre-compute warnings grouped by shift for inline display
  type ShiftIssue = { severity: 'critical' | 'warn' | 'info' | 'suggestion'; date: string; msg: string; station: string };
  const warningsByShift = (() => {
    const result: Record<string, { stationIssues: Map<string, ShiftIssue[]>; noCoverageDates: string[] }> = {
      am: { stationIssues: new Map(), noCoverageDates: [] },
      pm: { stationIssues: new Map(), noCoverageDates: [] },
      night: { stationIssues: new Map(), noCoverageDates: [] },
    };
    const sNames = stationsData.map(s => s.name);

    for (const w of warnings) {
      // "No coverage" warnings
      const noCovrMatch = w.match(/No coverage for (\w+) shift on (\d{4}-\d{2}-\d{2})/);
      if (noCovrMatch) {
        const shift = noCovrMatch[1].toLowerCase();
        const dateStr = format(new Date(noCovrMatch[2] + 'T00:00:00'), 'EEE M/d');
        if (result[shift]) result[shift].noCoverageDates.push(dateStr);
        continue;
      }

      // Station-specific warnings
      let matchedStation = '';
      for (const sn of sNames) {
        if (w.includes(sn)) { matchedStation = sn; break; }
      }
      if (!matchedStation) continue;

      const shiftMatch = w.match(/\((\w+)\)\s*$/) || w.match(/\b(AM|PM|Night)\b\s+shift/i);
      const shift = shiftMatch ? shiftMatch[1].toLowerCase() : '';
      if (!result[shift]) continue;

      const clean = w.replace(/^(CRITICAL|SCHEDULE ERROR|PIVOTAL|SUGGESTION|INFO): /, '');
      const dateMatch = clean.match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = dateMatch ? format(new Date(dateMatch[1] + 'T00:00:00'), 'EEE M/d') : '';
      let msg = clean
        .replace(matchedStation, '')
        .replace(/\s*\(\w+\)\s*$/, '')
        .replace(/on\s+\d{4}-\d{2}-\d{2}/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[—\-–\s]+/, '');

      const severity: ShiftIssue['severity'] =
        (w.startsWith('CRITICAL:') || w.startsWith('SCHEDULE ERROR:')) ? 'critical'
        : w.startsWith('INFO:') ? 'info'
        : w.startsWith('SUGGESTION:') ? 'suggestion'
        : 'warn';

      const map = result[shift].stationIssues;
      if (!map.has(matchedStation)) map.set(matchedStation, []);
      map.get(matchedStation)!.push({ severity, date: dateStr, msg, station: matchedStation });
    }
    return result;
  })();

  // Render inline warning panel for a shift section
  const renderShiftWarnings = (shiftKey: string) => {
    const data = warningsByShift[shiftKey];
    if (!data) return null;
    const totalStation = [...data.stationIssues.values()].reduce((s, arr) => s + arr.length, 0);
    const totalIssues = totalStation + data.noCoverageDates.length;
    if (totalIssues === 0) return null;

    const hasCritical = data.noCoverageDates.length > 0 ||
      [...data.stationIssues.values()].some(arr => arr.some(i => i.severity === 'critical'));
    const borderColor = hasCritical ? 'border-red-200' : 'border-amber-200';
    const bgColor = hasCritical ? 'bg-red-50' : 'bg-amber-50';
    const headerColor = hasCritical ? 'text-red-800' : 'text-amber-800';
    const badgeBg = hasCritical ? 'bg-red-500' : 'bg-amber-500';

    return (
      <tr>
        <td colSpan={days.length + 1} className="p-0">
          <div className={`mx-2 my-1.5 border ${borderColor} rounded-lg overflow-hidden`}>
            <div className={`flex items-center justify-between px-3 py-1.5 ${bgColor} border-b ${borderColor}`}>
              <span className={`text-xs font-bold ${headerColor} flex items-center gap-1.5`}>
                <span className={`w-4 h-4 rounded-full ${badgeBg} text-white text-[9px] font-bold flex items-center justify-center`}>!</span>
                {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setShowWarnings(false)} className="text-gray-400 hover:text-gray-600 text-[10px]">hide</button>
            </div>

            {/* No coverage dates */}
            {data.noCoverageDates.length > 0 && (
              <div className="px-3 py-2 border-b border-red-100">
                <div className="text-[11px] text-red-600 font-medium mb-1">No staff assigned:</div>
                <div className="flex flex-wrap gap-1">
                  {data.noCoverageDates.map(d => (
                    <span key={d} className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded font-medium">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Station cards */}
            {data.stationIssues.size > 0 && (
              <div className="p-2 grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[...data.stationIssues.entries()].map(([stationName, issues]) => {
                  const stationInfo = getStationDisplay(stationName);
                  const criticalIssues = issues.filter(i => i.severity === 'critical');
                  const warnIssues = issues.filter(i => i.severity === 'warn');
                  const infoIssues = issues.filter(i => i.severity === 'info');
                  const hasCrit = criticalIssues.length > 0;

                  // Group info issues by message pattern (aggregate dates)
                  const infoByMsg = new Map<string, string[]>();
                  for (const issue of infoIssues) {
                    const key = issue.msg;
                    if (!infoByMsg.has(key)) infoByMsg.set(key, []);
                    if (issue.date) infoByMsg.get(key)!.push(issue.date);
                  }

                  return (
                    <div key={stationName} className="border rounded overflow-hidden">
                      <div className="px-2 py-1 flex items-center justify-between" style={{ backgroundColor: stationInfo.color }}>
                        <span className="text-white text-[10px] font-bold">
                          {stationInfo.abbr} {stationName}
                          {hasCrit && ' !'}
                        </span>
                        <span className="text-white/70 text-[9px]">{issues.length}</span>
                      </div>
                      <div className="px-2 py-1 max-h-[120px] overflow-y-auto space-y-0.5">
                        {/* Critical issues — show each one */}
                        {criticalIssues.map((issue, i) => (
                          <div key={`c${i}`} className="flex items-start gap-1 text-[10px]">
                            <span className="shrink-0 mt-px font-bold text-red-500">!</span>
                            <span className="text-gray-700">{issue.date ? `${issue.date}: ` : ''}{issue.msg}</span>
                          </div>
                        ))}
                        {/* Warn issues — show each one */}
                        {warnIssues.map((issue, i) => (
                          <div key={`w${i}`} className="flex items-start gap-1 text-[10px]">
                            <span className="shrink-0 mt-px font-bold text-amber-400">{'\u25CF'}</span>
                            <span className="text-gray-500">{issue.date ? `${issue.date}: ` : ''}{issue.msg}</span>
                          </div>
                        ))}
                        {/* Info issues — aggregate by message, show date chips */}
                        {[...infoByMsg.entries()].map(([msg, dates]) => (
                          <div key={msg} className="text-[10px] text-gray-400 mt-0.5">
                            <div className="flex items-center gap-1">
                              <span className="shrink-0 text-blue-300">{'\u25CF'}</span>
                              <span>{msg}</span>
                              <span className="text-gray-300">({dates.length}d)</span>
                            </div>
                            <div className="flex flex-wrap gap-0.5 ml-3 mt-0.5">
                              {dates.slice(0, 6).map(d => (
                                <span key={d} className="bg-blue-50 text-blue-400 text-[9px] px-1 py-px rounded">{d}</span>
                              ))}
                              {dates.length > 6 && <span className="text-[9px] text-gray-300">+{dates.length - 6} more</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Schedule</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
          >
            Export PDF
          </button>
          <button
            onClick={() => {
              setConfirmDialog({
                title: 'Auto-Generate Schedule',
                message: `Generate schedule for ${format(currentDate, 'MMMM yyyy')}? This will remove all existing assignments for this month, including any manual or forced assignments.`,
                confirmLabel: 'Generate',
                confirmColor: 'bg-green-600 hover:bg-green-700',
                onConfirm: () => {
                  setConfirmDialog(null);
                  generateSchedule.mutate({ clear: true }, {
                    onSuccess: (data) => {
                      toast.success(`Generated ${data.inserted} assignments`);
                      setShowWarnings(true);
                    },
                    onError: (err) => toast.error(err.message),
                  });
                },
              });
            }}
            disabled={generateSchedule.isPending}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {generateSchedule.isPending ? 'Generating...' : 'Auto-Generate'}
          </button>
          <button
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="px-3 py-1.5 bg-white border rounded text-sm hover:bg-gray-50"
          >
            &larr; Prev
          </button>
          <span className="text-lg font-semibold min-w-[180px] text-center">
            {format(currentDate, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="px-3 py-1.5 bg-white border rounded text-sm hover:bg-gray-50"
          >
            Next &rarr;
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-xs items-center">
        {Object.entries(SHIFT_ICONS).map(([name, { label, bg, text }]) => (
          <div key={name} className="flex items-center gap-1.5">
            <span className={`w-6 h-5 rounded text-[10px] font-bold flex items-center justify-center ${bg} ${text}`}>{label}</span>
            <span className="text-gray-600">{name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-6 h-5 rounded text-[10px] font-bold flex items-center justify-center bg-red-100 text-red-600">P</span>
          <span className="text-gray-600">PTO</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-6 h-5 rounded text-[9px] font-bold flex items-center justify-center bg-red-300 text-red-900">½</span>
          <span className="text-gray-600">Half Day</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-6 h-5 rounded text-[10px] flex items-center justify-center bg-gray-100 text-gray-400">&mdash;</span>
          <span className="text-gray-600">Off</span>
        </div>
        <div className="border-l pl-4 flex items-center gap-2">
          <span className="text-gray-500">Stations:</span>
          {stationsData.map(station => {
            const style = getStationDisplay(station.name);
            return (
              <div
                key={station.id}
                className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setEditingStation(station)}
                title={`Click to customize ${station.name}`}
              >
                <span
                  className="w-5 h-4 rounded text-[9px] font-bold flex items-center justify-center text-white"
                  style={{ backgroundColor: style.color }}
                >{style.abbr}</span>
                <span className="text-gray-600 text-[10px]">{station.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Station style editor popover */}
      {editingStation && (
        <StationStyleEditor
          station={editingStation}
          currentStyle={getStationDisplay(editingStation.name)}
          onSave={(color, abbr) => {
            updateStation.mutate(
              { id: editingStation.id, name: editingStation.name, color, abbr },
              {
                onSuccess: () => {
                  toast.success(`Updated ${editingStation.name} style`);
                  setEditingStation(null);
                },
                onError: (err) => toast.error(err.message),
              }
            );
          }}
          onClose={() => setEditingStation(null)}
        />
      )}

      {/* Assignment actions modal (edit/swap/remove) */}
      {actionsModal && (() => {
        const { assignment: a, employee: emp } = actionsModal;
        const sameShift = assignments
          .filter(other =>
            other.date === a.date &&
            other.shift_id === a.shift_id &&
            other.id !== a.id
          )
          .map(other => ({
            assignment: other,
            employee: employees.find(e => e.id === other.employee_id)!,
          }))
          .filter(x => x.employee);
        return (
          <AssignmentActionsModal
            assignment={a}
            employee={emp}
            sameShiftAssignments={sameShift}
            stations={stationsData}
            getStationDisplay={getStationDisplay}
            onChangeStation={(stationId) => {
              updateAssignment.mutate(
                { id: a.id, station_id: stationId },
                {
                  onSuccess: () => {
                    toast.success('Station updated');
                    setActionsModal(null);
                  },
                  onError: (err) => toast.error(err.message),
                }
              );
            }}
            onSwap={(otherId) => {
              swapAssignments.mutate(
                { a: a.id, b: otherId },
                {
                  onSuccess: () => {
                    toast.success('Stations swapped');
                    setActionsModal(null);
                  },
                  onError: (err) => toast.error(err.message),
                }
              );
            }}
            onRemove={() => {
              deleteAssignment.mutate(a.id, {
                onSuccess: () => {
                  toast.success('Assignment removed');
                  setActionsModal(null);
                },
                onError: (err) => toast.error(err.message),
              });
            }}
            onClose={() => setActionsModal(null)}
          />
        );
      })()}

      {/* Warnings are now shown inline within each shift section of the grid */}

      {/* Roster grid */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <tbody>
            {employees.map((emp, idx) => {
              const empTimeOff = timeOffIndex.get(emp.id);
              const prevShift = idx > 0 ? employees[idx - 1].default_shift : null;
              const showGroupHeader = emp.default_shift !== prevShift;
              const groupLabel = emp.default_shift === 'am' ? 'AM' : emp.default_shift === 'pm' ? 'PM' : emp.default_shift.charAt(0).toUpperCase() + emp.default_shift.slice(1);
              return (
                <React.Fragment key={emp.id}>
                {showGroupHeader && (
                  <>
                  <tr className="bg-gray-200">
                    <td colSpan={days.length + 1} className="sticky left-0 px-3 py-1.5 text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-300">
                      {groupLabel} Shift
                    </td>
                  </tr>
                  {showWarnings && renderShiftWarnings(emp.default_shift)}
                  {/* Date header row — shown for every shift section */}
                  <tr>
                    <td className="sticky left-0 bg-gray-100 z-10 border-r-2 border-b-2 border-gray-300 px-3 py-2 text-sm font-bold text-gray-800 min-w-[150px]">
                      Employee
                    </td>
                    {days.map((day) => {
                      const dStr = format(day, 'yyyy-MM-dd');
                      const dNum = getDay(day);
                      const dIsWknd = dNum === 0 || dNum === 6;
                      const dIsSat = dNum === 6;
                      const dIsToday = dStr === todayStr;
                      const shiftKey = emp.default_shift === 'pm' ? 'PM' : emp.default_shift === 'night' ? 'Night' : 'AM';
                      const dIssues = (coverageByDate.get(dStr) ?? []).filter(i => i.shift === shiftKey);
                      const dHasCrit = dIssues.some(i => i.severity === 'critical');
                      const dHasWarn = dIssues.some(i => i.severity === 'warn') && !dHasCrit;

                      const dTooltip = dIssues.length > 0
                        ? `${shiftKey} — ${format(day, 'EEE M/d')}:\n${dIssues.map(i => `${i.severity === 'critical' ? '! ' : ''}${i.message}`).join('\n')}`
                        : '';

                      return (
                        <td
                          key={dStr}
                          title={dTooltip}
                          onClick={() => setCoverageModal({ date: dStr, shift: shiftKey })}
                          className={`px-1 py-2 text-center font-bold border-b-2 min-w-[38px] cursor-pointer ${
                            dIsSat ? 'border-l-2 border-l-orange-300' : ''
                          } ${
                            dHasCrit ? 'bg-red-200 text-red-900 border-red-500 ring-1 ring-inset ring-red-400' :
                            dHasWarn ? 'bg-orange-300 text-orange-900 border-orange-600 ring-1 ring-inset ring-orange-500' :
                            dIsToday ? 'bg-blue-100 text-blue-800 border-gray-300' :
                            dIsWknd ? 'bg-orange-100 text-orange-800 border-gray-300' :
                            'bg-gray-100 text-gray-600 border-gray-300'
                          }`}
                        >
                          <div className="leading-tight">
                            <div className={`text-[10px] ${dIsWknd ? 'font-extrabold' : 'font-semibold'}`}>{format(day, 'EEE')}</div>
                            <div className={`text-sm ${dIsWknd ? 'font-extrabold' : ''}`}>{format(day, 'd')}</div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  </>
                )}
                <tr className="hover:bg-blue-50/40 border-b border-gray-200">
                  <td className="sticky left-0 bg-white z-10 px-3 py-2 border-r-2 border-gray-300 font-semibold text-gray-800 whitespace-nowrap text-[13px]">
                    <div className="flex items-center gap-1.5 relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEmployeeDetail(employeeDetail === emp.id ? null : emp.id); }}
                        className="hover:text-blue-600 hover:underline transition-colors text-left font-semibold"
                      >
                        {emp.name}
                      </button>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase ${
                        emp.role === 'admin' ? 'bg-orange-100 text-orange-700' :
                        emp.role === 'mlt' ? 'bg-cyan-100 text-cyan-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {emp.role}
                      </span>
                    </div>
                  </td>
                  {days.map((day) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const key = `${emp.id}-${dateStr}`;
                    const assignment = assignmentIndex.get(key);
                    const offType = empTimeOff?.get(dateStr);
                    const isOff = !!offType;
                    const dayNum = getDay(day);
                    const isWknd = dayNum === 0 || dayNum === 6;
                    const isSat = dayNum === 6;
                    const isToday = dateStr === todayStr;

                    let cellContent: React.ReactNode;
                    let cellBg = '';

                    if (offType === 'full') {
                      cellContent = <span className="text-xs font-bold text-red-600">P</span>;
                      cellBg = 'bg-red-50';
                    } else if (offType === 'custom' && assignment) {
                      // Partial PTO + assigned: show station/2 (e.g. HM/2)
                      const station = assignment.station_name ? getStationDisplay(assignment.station_name) : null;
                      const label = station ? `${station.abbr}/2` : '½';
                      cellContent = (
                        <span className="px-1 h-5 rounded text-[9px] font-bold flex items-center justify-center bg-red-300 text-red-900 shadow-sm">
                          {label}
                        </span>
                      );
                      cellBg = 'bg-red-50';
                    } else if (offType === 'custom') {
                      // Partial PTO, no assignment yet
                      cellContent = <span className="text-[10px] font-bold text-red-500">½</span>;
                      cellBg = 'bg-red-50';
                    } else if (assignment) {
                      const isCrossShift = emp.default_shift !== 'floater' && assignment.shift_name.toLowerCase() !== emp.default_shift;
                      const icon = SHIFT_ICONS[assignment.shift_name];
                      const station = assignment.station_name
                        ? getStationDisplay(assignment.station_name)
                        : null;

                      // Check if this employee was moved to cover a partial PTO coworker.
                      // Only true if: (a) someone at the same station has partial PTO, AND
                      // (b) this employee's home station is different (they were reassigned).
                      const homeStationName = emp.role === 'admin' ? 'Admin'
                        : emp.stations?.[0]?.name ?? null;
                      const isAtHomeStation = homeStationName === assignment.station_name;
                      const hasPTOCoworker = assignment.station_id != null && assignments.some(other =>
                        other.id !== assignment.id
                        && other.date === dateStr
                        && other.station_id === assignment.station_id
                        && timeOffIndex.get(other.employee_id)?.get(dateStr) === 'custom'
                      );
                      const isCoveringPartialPTO = hasPTOCoworker && !isAtHomeStation;

                      if (isCrossShift && icon) {
                        // Show shift badge in home row when working a different shift
                        cellContent = (
                          <span className={`w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center ${icon.bg} ${icon.text} shadow-sm ring-1 ring-inset ring-white/40`}>
                            {icon.label}
                          </span>
                        );
                      } else if (station && isCoveringPartialPTO && homeStationName) {
                        // Split duty — show home station → coverage station (e.g. AD→BB)
                        const homeDisplay = getStationDisplay(homeStationName);
                        cellContent = (
                          <span className="h-5 px-1 rounded text-[8px] font-bold flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: station.color }}>
                            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{homeDisplay.abbr}</span>
                            <span style={{ color: 'rgba(255,255,255,0.5)' }}>→</span>
                            {station.abbr}
                          </span>
                        );
                      } else if (station) {
                        cellContent = (
                          <span className="w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: station.color }}>
                            {station.abbr}
                          </span>
                        );
                      } else if (icon) {
                        cellContent = (
                          <span className={`w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center ${icon.bg} ${icon.text} shadow-sm`}>
                            {icon.label}
                          </span>
                        );
                      } else {
                        cellContent = <span className="text-[10px] font-semibold">{assignment.shift_name.charAt(0)}</span>;
                      }
                    } else {
                      cellContent = <span className="text-gray-300 text-sm">&mdash;</span>;
                    }

                    return (
                      <td
                        key={dateStr}
                        onClick={() => offType !== 'full' && handleCellClick(emp, dateStr)}
                        className={`text-center py-1.5 px-0.5 cursor-pointer transition-colors hover:bg-blue-50 ${cellBg} ${
                          isToday ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/30' : ''
                        } ${isSat ? 'border-l-2 border-l-orange-300' : ''} ${isWknd && !isOff ? 'bg-amber-50/60' : ''}`}
                        title={
                          offType === 'full' ? `${emp.name} - PTO (full day)` :
                          offType === 'custom' ? `${emp.name} - Partial PTO${assignment ? ` + ${assignment.shift_name}${assignment.station_name ? ` @ ${assignment.station_name}` : ''}` : ''}` :
                          assignment ? `${emp.name} - ${assignment.shift_name}${assignment.station_name ? ` @ ${assignment.station_name}` : ''} (click to remove)` :
                          `Assign ${emp.name} on ${dateStr}`
                        }
                      >
                        <div className="flex items-center justify-center min-h-[24px]">
                          {cellContent}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {/* Guest rows: cross-shift employees working in this shift group */}
                {(() => {
                  const nextShift = idx < employees.length - 1 ? employees[idx + 1].default_shift : null;
                  const isLastInGroup = nextShift !== emp.default_shift;
                  if (!isLastInGroup) return null;
                  const guests = crossShiftByGroup.get(emp.default_shift) ?? [];
                  if (guests.length === 0) return null;
                  return guests.map(({ emp: guestEmp, assignments: guestAssignments }) => {
                    const guestAssignmentIndex = new Map<string, ScheduleAssignment>();
                    for (const a of guestAssignments) guestAssignmentIndex.set(a.date, a);
                    return (
                      <tr key={`guest-${guestEmp.id}-${emp.default_shift}`} className="hover:bg-blue-50/40 border-b border-gray-200 bg-blue-50/20">
                        <td className="sticky left-0 bg-blue-50/40 z-10 px-3 py-2 border-r-2 border-gray-300 font-semibold text-gray-500 whitespace-nowrap text-[13px]">
                          <div className="flex items-center gap-1.5">
                            <span className="italic">{guestEmp.name}</span>
                            <span className={`text-[8px] px-1 py-0.5 rounded-sm font-bold uppercase bg-gray-200 text-gray-500`}>
                              {guestEmp.default_shift}
                            </span>
                          </div>
                        </td>
                        {days.map((day) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const guestAssignment = guestAssignmentIndex.get(dateStr);
                          const dayNum = getDay(day);
                          const isWknd = dayNum === 0 || dayNum === 6;
                          const isSat = dayNum === 6;
                          const isToday = dateStr === todayStr;

                          let guestCell: React.ReactNode;
                          if (guestAssignment) {
                            const station = guestAssignment.station_name
                              ? getStationDisplay(guestAssignment.station_name)
                              : null;
                            if (station) {
                              guestCell = (
                                <span className="w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: station.color }}>
                                  {station.abbr}
                                </span>
                              );
                            } else {
                              const icon = SHIFT_ICONS[guestAssignment.shift_name];
                              guestCell = icon ? (
                                <span className={`w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center ${icon.bg} ${icon.text} shadow-sm`}>
                                  {icon.label}
                                </span>
                              ) : null;
                            }
                          } else {
                            guestCell = <span className="text-gray-200 text-sm">&mdash;</span>;
                          }

                          return (
                            <td
                              key={dateStr}
                              className={`text-center py-1.5 px-0.5 ${
                                isToday ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/30' : ''
                              } ${isSat ? 'border-l-2 border-l-orange-300' : ''} ${isWknd ? 'bg-amber-50/60' : ''}`}
                              title={guestAssignment
                                ? `${guestEmp.name} (normally ${guestEmp.default_shift.toUpperCase()}) - ${guestAssignment.shift_name}${guestAssignment.station_name ? ` @ ${guestAssignment.station_name}` : ''}`
                                : ''
                              }
                            >
                              <div className="flex items-center justify-center min-h-[24px]">
                                {guestCell}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })()}
                </React.Fragment>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={days.length + 1} className="px-4 py-8 text-center text-gray-400">
                  No employees yet. Add some on the Employees page first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Employee Hours & Station Summary */}
      {assignments.length > 0 && (
        <div className="mt-4 bg-white rounded-lg shadow-md border border-gray-200 overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
            <h3 className="text-sm font-bold text-gray-700">Hours & Station Summary — {format(currentDate, 'MMMM yyyy')}</h3>
          </div>
          {(() => {
            // Build Sun-Sat week buckets from the month's days
            const weeks: { label: string; dates: Set<string> }[] = [];
            let currentWeekStart: Date | null = null;
            let currentDates = new Set<string>();

            for (const day of days) {
              const dow = getDay(day);
              if (dow === 0 && currentWeekStart !== null) {
                weeks.push({ label: `${format(currentWeekStart, 'M/d')}–${format(days[days.indexOf(day) - 1], 'M/d')}`, dates: currentDates });
                currentDates = new Set<string>();
                currentWeekStart = day;
              }
              if (currentWeekStart === null) currentWeekStart = day;
              currentDates.add(format(day, 'yyyy-MM-dd'));
            }
            if (currentDates.size > 0 && currentWeekStart) {
              const lastDay = days[days.length - 1];
              weeks.push({ label: `${format(currentWeekStart, 'M/d')}–${format(lastDay, 'M/d')}`, dates: currentDates });
            }

            // Build station breakdown per employee
            const empStationCounts = new Map<number, Map<string, number>>();
            for (const a of assignments) {
              const sName = a.station_name || 'Unassigned';
              if (!empStationCounts.has(a.employee_id)) empStationCounts.set(a.employee_id, new Map());
              const counts = empStationCounts.get(a.employee_id)!;
              counts.set(sName, (counts.get(sName) ?? 0) + 1);
            }

            // Shift group separators
            let lastShift = '';

            return (
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-gray-300">
                    <th className="text-left px-4 py-2.5 font-bold text-gray-700 sticky left-0 bg-gray-100 z-10">Employee</th>
                    <th className="text-center px-3 py-2.5 font-bold text-gray-700">Target</th>
                    {weeks.map((wk, i) => (
                      <th key={i} className="text-center px-2 py-2.5 font-bold text-gray-700 whitespace-nowrap">{wk.label}</th>
                    ))}
                    <th className="text-center px-3 py-2.5 font-bold text-gray-700">Total</th>
                    <th className="text-center px-3 py-2.5 font-bold text-red-600">PTO</th>
                    <th className="text-center px-3 py-2.5 font-bold text-gray-700">Wknd</th>
                    <th className="text-left px-3 py-2.5 font-bold text-gray-700">Stations</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, empIdx) => {
                    const empAssignments = assignments.filter(a => a.employee_id === emp.id);
                    const empDates = new Set(empAssignments.map(a => a.date));
                    const totalDays = empDates.size;
                    const target = emp.target_hours_week;
                    const wkndDays = [...empDates].filter(d => {
                      const dow = getDay(new Date(d + 'T00:00:00'));
                      return dow === 0 || dow === 6;
                    }).length;
                    const totalHours = totalDays * 8;
                    const empTimeOffDays = days.filter(d => timeOffIndex.get(emp.id)?.has(format(d, 'yyyy-MM-dd'))).length;
                    const stationCounts = empStationCounts.get(emp.id) ?? new Map<string, number>();
                    const sortedStations = [...stationCounts.entries()].sort(([, a], [, b]) => b - a);

                    // Shift group separator
                    const showSep = emp.default_shift !== lastShift;
                    lastShift = emp.default_shift;
                    const groupLabel = emp.default_shift === 'am' ? 'AM' : emp.default_shift === 'pm' ? 'PM' : emp.default_shift.charAt(0).toUpperCase() + emp.default_shift.slice(1);
                    const isEven = empIdx % 2 === 0;

                    return (
                      <React.Fragment key={emp.id}>
                        {showSep && (
                          <tr className="bg-gray-200">
                            <td colSpan={weeks.length + 6} className="px-4 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-y border-gray-300">
                              {groupLabel} Shift
                            </td>
                          </tr>
                        )}
                        <tr className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${isEven ? 'bg-white' : 'bg-gray-50/60'}`}>
                          <td className={`sticky left-0 z-10 px-4 py-2 font-semibold text-gray-800 ${isEven ? 'bg-white' : 'bg-gray-50/60'}`}>
                            <div className="flex items-center gap-1.5">
                              <span>{emp.name}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                emp.role === 'cls' ? 'bg-emerald-100 text-emerald-700' :
                                emp.role === 'mlt' ? 'bg-violet-100 text-violet-700' :
                                'bg-sky-100 text-sky-700'
                              }`}>{emp.role.toUpperCase()}</span>
                              {emp.employment_type === 'per-diem' && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-600">Per-Diem</span>}
                              {emp.employment_type === 'part-time' && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-pink-100 text-pink-600">Part-Time</span>}
                            </div>
                          </td>
                          <td className="text-center px-3 py-2 text-gray-400 font-medium">{target}h</td>
                          {weeks.map((wk, i) => {
                            const wkDays = [...wk.dates].filter(d => empDates.has(d)).length;
                            const wkHours = wkDays * 8;
                            const over = wkHours > target;
                            const under = wkHours < target && wk.dates.size >= 5;
                            return (
                              <td key={i} className="text-center px-2 py-2">
                                <span className={`font-semibold ${
                                  over ? 'text-red-600 bg-red-50 px-1.5 py-0.5 rounded' :
                                  under ? 'text-amber-600' :
                                  'text-gray-700'
                                }`}>
                                  {wkHours}h
                                </span>
                              </td>
                            );
                          })}
                          <td className="text-center px-3 py-2">
                            <span className="font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{totalHours}h</span>
                          </td>
                          <td className="text-center px-3 py-2">
                            <span className={`font-medium ${empTimeOffDays > 0 ? 'text-red-600' : 'text-gray-400'}`}>{empTimeOffDays}</span>
                          </td>
                          <td className="text-center px-3 py-2">
                            <span className={`font-medium ${wkndDays > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{wkndDays}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {sortedStations.map(([sName, count]) => {
                                const sd = getStationDisplay(sName);
                                return (
                                  <span key={sName} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: sd.color }} title={`${sName}: ${count} day${count !== 1 ? 's' : ''}`}>
                                    {sd.abbr}
                                    <span className="text-white/80">{count}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

      {modal && (
        <AssignmentModal
          date={modal.date}
          shift={modal.shift}
          month={month}
          preselectedEmployee={modal.employee}
          onClose={() => setModal(null)}
        />
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4">
              <h3 className="text-base font-bold text-gray-900">{confirmDialog.title}</h3>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{confirmDialog.message}</p>
            </div>
            <div className="px-5 py-3 bg-gray-50 flex justify-end gap-2 border-t border-gray-100">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${confirmDialog.confirmColor ?? 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coverage Gap Modal */}
      {coverageModal && (() => {
        const { date, shift } = coverageModal;
        const dayDate = new Date(date + 'T00:00:00');
        const issues = (coverageByDate.get(date) ?? []).filter(i => i.shift === shift);
        const allDayIssues = coverageByDate.get(date) ?? [];

        // Find who's working this shift on this date
        const shiftAssignments = assignments.filter(a => a.date === date && a.shift_name === shift);
        // Find who's off
        const offEmployees = employees.filter(emp => timeOffIndex.get(emp.id)?.has(date));

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setCoverageModal(null); setEmployeeDetail(null); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
              {/* Header with day navigation */}
              <div className={`px-5 py-3 rounded-t-xl flex items-center justify-between ${
                issues.some(i => i.severity === 'critical') ? 'bg-red-500'
                : issues.length > 0 ? 'bg-amber-500'
                : 'bg-emerald-500'
              }`}>
                <button
                  onClick={(e) => { e.stopPropagation(); navigateCoverageDay('prev'); }}
                  className="text-white/60 hover:text-white text-lg font-bold px-1"
                  title="Previous day (Left arrow)"
                >&#8249;</button>
                <div className="text-center flex-1">
                  <h3 className="text-white font-bold text-base">{shift} Shift — {format(dayDate, 'EEE, MMM d')}</h3>
                  <p className="text-white/80 text-xs">
                    {issues.length > 0
                      ? `${issues.length} issue${issues.length !== 1 ? 's' : ''} on this shift`
                      : `${shiftAssignments.length} staff assigned`
                    }
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); navigateCoverageDay('next'); }}
                  className="text-white/60 hover:text-white text-lg font-bold px-1"
                  title="Next day (Right arrow)"
                >&#8250;</button>
                <button onClick={() => { setCoverageModal(null); setEmployeeDetail(null); }} className="text-white/70 hover:text-white text-xl font-bold ml-2">&times;</button>
              </div>

              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Issues */}
                {issues.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Issues</h4>
                    <div className="space-y-1.5">
                      {issues.map((issue, i) => (
                        <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                          issue.severity === 'critical' ? 'bg-red-50 text-red-800'
                          : issue.severity === 'suggestion' ? 'bg-blue-50 text-blue-800'
                          : 'bg-amber-50 text-amber-800'
                        }`}>
                          <span className="font-bold shrink-0 mt-0.5">{
                            issue.severity === 'critical' ? '!' : issue.severity === 'suggestion' ? '\u2139' : '~'
                          }</span>
                          <div>
                            <div className="font-medium">{issue.message}</div>
                            {issue.station && <div className="text-xs opacity-70 mt-0.5">Station: {issue.station}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Who's working — grouped by station */}
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Working {shift} ({shiftAssignments.length})
                  </h4>
                  {shiftAssignments.length > 0 ? (() => {
                    // Group assignments by station
                    const stationGroups = new Map<string, typeof shiftAssignments>();
                    for (const a of shiftAssignments) {
                      const sName = a.station_name || 'Unassigned';
                      if (!stationGroups.has(sName)) stationGroups.set(sName, []);
                      stationGroups.get(sName)!.push(a);
                    }
                    // Sort: real stations first, Admin last
                    const stationOrder = ['Hematology/UA', 'Chemistry', 'Microbiology', 'Blood Bank', 'Admin', 'Unassigned'];
                    const sortedStations = [...stationGroups.keys()].sort((a, b) => {
                      const ai = stationOrder.indexOf(a); const bi = stationOrder.indexOf(b);
                      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                    });
                    return (
                      <div className="space-y-2">
                        {sortedStations.map(sName => {
                          const group = stationGroups.get(sName)!;
                          const stationDisplay = getStationDisplay(sName);
                          return (
                            <div key={sName}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: stationDisplay.color }}>
                                  {stationDisplay.abbr}
                                </span>
                                <span className="text-xs font-semibold text-gray-600">{sName}</span>
                                <span className="text-[10px] text-gray-400">({group.length})</span>
                              </div>
                              <div className="space-y-0.5 pl-1">
                                {(() => {
                                  // Find who has partial PTO in this station group
                                  const partialPTONames = group
                                    .filter(a => timeOffIndex.get(a.employee_id)?.get(date) === 'custom')
                                    .map(a => a.employee_name);
                                  return group.map(a => {
                                    const empInfo = employees.find(e => e.id === a.employee_id);
                                    const roleBg = empInfo?.role === 'admin' ? 'bg-orange-100 text-orange-700'
                                      : empInfo?.role === 'mlt' ? 'bg-cyan-100 text-cyan-700'
                                      : 'bg-blue-100 text-blue-700';
                                    const isPartialPTO = timeOffIndex.get(a.employee_id)?.get(date) === 'custom';
                                    // Only show "covers" if this person was moved here (not their home station)
                                    const empHome = empInfo?.role === 'admin' ? 'Admin'
                                      : empInfo?.stations?.[0]?.name ?? null;
                                    const isCovering = !isPartialPTO && partialPTONames.length > 0
                                      && empHome !== sName;
                                    return (
                                      <div key={a.id} className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded text-sm">
                                        <span className="font-medium text-gray-800">{a.employee_name}</span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase ${roleBg}`}>
                                          {empInfo?.role ?? '?'}
                                        </span>
                                        {isPartialPTO && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-red-100 text-red-700 border border-red-200">
                                            1/2 DAY
                                          </span>
                                        )}
                                        {isCovering && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                            covers 2nd half for {partialPTONames.join(', ')}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })() : (
                    <p className="text-sm text-red-500 italic px-3">No one assigned to this shift</p>
                  )}
                </div>

                {/* Who's off */}
                {offEmployees.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Off / PTO ({offEmployees.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {offEmployees.map(emp => {
                        const offRoleBg = emp.role === 'admin' ? 'bg-orange-100 text-orange-700'
                          : emp.role === 'mlt' ? 'bg-cyan-100 text-cyan-700'
                          : 'bg-blue-100 text-blue-700';
                        return (
                          <span key={emp.id} className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs font-medium flex items-center gap-1">
                            {emp.name}
                            <span className={`text-[8px] px-1 py-0.5 rounded-sm font-bold uppercase ${offRoleBg}`}>{emp.role}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Other shifts summary */}
                {['AM', 'PM', 'Night'].filter(s => s !== shift).map(otherShift => {
                  const otherIssues = allDayIssues.filter(i => i.shift === otherShift);
                  if (otherIssues.length === 0) return null;
                  return (
                    <div key={otherShift} className="pt-2 border-t border-gray-100">
                      <button
                        onClick={() => setCoverageModal({ date, shift: otherShift })}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {otherShift} shift has {otherIssues.length} issue{otherIssues.length !== 1 ? 's' : ''} &rarr;
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Employee Detail Modal */}
      {employeeDetail !== null && (() => {
        const emp = employees.find(e => e.id === employeeDetail);
        if (!emp) return null;
        const empSchedule = assignments.filter(a => a.employee_id === emp.id);
        const stationCounts: Record<string, number> = {};
        for (const a of empSchedule) {
          const s = a.station_name || 'Unassigned';
          stationCounts[s] = (stationCounts[s] || 0) + 1;
        }
        const sorted = Object.entries(stationCounts).sort(([,a],[,b]) => b - a);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEmployeeDetail(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-3 rounded-t-xl bg-blue-500 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold text-base">{emp.name}</h3>
                  <p className="text-white/80 text-xs">
                    {empSchedule.length} day{empSchedule.length !== 1 ? 's' : ''} scheduled in {format(new Date(month + '-01T00:00:00'), 'MMMM yyyy')}
                  </p>
                </div>
                <button onClick={() => setEmployeeDetail(null)} className="text-white/70 hover:text-white text-xl font-bold">&times;</button>
              </div>
              <div className="p-5">
                {sorted.length > 0 ? (
                  <div className="space-y-2">
                    {sorted.map(([station, count]) => {
                      const sd = getStationDisplay(station);
                      const pct = empSchedule.length > 0 ? Math.round(count / empSchedule.length * 100) : 0;
                      return (
                        <div key={station}>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-white text-[10px] font-bold px-2 py-0.5 rounded shrink-0" style={{ backgroundColor: sd.color }}>
                              {sd.abbr}
                            </span>
                            <span className="text-gray-700 flex-1 font-medium">{station}</span>
                            <span className="font-bold text-gray-900">{count}</span>
                            <span className="text-gray-400 text-xs w-10 text-right">{pct}%</span>
                          </div>
                          <div className="ml-9 mt-0.5">
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: sd.color }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No schedule data for this month</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

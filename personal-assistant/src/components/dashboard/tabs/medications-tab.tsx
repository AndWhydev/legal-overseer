'use client';

// This is a direct client-side copy of the medications page component
// Re-exports the page component logic for use in SPA shell

import React, { useState, useCallback, useMemo } from 'react';
import { SFChevronLeft, SFChevronRight } from 'sf-symbols-lib';
import { TabShell } from '@/components/ui/tab-shell';
import { MonthlyGrid } from '@/components/medications/monthly-grid';
import { PillIcon } from '@/components/medications/pill-icon';
import { february2026, medications, medicationMap } from '@/lib/medications/seed-data';
import type { MonthData, DaySchedule } from '@/lib/medications/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Check if medications feature is enabled.
 * Gated behind a feature flag to prevent unauthorized access.
 */
function isMedicationsEnabled(): boolean {
  // Feature gate: only enable if environment variable is set
  return process.env.NEXT_PUBLIC_ENABLE_MEDICATIONS === 'true';
}

function MedicationsTab() {
  // Feature gate check
  if (!isMedicationsEnabled()) {
    return (
      <TabShell>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">Medications feature is not available</p>
            <p className="text-xs text-text-muted">Contact support to enable this feature</p>
          </div>
        </div>
      </TabShell>
    );
  }

  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(1);
  const [monthData, setMonthData] = useState<MonthData>(february2026);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else { setMonth(m => m - 1); }
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else { setMonth(m => m + 1); }
  };

  const handleToggleDose = useCallback((date: string, medicationId: string) => {
    setMonthData(prev => prev.map(day => {
      if (day.date !== date) return day;
      const meds = day.medications.map(m => {
        if (m.medicationId !== medicationId) return m;
        return { ...m, taken: !m.taken, takenAt: !m.taken ? new Date().toISOString() : undefined };
      });
      const allTaken = meds.every(m => m.taken);
      const someTaken = meds.some(m => m.taken);
      return {
        ...day, medications: meds,
        status: meds.length === 0 ? 'empty' : allTaken ? 'complete' : someTaken ? 'partial' : 'pending',
      } as DaySchedule;
    }));
  }, []);

  const handleTakeAll = useCallback((date: string) => {
    setMonthData(prev => prev.map(day => {
      if (day.date !== date) return day;
      const meds = day.medications.map(m => ({
        ...m, taken: true, takenAt: m.takenAt || new Date().toISOString(),
      }));
      return { ...day, medications: meds, status: 'complete' } as DaySchedule;
    }));
  }, []);

  const stats = useMemo(() => {
    const completed = monthData.filter(d => d.status === 'complete').length;
    const total = monthData.filter(d => d.medications.length > 0).length;
    const totalDoses = monthData.reduce((sum, d) => sum + d.medications.reduce((s, m) => s + m.doses, 0), 0);
    const takenDoses = monthData.reduce((sum, d) => sum + d.medications.filter(m => m.taken).reduce((s, m) => s + m.doses, 0), 0);
    return { completed, total, totalDoses, takenDoses };
  }, [monthData]);

  const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-18`;
  const todaySchedule = monthData.find(d => d.date === todayStr);

  return (
    <TabShell>
      <div className="flex flex-col h-full">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {stats.completed}/{stats.total} days complete · {stats.takenDoses}/{stats.totalDoses} doses taken
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-elevated hover:text-foreground">
              <SFChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium">{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-elevated hover:text-foreground">
              <SFChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              <MonthlyGrid
                monthData={monthData}
                medications={medicationMap}
                year={year}
                month={month}
                onToggleDose={handleToggleDose}
                onTakeAll={handleTakeAll}
              />
            </div>
            <aside className="hidden xl:block w-72 shrink-0 space-y-4">
              <div className="glass-card rounded-xl p-4">
                <h3 className="text-sm font-medium text-foreground mb-3">Today&apos;s Schedule</h3>
                {todaySchedule && todaySchedule.medications.length > 0 ? (
                  <div className="space-y-2.5">
                    {todaySchedule.medications.map((dosage) => {
                      const med = medicationMap[dosage.medicationId];
                      if (!med) return null;
                      return (
                        <button
                          key={dosage.medicationId}
                          onClick={() => handleToggleDose(todayStr, dosage.medicationId)}
                          className="flex items-center gap-3 w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-elevated"
                        >
                          <PillIcon style={med.pillStyle} size={16} taken={dosage.taken} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium truncate ${dosage.taken ? 'text-text-muted line-through' : 'text-foreground'}`}>{med.name}</p>
                            <p className="text-[10px] text-text-muted">{med.doseMg}mg × {dosage.doses}</p>
                          </div>
                          {dosage.taken && <span className="text-[10px] text-success font-medium">Done</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">No medications scheduled</p>
                )}
              </div>
              <div className="glass-card rounded-xl p-4">
                <h3 className="text-sm font-medium text-foreground mb-3">Active Medications</h3>
                <div className="space-y-2">
                  {medications.map((med) => (
                    <div key={med.id} className="flex items-center gap-2.5 py-1">
                      <PillIcon style={med.pillStyle} size={12} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-secondary truncate">{med.name}</p>
                      </div>
                      <span className="text-[10px] text-text-muted">{med.doseMg}mg</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </TabShell>
  );
}

export default React.memo(MedicationsTab);

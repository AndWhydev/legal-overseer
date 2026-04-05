'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { TabShell } from '@/components/ui/tab-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  color: 'teal' | 'purple' | 'blue' | 'green' | 'magenta';
}

interface PositionedEvent extends CalendarEvent {
  top: number;
  height: number;
  columnIndex: number;
  totalColumns: number;
  dayIndex: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOUR_HEIGHT = 60;
const START_HOUR = 7;
const END_HOUR = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const EVENT_COLORS: Record<CalendarEvent['color'], string> = {
  teal: 'bg-teal-500/20 border-l-2 border-teal-500 text-teal-200',
  purple: 'bg-purple-500/20 border-l-2 border-purple-500 text-purple-200',
  blue: 'bg-blue-500/20 border-l-2 border-blue-500 text-blue-200',
  green: 'bg-green-500/20 border-l-2 border-green-500 text-green-200',
  magenta: 'bg-pink-500/20 border-l-2 border-pink-500 text-pink-200',
};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_EVENTS: CalendarEvent[] = [
  { id: '1', title: 'Standup', start: '2026-03-28T09:30:00', end: '2026-03-28T10:00:00', color: 'teal' },
  { id: '2', title: 'Design Sprint', start: '2026-03-28T10:00:00', end: '2026-03-28T12:00:00', color: 'purple' },
  { id: '3', title: '1:1 with Sarah', start: '2026-03-28T11:00:00', end: '2026-03-28T11:30:00', color: 'blue' },
  { id: '4', title: 'Board Meeting Prep', start: '2026-03-30T09:00:00', end: '2026-03-30T10:30:00', color: 'purple' },
  { id: '5', title: 'Sprint Planning', start: '2026-03-31T10:00:00', end: '2026-03-31T11:00:00', color: 'blue' },
  { id: '6', title: 'Customer Demo', start: '2026-03-30T13:00:00', end: '2026-03-30T14:00:00', color: 'teal' },
  { id: '7', title: 'Investor Call \u2014 Sequoia', start: '2026-03-28T14:00:00', end: '2026-03-28T15:00:00', color: 'green' },
  { id: '8', title: 'Team Retro', start: '2026-03-28T14:00:00', end: '2026-03-28T15:00:00', color: 'purple' },
  { id: '9', title: 'API Review', start: '2026-03-28T14:00:00', end: '2026-03-28T15:00:00', color: 'teal' },
  { id: '10', title: 'Marketing Sync', start: '2026-03-28T11:00:00', end: '2026-03-28T11:30:00', color: 'blue' },
  { id: '11', title: 'Lunch with Alex', start: '2026-03-28T12:30:00', end: '2026-03-28T13:30:00', color: 'green' },
  { id: '12', title: 'UI Polish Sprint', start: '2026-03-30T13:00:00', end: '2026-03-30T14:30:00', color: 'teal' },
  { id: '13', title: 'All Hands', start: '2026-04-01T10:00:00', end: '2026-04-01T11:00:00', color: 'blue' },
  { id: '14', title: 'Architecture Review', start: '2026-04-02T11:00:00', end: '2026-04-02T12:00:00', color: 'purple' },
  { id: '15', title: 'Coffee with David', start: '2026-03-30T15:00:00', end: '2026-03-30T15:30:00', color: 'green' },
  { id: '16', title: 'Product Review', start: '2026-03-28T16:00:00', end: '2026-03-28T17:00:00', color: 'teal' },
  { id: '17', title: 'Side Project Coding', start: '2026-03-28T16:00:00', end: '2026-03-28T18:00:00', color: 'purple' },
];

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(monday);
    nd.setDate(monday.getDate() + i);
    return nd;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 12) return `12 ${hour === 0 ? 'AM' : 'PM'}`;
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Positioning logic
// ---------------------------------------------------------------------------

function calculateEventPosition(event: CalendarEvent): { top: number; height: number } {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const top = ((startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(30, ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT);
  return { top, height };
}

function layoutEvents(events: CalendarEvent[], weekDays: Date[]): PositionedEvent[] {
  const result: PositionedEvent[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayEvents = events.filter((e) =>
      isSameDay(new Date(e.start), weekDays[dayIndex]),
    );

    dayEvents.sort((a, b) => {
      const aStart = new Date(a.start).getTime();
      const bStart = new Date(b.start).getTime();
      if (aStart !== bStart) return aStart - bStart;
      const aDur = new Date(a.end).getTime() - aStart;
      const bDur = new Date(b.end).getTime() - bStart;
      return bDur - aDur;
    });

    const columns: { end: number }[] = [];

    for (const event of dayEvents) {
      const { top, height } = calculateEventPosition(event);
      const eventEnd = top + height;

      let colIdx = -1;
      for (let c = 0; c < columns.length; c++) {
        if (columns[c].end <= top) {
          colIdx = c;
          break;
        }
      }
      if (colIdx === -1) {
        colIdx = columns.length;
        columns.push({ end: 0 });
      }
      columns[colIdx].end = eventEnd;

      result.push({
        ...event,
        top,
        height,
        columnIndex: colIdx,
        totalColumns: 0,
        dayIndex,
      });
    }

    const dayPositioned = result.filter((e) => e.dayIndex === dayIndex);
    for (const ev of dayPositioned) {
      const overlapping = dayPositioned.filter(
        (other) =>
          other.top < ev.top + ev.height && other.top + other.height > ev.top,
      );
      const maxCol = Math.max(...overlapping.map((o) => o.columnIndex)) + 1;
      for (const o of overlapping) {
        o.totalColumns = Math.max(o.totalColumns, maxCol);
      }
    }
  }

  for (const ev of result) {
    if (ev.totalColumns === 0) ev.totalColumns = 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DayHeader({ date, isToday }: { date: Date; isToday: boolean }) {
  const dayLabel = DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1];
  const dateNum = date.getDate();
  return (
    <div className="flex flex-col items-center gap-1 py-3">
      <span
        className={`text-sm font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {dayLabel}
      </span>
      {isToday ? (
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
          {dateNum}
        </span>
      ) : (
        <span className="flex size-8 items-center justify-center text-sm font-medium text-foreground">
          {dateNum}
        </span>
      )}
    </div>
  );
}

function EventBlock({ event }: { event: PositionedEvent }) {
  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  const colorClasses = EVENT_COLORS[event.color] || EVENT_COLORS.teal;
  const widthPct = 100 / event.totalColumns;
  const leftPct = event.columnIndex * widthPct;
  const isCompact = event.height < 40;

  return (
    <div
      className={`absolute overflow-hidden rounded-lg px-2 py-1 ${colorClasses} cursor-pointer transition-opacity hover:opacity-80`}
      style={{
        top: `${event.top}px`,
        height: `${event.height}px`,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 2px)`,
      }}
      title={`${event.title}\n${formatTime(startDate)} - ${formatTime(endDate)}`}
    >
      {isCompact ? (
        <p className="truncate text-sm font-medium leading-tight">
          {event.title}
        </p>
      ) : (
        <>
          <p className="truncate text-sm font-medium leading-tight">
            {event.title}
          </p>
          <p className="truncate text-sm leading-tight opacity-70">
            {formatTime(startDate)} - {formatTime(endDate)}
          </p>
        </>
      )}
    </div>
  );
}

function CurrentTimeLine({ weekDays }: { weekDays: Date[] }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayIndex = weekDays.findIndex((d) => isSameDay(d, now));
  if (todayIndex === -1) return null;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  if (top < 0 || top > (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT) return null;

  return (
    <>
      <div
        className="pointer-events-none absolute right-0 left-[60px] z-10 border-t border-red-500/30"
        style={{ top: `${top}px` }}
      />
      <div
        className="pointer-events-none absolute z-20 border-t-2 border-red-500"
        style={{
          top: `${top}px`,
          left: `calc(60px + ${todayIndex} * ((100% - 60px) / 7))`,
          width: `calc((100% - 60px) / 7)`,
        }}
      >
        <div className="absolute -top-[5px] -left-[5px] size-[10px] rounded-full bg-red-500" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function MeetingsTabCalendar() {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = useMemo(() => new Date(), []);

  const baseDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [today, weekOffset]);

  const weekDays = useMemo(() => getWeekDays(baseDate), [baseDate]);

  const positioned = useMemo(
    () => layoutEvents(MOCK_EVENTS, weekDays),
    [weekDays],
  );

  const gridHeight = (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT;

  const weekRangeLabel = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[6];
    const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });
    const yearFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric' });
    if (first.getMonth() === last.getMonth()) {
      return `${monthFmt.format(first)} ${first.getDate()} - ${last.getDate()}, ${yearFmt.format(first)}`;
    }
    return `${monthFmt.format(first)} ${first.getDate()} - ${monthFmt.format(last)} ${last.getDate()}, ${yearFmt.format(last)}`;
  }, [weekDays]);

  return (
    <TabShell variant="fixed" padding="p-0">
      <div className="flex h-full flex-col">
        {/* Navigation bar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Previous week"
            >
              <IconChevronLeft size={16} />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="cursor-pointer rounded-lg border-none bg-transparent px-3 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Today
            </button>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Next week"
            >
              <IconChevronRight size={16} />
            </button>
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {weekRangeLabel}
          </span>
        </div>

        {/* Day column headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
          <div />
          {weekDays.map((day, i) => (
            <DayHeader key={i} date={day} isToday={isSameDay(day, today)} />
          ))}
        </div>

        {/* Scrollable time grid */}
        <ScrollArea className="flex-1">
          <div
            className="relative grid grid-cols-[60px_repeat(7,1fr)]"
            style={{ height: `${gridHeight}px` }}
          >
            {/* Hour rows */}
            {HOURS.map((hour) => {
              const top = (hour - START_HOUR) * HOUR_HEIGHT;
              return (
                <React.Fragment key={hour}>
                  <div
                    className="pointer-events-none absolute left-0 w-[60px] pr-3 text-right text-sm text-muted-foreground"
                    style={{ top: `${top - 6}px` }}
                  >
                    {formatHour(hour)}
                  </div>
                  <div
                    className="pointer-events-none absolute right-0 left-[60px] border-t border-border"
                    style={{ top: `${top}px` }}
                  />
                </React.Fragment>
              );
            })}

            {/* Event blocks */}
            {weekDays.map((_, dayIndex) => {
              const dayEvents = positioned.filter(
                (e) => e.dayIndex === dayIndex,
              );
              if (dayEvents.length === 0) return null;
              return (
                <div
                  key={dayIndex}
                  className="absolute"
                  style={{
                    top: 0,
                    left: `calc(60px + ${dayIndex} * ((100% - 60px) / 7))`,
                    width: `calc((100% - 60px) / 7)`,
                    height: `${gridHeight}px`,
                  }}
                >
                  {dayEvents.map((ev) => (
                    <EventBlock key={ev.id} event={ev} />
                  ))}
                </div>
              );
            })}

            {/* Current time indicator */}
            <CurrentTimeLine weekDays={weekDays} />
          </div>
        </ScrollArea>
      </div>
    </TabShell>
  );
}

export default React.memo(MeetingsTabCalendar);

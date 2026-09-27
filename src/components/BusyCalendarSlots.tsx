export type BusySlot = { start: string; end: string };

export type BusyCalendarRange = {
  key: string;
  start: number;
  end: number;
  endsAtMidnight: boolean;
};

export function getBusySlotsForDate(slots: BusySlot[], dateKey: string): BusyCalendarRange[] {
  const startOfDay = Date.parse(`${dateKey}T00:00:00+09:00`);
  const endOfDay = startOfDay + 86_400_000;
  return slots
    .filter((slot) => Date.parse(slot.start) < endOfDay && Date.parse(slot.end) > startOfDay)
    .map((slot) => ({
      key: `${slot.start}-${slot.end}`,
      start: Math.max(startOfDay, Date.parse(slot.start)),
      end: Math.min(endOfDay, Date.parse(slot.end)),
      endsAtMidnight: Date.parse(slot.end) >= endOfDay
    }))
    .sort((a, b) => a.start - b.start);
}

export function BusyCalendarSlot({ range, language = "ja" }: {
  range: BusyCalendarRange;
  language?: "ja" | "en" | "zh-Hant";
}) {
  const label = { ja: "予約済", en: "Booked", "zh-Hant": "已預約" }[language];
  const time = (value: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  return (
    <span className="calendar-booking external-busy">
      {time(range.start)}-{range.endsAtMidnight ? "24:00" : time(range.end)} {label}
    </span>
  );
}

export function BusyCalendarSlots({ slots, dateKey, language = "ja" }: {
  slots: BusySlot[]; dateKey: string; language?: "ja" | "en" | "zh-Hant";
}) {
  return <>{getBusySlotsForDate(slots, dateKey).map((range) => (
    <BusyCalendarSlot key={range.key} range={range} language={language} />
  ))}</>;
}

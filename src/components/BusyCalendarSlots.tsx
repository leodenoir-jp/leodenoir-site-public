export type BusySlot = { start: string; end: string };

export function BusyCalendarSlots({ slots, dateKey, language = "ja" }: {
  slots: BusySlot[]; dateKey: string; language?: "ja" | "en" | "zh-Hant";
}) {
  const startOfDay = Date.parse(`${dateKey}T00:00:00+09:00`);
  const endOfDay = startOfDay + 86_400_000;
  const label = { ja: "予約済み", en: "Booked", "zh-Hant": "已預約" }[language];
  const time = (value: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  return <>{slots.filter((slot) => Date.parse(slot.start) < endOfDay && Date.parse(slot.end) > startOfDay)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).map((slot) => {
      const start = Math.max(startOfDay, Date.parse(slot.start));
      const end = Math.min(endOfDay, Date.parse(slot.end));
      return <span className="calendar-booking external-busy" key={`${slot.start}-${slot.end}`}>
        {time(start)}-{end === endOfDay ? "24:00" : time(end)} {label}
      </span>;
    })}</>;
}

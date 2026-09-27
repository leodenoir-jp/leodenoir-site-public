import { Children, type ReactNode, useState } from "react";

const copy = {
  ja: { more: "See more", less: "Close" },
  en: { more: "See more", less: "Show less" },
  "zh-Hant": { more: "See more", less: "收合" }
} as const;

export function CalendarDayEntries({
  children,
  language = "ja",
  visibleCount = 2
}: {
  children: ReactNode;
  language?: keyof typeof copy;
  visibleCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const entries = Children.toArray(children);
  const hasOverflow = entries.length > visibleCount;
  const visibleEntries = expanded ? entries : entries.slice(0, visibleCount);

  return (
    <div className="calendar-day-entries">
      {visibleEntries}
      {hasOverflow ? (
        <button
          className="calendar-see-more"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? copy[language].less : `${copy[language].more} (+${entries.length - visibleCount})`}
        </button>
      ) : null}
    </div>
  );
}

export function AvailabilityCalendarLegend({ language = "ja" }: { language?: keyof typeof copy }) {
  const labels = {
    ja: { available: "予約可能", booked: "予約済" },
    en: { available: "Available", booked: "Booked" },
    "zh-Hant": { available: "可預約", booked: "已預約" }
  }[language];

  return (
    <div className="availability-calendar-legend" aria-label={language === "ja" ? "カレンダー凡例" : "Calendar legend"}>
      <span><i className="available" />{labels.available}</span>
      <span><i className="booked" />{labels.booked}</span>
    </div>
  );
}

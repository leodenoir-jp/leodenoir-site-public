import { Children, type ReactNode, useState } from "react";

const copy = {
  ja: { more: "See more", close: "閉じる", title: "予約枠一覧" },
  en: { more: "See more", close: "Close", title: "Schedule" },
  "zh-Hant": { more: "See more", close: "關閉", title: "預約時段" }
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
  const visibleEntries = entries.slice(0, visibleCount);

  return (
    <div className="calendar-day-entries">
      {visibleEntries}
      {hasOverflow ? (
        <button
          className="calendar-see-more"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        >
          {`${copy[language].more} (+${entries.length - visibleCount})`}
        </button>
      ) : null}
      {hasOverflow && expanded ? (
        <div className="calendar-overflow-backdrop" role="presentation" onClick={() => setExpanded(false)}>
          <section
            className="calendar-overflow-panel"
            role="dialog"
            aria-modal="true"
            aria-label={copy[language].title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="calendar-overflow-header">
              <strong>{copy[language].title}</strong>
              <button type="button" onClick={() => setExpanded(false)} aria-label={copy[language].close}>×</button>
            </div>
            <div className="calendar-overflow-list">{entries}</div>
          </section>
        </div>
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

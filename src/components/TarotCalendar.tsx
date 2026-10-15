import { useState } from "react";
import { AvailabilityCalendarLegend, CalendarDayEntries } from "./CalendarDayEntries";
import { jstDate, type BusyTime, type TarotSlot } from "../../shared/tarot";

export const tarotDateTime = (date: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
const time = (date: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
export function TarotCalendar({ slots, busy, selected, onSelect, deleting = false }: {
  slots: TarotSlot[]; busy: BusyTime[]; selected?: string; onSelect: (slot: TarotSlot) => void; deleting?: boolean;
}) {
  const [month, setMonth] = useState(() => jstDate(new Date()).slice(0, 7));
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const move = (amount: number) => setMonth(new Date(Date.UTC(year, number - 1 + amount, 1)).toISOString().slice(0, 7));
  return <div className="booking-calendar tarot-calendar">
    <div className="tarot-calendar-toolbar">
      <button type="button" onClick={() => move(-1)} aria-label="前月">&lt;</button>
      <label>表示月<input type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></label>
      <button type="button" onClick={() => move(1)} aria-label="翌月">&gt;</button>
    </div>
    <p className="platform-note">日本時間（JST）</p>
    <AvailabilityCalendarLegend />
    <div className="tarot-month-grid">
      {["日", "月", "火", "水", "木", "金", "土"].map(day => <div className="tarot-weekday" key={day}>{day}</div>)}
      {Array.from({ length: first.getUTCDay() }, (_, i) => <div className="tarot-day empty" key={`empty-${i}`} />)}
      {Array.from({ length: days }, (_, i) => {
        const key = `${month}-${String(i + 1).padStart(2, "0")}`;
        const dayStart = Date.parse(`${key}T00:00:00+09:00`);
        return <div className="tarot-day" key={key}><strong>{i + 1}</strong>
          <CalendarDayEntries>
            {slots.filter(slot => jstDate(slot.start) === key).map(slot => <button type="button" key={slot.start}
              className={`calendar-booking available ${selected === slot.start ? "selected" : ""} ${slot.bufferBlocked ? "buffer-blocked" : ""}`}
              aria-pressed={!deleting && selected === slot.start}
              aria-label={`${tarotDateTime(slot.start)} ${deleting ? "空き枠を削除" : slot.bufferBlocked ? "移動時間に重複あり" : "予約可能"}`}
              onClick={() => onSelect(slot)}>{time(slot.start)}–{time(slot.end)}{slot.bufferBlocked ? " ※" : ""}</button>)}
            {busy.filter(b => Date.parse(b.starts_at) < dayStart + 86400000 && Date.parse(b.ends_at) > dayStart).map((b, index) => <span className="calendar-booking busy-slot" key={`${b.starts_at}-${index}`}>{time(b.starts_at)}–{time(b.ends_at)} 予約済</span>)}
          </CalendarDayEntries>
        </div>;
      })}
    </div>
  </div>;
}

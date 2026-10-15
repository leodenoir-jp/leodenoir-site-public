export type TarotMode = "online" | "in_person" | "email";
export type TarotStatus = "inquiry" | "pending_payment" | "intake_pending" | "awaiting_theme" | "reading" | "result_pending" | "questions" | "answering" | "answer_pending" | "confirmed" | "complete" | "expired" | "cancelled";
export type Rule = { enabled: boolean; start: string; end: string };
export type TarotSettings = {
  enabled: boolean; lead_hours: number; horizon_days: number; daily_limit: number;
  weekly_rules: Record<string, Rule>;
  date_overrides: Array<Rule & { date: string; excluded_times?: string[] }>;
  guidance: string; intake_text: string;
};
export type BusyTime = { starts_at: string; ends_at: string };
export type TarotSlot = { start: string; end: string; bufferBlocked: boolean };
export const tarotModes = { online: "オンライン鑑定", in_person: "対面鑑定", email: "メール鑑定" };
export const tarotPrices = { online: 4000, in_person: 16000, email: 3500 };
export const tarotStatuses: Record<TarotStatus, string> = {
  inquiry: "日時・場所の相談", pending_payment: "決済待ち", intake_pending: "相談案内の送信待ち",
  awaiting_theme: "相談内容の返信待ち", reading: "鑑定中", result_pending: "鑑定結果の送信待ち",
  questions: "質問受付中", answering: "質問への回答待ち", answer_pending: "回答の送信待ち",
  confirmed: "予約確定", complete: "完了", expired: "返信期限切れ", cancelled: "キャンセル"
};
export const tokyoWards = ["千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区", "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区", "杉並区", "豊島区", "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区"];
export function defaultTarotSettings(): TarotSettings {
  return { enabled: false, lead_hours: 24, horizon_days: 21, daily_limit: 3,
    weekly_rules: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [String(day), { enabled: false, start: "10:00", end: "18:00" }])), date_overrides: [],
    guidance: "オンライン・対面鑑定は50分です。冒頭20分程度でご相談を伺い、その後タロットカードを用いてお話しします。",
    intake_text: "現在の状況、何に迷っているか、いつまでにどうしたいかを、分かる範囲で具体的にお知らせください。\n例：今の職場に残るか転職するか迷っています。今後3か月で判断するために、私が整理すべきことを知りたいです。\n1回につき1テーマです。鑑定前の問いの整理は、鑑定後の質問回数には含みません。" };
}
export const jstDate = (value: Date | string) => new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const addMinutes = (value: string, minutes: number) => new Date(Date.parse(value) + minutes * 60000).toISOString();
export const overlaps = (start: string, end: string, busy: BusyTime) => Date.parse(start) < Date.parse(busy.ends_at) && Date.parse(end) > Date.parse(busy.starts_at);
export function reservationRange(mode: TarotMode, start: string) {
  return { starts_at: addMinutes(start, mode === "in_person" ? -60 : 0), ends_at: addMinutes(start, mode === "in_person" ? 110 : 80) };
}
export function tarotSlots(settings: TarotSettings, busy: BusyTime[], ownStarts: string[], mode: TarotMode, now = new Date()): TarotSlot[] {
  if (!settings.enabled || mode === "email") return [];
  const slots: TarotSlot[] = [];
  const midnight = Date.parse(`${jstDate(now)}T00:00:00+09:00`);
  for (let day = 0; day < settings.horizon_days; day++) {
    const date = jstDate(new Date(midnight + day * 86400000));
    if (ownStarts.filter(start => jstDate(start) === date).length >= settings.daily_limit) continue;
    const override = settings.date_overrides.find(rule => rule.date === date);
    const rule = override ?? settings.weekly_rules[String(new Date(`${date}T12:00:00Z`).getUTCDay())];
    if (!rule?.enabled) continue;
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    for (let min = minutes(rule.start); min + 50 <= minutes(rule.end); min += 30) {
      const time = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
      if (override?.excluded_times?.includes(time)) continue;
      const start = new Date(`${date}T${time}:00+09:00`).toISOString();
      const end = addMinutes(start, 50);
      if (Date.parse(start) < now.getTime() + settings.lead_hours * 3600000 || busy.some(b => overlaps(start, end, b))) continue;
      const range = reservationRange(mode, start);
      const bufferBlocked = busy.some(b => overlaps(range.starts_at, range.ends_at, b));
      if (mode === "online" && bufferBlocked) continue;
      slots.push({ start, end, bufferBlocked });
    }
  }
  return slots;
}
export function validateSettings(value: TarotSettings) {
  if (typeof value.enabled !== "boolean" || !Number.isInteger(value.lead_hours) || value.lead_hours < 0 || value.lead_hours > 720 || !Number.isInteger(value.horizon_days) || value.horizon_days < 1 || value.horizon_days > 120 || !Number.isInteger(value.daily_limit) || value.daily_limit < 1 || value.daily_limit > 30) throw new Error("受付条件を確認してください。");
  if (!Array.isArray(value.date_overrides) || value.date_overrides.length > 366) throw new Error("例外日の設定を確認してください。");
  const time = /^(?:[01]\d|2[0-3]):(?:00|30)$/;
  const validRule = (r: Rule) => r && typeof r.enabled === "boolean" && time.test(r.start) && time.test(r.end) && r.start < r.end;
  if (Array.from({ length: 7 }, (_, day) => value.weekly_rules?.[String(day)]).some(r => !validRule(r))) throw new Error("曜日ごとの開始・終了時刻を確認してください。");
  if (value.date_overrides.some(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !validRule(r) || (r.excluded_times && (!Array.isArray(r.excluded_times) || r.excluded_times.some(t => !time.test(t)))))) throw new Error("例外日の時刻を確認してください。");
  if (new Set(value.date_overrides.map(r => r.date)).size !== value.date_overrides.length) throw new Error("例外日が重複しています。");
  if (typeof value.guidance !== "string" || value.guidance.length > 5000 || typeof value.intake_text !== "string" || value.intake_text.length > 5000) throw new Error("案内文は5,000文字以内で入力してください。");
  return value;
}

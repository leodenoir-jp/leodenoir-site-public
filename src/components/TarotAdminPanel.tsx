import { useCallback, useEffect, useRef, useState } from "react";
import { defaultTarotSettings, jstDate, tarotModes, tarotPublicationWindow, tarotStatuses, type BusyTime, type Rule, type TarotMode, type TarotSettings, type TarotSlot, type TarotStatus } from "../../shared/tarot";
import { TarotCalendar, tarotDateTime } from "./TarotCalendar";

type Mail = { id: string; kind: string; status: string; subject: string; body: string; error: string | null; sent_at: string | null; attempted_at: string | null };
type Reading = {
  id: string; mode: TarotMode; status: TarotStatus; starts_at: string | null; version: number;
  amount: number; transport_amount: number; paid_at: string | null; payment_method: string | null; payment_link: string | null;
  location: { ward?: string; station?: string; line?: string; venue?: string }; preference: string;
  theme: string | null; question: string | null; due_at: string | null; reply_deadline: string | null; question_deadline: string | null;
  counseling_clients: { email: string; display_name: string; client_id: string; zoom_link: string | null };
  tarot_mail: Mail[];
};
type AdminData = { settings: TarotSettings; settingsUpdatedAt: string | null; requests: Reading[]; slots: TarotSlot[]; busySlots: BusyTime[] };
export function TarotAdminPanel({ token, view }: { token: string; view: "tarot" | "tarot-email" | "tarot-settings" }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");
  const lock = useRef(false);
  const mock = token === "mock-counseling-admin";
  const load = useCallback(async () => {
    if (mock) { setData({ settings: defaultTarotSettings(), settingsUpdatedAt: null, requests: [], slots: [], busySlots: [] }); return; }
    const response = await fetch(`/api/tarot?mode=admin&page=${page}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "タロット管理情報を取得できませんでした。");
    setData(body);
  }, [token, page, mock]);
  useEffect(() => { setError(""); void load().catch(e => setError(e.message)); }, [load]);
  async function act(body: Record<string, unknown>) {
    if (lock.current) return false;
    if (mock) { setMessage("モック表示です。保存・メール送信は行いません。"); return false; }
    lock.current = true; setPending(true); setError(""); setMessage("");
    try {
      const request = body.action === "save-settings" ? { ...body, settingsUpdatedAt: data?.settingsUpdatedAt } : body;
      const response = await fetch("/api/tarot", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(request) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "操作を完了できませんでした。");
      setMessage(result.message); await load(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "通信エラーが発生しました。"); return false; }
    finally { lock.current = false; setPending(false); }
  }
  return <section className="tarot-admin-panel">
    <div className="tarot-admin-heading"><h2>{view === "tarot-settings" ? "タロットの公開枠・案内文" : view === "tarot-email" ? "メール鑑定" : "タロット予約・日時相談"}</h2><button type="button" className="button secondary" disabled={pending} onClick={() => void load().catch(e => setError(e.message))}>再読み込み</button></div>
    {message ? <p className="form-success" role="status">{message}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}
    {!data ? <p>管理情報を読み込んでいます。読み込めない場合はDBのタロット用マイグレーションを確認してください。</p> : view === "tarot-settings" ? <TarotSchedule data={data} pending={pending} save={act} /> : <>
      <label>このページ内を検索<input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="お名前・メール・受付番号" /></label>
      {data.requests.filter(r => (view === "tarot-email" ? r.mode === "email" : r.mode !== "email") && `${r.id} ${r.counseling_clients.display_name} ${r.counseling_clients.email}`.toLowerCase().includes(filter.toLowerCase())).map(r => <TarotRequestEditor key={`${r.id}-${r.version}`} reading={r} pending={pending} act={act} />)}
      {!data.requests.some(r => view === "tarot-email" ? r.mode === "email" : r.mode !== "email") ? <p>このページに該当するお申し込みはありません。</p> : null}
      <div className="button-row"><button className="button secondary" disabled={page === 0 || pending} onClick={() => setPage(p => p - 1)}>前の50件</button><span>{page + 1}ページ</span><button className="button secondary" disabled={data.requests.length < 50 || pending} onClick={() => setPage(p => p + 1)}>次の50件</button></div>
    </>}
  </section>;
}
function TarotRequestEditor({ reading: r, pending, act }: { reading: Reading; pending: boolean; act: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [paymentMethod, setPaymentMethod] = useState(r.payment_method || "PayPal");
  const [paymentLink, setPaymentLink] = useState(r.payment_link || "");
  const [zoomLink, setZoomLink] = useState(r.counseling_clients.zoom_link || "");
  const [transportAmount, setTransport] = useState(r.transport_amount);
  const [text, setText] = useState("");
  const [receivedAt, setReceived] = useState("");
  const [start, setStart] = useState("");
  const action = (name: string, extra: Record<string, unknown> = {}) => void act({ action: name, id: r.id, version: r.version, ...extra });
  const done = ["complete", "expired", "cancelled"].includes(r.status);
  const replyExpired = r.status === "awaiting_theme" && r.reply_deadline && Date.now() > Date.parse(r.reply_deadline);
  const questionExpired = r.status === "questions" && r.question_deadline && Date.now() > Date.parse(r.question_deadline);
  return <article className="tarot-request-item">
    <div className="tarot-admin-heading"><h3>{r.counseling_clients.display_name} <small>{tarotModes[r.mode]}</small></h3><strong className="status-badge">{replyExpired ? "返信期限超過・受信確認待ち" : tarotStatuses[r.status]}</strong></div>
    <p><a href={`mailto:${r.counseling_clients.email}`}>{r.counseling_clients.email}</a> / {r.counseling_clients.client_id}</p>
    <p className="platform-note">受付番号：{r.id}{r.starts_at ? ` / ${tarotDateTime(r.starts_at)}` : ""}</p>
    <p>鑑定料 {r.amount.toLocaleString("ja-JP")}円{r.mode === "in_person" ? ` + 交通費 ${r.transport_amount.toLocaleString("ja-JP")}円` : ""} / {r.paid_at ? `入金確認 ${tarotDateTime(r.paid_at)}` : "入金未確認"}</p>
    {r.mode === "in_person" ? <p>東京都{r.location.ward} / {r.location.line} / {r.location.station} / {r.location.venue || "施設未定"}<br />{r.preference}</p> : null}
    {r.reply_deadline ? <p>相談内容の返信期限：{tarotDateTime(r.reply_deadline)}</p> : null}
    {r.due_at ? <p>鑑定のお届け目安：{tarotDateTime(r.due_at)}</p> : null}
    {r.question_deadline ? <p>質問受付期限：{tarotDateTime(r.question_deadline)}</p> : null}
    {r.theme ? <details><summary>確定したテーマ</summary><p className="tarot-preline">{r.theme}</p></details> : null}
    {r.question ? <details><summary>受信した質問</summary><p className="tarot-preline">{r.question}</p></details> : null}
    <fieldset disabled={pending} className="tarot-admin-controls">
      {["pending_payment", "confirmed"].includes(r.status) ? <>
        <div className="platform-grid three"><label>決済方法<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option>PayPal</option><option>PayPay</option></select></label><label>決済リンク<input type="url" value={paymentLink} onChange={e => setPaymentLink(e.target.value)} /></label>{r.mode === "online" ? <label>Zoom会議リンク<input type="url" value={zoomLink} onChange={e => setZoomLink(e.target.value)} /></label> : r.mode === "in_person" ? <label>交通費（円）<input type="number" min={0} max={100000} step={1} value={transportAmount} onChange={e => setTransport(Number(e.target.value))} /></label> : null}</div>
        <div className="button-row"><button className="button secondary" onClick={() => action("details", { paymentMethod, paymentLink, zoomLink, transportAmount })}>情報を保存</button>
        {r.status === "pending_payment" ? <><button className="button secondary" disabled={r.tarot_mail.some(m => m.kind === "payment")} onClick={() => { if (confirm("保存済みの決済情報で案内メールを送信しますか？")) action("payment"); }}>決済案内を送信</button><button className="button primary" onClick={() => { if (confirm("実際の入金を確認しましたか？入金済みとして記録し、案内メールを送信します。")) action("paid"); }}>入金確認・案内送信</button></> : null}</div>
      </> : null}
      {r.status === "inquiry" ? <><label>メールで合意した開始日時（日本時間）<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} step={1800} /></label><button className="button secondary" onClick={() => action("assign", { start: start ? new Date(`${start}:00+09:00`).toISOString() : "" })}>日時を確保し、仮確定メールを送信</button><p className="platform-note">公開枠かつ前後1時間が空いている日時のみ確保できます。必要に応じてタロットの公開枠を調整してください。</p></> : null}
      {["awaiting_theme", "reading", "questions", "answering"].includes(r.status) ? <>
        <label>{r.status === "awaiting_theme" ? "受信・確認済みのテーマ" : r.status === "reading" ? "鑑定結果（メール本文）" : r.status === "questions" ? "受信した質問（1問）" : "質問への回答（メール本文）"}<textarea rows={6} value={text} onChange={e => setText(e.target.value)} maxLength={20000} /></label>
        {r.status === "questions" ? <label>質問の受信日時（日本時間）<input type="datetime-local" value={receivedAt} onChange={e => setReceived(e.target.value)} /></label> : null}
        <button className="button primary" disabled={!text.trim() || (r.status === "questions" && !receivedAt)} onClick={() => {
          const actions: Partial<Record<TarotStatus, string>> = { awaiting_theme: "theme", reading: "result", questions: "question", answering: "answer" };
          const name = actions[r.status];
          if (["reading", "answering"].includes(r.status) && !confirm("入力した本文を依頼者にメールで送信しますか？")) return;
          action(name!, { text, receivedAt: receivedAt ? new Date(`${receivedAt}:00+09:00`).toISOString() : "" });
        }}>{r.status === "awaiting_theme" ? "テーマ確定・鑑定開始" : r.status === "reading" ? "鑑定結果を送信" : r.status === "questions" ? "質問受信を記録" : "回答を送信・完了"}</button>
      </> : null}
      {replyExpired || questionExpired || r.status === "confirmed" || r.status === "inquiry" ? <button className="button secondary" onClick={() => { if (confirm("メールの受信状況・実施状況を確認しましたか？返信待ちは「返信期限切れ」、実施済み・質問なしは「完了」として終了します。")) action("close"); }}>{replyExpired || r.status === "inquiry" ? "返信期限切れとして終了" : "受信・実施状況を確認して完了"}</button> : null}
      {!done && !["result_pending", "answer_pending", "intake_pending"].includes(r.status) ? <details><summary>キャンセル</summary><label>理由<textarea value={text} onChange={e => setText(e.target.value)} /></label><button className="button secondary" disabled={!text.trim()} onClick={() => { if (confirm("受付をキャンセルし、予約枠を開放します。返金処理は別途手動です。実行しますか？")) action("cancel", { text }); }}>キャンセルして通知</button></details> : null}
      <details><summary>メール送信履歴（{r.tarot_mail.filter(m => m.status !== "sent").length}件未送信）</summary>{r.tarot_mail.map(m => <section className="tarot-mail-log" key={m.id}><strong>{m.subject}</strong><p>{m.status === "sent" ? `送信済 ${tarotDateTime(m.sent_at!)}` : m.status === "sending" ? "送信結果を確認中" : "未送信"}{m.error ? ` / ${m.error}` : ""}</p><details><summary>本文を確認</summary><p className="tarot-preline">{m.body}</p></details></section>)}
        <p className="platform-note">「送信済」は送信サービスの受付確認です。受信箱への到着を保証するものではありません。初回試行から23時間を超える未確定の送信は、重複防止のため自動再送せず、Resendで確認してください。</p>
        <button className="button secondary" onClick={() => action("retry")}>未送信メールを再試行</button>
      </details>
    </fieldset>
  </article>;
}
function TarotSchedule({ data, pending, save }: { data: AdminData; pending: boolean; save: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [settings, setSettings] = useState(data.settings);
  const [override, setOverride] = useState<Rule & { date: string }>({ date: "", enabled: true, start: "10:00", end: "18:00" });
  useEffect(() => setSettings(data.settings), [data.settings]);
  const update = (day: number, patch: Partial<Rule>) => setSettings(s => ({ ...s, weekly_rules: { ...s.weekly_rules, [day]: { ...s.weekly_rules[day], ...patch } } }));
  const persist = (next: TarotSettings) => save({ action: "save-settings", settings: next });
  const publication = tarotPublicationWindow(settings);
  const savedPublication = tarotPublicationWindow(data.settings);
  const dirty = JSON.stringify(settings) !== JSON.stringify(data.settings);
  const saveOverride = async () => {
    const next = { ...settings, date_overrides: [...settings.date_overrides.filter(r => r.date !== override.date), override] };
    setSettings(next);
    if (await persist(next)) setOverride(current => ({ ...current, date: "" }));
  };
  return <form className="platform-form" onSubmit={e => { e.preventDefault(); if (override.date) void saveOverride(); else void persist(settings); }}>
    <fieldset disabled={pending} className="tarot-admin-controls">
      <label className="counseling-consent"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />タロットのお申し込みを受け付ける（メール鑑定を含む）</label>
      <div className="platform-grid three">{([['lead_hours', '何時間後から受付', 0, 720], ['horizon_days', '何日先まで表示', 1, 120], ['daily_limit', '1日の予約上限', 1, 30]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} required value={settings[key]} onChange={e => setSettings({ ...settings, [key]: Number(e.target.value) })} /></label>)}</div>
      <p className="platform-note">公開対象期間：{publication.today} ～ {publication.lastDate}（日本時間）。期間外の日付設定は保存されても、期間内に入るまで予約画面に表示されません。</p>
      {publication.outsideDates.length ? <div role="status"><p className="form-error">公開期間外の受付日：{publication.outsideDates.join("、")}</p>{publication.requiredDays <= 120 ? <button type="button" className="button secondary" onClick={() => { const next = { ...settings, horizon_days: publication.requiredDays }; setSettings(next); void persist(next); }}>これらの日付まで公開期間を延長して保存（{publication.requiredDays}日間）</button> : <p>公開期間の上限は120日です。</p>}</div> : null}
      <h3>曜日ごとの受付時間</h3>
      <div className="counseling-weekly-grid">{["日", "月", "火", "水", "木", "金", "土"].map((day, i) => <div className="counseling-weekly-row" key={day}><label className="counseling-consent"><input type="checkbox" checked={settings.weekly_rules[i].enabled} onChange={e => update(i, { enabled: e.target.checked })} />{day}曜日</label><input type="time" step={1800} aria-label={`${day}曜日 開始`} value={settings.weekly_rules[i].start} onChange={e => update(i, { start: e.target.value })} /><input type="time" step={1800} aria-label={`${day}曜日 終了`} value={settings.weekly_rules[i].end} onChange={e => update(i, { end: e.target.value })} /></div>)}</div>
      <h3>日付指定の受付・停止</h3>
      <p className="platform-note">指定した日の設定は曜日ごとの受付時間より優先されます。</p>
      <div className="tarot-date-setting">
        <label>日付<input type="date" value={override.date} onChange={e => setOverride({ ...override, date: e.target.value })} /></label>
        <div className="tarot-date-modes" role="group" aria-label="日付の受付状態">
          <label><input type="radio" name="tarot-date-mode" checked={override.enabled} onChange={() => setOverride({ ...override, enabled: true })} />この日を受付する</label>
          <label><input type="radio" name="tarot-date-mode" checked={!override.enabled} onChange={() => setOverride({ ...override, enabled: false })} />この日は受付停止</label>
        </div>
        {override.enabled ? <><label>開始<input type="time" step={1800} value={override.start} onChange={e => setOverride({ ...override, start: e.target.value })} /></label><label>終了<input type="time" step={1800} value={override.end} onChange={e => setOverride({ ...override, end: e.target.value })} /></label></> : null}
      </div>
      <button type="button" className="button secondary" disabled={!override.date} onClick={() => void saveOverride()}>{override.enabled ? "受付日を保存" : "受付停止日を保存"}</button>
      {settings.date_overrides.length ? <details className="tarot-saved-dates"><summary>保存済みの日付設定（受付 {settings.date_overrides.filter(rule => rule.enabled).length}件・停止 {settings.date_overrides.filter(rule => !rule.enabled).length}件）</summary>
        {settings.date_overrides.slice().sort((a, b) => a.date.localeCompare(b.date)).map(rule => <div className="tarot-override" key={rule.date}><span><strong className={rule.enabled ? "tarot-date-open" : "tarot-date-closed"}>{rule.enabled ? "受付" : "受付停止"}</strong> {rule.date} {rule.enabled ? `${rule.start}–${rule.end}` : ""} {rule.excluded_times?.length ? `除外 ${rule.excluded_times.join("、")}` : ""}</span><button type="button" className="button secondary" disabled={dirty} title={dirty ? "先に未保存の変更を保存してください" : undefined} aria-label={`${rule.date}の設定を削除`} onClick={() => { if (confirm(`${rule.date}の日付設定を削除しますか？`)) void persist({ ...data.settings, date_overrides: data.settings.date_overrides.filter(r => r.date !== rule.date) }); }}>削除</button></div>)}
      </details> : null}
      <label>公開案内文<textarea rows={4} value={settings.guidance} onChange={e => setSettings({ ...settings, guidance: e.target.value })} maxLength={5000} /></label>
      <label>入金後の相談内容案内（メール鑑定）<textarea rows={7} value={settings.intake_text} onChange={e => setSettings({ ...settings, intake_text: e.target.value })} maxLength={5000} /></label>
      <p className="platform-note">返信期限・対象外テーマ・質問回数等の共通条件は案内に自動付記します。</p>
      {dirty || override.date ? <p className="form-error" role="status">未保存の変更があります。保存するまで予約画面には反映されません。</p> : null}
      <button className="button primary" type="submit">公開枠・案内文を保存</button>
      <h3>保存済みの公開枠</h3><p className="platform-note">公開対象期間：{savedPublication.today} ～ {savedPublication.lastDate}。空き枠をクリックすると、その日の開始時刻を除外して保存します。予約済の枠は削除できません。</p>
      {!data.settings.date_overrides.some(rule => rule.enabled) && !Object.values(data.settings.weekly_rules).some(rule => rule.enabled) ? <p className="form-error" role="status">保存済みの受付日はありません。「日付指定の受付・停止」で受付日を登録してください。</p> : null}
      <TarotCalendar slots={data.slots} busy={data.busySlots} deleting onSelect={slot => {
        if (!confirm(`${tarotDateTime(slot.start)}の公開枠を削除しますか？未保存の編集は反映せず、保存済み設定に除外を追加します。`)) return;
        const date = jstDate(slot.start); const time = new Date(Date.parse(slot.start) + 9 * 3600000).toISOString().slice(11, 16);
        const existing = data.settings.date_overrides.find(r => r.date === date);
        const rule = existing ?? data.settings.weekly_rules[new Date(`${date}T12:00:00Z`).getUTCDay()];
        void persist({ ...data.settings, date_overrides: [...data.settings.date_overrides.filter(r => r.date !== date), { ...rule, date, excluded_times: [...new Set([...(existing?.excluded_times ?? []), time])] }] });
      }} />
    </fieldset>
  </form>;
}

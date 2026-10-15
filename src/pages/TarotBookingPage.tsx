import { useEffect, useRef, useState, type FormEvent } from "react";
import { Seo } from "../components/Seo";
import { TarotCalendar, tarotDateTime } from "../components/TarotCalendar";
import { TarotTerms } from "../components/TarotTerms";
import { tarotModes, tarotPrices, tokyoWards, type BusyTime, type TarotMode, type TarotSlot } from "../../shared/tarot";

export function TarotBookingPage() {
  const [mode, setMode] = useState<TarotMode>("online");
  const [data, setData] = useState<{ enabled: boolean; guidance: string; slots: TarotSlot[]; busySlots: BusyTime[] } | null>(null);
  const [slot, setSlot] = useState<TarotSlot | null>(null);
  const [inquiry, setInquiry] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const id = useRef(crypto.randomUUID());
  const locked = useRef(false);
  const successPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (success) { successPanel.current?.focus(); successPanel.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }, [success]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setData(null); setMessage(""); setSlot(null); setInquiry(false);
    fetch(`/api/tarot?mode=${mode}`, { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "受付状況を取得できませんでした。");
      setData(body);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || success) return;
    const fields = new FormData(event.currentTarget);
    locked.current = true; setSending(true); setMessage("");
    try {
      const response = await fetch("/api/tarot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "request", id: id.current, mode, start: slot?.start, inquiry, name: fields.get("name"), email: fields.get("email"),
        preference: fields.get("preference"), website: fields.get("website"), consent: fields.get("consent") === "on",
        location: { ward: fields.get("ward"), station: fields.get("station"), line: fields.get("line"), venue: fields.get("venue") }
      }) });
      const body = await response.json();
      if (!response.ok || !body.accepted) throw new Error(body.message || "受付結果を確認できませんでした。同じ画面から再度お試しください。");
      setSuccess(`${body.message}\n受付番号：${body.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "通信状況を確認してください。"); }
    finally { setSending(false); locked.current = false; }
  }
  return <>
    <Seo title="タロットカード鑑定の予約" description="オンライン・東京都内23区での対面・メール鑑定のお申し込み。" />
    <section className="page-hero counseling-hero"><div className="container"><div><p className="eyebrow">Tarot Reading</p><h1>タロットカード鑑定</h1><p>ご希望の鑑定方法をお選びください。</p></div><img src="/images/service_tarot-card-reading.png" alt="タロットカード鑑定" /></div></section>
    <section className="section"><div className="container tarot-booking-content">
      {success ? <section ref={successPanel} className="tarot-success" role="status" tabIndex={-1}><h2>お申し込みを受け付けました</h2><p style={{ whiteSpace: "pre-line" }}>{success}</p><p>この画面から再度送信する必要はありません。Leoからのご案内をお待ちください。</p><a href="/services/tarot-card-reading" className="button secondary">サービス紹介へ</a></section> : <>
        <fieldset className="tarot-mode-selector" disabled={sending}><legend>鑑定方法</legend>{(Object.keys(tarotModes) as TarotMode[]).map(key => <label key={key} className={mode === key ? "selected" : ""}><input type="radio" name="tarot-mode" checked={mode === key} onChange={() => setMode(key)} /><span><strong>{tarotModes[key]}</strong><span>{key === "email" ? "1テーマ" : "50分"}　{tarotPrices[key].toLocaleString("ja-JP")}円{key === "in_person" ? " + 交通費" : ""}</span></span></label>)}</fieldset>
        {data?.guidance && mode !== "email" ? <p className="tarot-guidance">{data.guidance}</p> : null}
        {loading ? <p role="status">受付状況を確認しています…</p> : null}
        {data && !data.enabled ? <p className="platform-note">現在、新規のお申し込みを受け付けていません。</p> : null}
        {mode !== "email" && data ? <section><h2>ご希望の日時</h2><TarotCalendar slots={data.slots} busy={data.busySlots} selected={slot?.start} onSelect={value => { setSlot(value); setInquiry(false); }} />{data.slots.length === 0 ? <p>現在、公開中の空き枠はありません。</p> : null}</section> : null}
        <form className="platform-form tarot-request-form" onSubmit={submit}>
          <h2>{mode === "email" ? "メール鑑定のお申し込み" : "お申し込み内容"}</h2>
          {mode === "in_person" ? <>
            <p>東京都内23区のみ対応します。ご自宅には伺えません。希望施設がなければ、近隣の喫茶店などで実施します。交通費・場所はLeoからのメールで調整後に確定します。飲食代・席料は各自の分をご負担ください。</p>
            <div className="platform-grid three"><label>東京都の区（必須）<select name="ward" required defaultValue=""><option value="" disabled>区を選択</option>{tokyoWards.map(ward => <option key={ward}>{ward}</option>)}</select></label><label>最寄り駅（必須）<input name="station" placeholder="例：新宿駅" required maxLength={200} /></label><label>路線（必須）<input name="line" placeholder="例：JR山手線" required maxLength={200} /></label></div>
            <label>希望施設（任意）<input name="venue" placeholder="例：駅近くの喫茶店名。未定の場合は空欄で構いません" maxLength={200} /></label>
            {slot?.bufferBlocked ? <p className="form-error" role="alert">前後1時間に別の予定があるため、この枠は予約できません。場所によっては調整できる場合がありますので、日時・場所の相談をご利用ください。</p> : null}
            <label className="counseling-consent"><input type="checkbox" checked={inquiry} onChange={e => setInquiry(e.target.checked)} />日時・場所について相談する（予約枠は確保されません）</label>
            {inquiry ? <label>ご希望の日時・場所（必須）<textarea name="preference" required maxLength={2000} placeholder="例：来月の平日午後、東京都新宿区の駅周辺。複数候補や時間帯をお知らせください。" /></label> : null}
          </> : null}
          {mode !== "email" && !inquiry ? <p><strong>{slot ? `${tarotDateTime(slot.start)}–${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(slot.end))}` : "カレンダーから1枠お選びください。"}</strong></p> : null}
          <div className="platform-grid two"><label>お名前・ニックネーム（必須）<input name="name" autoComplete="name" required maxLength={120} /></label><label>メールアドレス（必須）<input name="email" type="email" autoComplete="email" required maxLength={254} /></label></div>
          <label className="tarot-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <TarotTerms email={mode === "email"} />
          <label className="counseling-consent"><input type="checkbox" name="consent" required /><span>上記の条件、<a href="/terms" target="_blank" rel="noreferrer">利用規約</a>・<a href="/privacy" target="_blank" rel="noreferrer">プライバシーポリシー</a>を確認しました。</span></label>
          {message ? <p className="form-error" role="alert">{message}</p> : null}
          <button className="button primary" disabled={sending || loading || !data?.enabled || (mode !== "email" && !inquiry && (!slot || slot.bufferBlocked))}>{sending ? "送信中…" : inquiry ? "日時・場所の相談を送信" : "申し込みを送信"}</button>
          <p className="platform-note">この画面では決済されません。お申し込み後、Leoからお支払い方法をご案内します。</p>
        </form>
      </>}
    </div></section>
  </>;
}

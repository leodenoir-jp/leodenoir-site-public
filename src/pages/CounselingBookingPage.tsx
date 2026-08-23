import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { Route } from "../App";
import { Seo } from "../components/Seo";

type CounselingSlot = {
  id: string;
  start: string;
  end: string;
  timezone: string;
};

type WeeklyRule = {
  enabled: boolean;
  start: string;
  end: string;
};

type DateOverride = WeeklyRule & {
  date: string;
};

type CounselingSettings = {
  timezone: string;
  lead_hours: number;
  horizon_days: number;
  daily_limit: number;
  weekly_rules: Record<string, WeeklyRule>;
  date_overrides: DateOverride[];
  public_guidance: string;
  provisional_template: string;
  payment_template: string;
  confirmation_template: string;
  reminder_template: string;
  cancellation_template: string;
};

type CounselingClient = {
  id: string;
  client_id: string;
  email: string;
  display_name: string;
  zoom_link: string | null;
};

type CounselingAppointment = {
  id: string;
  booking_id: string;
  starts_at: string;
  session_ends_at: string;
  reserved_until: string;
  timezone: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "counselor_cancelled";
  payment_method: "PayPal" | "PayPay" | null;
  payment_link: string | null;
  paid_at: string | null;
  payment_sent_at: string | null;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
  cancellation_reason: string | null;
  counseling_clients: CounselingClient;
};

type CalendarReservation = {
  starts_at: string;
  ends_at: string;
  source_type: "learning" | "counseling";
  source_id: string;
  status: "active" | "cancelled";
};

type CounselingAdminData = {
  settings: CounselingSettings;
  appointments: CounselingAppointment[];
  slots: CounselingSlot[];
  reservations: CalendarReservation[];
};

type CounselingAdminTab = "appointments" | "schedule" | "guidance";

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
const counselingAdminSessionKey = "ldn-counseling-admin-session";
const counselingAdminLoginEmail = "yu.leobiz001@outlook.com";
const mockCounselingAdminToken = "mock-counseling-admin";
const fallbackPublicGuidance = `当セッションはカウンセリングを中心に、対話を通して不安やお悩みの背景を整理し、ストレスの緩和や解決に近づくための方向性を一緒に考えます。必要に応じて、言語化の補助としてタロットカードを使用します。

大切にしていること
・今抱えている悩みの本質を一緒に辿ること
・相談者さま自身の可能性を引き出すこと
・これからどう進むかを整理すること

「少し耳が痛いことでも、きちんと知りたい」「自分の人生を前に進めたい」という方に向いたセッションです。

【ご予約前のご案内】
・1時間以上をご希望の場合は、まず1枠をご予約のうえ、仮確定メールへの返信でご希望時間をお知らせください
・お支払い方法はPayPalまたはPayPayです`;

export function CounselingBookingPage({ route }: { route: Route }) {
  return route.path === "/counseling/admin"
    ? <CounselorAdminPage />
    : <CounselingPublicPage route={route} />;
}

function createMockAdminData(): CounselingAdminData {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 2);
  futureDate.setHours(14, 0, 0, 0);
  const confirmedDate = new Date();
  confirmedDate.setDate(confirmedDate.getDate() + 5);
  confirmedDate.setHours(10, 30, 0, 0);
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 1);
  pastDate.setHours(19, 0, 0, 0);
  const openDate = new Date();
  openDate.setDate(openDate.getDate() + 1);
  openDate.setHours(11, 0, 0, 0);
  const openDateSecond = new Date();
  openDateSecond.setDate(openDateSecond.getDate() + 4);
  openDateSecond.setHours(15, 0, 0, 0);
  const learningDate = new Date();
  learningDate.setDate(learningDate.getDate() + 3);
  learningDate.setHours(16, 0, 0, 0);
  const appointment = (id: string, bookingId: string, startsAt: Date, status: CounselingAppointment["status"], client: CounselingClient): CounselingAppointment => ({
    id,
    booking_id: bookingId,
    starts_at: startsAt.toISOString(),
    session_ends_at: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
    reserved_until: new Date(startsAt.getTime() + 80 * 60_000).toISOString(),
    timezone: "Asia/Tokyo",
    status,
    payment_method: status === "pending_payment" ? null : "PayPal",
    payment_link: status === "pending_payment" ? "" : "https://example.com/paypal-demo",
    paid_at: status === "confirmed" ? new Date().toISOString() : null,
    payment_sent_at: status === "pending_payment" ? null : new Date().toISOString(),
    confirmation_sent_at: status === "confirmed" ? new Date().toISOString() : null,
    reminder_sent_at: null,
    cancellation_reason: null,
    counseling_clients: client
  });
  const appointments = [
    appointment("mock-1", "CS-1001", futureDate, "pending_payment", {
      id: "mock-client-1",
      client_id: "CL-2401",
      email: "client01@example.com",
      display_name: "サンプル相談者A",
      zoom_link: ""
    }),
    appointment("mock-2", "CS-1002", confirmedDate, "confirmed", {
      id: "mock-client-2",
      client_id: "CL-2402",
      email: "client02@example.com",
      display_name: "サンプル相談者B",
      zoom_link: "https://zoom.us/j/0000000000"
    }),
    appointment("mock-3", "CS-1003", pastDate, "confirmed", {
      id: "mock-client-3",
      client_id: "CL-2403",
      email: "client03@example.com",
      display_name: "サンプル相談者C",
      zoom_link: "https://zoom.us/j/1111111111"
    })
  ];

  return {
    settings: {
      timezone: "Asia/Tokyo",
      lead_hours: 18,
      horizon_days: 14,
      daily_limit: 3,
      weekly_rules: Object.fromEntries(weekdayLabels.map((_, day) => [String(day), {
        enabled: day >= 1 && day <= 5,
        start: "10:00",
        end: "18:00"
      }])) as Record<string, WeeklyRule>,
      date_overrides: [
        { date: toLocalDateKey(futureDate), enabled: true, start: "13:00", end: "20:00" },
        { date: toLocalDateKey(confirmedDate), enabled: false, start: "10:00", end: "18:00" }
      ],
      public_guidance: fallbackPublicGuidance,
      provisional_template: "{{name}} 様\n\n個別カウンセリングの日程を仮確定しました。\n予約ID：{{bookingId}}\n日時：{{dateTime}}\n\nお支払い方法とZoomリンクは確認後にメールでご案内します。",
      payment_template: "{{name}} 様\n\n個別カウンセリングのお支払い方法とZoomリンクをご案内します。\n決済方法：{{paymentMethod}}\n決済リンク：{{paymentLink}}\nZoomリンク：{{zoomLink}}",
      confirmation_template: "{{name}} 様\n\nご入金を確認し、個別カウンセリングの予約が確定しました。\n予約ID：{{bookingId}}\n日時：{{dateTime}}\nZoomリンク：{{zoomLink}}",
      reminder_template: "{{name}} 様\n\n個別カウンセリング開始18時間前のリマインドです。\n予約ID：{{bookingId}}\n日時：{{dateTime}}\nZoomリンク：{{zoomLink}}",
      cancellation_template: "{{name}} 様\n\nカウンセラー都合により、以下の予約をキャンセルさせていただきました。\n予約ID：{{bookingId}}\n日時：{{dateTime}}\n理由：{{cancellationReason}}"
    },
    appointments,
    slots: [
      { id: "mock-open-1", start: openDate.toISOString(), end: new Date(openDate.getTime() + 50 * 60_000).toISOString(), timezone: "Asia/Tokyo" },
      { id: "mock-open-2", start: openDateSecond.toISOString(), end: new Date(openDateSecond.getTime() + 50 * 60_000).toISOString(), timezone: "Asia/Tokyo" }
    ],
    reservations: [
      { starts_at: futureDate.toISOString(), ends_at: new Date(futureDate.getTime() + 80 * 60_000).toISOString(), source_type: "counseling", source_id: "CS-1001", status: "active" },
      { starts_at: confirmedDate.toISOString(), ends_at: new Date(confirmedDate.getTime() + 80 * 60_000).toISOString(), source_type: "counseling", source_id: "CS-1002", status: "active" },
      { starts_at: pastDate.toISOString(), ends_at: new Date(pastDate.getTime() + 80 * 60_000).toISOString(), source_type: "counseling", source_id: "CS-1003", status: "active" },
      { starts_at: learningDate.toISOString(), ends_at: new Date(learningDate.getTime() + 50 * 60_000).toISOString(), source_type: "learning", source_id: "BR-LEARNING-001", status: "active" }
    ]
  };
}

function CounselingPublicPage({ route }: { route: Route }) {
  const [slots, setSlots] = useState<CounselingSlot[]>([]);
  const [guidance, setGuidance] = useState(fallbackPublicGuidance);
  const [selectedSlot, setSelectedSlot] = useState<CounselingSlot | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [form, setForm] = useState({ name: "", email: "", policyAccepted: false });
  const [status, setStatus] = useState<"idle" | "loading" | "sending" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const loadAvailability = async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/counseling?mode=availability", { headers: { Accept: "application/json" } });
      const body = await readJsonResponse<{ slots?: CounselingSlot[]; guidance?: string; message?: string }>(response);
      if (!response.ok) throw new Error(body.message || "空き枠を取得できませんでした。");
      const nextSlots = body.slots ?? [];
      setSlots(nextSlots);
      setGuidance(body.guidance ?? "");
      if (nextSlots[0]) setMonth(new Date(nextSlots[0].start));
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "空き枠を取得できませんでした。");
      setStatus("error");
    }
  };

  useEffect(() => {
    void loadAvailability();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSlot || !form.name.trim() || !form.email.trim() || !form.policyAccepted) {
      setMessage("日時、氏名、メールアドレス、キャンセルポリシーへの同意をご確認ください。");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/counseling", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "request", name: form.name, email: form.email, start: selectedSlot.start })
      });
      const body = await readJsonResponse<{ bookingId?: string; mailWarning?: boolean; message?: string }>(response);
      if (!response.ok) throw new Error(body.message || "予約希望を送信できませんでした。");
      setStatus("success");
      setMessage(body.mailWarning
        ? `予約希望を受け付けました（予約ID：${body.bookingId}）。メールの到着に時間がかかる場合があります。`
        : `予約希望を受け付けました（予約ID：${body.bookingId}）。日程仮確定メールをご確認ください。`);
      setSelectedSlot(null);
      setForm({ name: "", email: "", policyAccepted: false });
      await loadAvailability();
      setStatus("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予約希望を送信できませんでした。");
      setStatus("error");
    }
  };

  return (
    <>
      <Seo title="個別カウンセリング予約" description="Leo de Noirの個別カウンセリング予約ページです。空き枠から希望日時をお選びいただけます。" />
      <section className="page-hero counseling-hero">
        <div className="container two-column">
          <div>
            <p className="eyebrow">Personal Counseling</p>
            <h1>個別カウンセリング予約</h1>
            <p>誰にも話せなかった想いを、安心できる場所で。対話を通して思考をほどき、次の一歩を一緒に整理します。</p>
          </div>
          <img src="/images/service_personal-counseling.png" alt="個別カウンセリングのイメージ" />
        </div>
      </section>

      <section className="section counseling-booking-section">
        <div className="container counseling-booking-layout">
          <div className="platform-card counseling-guidance">
            <h2>ご予約前にお読みください</h2>
            {guidance.split("\n").map((line, index) => line ? <p key={`${line}-${index}`}>{line}</p> : <br key={`space-${index}`} />)}
            <p className="counseling-policy-box">
              <strong>キャンセルポリシー</strong><br />
              決済完了後、または開始12時間前を過ぎてからの相談者さま都合によるキャンセルは返金対象外です。開始12時間前までのキャンセルは返金可能です。返金をご希望の場合は、振込先情報または支払いコードを予約メールへの返信でお知らせください。
            </p>
          </div>

          <div className="platform-card counseling-calendar-card">
            <p className="eyebrow">Select a date</p>
            <h2>希望日時を選択</h2>
            <p className="platform-muted">表示時刻は日本時間（JST）です。1回50分のセッション後、30分の調整時間を確保します。</p>
            {status === "loading" ? <p>空き枠を読み込んでいます。</p> : null}
            <CounselingCalendar month={month} setMonth={setMonth} slots={slots} selectedSlot={selectedSlot} onSelect={setSelectedSlot} />
            {slots.length === 0 && status !== "loading" ? (
              <p className="platform-note">現在公開中の新規予約枠はありません。リピーターの方はメールでご連絡ください。</p>
            ) : null}
          </div>

          <form className="platform-card platform-form counseling-request-form" onSubmit={submit}>
            <p className="eyebrow">Booking Request</p>
            <h2>予約内容を送信</h2>
            <label>
              選択日時
              <input value={selectedSlot ? formatDateTime(selectedSlot.start) : "カレンダーから日時を選択してください"} readOnly />
            </label>
            <label>
              お名前 <span className="required-label">必須</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" required />
            </label>
            <label>
              メールアドレス <span className="required-label">必須</span>
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
            </label>
            <label className="counseling-consent">
              <input type="checkbox" checked={form.policyAccepted} onChange={(event) => setForm({ ...form, policyAccepted: event.target.checked })} required />
              <span>キャンセルポリシーと予約前の案内を確認し、同意します。</span>
            </label>
            {message ? <p className={status === "success" ? "form-success" : "form-error"}>{message}</p> : null}
            <button className="button primary" type="submit" disabled={!selectedSlot || status === "sending"}>
              {status === "sending" ? "送信中..." : "予約希望を送信"}
            </button>
            <button className="button secondary" type="button" onClick={() => route.navigate("/services/personal-counseling")}>サービス詳細へ戻る</button>
          </form>
        </div>
      </section>
    </>
  );
}

function CounselingCalendar({
  month,
  setMonth,
  slots,
  selectedSlot,
  onSelect
}: {
  month: Date;
  setMonth: (value: Date) => void;
  slots: CounselingSlot[];
  selectedSlot: CounselingSlot | null;
  onSelect: (value: CounselingSlot) => void;
}) {
  const cells = useMemo(() => getMonthCells(month), [month]);
  return (
    <div className="booking-calendar counseling-calendar">
      <div className="calendar-toolbar">
        <button type="button" aria-label="前の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <strong>{month.getFullYear()}年 {month.getMonth() + 1}月</strong>
        <button type="button" aria-label="次の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="calendar-weekdays">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((date, index) => {
          if (!date) return <div className="calendar-cell blank" key={`blank-${index}`} />;
          const key = toLocalDateKey(date);
          const daySlots = slots.filter((slot) => toJstDateKey(slot.start) === key);
          return (
            <div className="calendar-cell" key={key}>
              <span className="calendar-date">{date.getDate()}</span>
              {daySlots.map((slot) => (
                <button
                  className={`calendar-booking available${selectedSlot?.id === slot.id ? " selected" : ""}`}
                  key={slot.id}
                  type="button"
                  onClick={() => onSelect(slot)}
                >
                  {formatTime(slot.start)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CounselorAdminPage() {
  const [sessionToken, setSessionToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [loginEmail, setLoginEmail] = useState(counselingAdminLoginEmail);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<CounselingAdminTab>("appointments");
  const [adminCalendarMonth, setAdminCalendarMonth] = useState(() => new Date());
  const [settings, setSettings] = useState<CounselingSettings | null>(null);
  const [appointments, setAppointments] = useState<CounselingAppointment[]>([]);
  const [adminSlots, setAdminSlots] = useState<CounselingSlot[]>([]);
  const [reservations, setReservations] = useState<CalendarReservation[]>([]);
  const [overrideDraft, setOverrideDraft] = useState<DateOverride>({ date: "", enabled: true, start: "10:00", end: "18:00" });
  const [detailDrafts, setDetailDrafts] = useState<Record<string, { zoomLink: string; paymentMethod: "PayPal" | "PayPay"; paymentLink: string; cancellationReason: string }>>({});

  const setAdminData = (body: CounselingAdminData) => {
    setSettings(body.settings);
    setAppointments(body.appointments);
    setAdminSlots(body.slots);
    setReservations(body.reservations);
    setDetailDrafts(Object.fromEntries(body.appointments.map((appointment) => [appointment.id, {
      zoomLink: appointment.counseling_clients.zoom_link ?? "",
      paymentMethod: appointment.payment_method ?? "PayPal",
      paymentLink: appointment.payment_link ?? "",
      cancellationReason: appointment.cancellation_reason ?? ""
    }])));
  };

  const loadAdmin = async (token: string) => {
    if (token === mockCounselingAdminToken) {
      setAdminData(createMockAdminData());
      return;
    }
    const [response, availabilityResponse, occupancyResponse] = await Promise.all([
      fetch("/api/counseling?mode=admin", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }),
      fetch("/api/counseling?mode=availability", { headers: { Accept: "application/json" } }),
      fetch("/api/counseling?mode=occupancy", { headers: { Accept: "application/json" } })
    ]);
    if (!response.ok) throw new Error(response.status === 401 ? "このアカウントでは管理画面を利用できません。" : "管理データを取得できませんでした。");
    const body = await readJsonResponse<{ settings: CounselingSettings; appointments: CounselingAppointment[] }>(response);
    const availabilityBody = availabilityResponse.ok ? await readJsonResponse<{ slots?: CounselingSlot[] }>(availabilityResponse) : { slots: [] };
    const occupancyBody = occupancyResponse.ok ? await readJsonResponse<{ reservations?: CalendarReservation[] }>(occupancyResponse) : { reservations: [] };
    setAdminData({
      settings: body.settings,
      appointments: body.appointments,
      slots: availabilityBody.slots ?? [],
      reservations: occupancyBody.reservations ?? []
    });
  };

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      const token = window.sessionStorage.getItem(counselingAdminSessionKey) ?? "";
      if (!mounted) return;
      setSessionToken(token);
      if (token) {
        try {
          await loadAdmin(token);
        } catch (error) {
          window.sessionStorage.removeItem(counselingAdminSessionKey);
          setSessionToken("");
          setMessage(error instanceof Error ? error.message : "管理データを取得できませんでした。");
        }
      }
      setLoading(false);
    };
    void resolve();
    return () => { mounted = false; };
  }, []);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/counseling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "admin-login", email: loginEmail, password: loginPassword })
      });
      const body = await readJsonResponse<{ token?: string; message?: string }>(response);
      if (!response.ok || !body.token) {
        setMessage(body.message || "IDまたはパスワードが一致しません。");
        return;
      }
      window.sessionStorage.setItem(counselingAdminSessionKey, body.token);
      setSessionToken(body.token);
      setLoginPassword("");
      await loadAdmin(body.token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ログインできませんでした。");
    } finally {
      setLoginBusy(false);
    }
  };

  const showMockAdmin = () => {
    window.sessionStorage.setItem(counselingAdminSessionKey, mockCounselingAdminToken);
    setSessionToken(mockCounselingAdminToken);
    setAdminData(createMockAdminData());
    setMessage("モック表示中です。保存・送信ボタンは実際のDB更新やメール送信を行いません。");
  };

  const adminAction = async (payload: Record<string, unknown>, successMessage: string) => {
    if (sessionToken === mockCounselingAdminToken) {
      void payload;
      setMessage(`モック表示中です。実際の保存・送信は行わず、操作だけ確認しています。`);
      return true;
    }
    setMessage("処理中...");
    const response = await fetch("/api/counseling", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify(payload)
    });
    const body = await readJsonResponse<{ message?: string }>(response);
    if (!response.ok) {
      setMessage(body.message || "処理できませんでした。");
      return false;
    }
    setMessage(successMessage);
    await loadAdmin(sessionToken);
    return true;
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    await adminAction({
      action: "save-settings",
      leadHours: settings.lead_hours,
      horizonDays: settings.horizon_days,
      dailyLimit: settings.daily_limit,
      weeklyRules: settings.weekly_rules,
      dateOverrides: settings.date_overrides,
      publicGuidance: settings.public_guidance,
      provisionalTemplate: settings.provisional_template,
      paymentTemplate: settings.payment_template,
      confirmationTemplate: settings.confirmation_template,
      reminderTemplate: settings.reminder_template,
      cancellationTemplate: settings.cancellation_template
    }, "予約設定と案内文を保存しました。");
  };

  if (loading) return <section className="section"><div className="container"><p>管理画面を確認しています。</p></div></section>;
  if (!sessionToken || !settings) {
    return (
      <>
        <Seo title="カウンセラー専用管理" description="個別カウンセリングの予約管理画面です。" noIndex />
        <section className="section counseling-admin-login">
          <div className="container">
            <form className="platform-card platform-form login-card" onSubmit={signIn}>
              <p className="eyebrow">Counselor only</p>
              <h1>個別カウンセリング管理</h1>
              <p>カウンセラー専用IDとパスワードでログインしてください。</p>
              <label>
                ID
                <input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder={counselingAdminLoginEmail} autoComplete="username" required />
              </label>
              <label>
                Password
                <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Password" autoComplete="current-password" required />
              </label>
              {message ? <p className="form-error">{message}</p> : null}
              <button className="button primary" type="submit" disabled={loginBusy}>{loginBusy ? "ログイン中..." : "ログイン"}</button>
              <button className="button secondary" type="button" onClick={showMockAdmin}>モックで管理画面を見る</button>
            </form>
          </div>
        </section>
      </>
    );
  }

  const updateRule = (day: number, next: Partial<WeeklyRule>) => setSettings({
    ...settings,
    weekly_rules: { ...settings.weekly_rules, [String(day)]: { ...settings.weekly_rules[String(day)], ...next } }
  });
  const addOverride = () => {
    if (!overrideDraft.date) return;
    setSettings({ ...settings, date_overrides: [...settings.date_overrides.filter((item) => item.date !== overrideDraft.date), overrideDraft].sort((a, b) => a.date.localeCompare(b.date)) });
    setOverrideDraft({ ...overrideDraft, date: "" });
  };

  return (
    <>
      <Seo title="カウンセラー専用管理" description="個別カウンセリングの予約管理画面です。" noIndex />
      <section className="page-hero counseling-admin-hero"><div className="container"><p className="eyebrow">Counselor only</p><h1>個別カウンセリング管理</h1><p>予約、決済、Zoomリンク、公開枠、案内文を一か所で管理します。</p></div></section>
      <section className="section platform-section">
        <div className="container platform-stack counseling-admin-stack">
          {message ? <p className={message.includes("できません") ? "form-error" : "form-success"}>{message}</p> : null}

          <nav className="counseling-admin-tabs" aria-label="カウンセラー管理メニュー">
            {[
              ["appointments", "予約一覧"],
              ["schedule", "スケジュール登録"],
              ["guidance", "案内文"]
            ].map(([tab, label]) => (
              <button
                className={activeAdminTab === tab ? "active" : ""}
                key={tab}
                type="button"
                onClick={() => setActiveAdminTab(tab as CounselingAdminTab)}
              >
                {label}
              </button>
            ))}
          </nav>

          {activeAdminTab === "appointments" ? (
          <section className="platform-card">
            <h2>予約一覧</h2>
            <CounselingAdminCalendar
              appointments={appointments}
              month={adminCalendarMonth}
              reservations={reservations}
              setMonth={setAdminCalendarMonth}
              slots={adminSlots}
            />
            <div className="counseling-appointment-list">
              {appointments.map((appointment) => {
                const draft = detailDrafts[appointment.id] ?? { zoomLink: "", paymentMethod: "PayPal" as const, paymentLink: "", cancellationReason: "" };
                return (
                  <article className={`counseling-appointment ${appointment.status}`} key={appointment.id}>
                    <div className="counseling-appointment-head">
                      <div><strong>{appointment.booking_id}</strong><span>{formatDateTime(appointment.starts_at)}</span></div>
                      <span className="status-badge">{formatStatus(appointment.status)}</span>
                    </div>
                    <p>{appointment.counseling_clients.display_name} / {appointment.counseling_clients.email} / {appointment.counseling_clients.client_id}</p>
                    <div className="platform-grid three">
                      <label>Zoomリンク<input type="url" value={draft.zoomLink} onChange={(event) => setDetailDrafts({ ...detailDrafts, [appointment.id]: { ...draft, zoomLink: event.target.value } })} /></label>
                      <label>決済方法<select value={draft.paymentMethod} onChange={(event) => setDetailDrafts({ ...detailDrafts, [appointment.id]: { ...draft, paymentMethod: event.target.value as "PayPal" | "PayPay" } })}><option>PayPal</option><option>PayPay</option></select></label>
                      <label>決済リンク<input type="url" value={draft.paymentLink} onChange={(event) => setDetailDrafts({ ...detailDrafts, [appointment.id]: { ...draft, paymentLink: event.target.value } })} /></label>
                    </div>
                    <div className="button-row compact">
                      <button className="button secondary" type="button" onClick={() => void adminAction({ action: "save-details", appointmentId: appointment.id, ...draft }, "Zoomリンクと決済情報を保存しました。")}>情報を保存</button>
                      <button className="button secondary" type="button" onClick={() => void adminAction({ action: "send-payment", appointmentId: appointment.id }, "決済方法とZoomリンクを送信しました。")}>決済案内を送信</button>
                      <button className="button primary" type="button" onClick={() => void adminAction({ action: "mark-paid", appointmentId: appointment.id }, "予約を確定し、クライエントへ通知しました。")}>決済完了</button>
                    </div>
                    <div className="counseling-cancel-control">
                      <label>カウンセラー都合のキャンセル理由<input value={draft.cancellationReason} onChange={(event) => setDetailDrafts({ ...detailDrafts, [appointment.id]: { ...draft, cancellationReason: event.target.value } })} /></label>
                      <button className="button secondary" type="button" onClick={() => void adminAction({ action: "cancel", appointmentId: appointment.id, reason: draft.cancellationReason }, "予約をキャンセルし、クライエントへ通知しました。")}>予約をキャンセル</button>
                    </div>
                  </article>
                );
              })}
              {appointments.length === 0 ? <p className="platform-muted">予約はまだありません。</p> : null}
            </div>
          </section>
          ) : null}

          {activeAdminTab === "schedule" ? (
          <form className="platform-card platform-form" onSubmit={saveSettings}>
            <h2>スケジュール登録</h2>
            <div className="platform-grid three">
              <label>何時間後から表示するか<input type="number" min="0" step="1" value={settings.lead_hours} onChange={(event) => setSettings({ ...settings, lead_hours: Number(event.target.value) })} /></label>
              <label>候補を表示する日数<input type="number" min="1" max="120" value={settings.horizon_days} onChange={(event) => setSettings({ ...settings, horizon_days: Number(event.target.value) })} /></label>
              <label>1日の予約上限<input type="number" min="1" max="30" value={settings.daily_limit} onChange={(event) => setSettings({ ...settings, daily_limit: Number(event.target.value) })} /></label>
            </div>
            <div className="counseling-weekly-grid">
              {weekdayLabels.map((label, day) => {
                const rule = settings.weekly_rules[String(day)];
                return (
                  <div className="counseling-weekly-row" key={label}>
                    <label className="counseling-consent"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(day, { enabled: event.target.checked })} /><span>{label}曜日</span></label>
                    <input type="time" step="1800" value={rule.start} onChange={(event) => updateRule(day, { start: event.target.value })} disabled={!rule.enabled} aria-label={`${label}曜日の開始時刻`} />
                    <input type="time" step="1800" value={rule.end} onChange={(event) => updateRule(day, { end: event.target.value })} disabled={!rule.enabled} aria-label={`${label}曜日の終了時刻`} />
                  </div>
                );
              })}
            </div>

            <h3>日付ごとの例外設定</h3>
            <div className="platform-grid four counseling-override-editor">
              <label>日付<input type="date" value={overrideDraft.date} onChange={(event) => setOverrideDraft({ ...overrideDraft, date: event.target.value })} /></label>
              <label className="counseling-consent"><input type="checkbox" checked={overrideDraft.enabled} onChange={(event) => setOverrideDraft({ ...overrideDraft, enabled: event.target.checked })} /><span>予約を受け付ける</span></label>
              <label>開始<input type="time" step="1800" value={overrideDraft.start} onChange={(event) => setOverrideDraft({ ...overrideDraft, start: event.target.value })} disabled={!overrideDraft.enabled} /></label>
              <label>終了<input type="time" step="1800" value={overrideDraft.end} onChange={(event) => setOverrideDraft({ ...overrideDraft, end: event.target.value })} disabled={!overrideDraft.enabled} /></label>
            </div>
            <button className="button secondary" type="button" onClick={addOverride}>例外日を追加</button>
            <div className="counseling-override-list">
              {settings.date_overrides.map((override) => <span key={override.date}>{override.date} / {override.enabled ? `${override.start}〜${override.end}` : "受付停止"}<button type="button" aria-label={`${override.date}を削除`} onClick={() => setSettings({ ...settings, date_overrides: settings.date_overrides.filter((item) => item.date !== override.date) })}>×</button></span>)}
            </div>
            <button className="button primary" type="submit">スケジュール設定を保存</button>
          </form>
          ) : null}

          {activeAdminTab === "guidance" ? (
          <form className="platform-card platform-form" onSubmit={saveSettings}>
            <h2>公開案内文・自動送信文</h2>
            <p className="platform-note">テンプレートでは {"{{name}}、{{bookingId}}、{{dateTime}}、{{paymentMethod}}、{{paymentLink}}、{{zoomLink}}、{{cancellationReason}}"} を使用できます。</p>
            <TemplateEditor label="予約ページ案内文" value={settings.public_guidance} onChange={(value) => setSettings({ ...settings, public_guidance: value })} />
            <TemplateEditor label="日程仮確定メール" value={settings.provisional_template} onChange={(value) => setSettings({ ...settings, provisional_template: value })} />
            <TemplateEditor label="決済方法・Zoomリンク案内メール" value={settings.payment_template} onChange={(value) => setSettings({ ...settings, payment_template: value })} />
            <TemplateEditor label="予約確定メール" value={settings.confirmation_template} onChange={(value) => setSettings({ ...settings, confirmation_template: value })} />
            <TemplateEditor label="18時間前リマインドメール" value={settings.reminder_template} onChange={(value) => setSettings({ ...settings, reminder_template: value })} />
            <TemplateEditor label="カウンセラー都合キャンセルメール" value={settings.cancellation_template} onChange={(value) => setSettings({ ...settings, cancellation_template: value })} />
            <button className="button primary" type="submit">案内文を保存</button>
          </form>
          ) : null}
        </div>
      </section>
    </>
  );
}

function CounselingAdminCalendar({
  appointments,
  month,
  reservations,
  setMonth,
  slots
}: {
  appointments: CounselingAppointment[];
  month: Date;
  reservations: CalendarReservation[];
  setMonth: (value: Date) => void;
  slots: CounselingSlot[];
}) {
  const cells = useMemo(() => getMonthCells(month), [month]);
  const activeReservations = reservations.filter((reservation) => reservation.status === "active");
  const appointmentByBookingId = new Map(appointments.map((appointment) => [appointment.booking_id, appointment]));

  return (
    <div className="booking-calendar counseling-admin-calendar">
      <div className="calendar-toolbar">
        <button type="button" aria-label="前の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>&lt;</button>
        <strong>{month.getFullYear()}年 {month.getMonth() + 1}月</strong>
        <button type="button" aria-label="次の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>&gt;</button>
      </div>
      <div className="counseling-calendar-legend" aria-label="表示分類">
        <span><i className="available" />空き枠</span>
        <span><i className="counseling" />カウンセリング予約済</span>
        <span><i className="learning" />Learning予約済</span>
      </div>
      <div className="calendar-weekdays">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((date, index) => {
          if (!date) return <div className="calendar-cell blank" key={`blank-${index}`} />;
          const key = toLocalDateKey(date);
          const daySlots = slots.filter((slot) => toJstDateKey(slot.start) === key);
          const dayReservations = activeReservations.filter((reservation) => toJstDateKey(reservation.starts_at) === key);
          return (
            <div className="calendar-cell" key={key}>
              <span className="calendar-date">{date.getDate()}</span>
              {daySlots.map((slot) => (
                <span className="calendar-booking available" key={`slot-${slot.id}`} aria-label={`空き枠 ${formatTime(slot.start)}から${formatTime(slot.end)}`} title="空き枠">
                  {formatTime(slot.start)}-{formatTime(slot.end)}
                </span>
              ))}
              {dayReservations.map((reservation) => {
                const appointment = appointmentByBookingId.get(reservation.source_id);
                const label = reservation.source_type === "learning"
                  ? "Learning予約済"
                  : `カウンセリング予約済${appointment ? ` / ${appointment.counseling_clients.display_name}` : ""}`;
                return (
                  <span className={`calendar-booking ${reservation.source_type === "learning" ? "learning-reserved" : "counseling-reserved"}`} key={`${reservation.source_type}-${reservation.source_id}`} aria-label={`${label} ${formatTime(reservation.starts_at)}から${formatTime(reservation.ends_at)}`} title={label}>
                    {formatTime(reservation.starts_at)}-{formatTime(reservation.ends_at)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TemplateEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<textarea rows={10} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function getMonthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return [...Array<Date | null>(first.getDay()).fill(null), ...Array.from({ length: last.getDate() }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
}

function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toJstDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatStatus(status: CounselingAppointment["status"]) {
  return { pending_payment: "仮確定・決済待ち", confirmed: "予約確定", cancelled: "キャンセル", counselor_cancelled: "カウンセラー都合キャンセル" }[status];
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("予約情報を読み込めませんでした。時間をおいて再度お試しください。");
  return response.json() as Promise<T>;
}

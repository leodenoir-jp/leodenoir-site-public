import {
  appointmentTemplateValues,
  assertCounselor,
  cleanText,
  counselorEmail,
  createCounselingAdminSession,
  createServiceClient,
  defaultSettings,
  formatJstDateTime,
  getBearerToken,
  normalizeBody,
  renderTemplate,
  sendCounselingEmail,
  type CounselingSettings,
  type DateOverride,
  type WeeklyRule
} from "./_lib/counseling";

declare const process: {
  env: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
};

type Reservation = {
  starts_at: string;
  ends_at: string;
  source_type: "learning" | "counseling";
  source_id: string;
  status: "active" | "cancelled";
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sessionMinutes = 50;
const reservedMinutes = 80;

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function dateKeyInJst(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`);
}

function addDaysToKey(dateKey: string, days: number) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyInJst(date);
}

function overlaps(start: string, end: string, reservation: Reservation) {
  return new Date(start).getTime() < new Date(reservation.ends_at).getTime()
    && new Date(end).getTime() > new Date(reservation.starts_at).getTime();
}

function normalizeSettings(record: Record<string, unknown> | null): CounselingSettings {
  const fallback = defaultSettings();
  if (!record) return fallback;
  return {
    timezone: cleanText(record.timezone) || fallback.timezone,
    lead_hours: Number(record.lead_hours ?? fallback.lead_hours),
    horizon_days: Number(record.horizon_days ?? fallback.horizon_days),
    daily_limit: Number(record.daily_limit ?? fallback.daily_limit),
    weekly_rules: record.weekly_rules as Record<string, WeeklyRule> || fallback.weekly_rules,
    date_overrides: Array.isArray(record.date_overrides) ? record.date_overrides as DateOverride[] : [],
    public_guidance: cleanText(record.public_guidance) || fallback.public_guidance,
    provisional_template: cleanText(record.provisional_template) || fallback.provisional_template,
    payment_template: cleanText(record.payment_template) || fallback.payment_template,
    confirmation_template: cleanText(record.confirmation_template) || fallback.confirmation_template,
    reminder_template: cleanText(record.reminder_template) || fallback.reminder_template,
    cancellation_template: cleanText(record.cancellation_template) || fallback.cancellation_template
  };
}

async function loadSettings(serviceClient: Awaited<ReturnType<typeof createServiceClient>>) {
  const { data, error } = await serviceClient.from("counseling_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  return normalizeSettings(data as Record<string, unknown> | null);
}

async function loadReservations(serviceClient: Awaited<ReturnType<typeof createServiceClient>>) {
  const { data, error } = await serviceClient
    .from("calendar_reservations")
    .select("starts_at,ends_at,source_type,source_id,status")
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as Reservation[];
}

async function buildAvailability(serviceClient: Awaited<ReturnType<typeof createServiceClient>>) {
  const [settings, reservations] = await Promise.all([loadSettings(serviceClient), loadReservations(serviceClient)]);
  const now = new Date();
  const earliest = now.getTime() + settings.lead_hours * 3_600_000;
  const today = dateKeyInJst(now);
  const activeCounselingCounts = new Map<string, number>();
  reservations.filter((item) => item.source_type === "counseling").forEach((item) => {
    const key = dateKeyInJst(new Date(item.starts_at));
    activeCounselingCounts.set(key, (activeCounselingCounts.get(key) ?? 0) + 1);
  });

  const slots: Array<{ id: string; start: string; end: string; timezone: string }> = [];
  for (let offset = 0; offset < settings.horizon_days; offset += 1) {
    const date = addDaysToKey(today, offset);
    if ((activeCounselingCounts.get(date) ?? 0) >= settings.daily_limit) continue;
    const override = settings.date_overrides.find((item) => item.date === date);
    const weekday = dateFromKey(date).getDay();
    const rule = override ?? settings.weekly_rules[String(weekday)];
    if (!rule?.enabled) continue;
    const startMinutes = toMinutes(rule.start);
    const endMinutes = toMinutes(rule.end);
    for (let minute = startMinutes; minute + reservedMinutes <= endMinutes; minute += 30) {
      const start = new Date(`${date}T${minutesToTime(minute)}:00+09:00`).toISOString();
      const end = addMinutes(start, reservedMinutes);
      if (new Date(start).getTime() < earliest) continue;
      if (reservations.some((reservation) => overlaps(start, end, reservation))) continue;
      slots.push({ id: `CS-${date}-${minutesToTime(minute).replace(":", "")}`, start, end, timezone: settings.timezone });
    }
  }
  return { settings, slots, reservations };
}

async function findAppointment(serviceClient: Awaited<ReturnType<typeof createServiceClient>>, appointmentId: string) {
  const { data, error } = await serviceClient
    .from("counseling_appointments")
    .select("*, counseling_clients(*)")
    .eq("id", appointmentId)
    .single();
  if (error) throw error;
  return data as Record<string, unknown> & { counseling_clients: Record<string, unknown> };
}

async function handlePublicAvailability(res: ApiResponse) {
  const serviceClient = await createServiceClient();
  const { settings, slots } = await buildAvailability(serviceClient);
  return res.status(200).json({
    guidance: settings.public_guidance,
    timezone: settings.timezone,
    leadHours: settings.lead_hours,
    horizonDays: settings.horizon_days,
    sessionMinutes,
    bufferMinutes: reservedMinutes - sessionMinutes,
    slots
  });
}

async function handleOccupancy(res: ApiResponse) {
  const serviceClient = await createServiceClient();
  const reservations = await loadReservations(serviceClient);
  return res.status(200).json({ reservations });
}

async function handleAdmin(req: ApiRequest, res: ApiResponse) {
  await assertCounselor(getBearerToken(req.headers));
  const serviceClient = await createServiceClient();
  const [settings, appointmentsResult] = await Promise.all([
    loadSettings(serviceClient),
    serviceClient.from("counseling_appointments").select("*, counseling_clients(*)").order("starts_at", { ascending: true })
  ]);
  if (appointmentsResult.error) throw appointmentsResult.error;
  return res.status(200).json({ settings, appointments: appointmentsResult.data ?? [] });
}

async function loginCounselor(body: Record<string, unknown>, res: ApiResponse) {
  const email = cleanText(body.email).toLowerCase();
  const password = cleanText(body.password);
  if (!email || !password) return res.status(400).json({ message: "IDとパスワードを入力してください。" });
  const token = await createCounselingAdminSession(email, password);
  return res.status(200).json({ token });
}

async function createAppointment(body: Record<string, unknown>, res: ApiResponse) {
  const name = cleanText(body.name);
  const email = cleanText(body.email).toLowerCase();
  const start = cleanText(body.start);
  if (!name || !emailPattern.test(email) || !start || Number.isNaN(new Date(start).getTime())) {
    return res.status(400).json({ message: "入力内容を確認してください。" });
  }

  const serviceClient = await createServiceClient();
  const { settings, slots } = await buildAvailability(serviceClient);
  if (!slots.some((slot) => slot.start === new Date(start).toISOString())) {
    return res.status(409).json({ message: "選択した日時は受付できなくなりました。別の日時をお選びください。" });
  }

  const existing = await serviceClient.from("counseling_clients").select("*").eq("email", email).maybeSingle();
  if (existing.error) throw existing.error;
  let client = existing.data as Record<string, unknown> | null;
  if (client) {
    const updated = await serviceClient.from("counseling_clients").update({ display_name: name, updated_at: new Date().toISOString() }).eq("id", client.id).select("*").single();
    if (updated.error) throw updated.error;
    client = updated.data as Record<string, unknown>;
  } else {
    const clientId = `CL-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const inserted = await serviceClient.from("counseling_clients").insert({ client_id: clientId, email, display_name: name }).select("*").single();
    if (inserted.error) throw inserted.error;
    client = inserted.data as Record<string, unknown>;
  }

  const bookingId = `CO-${Date.now().toString(36).toUpperCase()}`;
  const startsAt = new Date(start).toISOString();
  const appointmentInsert = await serviceClient.from("counseling_appointments").insert({
    booking_id: bookingId,
    client_id: client.id,
    starts_at: startsAt,
    session_ends_at: addMinutes(startsAt, sessionMinutes),
    reserved_until: addMinutes(startsAt, reservedMinutes),
    timezone: settings.timezone,
    status: "pending_payment"
  }).select("*").single();
  if (appointmentInsert.error) throw appointmentInsert.error;
  const appointment = appointmentInsert.data as Record<string, unknown>;

  const reservation = await serviceClient.from("calendar_reservations").insert({
    source_type: "counseling",
    source_id: bookingId,
    starts_at: startsAt,
    ends_at: addMinutes(startsAt, reservedMinutes),
    status: "active"
  });
  if (reservation.error) {
    await serviceClient.from("counseling_appointments").delete().eq("id", appointment.id);
    return res.status(409).json({ message: "選択した日時は受付できなくなりました。別の日時をお選びください。" });
  }

  const values = appointmentTemplateValues(appointment, client);
  const clientText = renderTemplate(settings.provisional_template, values);
  const counselorText = [
    "個別カウンセリングの予約希望が届きました。",
    "",
    `予約ID：${bookingId}`,
    `クライエントID：${client.client_id}`,
    `氏名：${name}`,
    `メールアドレス：${email}`,
    `日時：${formatJstDateTime(startsAt)}`,
    "所要時間：50分（後続30分を自動確保）"
  ].join("\n");
  const mailResults = await Promise.allSettled([
    sendCounselingEmail({ to: email, replyTo: counselorEmail, subject: "個別カウンセリングの日程を仮確定しました", text: clientText, idempotencyKey: `counseling-provisional-client-${bookingId}` }),
    sendCounselingEmail({ to: counselorEmail, replyTo: email, subject: "個別カウンセリングの予約希望が届きました", text: counselorText, idempotencyKey: `counseling-provisional-owner-${bookingId}` })
  ]);
  const provisionalSent = mailResults[0].status === "fulfilled";
  await serviceClient.from("counseling_appointments").update({ provisional_sent_at: provisionalSent ? new Date().toISOString() : null }).eq("id", appointment.id);
  return res.status(200).json({ bookingId, clientId: client.client_id, mailWarning: mailResults.some((result) => result.status === "rejected") });
}

async function saveSettings(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertCounselor(getBearerToken(req.headers));
  const serviceClient = await createServiceClient();
  const fallback = defaultSettings();
  const weeklyRules = body.weeklyRules && typeof body.weeklyRules === "object" ? body.weeklyRules : fallback.weekly_rules;
  const dateOverrides = Array.isArray(body.dateOverrides) ? body.dateOverrides : [];
  const payload = {
    id: true,
    timezone: "Asia/Tokyo",
    lead_hours: Math.max(0, Number(body.leadHours ?? 18)),
    horizon_days: Math.min(120, Math.max(1, Number(body.horizonDays ?? 14))),
    daily_limit: Math.min(30, Math.max(1, Number(body.dailyLimit ?? 3))),
    weekly_rules: weeklyRules,
    date_overrides: dateOverrides,
    public_guidance: cleanText(body.publicGuidance) || fallback.public_guidance,
    provisional_template: cleanText(body.provisionalTemplate) || fallback.provisional_template,
    payment_template: cleanText(body.paymentTemplate) || fallback.payment_template,
    confirmation_template: cleanText(body.confirmationTemplate) || fallback.confirmation_template,
    reminder_template: cleanText(body.reminderTemplate) || fallback.reminder_template,
    cancellation_template: cleanText(body.cancellationTemplate) || fallback.cancellation_template,
    updated_at: new Date().toISOString()
  };
  const { error } = await serviceClient.from("counseling_settings").upsert(payload, { onConflict: "id" });
  if (error) throw error;
  return res.status(200).json({ message: "保存しました。" });
}

async function saveAppointmentDetails(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertCounselor(getBearerToken(req.headers));
  const appointmentId = cleanText(body.appointmentId);
  const paymentMethod = cleanText(body.paymentMethod);
  const paymentLink = cleanText(body.paymentLink);
  const zoomLink = cleanText(body.zoomLink);
  if (!appointmentId || !["PayPal", "PayPay"].includes(paymentMethod) || !paymentLink || !zoomLink) {
    return res.status(400).json({ message: "Zoomリンクと決済情報を入力してください。" });
  }
  const serviceClient = await createServiceClient();
  const appointment = await findAppointment(serviceClient, appointmentId);
  const client = appointment.counseling_clients;
  const updates = await Promise.all([
    serviceClient.from("counseling_appointments").update({ payment_method: paymentMethod, payment_link: paymentLink, updated_at: new Date().toISOString() }).eq("id", appointmentId),
    serviceClient.from("counseling_clients").update({ zoom_link: zoomLink, updated_at: new Date().toISOString() }).eq("id", client.id)
  ]);
  if (updates.some((result) => result.error)) throw updates.find((result) => result.error)?.error;
  return res.status(200).json({ message: "登録しました。" });
}

async function sendPaymentGuide(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertCounselor(getBearerToken(req.headers));
  const serviceClient = await createServiceClient();
  const appointment = await findAppointment(serviceClient, cleanText(body.appointmentId));
  const client = appointment.counseling_clients;
  if (!appointment.payment_method || !appointment.payment_link || !client.zoom_link) {
    return res.status(400).json({ message: "先にZoomリンクと決済情報を登録してください。" });
  }
  const settings = await loadSettings(serviceClient);
  const text = renderTemplate(settings.payment_template, appointmentTemplateValues(appointment, client));
  await sendCounselingEmail({ to: String(client.email), replyTo: counselorEmail, subject: "個別カウンセリングのお支払い方法とZoomリンク", text, idempotencyKey: `counseling-payment-${appointment.booking_id}` });
  await serviceClient.from("counseling_appointments").update({ payment_sent_at: new Date().toISOString() }).eq("id", appointment.id);
  return res.status(200).json({ message: "決済案内を送信しました。" });
}

async function markPaid(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertCounselor(getBearerToken(req.headers));
  const serviceClient = await createServiceClient();
  const appointment = await findAppointment(serviceClient, cleanText(body.appointmentId));
  const client = appointment.counseling_clients;
  if (!client.zoom_link) return res.status(400).json({ message: "Zoomリンクを登録してください。" });
  const settings = await loadSettings(serviceClient);
  const text = renderTemplate(settings.confirmation_template, appointmentTemplateValues(appointment, client));
  await sendCounselingEmail({ to: String(client.email), replyTo: counselorEmail, subject: "個別カウンセリングの予約が確定しました", text, idempotencyKey: `counseling-confirmation-${appointment.booking_id}` });
  const now = new Date().toISOString();
  await serviceClient.from("counseling_appointments").update({ status: "confirmed", paid_at: now, confirmation_sent_at: now, updated_at: now }).eq("id", appointment.id);
  return res.status(200).json({ message: "入金確認と予約確定メールの送信が完了しました。" });
}

async function cancelByCounselor(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertCounselor(getBearerToken(req.headers));
  const reason = cleanText(body.reason);
  if (!reason) return res.status(400).json({ message: "キャンセル理由を入力してください。" });
  const serviceClient = await createServiceClient();
  const appointment = await findAppointment(serviceClient, cleanText(body.appointmentId));
  const client = appointment.counseling_clients;
  const settings = await loadSettings(serviceClient);
  appointment.cancellation_reason = reason;
  const text = renderTemplate(settings.cancellation_template, appointmentTemplateValues(appointment, client));
  await sendCounselingEmail({ to: String(client.email), replyTo: counselorEmail, subject: "個別カウンセリングの予約キャンセルについて", text, idempotencyKey: `counseling-cancel-${appointment.booking_id}` });
  const now = new Date().toISOString();
  await Promise.all([
    serviceClient.from("counseling_appointments").update({ status: "counselor_cancelled", cancelled_at: now, cancellation_reason: reason, updated_at: now }).eq("id", appointment.id),
    serviceClient.from("calendar_reservations").update({ status: "cancelled", updated_at: now }).eq("source_type", "counseling").eq("source_id", appointment.booking_id)
  ]);
  return res.status(200).json({ message: "予約をキャンセルし、クライエントへ通知しました。" });
}

async function syncLearningReservation(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  const token = getBearerToken(req.headers);
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return res.status(500).json({ message: "Auth configuration is missing." });
  const { createClient } = await import("@supabase/supabase-js");
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const userResult = await authClient.auth.getUser(token);
  if (userResult.error || !userResult.data.user?.email) return res.status(401).json({ message: "Unauthorized" });
  const reservations = Array.isArray(body.reservations) ? body.reservations : [];
  if (reservations.length === 0) return res.status(400).json({ message: "Reservations are required." });
  const serviceClient = await createServiceClient();
  for (const value of reservations) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const sourceId = cleanText(item.sourceId);
    const start = cleanText(item.start);
    const durationMinutes = Math.max(25, Math.min(180, Number(item.durationMinutes ?? 50)));
    if (!sourceId || Number.isNaN(new Date(start).getTime())) continue;
    const { error } = await serviceClient.from("calendar_reservations").upsert({
      source_type: "learning",
      source_id: sourceId,
      starts_at: new Date(start).toISOString(),
      ends_at: addMinutes(start, durationMinutes),
      status: "active",
      updated_at: new Date().toISOString()
    }, { onConflict: "source_type,source_id" });
    if (error?.code === "23P01") return res.status(409).json({ message: "The selected schedule is no longer available." });
    if (error) throw error;
  }
  return res.status(200).json({ message: "Synced" });
}

async function updateLearningReservation(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertCounselor(getBearerToken(req.headers));
  const serviceClient = await createServiceClient();
  const sourceId = cleanText(body.sourceId);
  const active = body.active !== false;
  const { error } = await serviceClient.from("calendar_reservations").update({ status: active ? "active" : "cancelled", updated_at: new Date().toISOString() }).eq("source_type", "learning").eq("source_id", sourceId);
  if (error) throw error;
  return res.status(200).json({ message: "Updated" });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const mode = queryValue(req.query?.mode);
      if (mode === "availability") return await handlePublicAvailability(res);
      if (mode === "occupancy") return await handleOccupancy(res);
      if (mode === "admin") return await handleAdmin(req, res);
      return res.status(400).json({ message: "Unknown mode." });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ message: "Method Not Allowed" });
    }
    const body = normalizeBody(req.body);
    const action = cleanText(body.action);
    if (action === "admin-login") return await loginCounselor(body, res);
    if (action === "request") return await createAppointment(body, res);
    if (action === "save-settings") return await saveSettings(body, req, res);
    if (action === "save-details") return await saveAppointmentDetails(body, req, res);
    if (action === "send-payment") return await sendPaymentGuide(body, req, res);
    if (action === "mark-paid") return await markPaid(body, req, res);
    if (action === "cancel") return await cancelByCounselor(body, req, res);
    if (action === "sync-learning") return await syncLearningReservation(body, req, res);
    if (action === "update-learning") return await updateLearningReservation(body, req, res);
    return res.status(400).json({ message: "Unknown action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Counseling API failed.", { message });
    if (message === "Unauthorized") return res.status(401).json({ message: "Unauthorized" });
    return res.status(500).json({ message: "処理を完了できませんでした。時間をおいて再度お試しください。" });
  }
}

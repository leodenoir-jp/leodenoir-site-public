declare const process: {
  env: Record<string, string | undefined>;
};

export const counselorEmail = "yu.leobiz003@outlook.com";
export const counselingTimezone = "Asia/Tokyo";
const counselingAdminSessionPrefix = "counseling-admin:";

export type WeeklyRule = {
  enabled: boolean;
  start: string;
  end: string;
};

export type DateOverride = WeeklyRule & {
  date: string;
};

export type CounselingSettings = {
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

export const defaultGuidance = `当セッションはカウンセリングを中心に、対話を通して不安やお悩みの背景を整理し、ストレスの緩和や解決に近づくための方向性を一緒に考えます。必要に応じて、言語化の補助としてタロットカードを使用します。

大切にしていること
・今抱えている悩みの本質を一緒に辿ること
・相談者さま自身の可能性を引き出すこと
・これからどう進むかを整理すること

「少し耳が痛いことでも、きちんと知りたい」「自分の人生を前に進めたい」という方に向いたセッションです。

【ご予約前のご案内】
・1時間以上をご希望の場合は、まず1枠をご予約のうえ、仮確定メールへの返信でご希望時間をお知らせください
・お支払い方法はPayPalまたはPayPayです`;

export const defaultTemplates = {
  provisional: `{{name}} 様

個別カウンセリングへお申し込みいただき、ありがとうございます。
次の日程を仮確定として承りました。

予約ID：{{bookingId}}
日時：{{dateTime}}
所要時間：50分
料金：9,000円

内容を確認後、PayPalまたはPayPayの決済方法とZoomリンクをメールでご案内します。

【キャンセルについて】
決済完了後、または開始12時間前を過ぎてからの相談者さま都合によるキャンセルは返金対象外です。開始12時間前までのキャンセルは返金可能です。返金時は、振込先情報または支払いコードをこのメールへの返信でお知らせください。

当日は、顔出し・声出しともに任意です。声出しが難しい場合はZoomチャットもご利用いただけます。`,
  payment: `{{name}} 様

個別カウンセリングのお支払い方法とZoomリンクをご案内します。

予約ID：{{bookingId}}
日時：{{dateTime}}
お支払い方法：{{paymentMethod}}
決済リンク：{{paymentLink}}
Zoomリンク：{{zoomLink}}

決済完了を確認後、予約確定メールをお送りします。`,
  confirmation: `{{name}} 様

ご入金を確認しました。個別カウンセリングの予約が確定しました。

予約ID：{{bookingId}}
日時：{{dateTime}}
Zoomリンク：{{zoomLink}}

開始時間になりましたら、上記リンクからご参加ください。`,
  reminder: `{{name}} 様

こんにちは、Leoです。
個別カウンセリングの開始約18時間前となりましたので、ご予約内容をお送りします。

予約ID：{{bookingId}}
日時：{{dateTime}}
Zoomリンク：{{zoomLink}}

顔出し・声出しは任意です。声出しが難しい場合はZoomチャットもご利用いただけます。

【キャンセルについて】
決済完了後、または開始12時間前を過ぎてからの相談者さま都合によるキャンセルは返金対象外です。日程変更が必要な場合は、できるだけ早くこのメールへご返信ください。`,
  cancellation: `{{name}} 様

個別カウンセリングの予約について、カウンセラー都合により次の日程をキャンセルさせていただきました。

予約ID：{{bookingId}}
日時：{{dateTime}}
理由：{{cancellationReason}}

ご迷惑をおかけし申し訳ありません。日程の再調整または返金について、別途ご案内します。`
};

export const defaultWeeklyRules: Record<string, WeeklyRule> = Object.fromEntries(
  Array.from({ length: 7 }, (_, day) => [String(day), { enabled: day >= 1 && day <= 5, start: "10:00", end: "18:00" }])
);

export function defaultSettings(): CounselingSettings {
  return {
    timezone: counselingTimezone,
    lead_hours: 18,
    horizon_days: 14,
    daily_limit: 3,
    weekly_rules: defaultWeeklyRules,
    date_overrides: [],
    public_guidance: defaultGuidance,
    provisional_template: defaultTemplates.provisional,
    payment_template: defaultTemplates.payment,
    confirmation_template: defaultTemplates.confirmation,
    reminder_template: defaultTemplates.reminder,
    cancellation_template: defaultTemplates.cancellation
  };
}

export async function createServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server configuration is missing.");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function getAdminLoginEmail() {
  return (process.env.COUNSELING_ADMIN_LOGIN_EMAIL || "yu.leobiz001@outlook.com").trim().toLowerCase();
}

function getAdminLoginPassword() {
  return process.env.COUNSELING_ADMIN_LOGIN_PASSWORD || "";
}

function getAdminSessionSecret() {
  return process.env.COUNSELING_ADMIN_SESSION_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.RESEND_API_KEY
    || getAdminLoginPassword();
}

async function signAdminPayload(payload: string) {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", getAdminSessionSecret()).update(payload).digest("base64url");
}

export async function createCounselingAdminSession(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const adminPassword = getAdminLoginPassword();
  if (!adminPassword || normalizedEmail !== getAdminLoginEmail() || password !== adminPassword) {
    throw new Error("Unauthorized");
  }
  const payload = Buffer.from(JSON.stringify({
    email: normalizedEmail,
    exp: Date.now() + 1000 * 60 * 60 * 8
  })).toString("base64url");
  const signature = await signAdminPayload(payload);
  return `${counselingAdminSessionPrefix}${payload}.${signature}`;
}

async function verifyCounselingAdminSession(token: string) {
  if (!token.startsWith(counselingAdminSessionPrefix)) return null;
  const session = token.slice(counselingAdminSessionPrefix.length);
  const [payload, signature] = session.split(".");
  if (!payload || !signature) return null;
  const expectedSignature = await signAdminPayload(payload);
  if (signature !== expectedSignature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; exp?: number };
    if (parsed.email !== getAdminLoginEmail() || !parsed.exp || parsed.exp < Date.now()) return null;
    return { email: parsed.email };
  } catch {
    return null;
  }
}

export async function assertCounselor(token: string) {
  if (!token) throw new Error("Unauthorized");
  const adminSession = await verifyCounselingAdminSession(token);
  if (adminSession) return adminSession;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Supabase auth configuration is missing.");
  const { createClient } = await import("@supabase/supabase-js");
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || data.user?.email?.toLowerCase() !== counselorEmail) throw new Error("Unauthorized");
  return data.user;
}

export function getBearerToken(headers?: Record<string, string | string[] | undefined>) {
  const header = headers?.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice(7) : "";
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeBody(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), template);
}

export function formatJstDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: counselingTimezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export async function sendCounselingEmail({
  to,
  replyTo,
  subject,
  text,
  idempotencyKey
}: {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.COUNSELING_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Counseling mail configuration is missing.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: replyTo,
      subject,
      text,
      html: `<div style="font-family:'Yu Gothic','游ゴシック',YuGothic,Meiryo,Arial,sans-serif;color:#111827;line-height:1.8;font-size:15px;white-space:pre-wrap">${escapeHtml(text)}</div>`
    })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Counseling email send failed.", { status: response.status, errorBody });
    throw new Error("Email delivery failed.");
  }
}

export function appointmentTemplateValues(appointment: Record<string, unknown>, client: Record<string, unknown>) {
  return {
    name: String(client.display_name || "相談者"),
    email: String(client.email || ""),
    clientId: String(client.client_id || ""),
    bookingId: String(appointment.booking_id || ""),
    dateTime: formatJstDateTime(String(appointment.starts_at || "")),
    paymentMethod: String(appointment.payment_method || ""),
    paymentLink: String(appointment.payment_link || ""),
    zoomLink: String(client.zoom_link || ""),
    cancellationReason: String(appointment.cancellation_reason || "")
  };
}

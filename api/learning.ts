declare const process: {
  env: Record<string, string | undefined>;
};

declare const Buffer: {
  from: (value: string, encoding?: string) => { toString: (encoding: string) => string };
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

type AvailabilityInput = {
  start: string;
  end: string;
  timezone: string;
  deliveryMode: "online" | "inPerson";
  note: string;
};

type PurchaseOfferRecord = {
  id: string;
  offer_id: string;
  student_id: string;
  lesson_kind: "japanese" | "english";
  lesson_menu_id: string;
  package_label: string;
  duration_minutes: 25 | 50;
  quantity: number;
  currency: "USD" | "JPY";
  unit_price: number;
  total_amount: number;
  payment_method: "PayPal" | "PayPay";
  payment_link: string;
  receipt_requested: boolean;
  receipt_name: string | null;
  display_language: "ja" | "en" | "zh-Hant";
  status: "pending_payment" | "paid" | "cancelled";
  offered_at: string;
  paid_at: string | null;
  receipt_sent_at: string | null;
  students: {
    id: string;
    student_id: string;
    email: string;
    name: string | null;
  };
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ownerEmail = "yu.leobiz003@outlook.com";
const adminSessionPrefix = "learning-admin:";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBody(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function getBearerToken(headers?: Record<string, string | string[] | undefined>) {
  const header = headers?.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice(7) : "";
}

async function createServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server configuration is missing.");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function adminEmail() {
  return (process.env.COUNSELING_ADMIN_LOGIN_EMAIL || "yu.leobiz001@outlook.com").trim().toLowerCase();
}

function adminPassword() {
  return process.env.COUNSELING_ADMIN_LOGIN_PASSWORD || "";
}

function adminSecret() {
  return process.env.COUNSELING_ADMIN_SESSION_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.RESEND_API_KEY
    || adminPassword();
}

async function signAdminPayload(payload: string) {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", adminSecret()).update(payload).digest("base64url");
}

async function createAdminSession(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!adminPassword() || normalizedEmail !== adminEmail() || password !== adminPassword()) throw new Error("Unauthorized");
  const payload = Buffer.from(JSON.stringify({
    email: normalizedEmail,
    exp: Date.now() + 1000 * 60 * 60 * 8
  })).toString("base64url");
  const signature = await signAdminPayload(payload);
  return `${adminSessionPrefix}${payload}.${signature}`;
}

async function verifyAdminSession(token: string) {
  if (!token.startsWith(adminSessionPrefix)) return null;
  const [payload, signature] = token.slice(adminSessionPrefix.length).split(".");
  if (!payload || !signature || signature !== await signAdminPayload(payload)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; exp?: number };
    if (parsed.email !== adminEmail() || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function assertTutor(token: string) {
  if (!token) throw new Error("Unauthorized");
  const admin = await verifyAdminSession(token);
  if (admin) return admin;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Supabase auth configuration is missing.");
  const { createClient } = await import("@supabase/supabase-js");
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || data.user?.email?.toLowerCase() !== ownerEmail) throw new Error("Unauthorized");
  return data.user;
}

async function loginTutor(body: Record<string, unknown>, res: ApiResponse) {
  const token = await createAdminSession(cleanText(body.email), cleanText(body.password));
  return res.status(200).json({ token });
}

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(amount: number, currency: "USD" | "JPY") {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "ja-JP", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2
  }).format(amount);
}

function renderEmailHtml(content: string) {
  return `<div style="font-family:'Yu Gothic','游ゴシック',YuGothic,'Hiragino Kaku Gothic ProN',Meiryo,Arial,sans-serif;color:#111827;line-height:1.75;font-size:15px">${content}</div>`;
}

async function sendEmail({
  to,
  replyTo,
  subject,
  text,
  html,
  attachments
}: {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL || process.env.STUDENT_AUTH_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Mail configuration is missing.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: replyTo,
      subject,
      text,
      html,
      attachments
    })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Learning email send failed.", {
      status: response.status,
      statusText: response.statusText,
      errorBody
    });
    throw new Error("Failed to send email.");
  }
}

function normalizeAvailability(value: unknown): AvailabilityInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const start = cleanText(record.start);
  const end = cleanText(record.end);
  const timezone = cleanText(record.timezone) || "Asia/Tokyo";
  const deliveryMode = cleanText(record.deliveryMode) === "inPerson" ? "inPerson" : "online";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!start || !end || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return null;
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    timezone,
    deliveryMode,
    note: cleanText(record.note)
  };
}

async function listAvailability(res: ApiResponse) {
  const serviceClient = await createServiceClient();
  const { data, error } = await serviceClient
    .from("availability_slots")
    .select("id,starts_at,ends_at,timezone,delivery_mode,note")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return res.status(200).json({
    slots: (data ?? []).map((slot: Record<string, unknown>) => ({
      id: String(slot.id),
      start: String(slot.starts_at),
      end: String(slot.ends_at),
      timezone: String(slot.timezone || "Asia/Tokyo"),
      deliveryMode: slot.delivery_mode === "inPerson" ? "inPerson" : "online",
      note: ""
    }))
  });
}

async function listAdmin(req: ApiRequest, res: ApiResponse) {
  await assertTutor(getBearerToken(req.headers));
  const serviceClient = await createServiceClient();
  const [slotsResult, offersResult, studentsResult] = await Promise.all([
    serviceClient.from("availability_slots").select("id,starts_at,ends_at,timezone,delivery_mode,note").order("starts_at", { ascending: true }),
    serviceClient.from("lesson_purchase_offers").select("*,students(id,student_id,email,name)").order("offered_at", { ascending: false }),
    serviceClient.from("students").select("id,student_id,email,name").order("created_at", { ascending: false })
  ]);
  if (slotsResult.error) throw slotsResult.error;
  if (studentsResult.error) throw studentsResult.error;
  const purchaseOffersReady = !offersResult.error;
  if (offersResult.error && offersResult.error.code !== "42P01") throw offersResult.error;
  return res.status(200).json({
    slots: slotsResult.data ?? [],
    offers: purchaseOffersReady ? offersResult.data ?? [] : [],
    students: studentsResult.data ?? [],
    purchaseOffersReady
  });
}

async function saveAvailability(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertTutor(getBearerToken(req.headers));
  const values = Array.isArray(body.slots) ? body.slots : [];
  const slots = values.map(normalizeAvailability).filter((slot): slot is AvailabilityInput => Boolean(slot));
  if (slots.length === 0 || slots.length > 500) return res.status(400).json({ message: "有効な空き枠を入力してください。" });
  const serviceClient = await createServiceClient();
  const inserted: unknown[] = [];
  for (const slot of slots) {
    const { data: existing, error: findError } = await serviceClient
      .from("availability_slots")
      .select("id,starts_at,ends_at,timezone,delivery_mode,note")
      .eq("starts_at", slot.start)
      .eq("ends_at", slot.end)
      .eq("delivery_mode", slot.deliveryMode)
      .maybeSingle();
    if (findError) throw findError;
    if (existing) {
      inserted.push(existing);
      continue;
    }
    const { data, error } = await serviceClient.from("availability_slots").insert({
      starts_at: slot.start,
      ends_at: slot.end,
      timezone: slot.timezone,
      delivery_mode: slot.deliveryMode,
      note: slot.note || null
    }).select("id,starts_at,ends_at,timezone,delivery_mode,note").single();
    if (error) throw error;
    inserted.push(data);
  }
  return res.status(200).json({ message: `${inserted.length}件の空き枠を保存しました。`, slots: inserted });
}

async function deleteAvailability(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertTutor(getBearerToken(req.headers));
  const slotId = cleanText(body.slotId);
  if (!slotId) return res.status(400).json({ message: "空き枠IDが必要です。" });
  const serviceClient = await createServiceClient();
  const { error } = await serviceClient.from("availability_slots").delete().eq("id", slotId);
  if (error) throw error;
  return res.status(200).json({ message: "空き枠を削除しました。" });
}

async function generateStudentId(serviceClient: Awaited<ReturnType<typeof createServiceClient>>) {
  for (let index = 0; index < 30; index += 1) {
    const studentId = `STU-${Math.floor(100000 + Math.random() * 900000)}`;
    const { data, error } = await serviceClient.from("students").select("id").eq("student_id", studentId).maybeSingle();
    if (error) throw error;
    if (!data) return studentId;
  }
  throw new Error("Student ID generation failed.");
}

async function findOrCreateStudent(serviceClient: Awaited<ReturnType<typeof createServiceClient>>, email: string, name: string) {
  const { data: existing, error: findError } = await serviceClient.from("students").select("id,student_id,email,name").eq("email", email).maybeSingle();
  if (findError) throw findError;
  if (existing) {
    if (name && existing.name !== name) {
      const { data, error } = await serviceClient.from("students").update({ name, updated_at: new Date().toISOString() }).eq("id", existing.id).select("id,student_id,email,name").single();
      if (error) throw error;
      return data;
    }
    return existing;
  }
  const studentId = await generateStudentId(serviceClient);
  const { data, error } = await serviceClient.from("students").insert({ student_id: studentId, email, name: name || email.split("@")[0], provider: "email" }).select("id,student_id,email,name").single();
  if (error) throw error;
  return data;
}

function purchaseOfferCopy(offer: PurchaseOfferRecord) {
  const total = formatMoney(Number(offer.total_amount), offer.currency);
  const unit = formatMoney(Number(offer.unit_price), offer.currency);
  const link = offer.payment_link;
  if (offer.display_language === "en") {
    return {
      subject: "Lesson package purchase information",
      text: `${offer.students.name || offer.students.email},\n\nYour lesson package purchase information is ready.\n\nPackage: ${offer.package_label}\nDuration: ${offer.duration_minutes} minutes\nLessons: ${offer.quantity}\nUnit price: ${unit}\nTotal: ${total}\nPayment: ${offer.payment_method}\nPayment link: ${link}\n\nAfter completing payment, please reply to this email. Your package will be added after payment is confirmed.`,
      receiptLabel: "Receipt"
    };
  }
  if (offer.display_language === "zh-Hant") {
    return {
      subject: "課程套組購買資訊",
      text: `${offer.students.name || offer.students.email} 您好：\n\n以下是您的課程套組購買資訊。\n\n套組：${offer.package_label}\n時長：${offer.duration_minutes}分鐘\n堂數：${offer.quantity}\n單價：${unit}\n總額：${total}\n付款方式：${offer.payment_method}\n付款連結：${link}\n\n完成付款後請回覆此郵件。確認入帳後，課程堂數將加入您的帳戶。`,
      receiptLabel: "收據"
    };
  }
  return {
    subject: "レッスンパッケージ購入のご案内",
    text: `${offer.students.name || offer.students.email} 様\n\nレッスンパッケージの購入内容と決済方法をご案内します。\n\nパッケージ：${offer.package_label}\n時間：${offer.duration_minutes}分\n回数：${offer.quantity}回\n1回あたり：${unit}\n合計：${total}\n決済方法：${offer.payment_method}\n決済リンク：${link}\n\nお支払い完了後、このメールへご返信ください。入金確認後、レッスン回数をアカウントへ反映します。`,
    receiptLabel: "領収書"
  };
}

async function sendPurchaseOffer(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertTutor(getBearerToken(req.headers));
  const email = cleanText(body.email).toLowerCase();
  const name = cleanText(body.name);
  const lessonKind = cleanText(body.lessonKind) === "english" ? "english" : "japanese";
  const lessonMenuId = cleanText(body.lessonMenuId);
  const packageLabel = cleanText(body.packageLabel);
  const durationMinutes = Number(body.durationMinutes) === 25 ? 25 : 50;
  const quantity = Math.floor(Number(body.quantity));
  const currency = cleanText(body.currency) === "JPY" ? "JPY" : "USD";
  const unitPrice = Number(body.unitPrice);
  const paymentMethod = cleanText(body.paymentMethod) === "PayPay" ? "PayPay" : "PayPal";
  const paymentLink = cleanText(body.paymentLink);
  const receiptRequested = body.receiptRequested === true;
  const receiptName = cleanText(body.receiptName);
  const displayLanguage = cleanText(body.displayLanguage) === "en" ? "en" : cleanText(body.displayLanguage) === "zh-Hant" ? "zh-Hant" : "ja";
  if (!emailPattern.test(email) || !lessonMenuId || !packageLabel || quantity < 1 || quantity > 100 || !Number.isFinite(unitPrice) || unitPrice < 0 || (currency === "USD" && unitPrice > 100) || (currency === "JPY" && unitPrice > 30_000) || !/^https:\/\//i.test(paymentLink)) {
    return res.status(400).json({ message: "生徒情報、パッケージ内容、決済リンクを確認してください。" });
  }
  const serviceClient = await createServiceClient();
  const student = await findOrCreateStudent(serviceClient, email, name);
  const offerId = `LPO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data, error } = await serviceClient.from("lesson_purchase_offers").insert({
    offer_id: offerId,
    student_id: student.id,
    lesson_kind: lessonKind,
    lesson_menu_id: lessonMenuId,
    package_label: packageLabel,
    duration_minutes: durationMinutes,
    quantity,
    currency,
    unit_price: unitPrice,
    total_amount: unitPrice * quantity,
    payment_method: paymentMethod,
    payment_link: paymentLink,
    receipt_requested: receiptRequested,
    receipt_name: receiptRequested ? (receiptName || name || email) : null,
    display_language: displayLanguage,
    status: "pending_payment"
  }).select("*,students(id,student_id,email,name)").single();
  if (error) throw error;
  const offer = data as PurchaseOfferRecord;
  const copy = purchaseOfferCopy(offer);
  await sendEmail({
    to: email,
    replyTo: process.env.LEARNING_TUTOR_TO_EMAIL || ownerEmail,
    subject: copy.subject,
    text: copy.text,
    html: renderEmailHtml(`<p>${escapeHtml(copy.text).replace(/\n/g, "<br />")}</p>`)
  });
  return res.status(200).json({ message: "購入案内を送信しました。", offer });
}

function buildReceiptHtml(offer: PurchaseOfferRecord) {
  const receiptName = offer.receipt_name || offer.students.name || offer.students.email;
  const total = formatMoney(Number(offer.total_amount), offer.currency);
  const copy = offer.display_language === "en"
    ? { title: "RECEIPT", recipient: "Received from", amount: "Amount", service: "Description", method: "Payment method", date: "Issue date", issuer: "Issuer", note: "Payment received in full." }
    : offer.display_language === "zh-Hant"
      ? { title: "收據", recipient: "付款人", amount: "金額", service: "服務內容", method: "付款方式", date: "開立日期", issuer: "開立人", note: "上述款項已收訖。" }
      : { title: "領収書", recipient: "宛名", amount: "金額", service: "但し書き", method: "支払方法", date: "発行日", issuer: "発行者", note: "上記金額を正に領収いたしました。" };
  return `<!doctype html><html lang="${offer.display_language}"><head><meta charset="utf-8"><title>${copy.title} ${offer.offer_id}</title><style>body{font-family:'Yu Gothic','游ゴシック',YuGothic,Meiryo,sans-serif;color:#111827;margin:48px}.receipt{max-width:760px;margin:auto;border:1px solid #94a3b8;padding:40px}.brand{color:#0f2742;font-size:14px}.title{text-align:center;font-size:30px;margin:18px 0 34px}.amount{font-size:24px;font-weight:700;border-bottom:2px solid #0f2742;padding:8px 0}dl{display:grid;grid-template-columns:150px 1fr;gap:12px;margin:30px 0}dt{color:#475569}dd{margin:0}.footer{margin-top:42px;border-top:1px solid #cbd5e1;padding-top:18px}.id{font-size:12px;color:#64748b}</style></head><body><main class="receipt"><p class="brand">Leo de Noir / Workaholic Owl</p><h1 class="title">${copy.title}</h1><p class="id">No. ${escapeHtml(offer.offer_id)}</p><dl><dt>${copy.recipient}</dt><dd>${escapeHtml(receiptName)}</dd><dt>${copy.amount}</dt><dd class="amount">${escapeHtml(total)}</dd><dt>${copy.service}</dt><dd>${escapeHtml(`${offer.package_label} ${offer.duration_minutes}分 × ${offer.quantity}回`)}</dd><dt>${copy.method}</dt><dd>${escapeHtml(offer.payment_method)}</dd><dt>${copy.date}</dt><dd>${escapeHtml(new Date().toLocaleDateString(offer.display_language === "ja" ? "ja-JP" : offer.display_language === "zh-Hant" ? "zh-TW" : "en-US", { timeZone: "Asia/Tokyo" }))}</dd><dt>${copy.issuer}</dt><dd>Leo de Noir / Workaholic Owl<br>運営者：請井 悠貴子<br>${ownerEmail}</dd></dl><p>${copy.note}</p><div class="footer">https://leodenoir.com</div></main></body></html>`;
}

async function markOfferPaid(body: Record<string, unknown>, req: ApiRequest, res: ApiResponse) {
  await assertTutor(getBearerToken(req.headers));
  const offerId = cleanText(body.offerId);
  if (!offerId) return res.status(400).json({ message: "購入案内IDが必要です。" });
  const serviceClient = await createServiceClient();
  const { data, error } = await serviceClient.from("lesson_purchase_offers").select("*,students(id,student_id,email,name)").eq("id", offerId).single();
  if (error) throw error;
  const offer = data as PurchaseOfferRecord;
  if (offer.status === "paid") return res.status(200).json({ message: "入金確認済みです。", offer });
  const { data: existingPackage, error: packageFindError } = await serviceClient
    .from("lesson_packages")
    .select("id,purchased_lessons,remaining_lessons")
    .eq("student_id", offer.student_id)
    .eq("lesson_menu_id", offer.lesson_menu_id)
    .eq("unit_price", offer.unit_price)
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (packageFindError) throw packageFindError;
  if (existingPackage) {
    const { error: updateError } = await serviceClient.from("lesson_packages").update({
      purchased_lessons: Number(existingPackage.purchased_lessons) + offer.quantity,
      remaining_lessons: Number(existingPackage.remaining_lessons) + offer.quantity,
      purchased_at: new Date().toISOString()
    }).eq("id", existingPackage.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await serviceClient.from("lesson_packages").insert({
      student_id: offer.student_id,
      lesson_kind: offer.lesson_kind,
      lesson_menu_id: offer.lesson_menu_id,
      package_label: offer.package_label,
      currency: offer.currency,
      unit_price: offer.unit_price,
      purchased_lessons: offer.quantity,
      remaining_lessons: offer.quantity,
      purchased_at: new Date().toISOString()
    });
    if (insertError) throw insertError;
  }
  const paidAt = new Date().toISOString();
  const receiptHtml = offer.receipt_requested ? buildReceiptHtml(offer) : "";
  const copy = purchaseOfferCopy(offer);
  const studentText = offer.display_language === "en"
    ? `Payment has been confirmed for ${offer.package_label}. ${offer.quantity} lesson credits have been added to your account.${offer.receipt_requested ? " Your receipt is attached." : ""}`
    : offer.display_language === "zh-Hant"
      ? `已確認 ${offer.package_label} 的付款，${offer.quantity} 堂課已加入您的帳戶。${offer.receipt_requested ? "收據已附於本郵件。" : ""}`
      : `${offer.package_label}の入金を確認しました。${offer.quantity}回分をアカウントへ反映しました。${offer.receipt_requested ? "領収書を添付しています。" : ""}`;
  await sendEmail({
    to: offer.students.email,
    replyTo: process.env.LEARNING_TUTOR_TO_EMAIL || ownerEmail,
    subject: offer.display_language === "en" ? "Payment confirmed" : offer.display_language === "zh-Hant" ? "付款確認完成" : "レッスンパッケージの入金を確認しました",
    text: studentText,
    html: renderEmailHtml(`<p>${escapeHtml(studentText)}</p>`),
    attachments: receiptHtml ? [{ filename: `receipt-${offer.offer_id}.html`, content: Buffer.from(receiptHtml, "utf8").toString("base64") }] : undefined
  });
  await sendEmail({
    to: process.env.LEARNING_TUTOR_TO_EMAIL || ownerEmail,
    replyTo: offer.students.email,
    subject: "購入代金の入金確認が完了しました",
    text: `購入案内ID: ${offer.offer_id}\n生徒: ${offer.students.name || ""} (${offer.students.email})\nパッケージ: ${offer.package_label}\n回数: ${offer.quantity}回\n合計: ${formatMoney(Number(offer.total_amount), offer.currency)}\n領収書: ${offer.receipt_requested ? "送信済み" : "希望なし"}`,
    html: renderEmailHtml(`<p>購入案内ID: ${escapeHtml(offer.offer_id)}<br>生徒: ${escapeHtml(offer.students.name || "")} (${escapeHtml(offer.students.email)})<br>パッケージ: ${escapeHtml(offer.package_label)}<br>回数: ${offer.quantity}回<br>合計: ${escapeHtml(formatMoney(Number(offer.total_amount), offer.currency))}<br>領収書: ${offer.receipt_requested ? "送信済み" : "希望なし"}</p>`)
  });
  const { data: updated, error: updateError } = await serviceClient.from("lesson_purchase_offers").update({
    status: "paid",
    paid_at: paidAt,
    receipt_sent_at: offer.receipt_requested ? paidAt : null,
    updated_at: paidAt
  }).eq("id", offer.id).select("*,students(id,student_id,email,name)").single();
  if (updateError) throw updateError;
  return res.status(200).json({ message: `入金確認と${offer.receipt_requested ? "領収書送信" : "パッケージ反映"}が完了しました。`, offer: updated, receiptLabel: copy.receiptLabel });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const mode = queryValue(req.query?.mode);
      if (mode === "availability") return await listAvailability(res);
      if (mode === "admin") return await listAdmin(req, res);
      return res.status(400).json({ message: "Unknown mode." });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ message: "Method Not Allowed" });
    }
    const body = normalizeBody(req.body);
    const action = cleanText(body.action);
    if (action === "admin-login") return await loginTutor(body, res);
    if (action === "save-availability") return await saveAvailability(body, req, res);
    if (action === "delete-availability") return await deleteAvailability(body, req, res);
    if (action === "send-purchase-offer") return await sendPurchaseOffer(body, req, res);
    if (action === "mark-offer-paid") return await markOfferPaid(body, req, res);
    return res.status(400).json({ message: "Unknown action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Learning API failed.", { message });
    if (message === "Unauthorized") return res.status(401).json({ message: "Unauthorized" });
    return res.status(500).json({ message: "処理を完了できませんでした。時間をおいて再度お試しください。" });
  }
}

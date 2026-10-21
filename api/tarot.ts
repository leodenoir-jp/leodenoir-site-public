import holiday from "@holiday-jp/holiday_jp";
import { assertCounselor, cleanText, counselorEmail, createServiceClient, formatJstDateTime, getBearerToken, normalizeBody, sendCounselingEmail } from "./_lib/counseling.js";
import { defaultTarotSettings, jstDate, tarotModes, tarotPrices, tarotSlots, tokyoWards, validateSettings, type TarotMode, type TarotSettings } from "../shared/tarot.js";
import { tarotExcludedTopics } from "../src/data/tarotTerms.js";
import { isPayPalPaymentLink } from "../shared/paymentMethods.js";

type Request = { method?: string; query?: Record<string, string | string[] | undefined>; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { setHeader(name: string, value: string): void; status(code: number): { json(body: unknown): void } };
type DB = Awaited<ReturnType<typeof createServiceClient>>;
type Mail = { kind: string; recipient: string; subject: string; body: string };
class InputError extends Error {}
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new InputError(message); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const policy = "変更・キャンセルはこのメールへの返信でご相談ください。返信期限切れだけを理由に未実施の鑑定を実施済みとして扱いません。返金は実施状況と適用法令に応じて個別にご案内します。";

export function thirdBusinessDay(received: string) {
  let date = jstDate(received);
  let count = 0;
  while (count < 3) {
    date = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holiday.isHoliday(date)) count++;
  }
  return new Date(`${date}T23:59:59+09:00`).toISOString();
}
async function settings(db: DB, initialize = false): Promise<{ config: TarotSettings; updatedAt: string | null }> {
  if (initialize) {
    const { error } = await db.from("tarot_settings").upsert({ id: true, settings: defaultTarotSettings() }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }
  const { data, error } = await db.from("tarot_settings").select("settings,updated_at").eq("id", true).maybeSingle();
  if (error) throw error;
  return { config: validateSettings(data?.settings ?? defaultTarotSettings()), updatedAt: data?.updated_at ?? null };
}
async function availability(db: DB, config: TarotSettings, mode: TarotMode) {
  const busy: Array<{ starts_at: string; ends_at: string; source_type: string; source_id: string }> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("calendar_reservations").select("starts_at,ends_at,source_type,source_id").eq("status", "active")
      .gte("ends_at", `${jstDate(new Date())}T00:00:00+09:00`).order("id").range(offset, offset + 499);
    if (error) throw error;
    busy.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  const { data: own, error } = await db.from("tarot_requests").select("starts_at").not("starts_at", "is", null)
    .not("status", "in", "(cancelled,expired,inquiry)").gte("starts_at", `${jstDate(new Date())}T00:00:00+09:00`).limit(5000);
  if (error || (own?.length ?? 0) >= 5000) throw error ?? new Error("Capacity result incomplete");
  return { slots: tarotSlots(config, busy, (own ?? []).map(r => r.starts_at), mode), busySlots: busy.map(({ starts_at, ends_at }) => ({ starts_at, ends_at })) };
}
async function deliver(db: DB, requestId: string) {
  const { data: mails, error } = await db.from("tarot_mail").select("id").eq("request_id", requestId).neq("status", "sent");
  if (error) throw error;
  for (const item of mails ?? []) {
    const { data, error: claimError } = await db.rpc("tarot_claim_mail", { p_id: item.id });
    if (claimError) throw claimError;
    const mail = data?.[0];
    if (!mail) continue;
    let failure: string | null = null;
    try {
      await sendCounselingEmail({ to: mail.recipient, replyTo: counselorEmail, subject: mail.subject, text: mail.body, idempotencyKey: `tarot-${mail.id}` });
    } catch {
      failure = "送信サービスで確認できませんでした。送信履歴を確認のうえ再送してください。";
    }
    const { error: finishError } = await db.rpc("tarot_finish_mail", { p_id: mail.id, p_error: failure });
    if (finishError) throw finishError;
  }
  const { count, error: remainingError } = await db.from("tarot_mail").select("id", { count: "exact", head: true }).eq("request_id", requestId).neq("status", "sent");
  if (remainingError) throw remainingError;
  return (count ?? 0) === 0;
}
function paymentUrl(value: unknown) {
  const text = cleanText(value);
  try { const url = new URL(text); if (url.protocol === "https:" && !url.username && !url.password) return url.href; } catch { /* Validation below. */ }
  throw new InputError("決済リンクは https:// から始まるURLで指定してください。");
}
export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
    const body = normalizeBody(req.body);
    const mode = typeof req.query?.mode === "string" ? req.query.mode : "online";
    const publicRequest = req.method === "POST" && body.action === "request";
    const isPublic = (req.method === "GET" && ["online", "in_person", "email"].includes(mode)) || publicRequest;
    if (!isPublic) await assertCounselor(getBearerToken(req.headers));
    const db = await createServiceClient();
    const { config, updatedAt } = await settings(db, !isPublic);
    if (req.method === "GET") {
      if (isPublic) return res.status(200).json({ enabled: config.enabled, guidance: config.guidance, ...await availability(db, config, mode as TarotMode) });
      const page = Math.max(0, Math.min(10000, Number(req.query?.page) || 0));
      const { data, error } = await db.from("tarot_requests").select("*,counseling_clients(*),tarot_mail(id,kind,status,sent_at,attempted_at,error,subject,body)").order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
      if (error) throw error;
      return res.status(200).json({ settings: config, settingsUpdatedAt: updatedAt, requests: data, page, ...await availability(db, config, "online") });
    }
    if (publicRequest) {
      const id = cleanText(body.id), email = cleanText(body.email).toLowerCase(), name = cleanText(body.name);
      const serviceMode = cleanText(body.mode) as TarotMode;
      check(uuid.test(id) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 && name.length > 0 && name.length <= 120, "お名前とメールアドレスを確認してください。");
      check(Object.hasOwn(tarotModes, serviceMode) && body.consent === true && !body.website, "入力内容をご確認ください。");
      // A lost HTTP response must not create another hold or send another email.
      const { data: existing, error: existingError } = await db.from("tarot_requests").select("id,counseling_clients!inner(email)").eq("id", id).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const client = existing.counseling_clients as unknown as { email: string };
        check(client.email === email, "受付番号を確認できませんでした。");
        return res.status(200).json({ accepted: true, id, message: "お申し込みは受付済みです。決済案内をお待ちください。" });
      }
      check(config.enabled, "現在、新規のお申し込みを受け付けていません。");
      const inquiry = serviceMode === "in_person" && body.inquiry === true;
      const preference = cleanText(body.preference).slice(0, 2000);
      const location = normalizeBody(body.location);
      const place = { ward: cleanText(location.ward), station: cleanText(location.station), line: cleanText(location.line), venue: cleanText(location.venue) };
      if (serviceMode === "in_person") {
        check(tokyoWards.includes(place.ward) && place.station.length > 0 && place.line.length > 0 && Object.values(place).every(v => v.length <= 200), "東京都内23区・最寄り駅・路線を入力してください。");
        if (inquiry) check(preference.length > 0, "希望の日時・場所について入力してください。");
      }
      let start: string | null = null;
      if (serviceMode !== "email" && !inquiry) {
        start = cleanText(body.start);
        const { slots } = await availability(db, config, serviceMode);
        check(slots.some(slot => slot.start === start && !slot.bufferBlocked), "この枠は予約できません。カレンダーを更新して選び直してください。");
      }
      const summary = `受付番号：${id}\n鑑定方法：${tarotModes[serviceMode]}\n料金：${tarotPrices[serviceMode].toLocaleString("ja-JP")}円${serviceMode === "in_person" ? " + 交通費（別途ご案内）" : ""}\n${start ? `日時：${formatJstDateTime(start)}（50分）\n` : ""}${serviceMode === "in_person" ? `希望場所：東京都${place.ward} ${place.line} ${place.station} ${place.venue}\n希望・相談：${preference}\n` : ""}`;
      const mails: Mail[] = [
        { kind: "receipt", recipient: email, subject: inquiry ? "【Leo de Noir】日時・場所のご相談を受け付けました" : "【Leo de Noir】タロットカード鑑定のお申し込みを受け付けました", body: `${name} 様\n\n${summary}\n${inquiry ? "日時の相談として受け付けました。予約枠の確保・仮確定はしていません。" : start ? "上記の日程を仮確定として承りました。" : "メール鑑定のお申し込みを承りました。"}\nLeoからの決済・詳細案内をお待ちください。オンライン鑑定のZoomリンクは入金確認後にお送りします。\n\n${policy}` },
        { kind: "owner", recipient: counselorEmail, subject: "【タロット鑑定】お申し込みが届きました", body: `氏名：${name}\nメール：${email}\n表示言語：日本語\n${summary}\n${inquiry ? "日時相談のみ（枠は確保していません）" : ""}\n管理：https://leodenoir.com/counseling/admin` }
      ];
      const { error } = await db.rpc("tarot_create", { p_id: id, p_email: email, p_name: name, p_mode: serviceMode, p_start: start, p_location: serviceMode === "in_person" ? place : {}, p_preference: preference, p_inquiry: inquiry, p_settings: config, p_mails: mails });
      if (error) {
        if (error.code === "23P01") throw new InputError("この時間に別の予約が入りました。選び直してください。");
        if (error.code === "P0001") throw new InputError(error.message);
        throw error;
      }
      let delivered = false;
      try { delivered = await deliver(db, id); } catch { /* Durable request/outbox is retained for admin retry. */ }
      return res.status(200).json({ accepted: true, id, message: delivered ? "お申し込みを受け付けました。確認メールをご覧ください。" : "お申し込みは保存されました。確認メールの送信を確認中です。再送信せず、受付番号をお控えください。" });
    }
    if (body.action === "save-settings") {
      const next = validateSettings(body.settings as TarotSettings);
      const expected = cleanText(body.settingsUpdatedAt);
      check(expected.length > 0, "設定の読み込みが必要です。再読み込みしてください。");
      const { data, error } = await db.from("tarot_settings").update({ settings: next, updated_at: new Date().toISOString() })
        .eq("id", true).eq("updated_at", expected).select("updated_at").maybeSingle();
      if (error) throw error;
      if (!data) return res.status(409).json({ message: "別の画面で公開枠が更新されました。再読み込みしてから変更内容を確認してください。" });
      return res.status(200).json({ message: "公開枠・案内文を保存しました。" });
    }
    const id = cleanText(body.id);
    check(uuid.test(id), "受付番号を確認してください。");
    const { data: r, error } = await db.from("tarot_requests").select("*,counseling_clients(*)").eq("id", id).single();
    if (error) throw error;
    if (body.action === "retry") {
      const sent = await deliver(db, id);
      return res.status(200).json({ message: sent ? "メール送信を確認しました。" : "未送信があります。初回試行から23時間以上経ったものは、自動再送せずResendの履歴を確認してください。" });
    }
    check(Number(body.version) === r.version, "情報が更新されました。再読み込みしてください。");
    const client = r.counseling_clients;
    const patch: Record<string, unknown> = {};
    const mails: Mail[] = [];
    const greeting = `${client.display_name} 様\n\n受付番号：${id}\n${r.starts_at ? `日時：${formatJstDateTime(r.starts_at)}（50分）\n` : ""}`;
    const mail = (kind: string, subject: string, text: string) => mails.push({ kind, recipient: client.email, subject: `【Leo de Noir】${subject}`, body: `${greeting}\n${text}\n\n${policy}` });
    const state = (...states: string[]) => check(states.includes(r.status), "現在のステータスではこの操作はできません。");
    switch (body.action) {
      case "assign": {
        state("inquiry");
        const start = cleanText(body.start);
        const { slots } = await availability(db, config, r.mode);
        check(slots.some(slot => slot.start === start && !slot.bufferBlocked), "前後1時間が空いている公開枠を指定してください。");
        patch.starts_at = start; patch.status = "pending_payment"; patch.settings_snapshot = config;
        mail("assigned", "対面鑑定の日程を仮確定しました", `日時：${formatJstDateTime(start)}（50分）\n鑑定料：16,000円 + 交通費\n場所・交通費の調整後、決済方法をご案内します。`);
        break;
      }
      case "details": {
        state("pending_payment", "confirmed");
        check(cleanText(body.paymentMethod) === "PayPay" && !isPayPalPaymentLink(cleanText(body.paymentLink)), "PayPayの決済リンクを入力してください。");
        patch.payment_method = body.paymentMethod;
        patch.payment_link = paymentUrl(body.paymentLink);
        const transport = Number(body.transportAmount ?? 0);
        check(Number.isInteger(transport) && transport >= 0 && transport <= 100000, "交通費を確認してください。");
        patch.transport_amount = r.mode === "in_person" ? transport : 0;
        if (body.zoomLink) {
          const zoom = new URL(paymentUrl(body.zoomLink));
          check(zoom.hostname === "zoom.us" || zoom.hostname.endsWith(".zoom.us"), "Zoomの会議URLを入力してください。");
          patch.zoom_link = zoom.href;
        }
        break;
      }
      case "payment":
        state("pending_payment"); check(r.payment_method === "PayPay" && r.payment_link && !isPayPalPaymentLink(r.payment_link), "先にPayPayの決済情報を保存してください。");
        mail("payment", "タロット鑑定のお支払い案内", `鑑定料：${r.amount.toLocaleString("ja-JP")}円\n${r.mode === "in_person" ? `交通費：${r.transport_amount.toLocaleString("ja-JP")}円\n` : ""}合計：${(r.amount + r.transport_amount).toLocaleString("ja-JP")}円\nお支払い方法：${r.payment_method}\n決済リンク：${r.payment_link}\n入金確認後、${r.mode === "email" ? "ご相談内容の案内" : "予約確定のご案内"}をお送りします。`); break;
      case "paid":
        state("pending_payment"); check(r.payment_link, "決済情報を保存し、入金を確認してください。");
        check(r.mode !== "online" || client.zoom_link, "Zoomリンクを保存してください。");
        patch.paid_at = new Date().toISOString();
        patch.status = r.mode === "email" ? "intake_pending" : "confirmed";
        if (r.mode === "email") mail("intake", "メール鑑定のご相談内容をお知らせください", `ご入金を確認しました。以下を参考に、このメールに7日以内（土日祝を含む）にご返信ください。\n\n${config.intake_text}\n\n【お受けできないテーマ】\n${tarotExcludedTopics}\n\nテーマ・必要情報がそろってから、土日・日本の祝日を除く3営業日以内を目安にメール本文でお届けします。\n結果に記載された意味・表現の質問1問への回答1回を含みます。結果送信後7日以内にご返信ください。新しいテーマや再鑑定は対象外です。\n相談内容の返信がない場合は「返信期限切れ」として受付を終了することがあります。`);
        else mail("confirmation", "タロット鑑定の予約が確定しました", `ご入金を確認しました。\n${r.mode === "online" ? `Zoomリンク：${client.zoom_link}` : `実施場所：東京都${r.location.ward} ${r.location.line} ${r.location.station} ${r.location.venue}\n詳細はメールで調整した内容をご確認ください。飲食代・席料は各自の分をご負担ください。`}\n当日は開始時間にご参加ください。`);
        break;
      case "theme": {
        state("awaiting_theme"); const theme = cleanText(body.text); check(theme.length > 0 && theme.length <= 10000, "確定したテーマを入力してください。");
        patch.theme = theme; patch.theme_received_at = new Date().toISOString(); patch.due_at = thirdBusinessDay(String(patch.theme_received_at)); patch.status = "reading"; break;
      }
      case "result":
        state("reading"); check(cleanText(body.text).length > 0 && cleanText(body.text).length <= 20000, "鑑定結果を入力してください。");
        patch.status = "result_pending";
        mail("result", "メール鑑定の結果をお届けします", `${cleanText(body.text)}\n\n記載された意味・表現について、ご質問1問に1回回答いたします。このメール送信から7日以内（土日祝を含む）にご返信ください。新たな鑑定・テーマは含みません。`); break;
      case "question": {
        state("questions"); const received = new Date(cleanText(body.receivedAt));
        check(Number.isFinite(received.getTime()) && received.getTime() <= Date.now() && received.getTime() <= Date.parse(r.question_deadline) && received.getTime() >= Date.parse(r.question_deadline) - 7 * 86400000, "結果送信後7日以内の質問受信日時を入力してください。");
        check(cleanText(body.text).length > 0 && cleanText(body.text).length <= 10000, "受信した質問を入力してください。");
        patch.status = "answering"; patch.question = cleanText(body.text); patch.question_received_at = received.toISOString(); break;
      }
      case "answer":
        state("answering"); check(cleanText(body.text).length > 0 && cleanText(body.text).length <= 20000, "回答を入力してください。");
        patch.status = "answer_pending"; mail("answer", "鑑定結果へのご質問に回答します", `${cleanText(body.text)}\n\n今回の回答をもってメール鑑定を完了いたします。ご利用ありがとうございました。`); break;
      case "close":
        state("questions", "confirmed", "awaiting_theme", "inquiry");
        if (r.status === "questions") check(Date.now() > Date.parse(r.question_deadline), "質問受付期間中です。");
        if (r.status === "awaiting_theme") check(Date.now() > Date.parse(r.reply_deadline), "返信期限前です。");
        if (r.status === "confirmed") check(Date.now() > Date.parse(r.starts_at) + 50 * 60000, "セッション終了後に完了にしてください。");
        patch.status = r.status === "awaiting_theme" || r.status === "inquiry" ? "expired" : "complete"; break;
      case "cancel":
        check(!["complete", "cancelled", "result_pending", "answer_pending", "intake_pending"].includes(r.status), "送信待ちメールや現在の状況を確認してください。");
        check(cleanText(body.text).length > 0 && cleanText(body.text).length <= 2000, "キャンセル理由を入力してください。");
        patch.status = "cancelled"; patch.cancellation_reason = cleanText(body.text);
        mail("cancellation", "タロット鑑定のキャンセルについて", `以下の理由により受付を終了しました。\n${cleanText(body.text)}\nご入金済みの場合、返金等は別途ご案内します。`); break;
      default: throw new InputError("操作を確認してください。");
    }
    const { error: updateError } = await db.rpc("tarot_update", { p_id: id, p_version: r.version, p_patch: patch, p_mails: mails });
    if (updateError) {
      if (["P0001", "23505"].includes(updateError.code)) throw new InputError(updateError.code === "23505" ? "この案内は登録済みです。送信履歴から確認してください。" : updateError.message);
      throw updateError;
    }
    let sent = true;
    if (mails.length) { try { sent = await deliver(db, id); } catch { sent = false; } }
    return res.status(200).json({ message: !mails.length ? "保存しました。" : sent ? "保存し、メール送信を確認しました。" : "保存済みです。未送信メールがあります。送信履歴から再送してください。" });
  } catch (error) {
    if (error instanceof InputError) return res.status(400).json({ message: error.message });
    if (error instanceof Error && error.message === "Unauthorized") return res.status(401).json({ message: "管理者としてログインしてください。" });
    console.error("Tarot API failed", { code: (error as { code?: string })?.code ?? "unknown" });
    return res.status(503).json({ message: "現在受付情報を確認できません。しばらくしてから再度お試しください。" });
  }
}

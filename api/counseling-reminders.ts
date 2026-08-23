import {
  appointmentTemplateValues,
  counselorEmail,
  createServiceClient,
  defaultSettings,
  renderTemplate,
  sendCounselingEmail
} from "./_lib/counseling";

declare const process: {
  env: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const authorization = Array.isArray(req.headers?.authorization) ? req.headers?.authorization[0] : req.headers?.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const serviceClient = await createServiceClient();
    const now = new Date();
    const windowStart = new Date(now.getTime() + 17.5 * 3_600_000).toISOString();
    const windowEnd = new Date(now.getTime() + 18.5 * 3_600_000).toISOString();
    const [settingsResult, appointmentsResult] = await Promise.all([
      serviceClient.from("counseling_settings").select("*").eq("id", true).maybeSingle(),
      serviceClient
        .from("counseling_appointments")
        .select("*, counseling_clients(*)")
        .eq("status", "confirmed")
        .is("reminder_sent_at", null)
        .gte("starts_at", windowStart)
        .lt("starts_at", windowEnd)
    ]);
    if (settingsResult.error) throw settingsResult.error;
    if (appointmentsResult.error) throw appointmentsResult.error;
    const fallback = defaultSettings();
    const reminderTemplate = String(settingsResult.data?.reminder_template || fallback.reminder_template);
    const results: Array<{ bookingId: string; sent: boolean }> = [];

    for (const appointment of appointmentsResult.data ?? []) {
      const client = appointment.counseling_clients as Record<string, unknown>;
      const text = renderTemplate(reminderTemplate, appointmentTemplateValues(appointment, client));
      try {
        await sendCounselingEmail({
          to: String(client.email),
          replyTo: counselorEmail,
          subject: "【Leoの個別カウンセリング】予約前日のリマインド",
          text,
          idempotencyKey: `counseling-reminder-${appointment.booking_id}`
        });
        await serviceClient.from("counseling_appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", appointment.id);
        results.push({ bookingId: appointment.booking_id, sent: true });
      } catch (error) {
        console.error("Counseling reminder delivery failed.", {
          bookingId: appointment.booking_id,
          message: error instanceof Error ? error.message : "Unknown error"
        });
        results.push({ bookingId: appointment.booking_id, sent: false });
      }
    }

    return res.status(200).json({ checked: appointmentsResult.data?.length ?? 0, results });
  } catch (error) {
    console.error("Counseling reminder cron failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return res.status(500).json({ message: "Reminder processing failed." });
  }
}

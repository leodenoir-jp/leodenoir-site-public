type ContactRequest = {
  method?: string;
  body?: unknown;
};

declare const process: {
  env: Record<string, string | undefined>;
};

type ContactResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (body: unknown) => void;
    end: (body?: string) => void;
  };
};

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  clientType?: unknown;
  inquiryType?: unknown;
  message?: unknown;
  subject?: unknown;
  copyToRequester?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toBoolean(value: unknown) {
  return value === true || value === "true";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBody(body: unknown): ContactPayload {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as ContactPayload;
    } catch {
      return {};
    }
  }

  if (body && typeof body === "object") {
    return body as ContactPayload;
  }

  return {};
}

async function sendResendEmail({
  resendApiKey,
  fromEmail,
  to,
  replyTo,
  subject,
  text,
  html
}: {
  resendApiKey: string;
  fromEmail: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      reply_to: replyTo,
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Resend email send failed.", {
      status: response.status,
      statusText: response.statusText,
      errorBody
    });
    throw new Error("Failed to send email.");
  }
}

export default async function handler(req: ContactRequest, res: ContactResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;

  if (!resendApiKey || !toEmail || !fromEmail) {
    console.error("Contact API configuration error: required mail environment variables are missing.");
    return res.status(500).json({ message: "Mail environment variables are not configured." });
  }

  const body = normalizeBody(req.body);
  const name = toText(body.name);
  const email = toText(body.email);
  const clientType = toText(body.clientType);
  const inquiryType = toText(body.inquiryType);
  const message = toText(body.message);
  const requestedSubject = toText(body.subject);
  const copyToRequester = toBoolean(body.copyToRequester);

  if (!name || !email || !inquiryType || !message) {
    return res.status(400).json({ message: "Required fields are missing." });
  }

  if (!emailPattern.test(email)) {
    return res.status(400).json({ message: "Email address is invalid." });
  }

  const subject = requestedSubject || "お問い合わせがありました";
  const text = [
    "公式サイトから通知がありました。",
    "",
    `名前: ${name}`,
    `メールアドレス: ${email}`,
    `法人/個人: ${clientType || "未選択"}`,
    `種別: ${inquiryType}`,
    "",
    "内容:",
    message
  ].join("\n");

  const html = `
    <p>公式サイトから通知がありました。</p>
    <dl>
      <dt>名前</dt>
      <dd>${escapeHtml(name)}</dd>
      <dt>メールアドレス</dt>
      <dd>${escapeHtml(email)}</dd>
      <dt>法人/個人</dt>
      <dd>${escapeHtml(clientType || "未選択")}</dd>
      <dt>種別</dt>
      <dd>${escapeHtml(inquiryType)}</dd>
    </dl>
    <p><strong>内容</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>
  `;

  try {
    await sendResendEmail({
      resendApiKey,
      fromEmail,
      to: toEmail,
      replyTo: email,
      subject,
      text,
      html
    });

    if (copyToRequester) {
      await sendResendEmail({
        resendApiKey,
        fromEmail,
        to: email,
        replyTo: toEmail,
        subject,
        text,
        html
      });
    }
  } catch (error) {
    console.error("Resend email request failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });

    return res.status(500).json({ message: "Failed to send email." });
  }

  return res.status(200).json({ message: "OK" });
}

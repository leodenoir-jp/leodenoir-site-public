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
  copySubject?: unknown;
  copyMessage?: unknown;
  recipientGroup?: unknown;
  displayLanguage?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const defaultLearningTutorEmail = "yu.leobiz003@outlook.com";

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

  if (body && typeof body === "object") return body as ContactPayload;
  return {};
}

function formatDisplayLanguage(value: string) {
  const labels: Record<string, string> = {
    ja: "日本語",
    en: "English",
    "zh-Hant": "繁體中文"
  };

  return labels[value] ?? (value || "未指定");
}

function renderEmailHtml(content: string) {
  return `
    <div style="font-family: 'Yu Gothic', '游ゴシック', YuGothic, 'Hiragino Kaku Gothic ProN', Meiryo, Arial, sans-serif; color: #111827; line-height: 1.75; font-size: 15px;">
      ${content}
    </div>
  `;
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
  const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.STUDENT_AUTH_FROM_EMAIL;
  const body = normalizeBody(req.body);
  const name = toText(body.name);
  const email = toText(body.email);
  const clientType = toText(body.clientType);
  const inquiryType = toText(body.inquiryType);
  const message = toText(body.message);
  const requestedSubject = toText(body.subject);
  const copyToRequester = toBoolean(body.copyToRequester);
  const copySubject = toText(body.copySubject);
  const copyMessage = toText(body.copyMessage);
  const recipientGroup = toText(body.recipientGroup);
  const displayLanguage = formatDisplayLanguage(toText(body.displayLanguage));
  const contactToEmail = process.env.CONTACT_TO_EMAIL || process.env.LEARNING_TUTOR_TO_EMAIL || defaultLearningTutorEmail;
  const purchaseToEmail = process.env.PURCHASE_TO_EMAIL;
  const learningTutorEmail = process.env.LEARNING_TUTOR_TO_EMAIL || defaultLearningTutorEmail;

  if (!name || !email || !inquiryType || !message) {
    return res.status(400).json({ message: "Required fields are missing." });
  }

  if (!emailPattern.test(email)) {
    return res.status(400).json({ message: "Email address is invalid." });
  }

  const recipientEmail = recipientGroup === "purchase"
    ? (purchaseToEmail || contactToEmail)
    : recipientGroup === "learningTutor"
      ? learningTutorEmail
      : contactToEmail;

  if (!resendApiKey || !recipientEmail || !fromEmail) {
    console.error("Contact API configuration error: required mail environment variables are missing.", {
      recipientGroup: recipientGroup || "default",
      hasResendApiKey: Boolean(resendApiKey),
      hasRecipientEmail: Boolean(recipientEmail),
      hasFromEmail: Boolean(fromEmail)
    });
    return res.status(500).json({ message: "Mail environment variables are not configured." });
  }

  if (!emailPattern.test(recipientEmail)) {
    console.error("Contact API configuration error: recipient email address is invalid.", {
      recipientGroup: recipientGroup || "default"
    });
    return res.status(500).json({ message: "Recipient email address is invalid." });
  }

  const ownerRecipient = recipientEmail.toLowerCase() === defaultLearningTutorEmail
    || (contactToEmail ? recipientEmail.toLowerCase() === contactToEmail.toLowerCase() : false);
  const subject = requestedSubject || "お問い合わせがありました";
  const text = [
    "公式サイトから通知がありました。",
    "",
    `名前: ${name}`,
    `メールアドレス: ${email}`,
    `法人/個人: ${clientType || "未選択"}`,
    `種別: ${inquiryType}`,
    ownerRecipient ? `表示言語: ${displayLanguage}` : "",
    "",
    "内容:",
    message
  ].filter(Boolean).join("\n");

  const html = renderEmailHtml(`
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
      ${ownerRecipient ? `<dt>表示言語</dt><dd>${escapeHtml(displayLanguage)}</dd>` : ""}
    </dl>
    <p><strong>内容</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>
  `);

  try {
    await sendResendEmail({
      resendApiKey,
      fromEmail,
      to: recipientEmail,
      replyTo: email,
      subject,
      text,
      html
    });

    if (copyToRequester) {
      const requesterText = copyMessage || text;
      try {
        await sendResendEmail({
          resendApiKey,
          fromEmail,
          to: email,
          replyTo: recipientEmail,
          subject: copySubject || subject,
          text: requesterText,
          html: renderEmailHtml(`<p>${escapeHtml(requesterText).replace(/\n/g, "<br />")}</p>`)
        });
      } catch (error) {
        console.error("Requester copy email failed.", {
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  } catch (error) {
    console.error("Resend email request failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });

    return res.status(500).json({ message: "Failed to send email." });
  }

  return res.status(200).json({ message: "OK" });
}

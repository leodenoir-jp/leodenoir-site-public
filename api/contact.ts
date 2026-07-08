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
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

export default async function handler(req: ContactRequest, res: ContactResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;

  if (!resendApiKey || !toEmail || !fromEmail) {
    return res.status(500).json({ message: "Mail environment variables are not configured." });
  }

  const body = normalizeBody(req.body);
  const name = toText(body.name);
  const email = toText(body.email);
  const clientType = toText(body.clientType);
  const inquiryType = toText(body.inquiryType);
  const message = toText(body.message);

  if (!name || !email || !inquiryType || !message) {
    return res.status(400).json({ message: "Required fields are missing." });
  }

  if (!emailPattern.test(email)) {
    return res.status(400).json({ message: "Email address is invalid." });
  }

  const text = [
    "公式サイトからお問い合わせがありました。",
    "",
    `お名前: ${name}`,
    `メールアドレス: ${email}`,
    `法人／個人: ${clientType || "未選択"}`,
    `問い合わせ種別: ${inquiryType}`,
    "",
    "お問い合わせ内容:",
    message
  ].join("\n");

  const html = `
    <p>公式サイトからお問い合わせがありました。</p>
    <dl>
      <dt>お名前</dt>
      <dd>${escapeHtml(name)}</dd>
      <dt>メールアドレス</dt>
      <dd>${escapeHtml(email)}</dd>
      <dt>法人／個人</dt>
      <dd>${escapeHtml(clientType || "未選択")}</dd>
      <dt>問い合わせ種別</dt>
      <dd>${escapeHtml(inquiryType)}</dd>
    </dl>
    <p><strong>お問い合わせ内容</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      reply_to: email,
      subject: `Webサイトからのお問い合わせ: ${name}`,
      text,
      html
    })
  });

  if (!response.ok) {
    return res.status(500).json({ message: "Failed to send email." });
  }

  return res.status(200).json({ message: "OK" });
}

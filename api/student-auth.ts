type StudentAuthRequest = {
  method?: string;
  body?: unknown;
};

declare const process: {
  env: Record<string, string | undefined>;
};

type StudentAuthResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (body: unknown) => void;
  };
};

type StudentAuthPayload = {
  identifier?: unknown;
  redirectTo?: unknown;
  mode?: unknown;
  name?: unknown;
  provider?: unknown;
};

type StudentRecord = {
  student_id: string;
  name: string | null;
  email: string;
  provider: string | null;
  zoom_link?: string | null;
  created_at: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBody(body: unknown): StudentAuthPayload {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as StudentAuthPayload;
    } catch {
      return {};
    }
  }

  if (body && typeof body === "object") return body as StudentAuthPayload;
  return {};
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  subject,
  text,
  html
}: {
  resendApiKey: string;
  fromEmail: string;
  to: string;
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
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Student auth email send failed.", {
      status: response.status,
      statusText: response.statusText,
      errorBody
    });
    throw new Error("Failed to send student auth email.");
  }
}

async function findStudentEmailById({
  supabaseUrl,
  serviceRoleKey,
  studentId
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  studentId: string;
}) {
  const params = new URLSearchParams({
    student_id: `eq.${studentId}`,
    select: "email",
    limit: "1"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/students?${params.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Student lookup failed.", {
      status: response.status,
      statusText: response.statusText,
      errorBody
    });
    throw new Error("Student lookup failed.");
  }

  const records = await response.json() as { email?: string }[];
  return records[0]?.email ?? "";
}

async function generateUniqueStudentId(serviceClient: any) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const studentId = `STU-${Math.floor(100000 + Math.random() * 900000)}`;
    const { data, error } = await serviceClient
      .from("students")
      .select("student_id")
      .eq("student_id", studentId)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data?.student_id) return studentId;
  }

  throw new Error("Could not generate a unique Student ID.");
}

async function upsertStudentProfile({
  serviceClient,
  authUserId,
  email,
  name,
  provider
}: {
  serviceClient: any;
  authUserId: string;
  email: string;
  name: string;
  provider: string;
}) {
  const { data: existing, error: findError } = await serviceClient
    .from("students")
    .select("student_id,name,email,provider,created_at")
    .eq("email", email)
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (existing?.student_id) {
    const { data: updated, error: updateError } = await serviceClient
      .from("students")
      .update({
        auth_user_id: authUserId,
        name: existing.name || name,
        provider,
        updated_at: new Date().toISOString()
      })
      .eq("email", email)
      .select("student_id,name,email,provider,created_at")
      .single();

    if (updateError) {
      throw updateError;
    }
    return updated as StudentRecord;
  }

  const studentId = await generateUniqueStudentId(serviceClient);
  const { data: inserted, error: insertError } = await serviceClient
    .from("students")
    .insert({
      auth_user_id: authUserId,
      student_id: studentId,
      email,
      name,
      provider
    })
    .select("student_id,name,email,provider,created_at")
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted as StudentRecord;
}

export default async function handler(req: StudentAuthRequest, res: StudentAuthResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.STUDENT_AUTH_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !resendApiKey || !fromEmail) {
    console.error("Student auth configuration error: required environment variables are missing.", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseAnonKey: Boolean(supabaseAnonKey),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasResendApiKey: Boolean(resendApiKey),
      hasFromEmail: Boolean(fromEmail)
    });
    return res.status(500).json({ message: "Student auth environment variables are not configured." });
  }

  const body = normalizeBody(req.body);
  const identifier = toText(body.identifier).toLowerCase();
  const redirectTo = toText(body.redirectTo);
  const mode = toText(body.mode) === "signup" ? "signup" : "signin";
  const provider = toText(body.provider) === "google" ? "google" : "email";

  if (!identifier) {
    return res.status(400).json({ message: "Identifier is required." });
  }

  let email = identifier;
  if (mode === "signin" && !emailPattern.test(identifier)) {
    email = await findStudentEmailById({ supabaseUrl, serviceRoleKey, studentId: identifier.toUpperCase() });
  }

  if (!email || !emailPattern.test(email)) {
    return res.status(404).json({ message: "Student was not found." });
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const displayName = toText(body.name) || email.split("@")[0];

    const { data, error } = await authClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: redirectTo || undefined,
        data: {
          name: displayName,
          provider
        }
      }
    });

    const actionLink = data?.properties?.action_link;
    const authUserId = data?.user?.id;
    if (error || !actionLink || !authUserId) {
      console.error("Supabase student auth link generation failed.", {
        message: error?.message ?? "Auth link or user id was not returned.",
        status: error?.status
      });
      return res.status(500).json({ message: "Failed to create sign-in link." });
    }

    const student = await upsertStudentProfile({
      serviceClient,
      authUserId,
      email,
      name: displayName,
      provider
    });

    const subject = mode === "signup"
      ? "StudentID登録リンクをお送りします"
      : "Student Dashboardサインインリンクをお送りします";
    const text = [
      `${student.name || displayName} 様`,
      "",
      mode === "signup"
        ? "Leo de Noir / Workaholic Owl Learning のStudentID登録リンクをお送りします。"
        : "Leo de Noir / Workaholic Owl Learning のサインインリンクをお送りします。",
      "",
      `StudentID: ${student.student_id}`,
      "",
      "以下のリンクからStudent Dashboardを開いてください。",
      actionLink,
      "",
      "このリンクは本人確認用です。第三者へ転送しないでください。",
      "",
      "Leo de Noir / Workaholic Owl"
    ].join("\n");

    await sendResendEmail({
      resendApiKey,
      fromEmail,
      to: email,
      subject,
      text,
      html: renderEmailHtml(`
        <p>${escapeHtml(student.name || displayName)} 様</p>
        <p>${mode === "signup"
          ? "Leo de Noir / Workaholic Owl Learning のStudentID登録リンクをお送りします。"
          : "Leo de Noir / Workaholic Owl Learning のサインインリンクをお送りします。"
        }</p>
        <p><strong>StudentID:</strong> ${escapeHtml(student.student_id)}</p>
        <p><a href="${escapeHtml(actionLink)}" style="display:inline-block; padding: 10px 16px; background:#111827; color:#ffffff; text-decoration:none; border-radius: 6px;">Student Dashboardを開く</a></p>
        <p>このリンクは本人確認用です。第三者へ転送しないでください。</p>
        <p>Leo de Noir / Workaholic Owl</p>
      `)
    });
  } catch (error) {
    console.error("Student auth request failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return res.status(500).json({ message: "Failed to send sign-in link." });
  }

  return res.status(200).json({ message: "OK" });
}

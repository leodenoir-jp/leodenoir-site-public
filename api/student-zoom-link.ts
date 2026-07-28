type StudentZoomLinkRequest = {
  method?: string;
  body?: unknown;
};

type StudentZoomLinkResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (body: unknown) => void;
  };
};

type StudentZoomLinkPayload = {
  studentId?: unknown;
  name?: unknown;
  email?: unknown;
  zoomLink?: unknown;
};

declare const process: {
  env: Record<string, string | undefined>;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeBody(body: unknown): StudentZoomLinkPayload {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as StudentZoomLinkPayload;
    } catch {
      return {};
    }
  }

  if (body && typeof body === "object") return body as StudentZoomLinkPayload;
  return {};
}

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function handler(req: StudentZoomLinkRequest, res: StudentZoomLinkResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Student zoom link configuration error: Supabase environment variables are missing.");
    return res.status(500).json({ message: "Supabase environment variables are not configured." });
  }

  const body = normalizeBody(req.body);
  const email = toText(body.email).toLowerCase();
  const studentId = toText(body.studentId);
  const name = toText(body.name) || email.split("@")[0];
  const zoomLink = toText(body.zoomLink);

  if (!emailPattern.test(email) || !studentId) {
    return res.status(400).json({ message: "Student ID and email are required." });
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: existing, error: lookupError } = await serviceClient
      .from("students")
      .select("student_id,email")
      .eq("email", email)
      .maybeSingle();

    if (lookupError) {
      console.error("Student zoom link lookup failed.", { message: lookupError.message });
      return res.status(500).json({ message: "Student lookup failed." });
    }

    if (existing?.email) {
      const { error: updateError } = await serviceClient
        .from("students")
        .update({
          zoom_link: zoomLink || null,
          updated_at: new Date().toISOString()
        })
        .eq("email", email);

      if (updateError) {
        console.error("Student zoom link update failed.", { message: updateError.message });
        return res.status(500).json({ message: "Student zoom link update failed." });
      }

      return res.status(200).json({ ok: true });
    }

    const { error: insertError } = await serviceClient
      .from("students")
      .insert({
        student_id: studentId,
        email,
        name,
        provider: "email",
        zoom_link: zoomLink || null
      });

    if (insertError) {
      console.error("Student zoom link insert failed.", {
        message: insertError.message,
        code: insertError.code
      });
      return res.status(500).json({ message: "Student zoom link insert failed." });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Student zoom link request failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return res.status(500).json({ message: "Student zoom link request failed." });
  }
}

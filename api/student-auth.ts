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

export default async function handler(req: StudentAuthRequest, res: StudentAuthResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error("Student auth configuration error: Supabase environment variables are missing.");
    return res.status(500).json({ message: "Supabase environment variables are not configured." });
  }

  const body = normalizeBody(req.body);
  const identifier = toText(body.identifier).toLowerCase();
  const redirectTo = toText(body.redirectTo);

  if (!identifier) {
    return res.status(400).json({ message: "Identifier is required." });
  }

  let email = identifier;
  if (!emailPattern.test(identifier)) {
    email = await findStudentEmailById({ supabaseUrl, serviceRoleKey, studentId: identifier.toUpperCase() });
  }

  if (!email || !emailPattern.test(email)) {
    return res.status(404).json({ message: "Student was not found." });
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo || undefined
      }
    });

    if (error) {
      console.error("Supabase magic link send failed.", {
        message: error.message,
        status: error.status
      });
      return res.status(500).json({ message: "Failed to send sign-in link." });
    }
  } catch (error) {
    console.error("Student auth request failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return res.status(500).json({ message: "Failed to send sign-in link." });
  }

  return res.status(200).json({ message: "OK" });
}

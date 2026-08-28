type StudentProfileRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

declare const process: {
  env: Record<string, string | undefined>;
};

type StudentProfileResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (body: unknown) => void;
  };
};

type StudentProfilePayload = {
  name?: unknown;
  provider?: unknown;
};

type StudentRecord = {
  id: string;
  student_id: string;
  name: string | null;
  email: string;
  provider: string | null;
  zoom_link?: string | null;
  created_at: string;
};

type LessonPackageRecord = {
  lesson_kind: "japanese" | "english";
  lesson_menu_id: string;
  package_label: string;
  currency: "USD" | "JPY";
  unit_price: number;
  purchased_lessons: number;
  remaining_lessons: number;
  purchased_at: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeBody(body: unknown): StudentProfilePayload {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as StudentProfilePayload;
    } catch {
      return {};
    }
  }

  if (body && typeof body === "object") return body as StudentProfilePayload;
  return {};
}

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getHeader(req: StudentProfileRequest, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function toProfile(record: StudentRecord) {
  return {
    studentId: record.student_id,
    name: record.name || record.email.split("@")[0],
    email: record.email.toLowerCase(),
    provider: record.provider === "google" ? "google" : "email",
    createdAt: record.created_at,
    zoomLink: record.zoom_link || ""
  };
}

async function toProfileWithPackages(serviceClient: any, record: StudentRecord) {
  const { data, error } = await serviceClient
    .from("lesson_packages")
    .select("lesson_kind,lesson_menu_id,package_label,currency,unit_price,purchased_lessons,remaining_lessons,purchased_at")
    .eq("student_id", record.id)
    .order("purchased_at", { ascending: false });
  if (error) throw error;
  const packages = (data ?? []) as LessonPackageRecord[];
  console.info("Student package profile loaded.", {
    studentId: record.student_id,
    packageCount: packages.length,
    purchasedLessons: packages.reduce((total, item) => total + Number(item.purchased_lessons), 0),
    remainingLessons: packages.reduce((total, item) => total + Number(item.remaining_lessons), 0)
  });
  return {
    ...toProfile(record),
    lessonCredits: packages.map((item) => ({
      lessonKind: item.lesson_kind,
      lessonMenuId: item.lesson_menu_id,
      packageLabel: item.package_label,
      currency: item.currency,
      unitPrice: Number(item.unit_price),
      purchasedLessons: Number(item.purchased_lessons),
      remainingLessons: Number(item.remaining_lessons),
      purchasedAt: item.purchased_at
    }))
  };
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

export default async function handler(req: StudentProfileRequest, res: StudentProfileResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error("Student profile configuration error: Supabase environment variables are missing.");
    return res.status(500).json({ message: "Supabase environment variables are not configured." });
  }

  const authorization = getHeader(req, "authorization");
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return res.status(401).json({ message: "Authentication token is required." });
  }

  const body = normalizeBody(req.body);

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);

    if (userError || !userData.user?.email) {
      console.error("Student profile auth verification failed.", {
        message: userError?.message ?? "Authenticated user email was not found."
      });
      return res.status(401).json({ message: "Authentication failed." });
    }

    const email = userData.user.email.toLowerCase();
    if (!emailPattern.test(email)) {
      return res.status(400).json({ message: "Authenticated email is invalid." });
    }

    const provider = userData.user.app_metadata?.provider === "google" ? "google" : toText(body.provider) || "email";
    const name = toText(body.name)
      || toText(userData.user.user_metadata?.name)
      || toText(userData.user.user_metadata?.full_name)
      || email.split("@")[0];

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: linkedRecord, error: linkedRecordError } = await serviceClient
      .from("students")
      .select("id,student_id,name,email,provider,zoom_link,created_at")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (linkedRecordError) {
      console.error("Student profile auth linkage lookup failed.", { message: linkedRecordError.message });
      return res.status(500).json({ message: "Student profile lookup failed." });
    }

    const { data: emailRecord, error: findError } = await serviceClient
      .from("students")
      .select("id,student_id,name,email,provider,zoom_link,created_at")
      .eq("email", email)
      .maybeSingle();

    if (findError) {
      console.error("Student profile lookup failed.", { message: findError.message });
      return res.status(500).json({ message: "Student profile lookup failed." });
    }

    const existing = linkedRecord ?? emailRecord;
    if (linkedRecord && emailRecord && linkedRecord.id !== emailRecord.id) {
      console.error("Student profile linkage conflict detected.", {
        authStudentId: linkedRecord.student_id,
        emailStudentId: emailRecord.student_id
      });
      return res.status(409).json({ message: "Student account linkage requires administrator review." });
    }

    if (existing?.student_id) {
      const { data: updated, error: updateError } = await serviceClient
        .from("students")
        .update({
          auth_user_id: userData.user.id,
          email,
          name: existing.name || name,
          provider,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .select("id,student_id,name,email,provider,zoom_link,created_at")
        .single();

      if (updateError) {
        console.error("Student profile update failed.", { message: updateError.message });
        return res.status(500).json({ message: "Student profile update failed." });
      }

      return res.status(200).json({ profile: await toProfileWithPackages(serviceClient, updated as StudentRecord) });
    }

    const studentId = await generateUniqueStudentId(serviceClient);
    const { data: inserted, error: insertError } = await serviceClient
      .from("students")
      .insert({
        auth_user_id: userData.user.id,
        student_id: studentId,
        email,
        name,
        provider
      })
      .select("id,student_id,name,email,provider,zoom_link,created_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: racedExisting } = await serviceClient
          .from("students")
          .select("id,student_id,name,email,provider,zoom_link,created_at")
          .eq("email", email)
          .maybeSingle();

        if (racedExisting?.student_id) {
          return res.status(200).json({ profile: await toProfileWithPackages(serviceClient, racedExisting as StudentRecord) });
        }
      }

      console.error("Student profile insert failed.", {
        message: insertError.message,
        code: insertError.code
      });
      return res.status(500).json({ message: "Student profile insert failed." });
    }

    return res.status(200).json({ profile: await toProfileWithPackages(serviceClient, inserted as StudentRecord) });
  } catch (error) {
    console.error("Student profile request failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return res.status(500).json({ message: "Student profile request failed." });
  }
}

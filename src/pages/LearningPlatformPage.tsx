import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../App";
import { handleNav } from "../components/Layout";
import { Seo } from "../components/Seo";
import { importedLessonReviews } from "../data/lessonReviews";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabaseClient";
import {
  type BookingRecord,
  type BookingStatus,
  type CustomerRecord,
  type DeliveryMode,
  type LessonKind,
  type LessonMenu,
  type PlatformLanguage,
  demoBookings,
  demoCustomer,
  englishPronunciationMenus,
  japaneseLessonMenus,
  languageLabels,
  lessonVideos,
  lessonProducts
} from "../data/platform";

type LearningPlatformPageProps = {
  route: Route;
};

type BookingFormState = {
  name: string;
  email: string;
  deliveryMode: DeliveryMode;
  lessonMenuId: string;
  lessonCount: number;
  durationMinutes: number;
  requestedSlot: string;
  requestedSlots: TutorAvailabilitySlot[];
  timezone: string;
  purpose: string;
  recurringRequest: boolean;
};

type RequestChange = {
  bookingId: string;
  type: "reschedule_requested" | "cancel_requested";
  reason: string;
};

type StudentProfile = {
  studentId: string;
  name: string;
  email: string;
  provider: "google" | "email";
  createdAt: string;
  zoomLink?: string;
};

type SupabaseUserLike = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

type AuthStatus = "idle" | "checking" | "signed-in" | "failed";

type LessonReview = {
  id: string;
  studentName: string;
  studentEmail?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  postedAt: string;
  status: "approved" | "pending";
};

type MenuDisplayText = {
  category: string;
  name: string;
  description: string;
  note?: string;
};

type DisplayLessonMenu = LessonMenu & {
  display: MenuDisplayText;
};

type TutorAvailabilitySlot = {
  id: string;
  start: string;
  end: string;
  timezone: string;
  deliveryMode: DeliveryMode;
  note: string;
};

type SharedScheduleReservation = {
  starts_at: string;
  ends_at: string;
  source_type: "learning" | "counseling";
  source_id: string;
  status: "active" | "cancelled";
};

type LearningAdminStudent = {
  id: string;
  student_id: string;
  email: string;
  name: string | null;
  zoom_link: string | null;
};

type LearningPurchaseOffer = {
  id: string;
  offer_id: string;
  lesson_kind: LessonKind;
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
  display_language: PlatformLanguage;
  status: "pending_payment" | "paid" | "cancelled";
  offered_at: string;
  paid_at: string | null;
  receipt_sent_at: string | null;
  students: LearningAdminStudent;
};

const storageKey = "ldn-platform-language";
const studentEmailKey = "ldn-platform-student-email";
const tutorSessionKey = "ldn-platform-tutor-session-email";
const tutorAdminSessionKey = "ldn-counseling-admin-session";
const authPendingKey = "ldn-platform-auth-pending";
const availabilityStorageKey = "ldn-platform-tutor-availability";
const bookingsStorageKey = "ldn-platform-bookings";
const studentProfilesStorageKey = "ldn-platform-student-profiles";
const ownerEmail = "yu.leobiz003@outlook.com";

function hasAuthCallbackInUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.has("code") || params.has("error") || window.location.hash.includes("access_token") || window.location.hash.includes("error");
}

function getAuthCallbackError() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("error_description") || params.get("error") || hashParams.get("error_description") || hashParams.get("error");
}
const tutorLoginPlaceholder = "yourtutor@info.com";

const jpyUnitPriceOptions = [
  ...Array.from({ length: 21 }, (_, index) => index * 500),
  ...Array.from({ length: 20 }, (_, index) => 11_000 + index * 1_000)
];

function getClosestJpyUnitPriceIndex(value: number) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  jpyUnitPriceOptions.forEach((option, index) => {
    const distance = Math.abs(option - value);
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  });
  return closestIndex;
}

const initialBlockedStudents = ["blocked.student@example.com"];
const weekDayLabels = [
  { value: 0, label: "日" },
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" }
];
const availabilityDurationOptions = [25, 50, 75];
const availabilityTimeStepMinutes = 30;
const availabilityTimeStepMax = (24 * 60 / availabilityTimeStepMinutes) - 1;

type PlatformNotification = {
  name: string;
  email: string;
  inquiryType: string;
  message: string;
  subject?: string;
  copyToRequester?: boolean;
  copySubject?: string;
  copyMessage?: string;
  recipientGroup?: "default" | "purchase" | "learningTutor";
  displayLanguage?: PlatformLanguage;
};

async function sendPlatformNotification({
  name,
  email,
  inquiryType,
  message,
  subject,
  copyToRequester,
  copySubject,
  copyMessage,
  recipientGroup,
  displayLanguage
}: PlatformNotification) {
  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        name,
        email,
        clientType: "個人",
        inquiryType,
        message,
        subject,
        copyToRequester,
        copySubject,
        copyMessage,
        recipientGroup,
        displayLanguage
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function getSupabaseAccessToken() {
  const supabase = getSupabaseClient();
  if (!supabase) return "";
  const result = await supabase.auth.getSession();
  return result.data.session?.access_token ?? "";
}

async function syncLearningScheduleReservations(bookings: BookingRecord[], slots: TutorAvailabilitySlot[]) {
  try {
    const token = await getSupabaseAccessToken();
    if (!token) return "skipped" as const;
    const response = await fetch("/api/counseling", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action: "sync-learning",
        reservations: bookings.map((booking, index) => ({
          sourceId: booking.id,
          start: booking.requestedSlot,
          durationMinutes: getSlotDurationMinutes(slots[index])
        }))
      })
    });
    if (response.status === 409) return "conflict" as const;
    return response.ok ? "synced" as const : "failed" as const;
  } catch {
    return "failed" as const;
  }
}

async function updateLearningScheduleReservation(sourceId: string, active: boolean) {
  try {
    const token = await getSupabaseAccessToken();
    if (!token) return false;
    const response = await fetch("/api/counseling", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "update-learning", sourceId, active })
    });
    return response.ok;
  } catch {
    return false;
  }
}

const initialAvailabilitySlots: TutorAvailabilitySlot[] = [];
const sampleAvailabilitySlotIds = new Set(["AV-1001", "AV-1002", "AV-1003", "AV-1004", "AV-1005", "AV-1006", "AV-1007", "AV-1008"]);
const initialStudentProfiles: StudentProfile[] = [
  {
    studentId: "STU-2201",
    name: demoCustomer.name,
    email: demoCustomer.email,
    provider: "email",
    createdAt: "2026-07-20T10:00:00+09:00",
    zoomLink: "https://zoom.us/j/leo-student-demo"
  }
];

const initialBookingForm: BookingFormState = {
  name: "",
  email: "",
  deliveryMode: "online",
  lessonMenuId: "jp-trial",
  lessonCount: 1,
  durationMinutes: 25,
  requestedSlot: "",
  requestedSlots: [],
  timezone: "Asia/Tokyo",
  purpose: "",
  recurringRequest: false
};

export function LearningPlatformPage({ route }: LearningPlatformPageProps) {
  const [language, setLanguage] = useState<PlatformLanguage>(() => {
    const saved = window.localStorage.getItem(storageKey);
    return saved === "en" || saved === "zh-Hant" || saved === "ja" ? saved : "ja";
  });
  const [bookings, setBookingsBase] = useState<BookingRecord[]>(() => {
    const saved = window.localStorage.getItem(bookingsStorageKey);
    if (!saved) return demoBookings;
    try {
      const parsed = JSON.parse(saved) as BookingRecord[];
      return Array.isArray(parsed) ? parsed : demoBookings;
    } catch {
      return demoBookings;
    }
  });
  const [customer] = useState<CustomerRecord>(demoCustomer);
  const [studentEmail, setStudentEmail] = useState(() => window.localStorage.getItem(studentEmailKey) ?? "");
  const [studentProfiles, setStudentProfilesBase] = useState<StudentProfile[]>(() => {
    const saved = window.localStorage.getItem(studentProfilesStorageKey);
    if (!saved) return initialStudentProfiles;
    try {
      const parsed = JSON.parse(saved) as StudentProfile[];
      return Array.isArray(parsed) ? parsed : initialStudentProfiles;
    } catch {
      return initialStudentProfiles;
    }
  });
  const [bookingForm, setBookingForm] = useState<BookingFormState>(initialBookingForm);
  const [bookingMessage, setBookingMessage] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (
    hasAuthCallbackInUrl() || window.sessionStorage.getItem(authPendingKey) ? "checking" : "idle"
  ));
  const [authStatusMessage, setAuthStatusMessage] = useState(() => (
    hasAuthCallbackInUrl() || window.sessionStorage.getItem(authPendingKey)
      ? "Googleログインの状態を確認しています。少しだけお待ちください。"
      : ""
  ));
  const [blockedStudents, setBlockedStudents] = useState<string[]>(initialBlockedStudents);
  const [reviews, setReviews] = useState<LessonReview[]>(importedLessonReviews);
  const [availabilitySlots, setAvailabilitySlotsBase] = useState<TutorAvailabilitySlot[]>(() => {
    const saved = window.localStorage.getItem(availabilityStorageKey);
    if (!saved) return initialAvailabilitySlots;
    try {
      const parsed = JSON.parse(saved) as TutorAvailabilitySlot[];
      return Array.isArray(parsed) ? parsed.filter((slot) => !sampleAvailabilitySlotIds.has(slot.id)) : initialAvailabilitySlots;
    } catch {
      return initialAvailabilitySlots;
    }
  });
  const [sharedAvailabilitySlots, setSharedAvailabilitySlots] = useState<TutorAvailabilitySlot[]>([]);
  const [sharedReservations, setSharedReservations] = useState<SharedScheduleReservation[]>([]);
  const [changeRequest, setChangeRequest] = useState<RequestChange>({
    bookingId: demoBookings[0]?.id ?? "",
    type: "reschedule_requested",
    reason: ""
  });

  const mode = getMode(route.path);
  const selectedProduct = lessonProducts.find((product) => route.path.endsWith(product.kind)) ?? lessonProducts[0];
  const supabaseAvailable = isSupabaseConfigured();

  useEffect(() => {
    let mounted = true;
    const loadSharedSchedule = async () => {
      try {
        const [learningAvailabilityResponse, availabilityResponse, occupancyResponse] = await Promise.all([
          fetch("/api/learning?mode=availability", { headers: { Accept: "application/json" } }),
          fetch("/api/counseling?mode=availability", { headers: { Accept: "application/json" } }),
          fetch("/api/counseling?mode=occupancy", { headers: { Accept: "application/json" } })
        ]);
        if (!learningAvailabilityResponse.ok || !availabilityResponse.ok || !occupancyResponse.ok) return;
        if (!learningAvailabilityResponse.headers.get("content-type")?.includes("application/json")) return;
        if (!availabilityResponse.headers.get("content-type")?.includes("application/json")) return;
        if (!occupancyResponse.headers.get("content-type")?.includes("application/json")) return;
        const learningAvailabilityBody = await learningAvailabilityResponse.json() as { slots?: TutorAvailabilitySlot[] };
        const availabilityBody = await availabilityResponse.json() as { slots?: Array<{ id: string; start: string; timezone: string }> };
        const occupancyBody = await occupancyResponse.json() as { reservations?: SharedScheduleReservation[] };
        if (!mounted) return;
        setAvailabilitySlotsBase(learningAvailabilityBody.slots ?? []);
        setSharedAvailabilitySlots((availabilityBody.slots ?? []).map((slot) => ({
          id: `SHARED-${slot.id}`,
          start: slot.start,
          end: new Date(new Date(slot.start).getTime() + 50 * 60_000).toISOString(),
          timezone: slot.timezone,
          deliveryMode: "online",
          note: "共通オンライン候補枠"
        })));
        setSharedReservations(occupancyBody.reservations ?? []);
      } catch (error) {
        console.error("Shared schedule lookup failed.", {
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    };
    void loadSharedSchedule();
    return () => { mounted = false; };
  }, []);

  const bookableAvailabilitySlots = useMemo(() => {
    const combined = [...availabilitySlots, ...sharedAvailabilitySlots];
    const unique = Array.from(new Map(combined.map((slot) => [`${new Date(slot.start).toISOString()}-${slot.deliveryMode}`, slot])).values());
    return unique.filter((slot) => !sharedReservations.some((reservation) => (
      reservation.status === "active"
      && new Date(slot.start).getTime() < new Date(reservation.ends_at).getTime()
      && new Date(slot.end).getTime() > new Date(reservation.starts_at).getTime()
    )));
  }, [availabilitySlots, sharedAvailabilitySlots, sharedReservations]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let mounted = true;

    const applyUser = async (user: SupabaseUserLike | null) => {
      if (!mounted || !user?.email) return false;
      let profile: StudentProfile;
      try {
        profile = await ensureSupabaseStudentProfile(user, studentProfiles);
      } catch (error) {
        console.error("Supabase student profile sync failed.", {
          message: error instanceof Error ? error.message : "Unknown error"
        });
        profile = buildStudentProfileFromSupabaseUser(user, studentProfiles);
      }
      if (!mounted) return false;
      if (studentProfiles.some((item) => item.email.toLowerCase() === profile.email.toLowerCase())) {
        setStudentProfiles(studentProfiles.map((item) => (
          item.email.toLowerCase() === profile.email.toLowerCase() ? { ...item, ...profile } : item
        )));
      } else {
        setStudentProfiles([...studentProfiles, profile]);
      }
      setStudentEmail(profile.email);
      setBookingForm((current) => ({ ...current, email: profile.email, name: profile.name }));
      window.localStorage.setItem(studentEmailKey, profile.email);
      window.sessionStorage.removeItem(authPendingKey);
      setAuthStatus("signed-in");
      setAuthStatusMessage("Googleログインが完了しました。");
      return true;
    };

    const resolveAuthSession = async () => {
      const hasAuthReturn = hasAuthCallbackInUrl() || Boolean(window.sessionStorage.getItem(authPendingKey));
      const callbackError = getAuthCallbackError();
      if (callbackError) {
        window.sessionStorage.removeItem(authPendingKey);
        setAuthStatus("failed");
        setAuthStatusMessage(`Googleログインを完了できませんでした：${callbackError}`);
        return;
      }
      if (hasAuthReturn) {
        setAuthStatus("checking");
        setAuthStatusMessage("Googleログインの状態を確認しています。少しだけお待ちください。");
      }

      let applied = false;
      const hasAuthCode = new URLSearchParams(window.location.search).has("code");
      if (hasAuthCode) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          console.error("Supabase OAuth callback exchange failed.", { message: error.message });
          setAuthStatus("failed");
          setAuthStatusMessage(`Googleログイン後の確認でエラーが発生しました：${error.message}`);
        } else {
          window.history.replaceState({}, "", window.location.pathname);
          applied = await applyUser(data.session?.user ?? null);
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Supabase session lookup failed.", { message: error.message });
      }
      applied = (await applyUser(data.session?.user ?? null)) || applied;

      const userResult = await supabase.auth.getUser();
      if (userResult.error) {
        console.error("Supabase user lookup failed.", { message: userResult.error.message });
      }
      applied = (await applyUser(userResult.data.user)) || applied;

      if (hasAuthReturn && !applied) {
        window.sessionStorage.removeItem(authPendingKey);
        setAuthStatus("failed");
        setAuthStatusMessage("Googleログイン後のセッションを確認できませんでした。SupabaseのRedirect URLとVercelの環境変数を確認してください。");
      }
    };

    void resolveAuthSession();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [studentProfiles]);

  const handleLanguageChange = (nextLanguage: PlatformLanguage) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem(storageKey, nextLanguage);
  };

  const setAvailabilitySlots = (nextSlots: TutorAvailabilitySlot[] | ((current: TutorAvailabilitySlot[]) => TutorAvailabilitySlot[])) => {
    setAvailabilitySlotsBase((current) => {
      const resolved = typeof nextSlots === "function" ? nextSlots(current) : nextSlots;
      window.localStorage.setItem(availabilityStorageKey, JSON.stringify(resolved));
      return resolved;
    });
  };

  const setBookings = (nextBookings: BookingRecord[] | ((current: BookingRecord[]) => BookingRecord[])) => {
    setBookingsBase((current) => {
      const resolved = typeof nextBookings === "function" ? nextBookings(current) : nextBookings;
      window.localStorage.setItem(bookingsStorageKey, JSON.stringify(resolved));
      return resolved;
    });
  };

  const setStudentProfiles = (profiles: StudentProfile[]) => {
    setStudentProfilesBase(profiles);
    window.localStorage.setItem(studentProfilesStorageKey, JSON.stringify(profiles));
  };

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const studentCopy = getStudentPageCopy(language);
    const emailForRequest = (bookingForm.email || studentEmail).trim().toLowerCase();
    const nameForRequest = bookingForm.name.trim();
    const requestedLessonKind = getBookingLessonKind(bookingForm);
    const bookableLessonKinds = getBookableLessonKinds(emailForRequest, customer);
    const lessonKind = bookableLessonKinds.includes(requestedLessonKind) ? requestedLessonKind : bookableLessonKinds[0] ?? requestedLessonKind;
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForRequest);
    const menus = getEligibleBookingMenus(lessonKind, emailForRequest, customer);
    const menu = menus.find((item) => item.id === bookingForm.lessonMenuId) ?? menus[0];
    const requestedSlots = bookingForm.requestedSlots.filter((slot) => !isAvailabilitySlotBooked(slot, bookings));

    if (blockedStudents.includes(emailForRequest)) {
      setBookingMessage(studentCopy.blockedMessage);
      return;
    }

    if (!nameForRequest || !emailForRequest || !emailIsValid || requestedSlots.length === 0 || !menu) {
      setBookingMessage(studentCopy.validationError);
      return;
    }

    const requestGroupLabel = bookingForm.recurringRequest || requestedSlots.length > 1 ? `定期予約候補 ${requestedSlots.length}枠` : "単発予約";
    const menuDisplay = getMenuText(menu, "ja");
    const nextBookings: BookingRecord[] = requestedSlots.map((slot, index) => ({
      id: `BR-${Math.floor(2000 + Math.random() * 7000)}-${index + 1}`,
      student: nameForRequest,
      studentEmail: emailForRequest,
      lessonKind,
      requestedAt: new Date().toISOString(),
      requestedSlot: slot.start,
      timezone: slot.timezone,
      status: "requested",
      reason: [
        `${menuDisplay.category}：${menuDisplay.name} / ${slot.deliveryMode === "online" ? "オンライン" : "対面"}`,
        `${getSlotDurationMinutes(slot)}分`,
        requestGroupLabel,
        `候補枠: ${formatAvailabilityRange(slot)}`
      ].join(" / "),
      approvalGate: "tutor",
      creditAction: "hold"
    }));

    const scheduleSync = await syncLearningScheduleReservations(nextBookings, requestedSlots);
    if (scheduleSync === "conflict") {
      setBookingMessage("選択した候補枠は、別の予約により受付できなくなりました。カレンダーを再読み込みして別の日時をお選びください。");
      return;
    }

    const notificationSent = await sendPlatformNotification({
      name: nameForRequest,
      email: emailForRequest,
      inquiryType: "Learning予約リクエスト",
      displayLanguage: language,
      message: [
        "Learningページから予約リクエストが送信されました。",
        "",
        `生徒名: ${nameForRequest}`,
        `メールアドレス: ${emailForRequest}`,
        `レッスン種別: ${lessonKind === "japanese" ? "1on1日本語レッスン" : "英語発音コーチング"}`,
        `レッスンメニュー: ${menu.name}`,
        `リクエスト種別: ${requestGroupLabel}`,
        "",
        "候補枠:",
        ...requestedSlots.map((slot) => `- ${formatAvailabilityRange(slot)} / ${slot.deliveryMode === "online" ? "オンライン" : "対面"} / ${slot.timezone}`),
      ].join("\n")
    });

    setBookings((current) => [...nextBookings, ...current]);
    setStudentEmail(emailForRequest);
    window.localStorage.setItem(studentEmailKey, emailForRequest);
    setBookingForm({ ...initialBookingForm, name: nameForRequest, email: emailForRequest, lessonMenuId: menu.id });
    setChangeRequest((current) => ({ ...current, bookingId: nextBookings[0].id }));
    setBookingMessage(
      notificationSent
        ? studentCopy.bookingSuccess(nextBookings.length)
        : studentCopy.bookingMailError(nextBookings.length)
    );
  };

  const updateBookingStatus = (bookingId: string, status: BookingStatus, reason?: string) => {
    setBookings((current) =>
      current.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              status,
              reason: reason ?? booking.reason,
              approvalGate: status === "approved" ? "none" : "tutor",
              creditAction: status === "approved" ? "consumed" : booking.creditAction
            }
          : booking
      )
    );
  };

  const submitChangeRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const studentCopy = getStudentPageCopy(language);

    if (!changeRequest.bookingId || !changeRequest.reason.trim()) {
      setBookingMessage(studentCopy.changeValidationError);
      return;
    }

    const booking = bookings.find((item) => item.id === changeRequest.bookingId);
    const requestLabel = changeRequest.type === "cancel_requested" ? "キャンセル" : "日程変更";
    const displayRequestLabel = changeRequest.type === "cancel_requested" ? studentCopy.cancel : studentCopy.reschedule;
    const notificationSent = await sendPlatformNotification({
      name: booking?.student ?? "Student",
      email: booking?.studentEmail ?? studentEmail,
      inquiryType: "Learning日程変更・キャンセルリクエスト",
      displayLanguage: language,
      message: [
        `Learningページから${requestLabel}リクエストが送信されました。`,
        "",
        `リクエスト種別: ${requestLabel}`,
        `予約ID: ${changeRequest.bookingId}`,
        `対象日時: ${booking ? `${formatDateTime(booking.requestedSlot)} (${booking.timezone})` : "未確認"}`,
        `生徒名: ${booking?.student ?? "未確認"}`,
        `メールアドレス: ${booking?.studentEmail ?? studentEmail}`,
        "",
        "理由:",
        changeRequest.reason.trim()
      ].join("\n")
    });

    updateBookingStatus(changeRequest.bookingId, changeRequest.type, changeRequest.reason.trim());
    setBookingMessage(
      notificationSent
        ? studentCopy.changeSuccess(displayRequestLabel)
        : studentCopy.changeMailError(displayRequestLabel)
    );
    setChangeRequest((current) => ({ ...current, reason: "" }));
  };

  return (
    <>
      <Seo
        title="Learning Menu"
        description="Leo de Noir / Workaholic Owl の Learning Menu は、1on1日本語レッスンと英語発音コーチングの受講申込み、予約管理、受講履歴の確認ができる学習者向けサービスです。"
      />
      <section className="page-hero platform-hero">
        <div className="container platform-hero-grid">
          <div>
            <p className="eyebrow">Leo de Noir / Workaholic Owl</p>
            <h1>Learning Menu</h1>
            <p>
              Leo de Noir / Workaholic Owl の Learning Menu は、1on1日本語レッスンと英語発音コーチングのメニュー・受講方法を確認し、
              受講申込み、予約リクエスト、確定済み予約、受講履歴、購入済みレッスンパッケージを管理するための学習者向けサービスです。
            </p>
          </div>
          <div className="platform-switcher" aria-label="Language selector">
            {(Object.keys(languageLabels) as PlatformLanguage[]).map((item) => (
              <button key={item} className={item === language ? "active" : ""} type="button" onClick={() => handleLanguageChange(item)}>
                {languageLabels[item]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section platform-section">
        <div className="container">
          <PlatformNav route={route} activePath={route.path} />
          {mode === "learning" ? (
            <LearningHome route={route} language={language} />
          ) : mode === "reviews" ? (
            <LessonReviewPage
              language={language}
              reviews={reviews}
              setReviews={setReviews}
              studentEmail={studentEmail}
            />
          ) : mode === "tutor" ? (
            <TutorAvailabilityPage
              language={language}
              bookings={bookings}
              setBookings={setBookings}
              customer={customer}
              studentProfiles={studentProfiles}
              setStudentProfiles={setStudentProfiles}
              studentEmail={studentEmail}
              setStudentEmail={setStudentEmail}
              availabilitySlots={availabilitySlots}
              setAvailabilitySlots={setAvailabilitySlots}
              reviews={reviews}
              setReviews={setReviews}
            />
          ) : mode === "lesson" ? (
            <LessonLanding
              route={route}
              product={selectedProduct}
              language={language}
              bookingForm={bookingForm}
              setBookingForm={setBookingForm}
              blockedStudents={blockedStudents}
            />
          ) : (
            <StudentDashboard
              language={language}
              bookings={bookings}
              customer={customer}
              studentProfiles={studentProfiles}
              setStudentProfiles={setStudentProfiles}
              studentEmail={studentEmail}
              setStudentEmail={setStudentEmail}
              blockedStudents={blockedStudents}
              setBlockedStudents={setBlockedStudents}
              bookingForm={bookingForm}
              setBookingForm={setBookingForm}
              submitBooking={submitBooking}
              changeRequest={changeRequest}
              setChangeRequest={setChangeRequest}
              submitChangeRequest={submitChangeRequest}
              bookingMessage={bookingMessage}
              availabilitySlots={bookableAvailabilitySlots}
              supabaseAvailable={supabaseAvailable}
              authStatus={authStatus}
              authStatusMessage={authStatusMessage}
            />
          )}
        </div>
      </section>
    </>
  );
}

function PlatformNav({ route, activePath }: { route: Route; activePath: string }) {
  const normalizedActivePath = activePath === "/platform" ? "/learning/student" : activePath;
  const links = [
    { href: "/learning", label: "Summary" },
    { href: "/learning/japanese", label: "Japanese Lesson" },
    { href: "/learning/english", label: "English Coaching" },
    { href: "/learning/student", label: "Student Page" },
    { href: "/learning/reviews", label: "Lesson Review" }
  ];

  return (
    <nav className="platform-nav" aria-label="Learning platform navigation">
      {links.map((link) => (
        <a
          key={link.href}
          className={normalizedActivePath === link.href ? "active" : ""}
          href={link.href}
          onClick={(event) => {
            event.preventDefault();
            route.navigate(link.href);
          }}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

function LearningHome({ route, language }: { route: Route; language: PlatformLanguage }) {
  return (
    <div className="platform-stack">
      <div className="platform-band">
        <div>
          <h2>学習メニュー</h2>
          <p>1on1日本語レッスンと英語発音コーチングの内容・料金・受講方法を確認できます。目的や現在地に合わせて、必要なメニューをお選びください。</p>
        </div>
        <p className="platform-badge">Online / In-person</p>
      </div>
      <div className="platform-grid two">
        {lessonProducts.map((product) => {
          const copy = product.copy[language];
          return (
            <article className="platform-card feature-card" key={product.kind}>
              <img src={product.image} alt="" />
              <p className="eyebrow">{copy.eyebrow}</p>
              <h3>{copy.title}</h3>
              <p>{copy.summary}</p>
              <button className="button primary" type="button" onClick={() => route.navigate(product.path)}>
                メニューを見る
              </button>
            </article>
          );
        })}
      </div>
      <div className="platform-card">
        <p className="eyebrow">App Information</p>
        <h3>Leo de Noir / Workaholic Owl Learning Menu</h3>
        <p>
          本サービスでは、Googleログインまたはメールリンクを利用して学習者アカウントを作成・認証します。ログイン後は、レッスンの予約リクエスト、
          確定済み予約、受講履歴、購入済みレッスンパッケージの状況を確認できます。
        </p>
        <p>
          Googleログインでは、Googleアカウントの氏名、メールアドレス、プロフィール画像、Googleが発行するアカウント識別子を取得する場合があります。
          取得した情報は、学習者アカウントの作成・識別、Student IDとの紐づけ、本人認証、予約管理、受講履歴・購入済みパッケージの表示、
          レッスンに関する連絡のためだけに使用します。Gmail、Googleドライブ、Googleカレンダーのデータにはアクセスせず、広告配信、データ販売、
          信用評価、AIモデルの学習には使用しません。
        </p>
        <p lang="en">
          Leo de Noir / Workaholic Owl Learning Menu is a learner service for 1-on-1 Japanese lessons and English pronunciation coaching.
          Users can review lesson menus and methods, request enrollment and bookings, and check confirmed bookings, lesson history, and purchased lesson packages.
          Google Sign-In may provide the user&apos;s name, email address, profile image, and Google account identifier. We use this information only to create and
          identify the learner account, link a Student ID, authenticate the user, manage bookings, display lesson history and purchased packages, and send
          lesson-related communications. We do not access Gmail, Google Drive, or Google Calendar data, and we do not use Google user data for advertising,
          data sales, credit decisions, or AI model training.
        </p>
        <p>
          Googleユーザーデータを含む個人情報の取得、利用、保存、共有、削除については{" "}
          <a href="/privacy" onClick={(event) => handleNav(event, "/privacy", route.navigate)}>プライバシーポリシー</a>をご確認ください。
        </p>
      </div>
    </div>
  );
}

function LessonLanding({
  route,
  product,
  language,
  bookingForm,
  setBookingForm,
  blockedStudents
}: {
  route: Route;
  product: (typeof lessonProducts)[number];
  language: PlatformLanguage;
  bookingForm: BookingFormState;
  setBookingForm: (form: BookingFormState) => void;
  blockedStudents: string[];
}) {
  const copy = product.copy[language];
  const menus = getLessonMenus(product.kind);
  const menuLabel = getLessonMenuLabelCopy(language);
  const selectedMenu = menus.find((menu) => menu.id === bookingForm.lessonMenuId) ?? menus[0];
  const availableDurations = selectedMenu?.durations ?? [50];
  const availableCounts = selectedMenu?.purchaseCounts ?? [1];
  const priceSummary = selectedMenu ? buildPriceSummary(selectedMenu, bookingForm.deliveryMode, bookingForm.durationMinutes, bookingForm.lessonCount) : "";
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);

  return (
    <div className="platform-stack">
      <div className="lesson-landing">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p>{copy.summary}</p>
          <div className="delivery-grid">
            <article>
              <span>{menuLabel.deliveryOnlineKicker}</span>
              <strong>{menuLabel.deliveryOnlineTitle}</strong>
              <p>{menuLabel.deliveryOnlineDescription}</p>
            </article>
            <article>
              <span>{menuLabel.deliveryInPersonKicker}</span>
              <strong>{menuLabel.deliveryInPersonTitle}</strong>
              <p>{menuLabel.deliveryInPersonDescription}</p>
            </article>
          </div>
        </div>
        <img src={product.image} alt="" />
      </div>

      <LessonMenuGrid menus={menus} language={language} bookingForm={bookingForm} setBookingForm={setBookingForm} />

      <div className="platform-grid two">
        <div className="platform-column">
          <LessonPurchaseCard
            menus={menus}
            selectedMenu={selectedMenu}
            availableDurations={availableDurations}
            availableCounts={availableCounts}
            bookingForm={bookingForm}
            setBookingForm={setBookingForm}
            priceSummary={priceSummary}
            language={language}
            onOpenPurchaseDialog={() => setPurchaseDialogOpen(true)}
            onContact={() => route.navigate("/contact")}
          />
        </div>

        <aside className="platform-card">
          <LessonRules language={language} lessonKind={product.kind} />
          <LessonVideoCarousel language={language} lessonKind={product.kind} />
          <p className="platform-note">{product.timezoneLabel}</p>
          <button className="button secondary" type="button" onClick={() => route.navigate("/learning/student")}>
            {menuLabel.studentButton}
          </button>
        </aside>
      </div>

      {purchaseDialogOpen ? (
        <PurchaseDialog
          bookingForm={bookingForm}
          selectedMenu={selectedMenu}
          language={language}
          priceSummary={priceSummary}
          blockedStudents={blockedStudents}
          onClose={() => setPurchaseDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}

function LessonVideoCarousel({ language, lessonKind }: { language: PlatformLanguage; lessonKind: LessonKind }) {
  const [videoLanguage, setVideoLanguage] = useState<PlatformLanguage>(language);
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<"next" | "previous">("next");
  const touchStartX = useRef<number | null>(null);
  const copy = getLessonVideoGalleryCopy(language);
  const videos = [...lessonVideos[lessonKind][videoLanguage]].sort((first, second) => first.order - second.order);
  const activeVideo = videos[activeIndex];
  const youtubeId = activeVideo ? getYouTubeVideoId(activeVideo.youtubeId, activeVideo.youtubeUrl) : null;

  useEffect(() => {
    setVideoLanguage(language);
  }, [language]);

  useEffect(() => {
    setActiveIndex(0);
  }, [lessonKind, videoLanguage]);

  const moveTo = (nextIndex: number, nextDirection: "next" | "previous") => {
    if (videos.length < 2) return;
    setDirection(nextDirection);
    setActiveIndex((nextIndex + videos.length) % videos.length);
  };

  const moveBy = (delta: number) => {
    moveTo(activeIndex + delta, delta > 0 ? "next" : "previous");
  };

  return (
    <section
      className="lesson-video-section"
      aria-labelledby="lesson-video-title"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveBy(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveBy(1);
        }
      }}
    >
      <div className="lesson-video-heading">
        <div>
          <p className="eyebrow">Video</p>
          <h3 id="lesson-video-title">{copy.title}</h3>
          <p>{copy.lead}</p>
        </div>
        <div className="platform-switcher lesson-video-language-switcher" aria-label={copy.languageLabel}>
          {(Object.keys(languageLabels) as PlatformLanguage[]).map((item) => (
            <button
              key={item}
              className={item === videoLanguage ? "active" : ""}
              type="button"
              aria-pressed={item === videoLanguage}
              onClick={() => setVideoLanguage(item)}
            >
              {languageLabels[item]}
            </button>
          ))}
        </div>
      </div>

      <div
        className="lesson-video-viewport"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          if (touchStartX.current === null) return;
          const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
          const distance = endX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(distance) < 40) return;
          moveBy(distance < 0 ? 1 : -1);
        }}
      >
        <article
          className={`lesson-video-slide ${direction}`}
          key={`${activeVideo?.id ?? "empty"}-${direction}`}
          aria-live="polite"
        >
          {youtubeId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`}
              title={activeVideo.title}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="lesson-video-pending" aria-label={`${activeVideo?.title ?? copy.title} - ${copy.comingSoon}`}>
              <span>YouTube</span>
              <strong>{copy.comingSoon}</strong>
              <p>{copy.emptyDescription}</p>
            </div>
          )}
          <h4>{activeVideo?.title}</h4>
          {activeVideo?.description ? <p className="lesson-video-description">{activeVideo.description}</p> : null}
        </article>

        {videos.length > 1 ? (
          <>
            <button className="lesson-video-arrow previous" type="button" onClick={() => moveBy(-1)} aria-label={copy.previous}>
              ‹
            </button>
            <button className="lesson-video-arrow next" type="button" onClick={() => moveBy(1)} aria-label={copy.next}>
              ›
            </button>
          </>
        ) : null}
      </div>

      <div className="lesson-video-footer">
        <div className="lesson-video-dots" aria-label={copy.positionLabel}>
          {videos.map((video, index) => (
            <button
              className={index === activeIndex ? "active" : ""}
              type="button"
              key={video.id}
              aria-label={`${index + 1} / ${videos.length}: ${video.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => moveTo(index, index >= activeIndex ? "next" : "previous")}
            />
          ))}
        </div>
        <span>{activeIndex + 1} / {videos.length}</span>
      </div>
    </section>
  );
}

function getYouTubeVideoId(youtubeId?: string, youtubeUrl?: string) {
  const directId = youtubeId?.trim();
  if (directId) return directId;
  if (!youtubeUrl?.trim()) return null;

  try {
    const url = new URL(youtubeUrl);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    const queryId = url.searchParams.get("v");
    if (queryId) return queryId;
    const parts = url.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex((part) => part === "embed" || part === "shorts");
    return markerIndex >= 0 ? parts[markerIndex + 1] ?? null : null;
  } catch {
    return null;
  }
}

function getLessonVideoGalleryCopy(language: PlatformLanguage) {
  const copies = {
    ja: {
      title: "1on1日本語レッスン動画",
      lead: "講師について、レッスンで得られること、コースの特徴を動画でご覧いただけます。",
      languageLabel: "動画の言語",
      comingSoon: "準備中",
      emptyDescription: "動画の公開後、この画面でそのまま再生できます。",
      previous: "前の動画",
      next: "次の動画",
      positionLabel: "動画の現在位置"
    },
    en: {
      title: "1-on-1 Japanese Lesson Videos",
      lead: "Learn about your tutor, the benefits of the lessons, and the course features.",
      languageLabel: "Video language",
      comingSoon: "Coming soon",
      emptyDescription: "The video will play here once it is published.",
      previous: "Previous video",
      next: "Next video",
      positionLabel: "Current video position"
    },
    "zh-Hant": {
      title: "一對一日語課程影片",
      lead: "透過影片了解講師、課程優勢與各課程特色。",
      languageLabel: "影片語言",
      comingSoon: "準備中",
      emptyDescription: "影片公開後即可直接在此播放。",
      previous: "上一部影片",
      next: "下一部影片",
      positionLabel: "目前影片位置"
    }
  };

  return copies[language];
}

function LessonRules({ language, lessonKind }: { language: PlatformLanguage; lessonKind: LessonKind }) {
  const copy = getLessonRuleCopy(language, lessonKind);

  return (
    <div className="lesson-rules">
      <h3>{copy.title}</h3>
      <div>
        <h4>{copy.ruleTitle}</h4>
        <ul className="platform-list">
          {copy.rules.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function LessonPurchaseCard({
  menus,
  selectedMenu,
  availableDurations,
  availableCounts,
  bookingForm,
  setBookingForm,
  priceSummary,
  language,
  onOpenPurchaseDialog,
  onContact
}: {
  menus: LessonMenu[];
  selectedMenu: LessonMenu;
  availableDurations: number[];
  availableCounts: number[];
  bookingForm: BookingFormState;
  setBookingForm: (form: BookingFormState) => void;
  priceSummary: string;
  language: PlatformLanguage;
  onOpenPurchaseDialog: () => void;
  onContact: () => void;
}) {
  const selectedMenuText = getMenuText(selectedMenu, language);
  const text = getLessonMenuLabelCopy(language);

  return (
    <section className="platform-card platform-form" id="course-purchase" tabIndex={-1}>
      <h3>{text.purchaseTitle}</h3>
      <p className="platform-muted">{text.purchaseLead}</p>
      <label>
        {text.lessonMenu}
        <select
          value={selectedMenu.id}
          onChange={(event) => {
            const nextMenu = menus.find((menu) => menu.id === event.target.value) ?? menus[0];
            setBookingForm({
              ...bookingForm,
              lessonMenuId: nextMenu.id,
              durationMinutes: nextMenu.durations[0],
              lessonCount: nextMenu.purchaseCounts[0]
            });
          }}
        >
          {menus.map((menu) => (
            <option key={menu.id} value={menu.id}>
              {getMenuText(menu, language).category}：{getMenuText(menu, language).name}
            </option>
          ))}
        </select>
      </label>
      <p className="platform-note">{text.selected}: {selectedMenuText.category}：{selectedMenuText.name}</p>
      <fieldset className="delivery-methods">
        <legend>{text.deliverySelectTitle}</legend>
        <label className={bookingForm.deliveryMode === "online" ? "active" : ""}>
          <input
            type="radio"
            name="purchase-delivery-mode"
            checked={bookingForm.deliveryMode === "online"}
            onChange={() => setBookingForm({ ...bookingForm, deliveryMode: "online" })}
          />
          <span>
            <strong>{text.online}</strong>
          </span>
        </label>
        <label className={bookingForm.deliveryMode === "inPerson" ? "active" : ""}>
          <input
            type="radio"
            name="purchase-delivery-mode"
            checked={bookingForm.deliveryMode === "inPerson"}
            onChange={() => setBookingForm({ ...bookingForm, deliveryMode: "inPerson" })}
          />
          <span>
            <strong>{text.inPerson}</strong>
          </span>
        </label>
      </fieldset>
      <div className="platform-grid two">
        <label>
          {text.duration}
          <select value={bookingForm.durationMinutes} onChange={(event) => setBookingForm({ ...bookingForm, durationMinutes: Number(event.target.value) })}>
            {availableDurations.map((duration) => (
              <option key={duration} value={duration}>
                {duration}{text.minutes}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.count}
          <select value={bookingForm.lessonCount} onChange={(event) => setBookingForm({ ...bookingForm, lessonCount: Number(event.target.value) })}>
            {availableCounts.map((count) => (
              <option key={count} value={count}>
                {count}{text.lessons}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="price-preview">{priceSummary}</p>
      {bookingForm.deliveryMode === "inPerson" ? (
        <p className="platform-note">{text.inPersonNote}</p>
      ) : null}
      <button className="button primary" type="button" onClick={bookingForm.deliveryMode === "inPerson" ? onContact : onOpenPurchaseDialog}>
        {bookingForm.deliveryMode === "inPerson" ? text.contactButton : text.purchaseButton}
      </button>
    </section>
  );
}

function LessonMenuGrid({
  menus,
  language,
  bookingForm,
  setBookingForm
}: {
  menus: LessonMenu[];
  language: PlatformLanguage;
  bookingForm: BookingFormState;
  setBookingForm: (form: BookingFormState) => void;
}) {
  const text = getLessonMenuLabelCopy(language);
  const localizedMenus: DisplayLessonMenu[] = menus.map((menu) => {
    const display = getMenuText(menu, language);
    return { ...menu, category: display.category, display };
  });
  const groups = groupMenusByCategory(localizedMenus);
  const selectMenu = (menu: LessonMenu) => {
    setBookingForm({
      ...bookingForm,
      lessonMenuId: menu.id,
      durationMinutes: menu.durations[0],
      lessonCount: menu.purchaseCounts[0]
    });
    window.setTimeout(() => {
      document.getElementById("course-purchase")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <section className="platform-card">
      <h3>{text.menuTitle}</h3>
      <p className="platform-muted">{text.menuLead}</p>
      <div className="lesson-category-stack">
        {groups.map((group) => (
          <section key={group.category} className="lesson-category-section">
            <div className="lesson-category-heading">
              <span>Learning Purpose</span>
              <h4>{group.category}</h4>
            </div>
            <div className="lesson-menu-grid">
              {group.menus.map((menu) => (
                <button key={menu.id} className="lesson-menu-card" type="button" onClick={() => selectMenu(menu)}>
                  <strong>
                    <MenuTitle title={menu.display.name} />
                  </strong>
                  {menu.display.description ? <p>{menu.display.description}</p> : null}
                  <p className="price-preview">
                    <span>{text.online}: {formatUnitPrice(menu)}</span>
                    <span>{text.inPerson}: {formatUnitPrice(menu, 1.8)}</span>
                  </p>
                  {menu.display.note ? <small>{menu.display.note}</small> : null}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function MenuTitle({ title }: { title: string }) {
  const breakIndex = title.indexOf("（");
  if (breakIndex <= 0) return <>{title}</>;

  return (
    <>
      {title.slice(0, breakIndex)}
      <br />
      {title.slice(breakIndex)}
    </>
  );
}

function PurchaseDialog({
  bookingForm,
  selectedMenu,
  language,
  priceSummary,
  blockedStudents,
  onClose
}: {
  bookingForm: BookingFormState;
  selectedMenu: LessonMenu;
  language: PlatformLanguage;
  priceSummary: string;
  blockedStudents: string[];
  onClose: () => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<"PayPal" | "PayPay">("PayPal");
  const [receiptRequested, setReceiptRequested] = useState(false);
  const [receiptName, setReceiptName] = useState(bookingForm.name);
  const [receiptEmail, setReceiptEmail] = useState(bookingForm.email);
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseSent, setPurchaseSent] = useState(false);
  const text = getLessonMenuLabelCopy(language);
  const receiptCopy = getReceiptCopy(language);
  const selectedMenuText = getMenuText(selectedMenu, language);
  const receiptNumber = `LDN-RCPT-DRAFT-${new Date().toISOString().slice(0, 10).split("-").join("")}`;
  const issueDate = formatReceiptDate(new Date(), language);
  const deliveryLabel = bookingForm.deliveryMode === "online" ? receiptCopy.online : receiptCopy.inPerson;
  const receiptEmailNormalized = receiptEmail.trim().toLowerCase();
  const isBlocked = Boolean(receiptEmailNormalized && blockedStudents.includes(receiptEmailNormalized));

  const savePurchaseDraft = async () => {
    if (isBlocked) {
      setPurchaseMessage("このメールアドレスからのレッスン購入は受付できません。");
      return;
    }

    if (purchaseSubmitting || purchaseSent) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmailNormalized)) {
      setPurchaseMessage("購入希望の送信には、連絡先メールアドレスを入力してください。");
      return;
    }

    setPurchaseSubmitting(true);
    setPurchaseMessage("");
    const requesterCopy = [
      `${receiptName || "受講者"} 様`,
      "",
      "Leo de Noir / Workaholic Owl Learning Menuより、レッスンパッケージの購入希望を受け付けました。",
      "",
      "内容を確認のうえ、講師よりPayPalまたはPayPayの決済方法をご案内します。",
      "決済案内のメールをお待ちください。",
      "",
      "購入希望内容",
      `コース: ${selectedMenuText.category}：${selectedMenuText.name}`,
      `実施方法: ${bookingForm.deliveryMode === "online" ? text.online : text.inPerson}`,
      `時間: ${bookingForm.durationMinutes}${text.minutes}`,
      `購入回数: ${bookingForm.lessonCount}${text.lessons}`,
      `金額目安: ${priceSummary}`,
      `支払い方法: ${paymentMethod}`,
      `領収書発行希望: ${receiptRequested ? "あり" : "なし"}`,
      receiptRequested ? `領収書宛名: ${receiptName || "未入力"}` : "",
      "",
      "Leo de Noir / Workaholic Owl"
    ].filter(Boolean).join("\n");

    const notificationSent = await sendPlatformNotification({
      name: receiptName || "Lesson purchase draft",
      email: receiptEmail,
      inquiryType: "Learning購入希望内容確認",
      subject: "購入希望が送信されました",
      recipientGroup: "purchase",
      copyToRequester: true,
      copySubject: "購入リクエストを受け付けました",
      copyMessage: requesterCopy,
      displayLanguage: language,
      message: [
        "Learningページから購入希望内容が送信されました。",
        "",
        `表示名: ${receiptName || "未入力"}`,
        `生徒メールアドレス: ${receiptEmail || "未入力"}`,
        `コース: ${selectedMenuText.category}：${selectedMenuText.name}`,
        `実施方法: ${bookingForm.deliveryMode === "online" ? text.online : text.inPerson}`,
        `時間: ${bookingForm.durationMinutes}${text.minutes}`,
        `購入回数: ${bookingForm.lessonCount}${text.lessons}`,
        `金額目安: ${priceSummary}`,
        `支払い方法: ${paymentMethod}`,
        `領収書発行希望: ${receiptRequested ? "あり" : "なし"}`,
        receiptRequested ? `領収書宛名: ${receiptName || "未入力"}` : "",
        receiptRequested ? `領収書送付先メール: ${receiptEmail || "未入力"}` : "",
        receiptRequested ? `領収書番号: ${receiptNumber}` : ""
      ].filter(Boolean).join("\n")
    });

    setPurchaseSubmitting(false);
    setPurchaseSent(notificationSent);
    setPurchaseMessage(
      notificationSent
        ? "購入希望を送信しました。講師からの決済方法案内をお待ちください。"
        : "購入希望を送信できませんでした。時間をおいて再度お試しいただくか、直接お問い合わせください。"
    );
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className={`modal-panel purchase-panel ${purchaseSent ? "is-complete" : ""}`} role="dialog" aria-modal="true" aria-labelledby="purchase-dialog-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="購入画面を閉じる">
          ×
        </button>
        <h3 id="purchase-dialog-title">購入希望内容確認</h3>
        {purchaseMessage ? <p className={isBlocked || !purchaseSent ? "form-error" : "form-success"}>{purchaseMessage}</p> : null}
        {purchaseSent ? (
          <div className="purchase-complete" role="status">
            <strong>送信完了</strong>
            <span>購入希望を受け付けました。講師からの決済方法案内をメールでお送りします。</span>
          </div>
        ) : null}
        <div className="purchase-summary">
          <p><strong>{text.course}</strong><span>{selectedMenuText.category}：{selectedMenuText.name}</span></p>
          <p><strong>{text.deliveryMode}</strong><span>{bookingForm.deliveryMode === "online" ? text.online : text.inPerson}</span></p>
          <p><strong>{text.duration}</strong><span>{bookingForm.durationMinutes}{text.minutes}</span></p>
          <p><strong>{text.count}</strong><span>{bookingForm.lessonCount}{text.lessons}</span></p>
          <p><strong>{text.priceEstimate}</strong><span>{priceSummary}</span></p>
        </div>
        <div className="platform-form">
          <fieldset className="payment-methods">
            <legend>支払い方法確認</legend>
            <label>
              <input type="radio" name="payment-method" checked={paymentMethod === "PayPal"} onChange={() => setPaymentMethod("PayPal")} disabled={purchaseSent} />
              PayPal
            </label>
            <label>
              <input type="radio" name="payment-method" checked={paymentMethod === "PayPay"} onChange={() => setPaymentMethod("PayPay")} disabled={purchaseSent} />
              PayPay
            </label>
          </fieldset>
          <label>
            表示名
            <input value={receiptName} onChange={(event) => setReceiptName(event.target.value)} disabled={purchaseSent} />
          </label>
          <label>
            連絡先メールアドレス
            <input type="email" value={receiptEmail} onChange={(event) => setReceiptEmail(event.target.value)} disabled={purchaseSent} required />
          </label>
          <label className="checkbox-row receipt-request-row">
            <span>領収書発行を希望する</span>
            <input type="checkbox" checked={receiptRequested} onChange={(event) => setReceiptRequested(event.target.checked)} disabled={purchaseSent} />
          </label>
          {receiptRequested ? (
            <label>
              領収書宛名
              <input value={receiptName} onChange={(event) => setReceiptName(event.target.value)} disabled={purchaseSent} />
            </label>
          ) : null}
        </div>
        {receiptRequested ? (
          <section className="receipt-preview" aria-label={receiptCopy.title}>
            <div>
              <p className="eyebrow">{receiptCopy.badge}</p>
              <h4>{receiptCopy.title}</h4>
            </div>
            <dl>
              <div>
                <dt>{receiptCopy.receiptNo}</dt>
                <dd>{receiptNumber}</dd>
              </div>
              <div>
                <dt>{receiptCopy.issueDate}</dt>
                <dd>{issueDate}</dd>
              </div>
              <div>
                <dt>{receiptCopy.recipient}</dt>
                <dd>{receiptName || receiptCopy.notSet}</dd>
              </div>
              <div>
                <dt>{receiptCopy.amount}</dt>
                <dd>{priceSummary}</dd>
              </div>
              <div>
                <dt>{receiptCopy.service}</dt>
                <dd>{selectedMenuText.category}：{selectedMenuText.name} / {deliveryLabel} / {bookingForm.durationMinutes}min. x {bookingForm.lessonCount}</dd>
              </div>
              <div>
                <dt>{receiptCopy.paymentMethod}</dt>
                <dd>{paymentMethod}</dd>
              </div>
              <div>
                <dt>{receiptCopy.issuer}</dt>
                <dd>
                  Leo de Noir / Workaholic Owl<br />
                  Yukiko Ukei<br />
                  https://leodenoir.com<br />
                  yu.leobiz003@outlook.com
                </dd>
              </div>
              <div>
                <dt>{receiptCopy.email}</dt>
                <dd>{receiptEmail || receiptCopy.notSet}</dd>
              </div>
            </dl>
            <p>{receiptCopy.note}</p>
          </section>
        ) : null}
        <p className="platform-note">この画面では購入希望内容を送信します。決済はこの場では完了しません。内容確認後、PayPalまたはPayPayの支払い案内をメールでお送りします。</p>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            {purchaseSent ? "閉じる" : "閉じる"}
          </button>
          <button className="button primary" type="button" onClick={savePurchaseDraft} disabled={isBlocked || purchaseSubmitting || purchaseSent}>
            {purchaseSubmitting ? "送信中..." : purchaseSent ? "送信済み" : "購入希望を送信"}
          </button>
        </div>
      </div>
    </div>
  );
}
function BookingRequestCard({
  language,
  customer,
  studentEmail,
  blockedStudents,
  bookingForm,
  setBookingForm,
  submitBooking,
  bookingMessage
}: {
  language: PlatformLanguage;
  customer: CustomerRecord;
  studentEmail: string;
  blockedStudents: string[];
  bookingForm: BookingFormState;
  setBookingForm: (form: BookingFormState) => void;
  submitBooking: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  bookingMessage: string;
}) {
  const lessonKind = getBookingLessonKind(bookingForm);
  const currentEmail = (bookingForm.email || studentEmail).trim().toLowerCase();
  const bookableLessonKinds = getBookableLessonKinds(currentEmail, customer);
  const activeLessonKind = bookableLessonKinds.includes(lessonKind) ? lessonKind : bookableLessonKinds[0];
  const menus = activeLessonKind ? getEligibleBookingMenus(activeLessonKind, currentEmail, customer) : [];
  const selectedMenu = menus.find((menu) => menu.id === bookingForm.lessonMenuId) ?? menus[0];
  const isBlocked = blockedStudents.includes(currentEmail);
  const selectedSlots = bookingForm.requestedSlots;
  const text = getStudentPageCopy(language);
  const selectedDeliveryLabel = summarizeDeliveryModes(selectedSlots, language);
  const canRequestBooking = !isBlocked && selectedSlots.length > 0 && menus.length > 0;

  return (
    <form className="platform-card platform-form" id="booking-request" onSubmit={submitBooking}>
      <h3>{text.bookingRequestTitle}</h3>
      <p className="platform-muted">{text.bookingRequestLead}</p>
      {isBlocked ? <p className="form-error">{text.blockedMessage}</p> : null}
      {bookingMessage ? <p className="form-success">{bookingMessage}</p> : null}
      <div className="platform-grid two">
        <label>
          {text.name}
          <input value={bookingForm.name} onChange={(event) => setBookingForm({ ...bookingForm, name: event.target.value })} required />
        </label>
        <label>
          {text.loginEmail}
          <input type="email" value={bookingForm.email || studentEmail} onChange={(event) => setBookingForm({ ...bookingForm, email: event.target.value })} required />
        </label>
      </div>
      <div className="platform-grid two">
        <label>
          {text.lessonKind}
          <select
            value={activeLessonKind ?? ""}
            disabled={bookableLessonKinds.length === 0}
            onChange={(event) => {
              const nextKind = event.target.value as LessonKind;
              const nextMenu = getEligibleBookingMenus(nextKind, currentEmail, customer)[0];
              if (!nextMenu) return;
              setBookingForm({
                ...bookingForm,
                lessonMenuId: nextMenu.id,
                durationMinutes: nextMenu.durations[0],
                lessonCount: nextMenu.purchaseCounts[0]
              });
            }}
          >
            {bookableLessonKinds.length === 0 ? <option value="">{text.noPurchasedPackage}</option> : null}
            {bookableLessonKinds.map((kind) => (
              <option key={kind} value={kind}>
                {formatLessonKind(kind, language)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.lessonMenu}
          <select
            value={selectedMenu?.id ?? ""}
            disabled={menus.length === 0}
            onChange={(event) => {
              const nextMenu = menus.find((menu) => menu.id === event.target.value) ?? menus[0];
              if (!nextMenu) return;
              setBookingForm({
                ...bookingForm,
                lessonMenuId: nextMenu.id,
                durationMinutes: nextMenu.durations[0],
                lessonCount: nextMenu.purchaseCounts[0]
              });
            }}
          >
            {menus.length === 0 ? <option value="">{text.noPurchasedPackage}</option> : null}
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {getMenuText(menu, language).category}：{getMenuText(menu, language).name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="platform-note">{menus.length > 0 ? text.bookableMenuNote : text.noPurchasedPackageLead}</p>
      <p className="platform-note">{text.deliveryNote}</p>
      <div className="platform-grid two">
        <label>
          {text.selectedSlots}
          <input value={selectedSlots.length > 0 ? text.selectedSlotCount(selectedSlots.length) : text.selectedSlotPlaceholder} readOnly />
        </label>
        <label>
          {text.deliveryMode}
          <input value={selectedDeliveryLabel} readOnly />
        </label>
      </div>
      <div className="selected-slot-list">
        {selectedSlots.length > 0 ? selectedSlots.map((slot) => (
          <span key={slot.id}>
            {formatAvailabilityRange(slot)} / {formatDeliveryMode(slot.deliveryMode, language)}
          </span>
        )) : <span>{text.noManualSlot}</span>}
      </div>
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={bookingForm.recurringRequest}
          onChange={(event) => setBookingForm({ ...bookingForm, recurringRequest: event.target.checked })}
        />
        {text.recurringRequest}
      </label>
      <p className="platform-note">{text.recurringNote}</p>
      <button className="button primary" type="submit" disabled={!canRequestBooking}>
        {text.bookingRequestTitle}
      </button>
    </form>
  );
}

function OwnerBlockControls({
  blockEmail,
  setBlockEmail,
  blockedStudents,
  setBlockedStudents
}: {
  blockEmail: string;
  setBlockEmail: (email: string) => void;
  blockedStudents: string[];
  setBlockedStudents: (emails: string[]) => void;
}) {
  const addBlockedStudent = () => {
    const nextEmail = blockEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return;
    if (!blockedStudents.includes(nextEmail)) {
      setBlockedStudents([...blockedStudents, nextEmail]);
    }
    setBlockEmail("");
  };

  const removeBlockedStudent = (email: string) => {
    setBlockedStudents(blockedStudents.filter((item) => item !== email));
  };

  return (
    <section className="platform-card platform-form owner-control">
      <p className="eyebrow">Owner Safety Control</p>
      <h3>ブロックリスト管理</h3>
      <p className="platform-muted">ブロックリストに追加されたメールアドレスからの予約リクエストおよび購入希望は、自動的に受付対象外となります。</p>
      <div className="platform-grid two">
        <label>
          ブロックする生徒のメールアドレス
          <input type="email" value={blockEmail} onChange={(event) => setBlockEmail(event.target.value)} placeholder="student@example.com" />
        </label>
        <button className="button primary" type="button" onClick={addBlockedStudent}>
          ブロックリストに追加
        </button>
      </div>
      <div className="blocked-list">
        {blockedStudents.map((email) => (
          <span key={email}>
            {email}
            <button type="button" onClick={() => removeBlockedStudent(email)} aria-label={`${email} をブロック解除`}>×</button>
          </span>
        ))}
      </div>
    </section>
  );
}

function LessonReviewPage({
  language,
  reviews,
  setReviews,
  studentEmail
}: {
  language: PlatformLanguage;
  reviews: LessonReview[];
  setReviews: (reviews: LessonReview[]) => void;
  studentEmail: string;
}) {
  const [reviewName, setReviewName] = useState("");
  const [reviewEmail, setReviewEmail] = useState(studentEmail);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [comment, setComment] = useState("");
  const approvedReviews = reviews.filter((review) => review.status === "approved");
  const text = getReviewCopy(language);

  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewName.trim() || !comment.trim()) return;
    const nextReview: LessonReview = {
      id: `RV-${Math.floor(2000 + Math.random() * 7000)}`,
      studentName: reviewName.trim(),
      studentEmail: reviewEmail.trim().toLowerCase(),
      rating,
      comment: comment.trim(),
      postedAt: new Date().toISOString(),
      status: "pending"
    };
    setReviews([nextReview, ...reviews]);
    setComment("");
  };

  return (
    <div className="platform-stack">
      <div className="platform-band">
        <div>
          <p className="eyebrow">Lesson Review</p>
          <h2>{text.title}</h2>
          <p>{text.summary}</p>
        </div>
        <p className="platform-badge">{text.badge}</p>
      </div>

      <form className="platform-card platform-form review-form-compact" onSubmit={submitReview}>
        <div>
          <h3>{text.formTitle}</h3>
          <p className="platform-muted">{text.formLead}</p>
        </div>
        <div className="platform-grid two">
          <label>
            {text.name}
            <input value={reviewName} onChange={(event) => setReviewName(event.target.value)} required />
          </label>
          <label>
            {text.email}
            <input type="email" value={reviewEmail} onChange={(event) => setReviewEmail(event.target.value)} />
          </label>
        </div>
        <div className="review-form-inline">
          <fieldset className="rating-picker">
            <legend>{text.rating}</legend>
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} className={star <= rating ? "active" : ""} type="button" onClick={() => setRating(star as 1 | 2 | 3 | 4 | 5)}>
                ★
              </button>
            ))}
          </fieldset>
          <button className="button primary" type="submit">
            {text.submit}
          </button>
        </div>
        <label>
          {text.comment}
          <textarea value={comment} rows={3} onChange={(event) => setComment(event.target.value)} required />
        </label>
      </form>

      <section className="platform-card">
        <h3>{text.reviewsTitle}</h3>
        <p className="platform-muted">{text.reviewsNote}</p>
        <div className="review-grid">
          {approvedReviews.length > 0 ? approvedReviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          )) : <p className="platform-muted">{text.noReviews}</p>}
        </div>
      </section>

    </div>
  );
}

function ReviewCard({ review }: { review: LessonReview }) {
  return (
    <article className="review-card">
      <div className="review-stars" aria-label={`${review.rating} stars`}>
        {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
      </div>
      <p>{review.comment}</p>
      <footer>
        <strong>{review.studentName}</strong>
        <span>{formatDateTime(review.postedAt)}</span>
      </footer>
    </article>
  );
}

function TutorAvailabilityPage({
  language,
  bookings,
  setBookings,
  customer,
  studentProfiles,
  setStudentProfiles,
  studentEmail,
  setStudentEmail,
  availabilitySlots,
  setAvailabilitySlots,
  reviews,
  setReviews
}: {
  language: PlatformLanguage;
  bookings: BookingRecord[];
  setBookings: (bookings: BookingRecord[] | ((current: BookingRecord[]) => BookingRecord[])) => void;
  customer: CustomerRecord;
  studentProfiles: StudentProfile[];
  setStudentProfiles: (profiles: StudentProfile[]) => void;
  studentEmail: string;
  setStudentEmail: (email: string) => void;
  availabilitySlots: TutorAvailabilitySlot[];
  setAvailabilitySlots: (slots: TutorAvailabilitySlot[] | ((current: TutorAvailabilitySlot[]) => TutorAvailabilitySlot[])) => void;
  reviews: LessonReview[];
  setReviews: (reviews: LessonReview[]) => void;
}) {
  const [loginEmail, setLoginEmail] = useState(() => window.localStorage.getItem(tutorSessionKey) ?? tutorLoginPlaceholder);
  const [tutorEmail, setTutorEmail] = useState(() => window.localStorage.getItem(tutorSessionKey) ?? "");
  const [loginPassword, setLoginPassword] = useState("");
  const [adminToken, setAdminToken] = useState(() => window.sessionStorage.getItem(tutorAdminSessionKey) ?? "");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [deletingAvailabilityId, setDeletingAvailabilityId] = useState("");
  const [availabilityDeleteMessage, setAvailabilityDeleteMessage] = useState("");
  const [purchaseOffers, setPurchaseOffers] = useState<LearningPurchaseOffer[]>([]);
  const [adminStudents, setAdminStudents] = useState<LearningAdminStudent[]>([]);
  const [purchaseOffersReady, setPurchaseOffersReady] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date("2026-07-01T00:00:00+09:00"));
  const [bookingCalendarMonth, setBookingCalendarMonth] = useState(() => new Date("2026-07-01T00:00:00+09:00"));
  const [selectedTutorBooking, setSelectedTutorBooking] = useState<BookingRecord | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentRegistrationForm, setStudentRegistrationForm] = useState({ studentId: "", name: "", email: "" });
  const [lessonNoteDrafts, setLessonNoteDrafts] = useState<Record<string, string>>({});
  const [lessonNoteMessages, setLessonNoteMessages] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    startDate: "",
    startTime: "19:00",
    durationMinutes: 50,
    timezone: "Asia/Tokyo",
    deliveryMode: "online" as DeliveryMode,
    note: ""
  });
  const [registrationMode, setRegistrationMode] = useState<"single" | "recurring">("single");
  const [purchaseOfferForm, setPurchaseOfferForm] = useState({
    name: "",
    email: "",
    lessonKind: "japanese" as LessonKind,
    lessonMenuId: "jp-custom-50",
    packageLabel: "1on1日本語レッスン 50分 特別パッケージ",
    durationMinutes: 50 as 25 | 50,
    quantity: 15,
    currency: "USD" as "USD" | "JPY",
    unitPrice: 28,
    paymentMethod: "PayPal" as "PayPal" | "PayPay",
    paypalFeeIncluded: false,
    paymentLink: "",
    receiptRequested: true,
    receiptName: "",
    displayLanguage: "ja" as PlatformLanguage
  });
  const [recurringForm, setRecurringForm] = useState<{
    startDate: string;
    weeks: number;
    startTime: string;
    endTime: string;
    timezone: string;
    deliveryMode: DeliveryMode;
    note: string;
    weekdays: number[];
  }>({
    startDate: "",
    weeks: 4,
    startTime: "19:00",
    endTime: "20:00",
    timezone: "Asia/Tokyo",
    deliveryMode: "online",
    note: "",
    weekdays: [1, 3, 5]
  });
  const isOwner = Boolean(adminToken);
  const purchaseOfferBaseTotal = purchaseOfferForm.unitPrice * purchaseOfferForm.quantity;
  const purchaseOfferTotal = purchaseOfferForm.paymentMethod === "PayPal" && purchaseOfferForm.paypalFeeIncluded
    ? (purchaseOfferForm.currency === "JPY" ? Math.round(purchaseOfferBaseTotal * 1.041) : Math.round(purchaseOfferBaseTotal * 1.041 * 100) / 100)
    : purchaseOfferBaseTotal;
  const pendingReviews = reviews.filter((review) => review.status === "pending");
  const pendingBookings = bookings.filter((booking) => booking.status === "requested");
  const completedBookingsWithoutNotes = bookings.filter((booking) => (
    booking.status === "approved" && isPastBooking(booking.requestedSlot) && !booking.lessonNoteSent
  ));
  const adminStudentProfiles: StudentProfile[] = adminStudents.map((student) => ({
    studentId: student.student_id,
    name: student.name || student.email,
    email: student.email.toLowerCase(),
    provider: "email",
    createdAt: "",
    zoomLink: student.zoom_link || ""
  }));
  const mergedStudentProfiles = [
    ...studentProfiles.filter((profile) => !adminStudentProfiles.some((adminProfile) => adminProfile.email === profile.email.toLowerCase())),
    ...adminStudentProfiles
  ];
  const studentPackageSummaries = buildStudentPackageSummaries(bookings, customer, mergedStudentProfiles);
  const filteredStudentPackageSummaries = studentPackageSummaries.filter((summary) => {
    const keyword = studentSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [
      summary.name,
      summary.email,
      summary.studentId,
      summary.packageLabel,
      summary.zoomLink
    ].some((value) => value.toLowerCase().includes(keyword));
  });
  const recurringEndTimeInvalid = timeToMinutes(recurringForm.endTime) <= timeToMinutes(recurringForm.startTime);
  const selectedTutorBookingZoomLink = selectedTutorBooking
    ? mergedStudentProfiles.find((profile) => profile.email.toLowerCase() === selectedTutorBooking.studentEmail.toLowerCase())?.zoomLink ?? ""
    : "";

  const mapAdminSlot = (slot: Record<string, unknown>): TutorAvailabilitySlot => ({
    id: String(slot.id),
    start: String(slot.starts_at),
    end: String(slot.ends_at),
    timezone: String(slot.timezone || "Asia/Tokyo"),
    deliveryMode: slot.delivery_mode === "inPerson" ? "inPerson" : "online",
    note: typeof slot.note === "string" ? slot.note : ""
  });

  const loadLearningAdmin = async (token: string) => {
    const response = await fetch("/api/learning?mode=admin", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    const body = await response.json() as {
      message?: string;
      slots?: Array<Record<string, unknown>>;
      offers?: LearningPurchaseOffer[];
      students?: LearningAdminStudent[];
      purchaseOffersReady?: boolean;
    };
    if (!response.ok) throw new Error(body.message || "講師管理データを取得できませんでした。");
    setAvailabilitySlots((body.slots ?? []).map(mapAdminSlot));
    setPurchaseOffers(body.offers ?? []);
    setAdminStudents(body.students ?? []);
    setPurchaseOffersReady(body.purchaseOffersReady !== false);
  };

  useEffect(() => {
    if (!adminToken) return;
    void loadLearningAdmin(adminToken).catch((error) => {
      window.sessionStorage.removeItem(tutorAdminSessionKey);
      setAdminToken("");
      setAdminMessage(error instanceof Error ? error.message : "講師管理データを取得できませんでした。");
    });
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = loginEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return;
    setAdminBusy(true);
    setAdminMessage("");
    try {
      const response = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "admin-login", email: nextEmail, password: loginPassword })
      });
      const body = await response.json() as { token?: string; message?: string };
      if (!response.ok || !body.token) throw new Error(body.message || "IDまたはパスワードが一致しません。");
      window.sessionStorage.setItem(tutorAdminSessionKey, body.token);
      window.localStorage.setItem(tutorSessionKey, nextEmail);
      setTutorEmail(nextEmail);
      setAdminToken(body.token);
      setLoginPassword("");
      await loadLearningAdmin(body.token);
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "ログインできませんでした。");
    } finally {
      setAdminBusy(false);
    }
  };

  const postLearningAdmin = async <T,>(payload: Record<string, unknown>) => {
    const response = await fetch("/api/learning", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });
    const body = await response.json() as T & { message?: string };
    if (!response.ok) throw new Error(body.message || "処理を完了できませんでした。");
    return body;
  };

  const addAvailabilitySlot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.startDate || !form.startTime) return;
    const start = `${form.startDate}T${form.startTime}`;

    const nextSlot: TutorAvailabilitySlot = {
      id: `AV-${Math.floor(2000 + Math.random() * 7000)}`,
      start,
      end: addMinutesToLocalDateTime(start, form.durationMinutes),
      timezone: form.timezone,
      deliveryMode: form.deliveryMode,
      note: form.note.trim() || "単日登録枠"
    };

    setAdminBusy(true);
    setAdminMessage("");
    try {
      const body = await postLearningAdmin<{ slots?: Array<Record<string, unknown>> }>({ action: "save-availability", slots: [nextSlot] });
      const saved = (body.slots ?? []).map(mapAdminSlot);
      setAvailabilitySlots(Array.from(new Map([...availabilitySlots, ...saved].map((slot) => [slot.id, slot])).values())
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
      setForm({ ...form, startDate: "", note: "" });
      setAdminMessage(body.message || "単日枠を保存しました。");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "単日枠を保存できませんでした。");
    } finally {
      setAdminBusy(false);
    }
  };

  const removeAvailabilitySlot = async (slotId: string) => {
    if (deletingAvailabilityId) return;
    setDeletingAvailabilityId(slotId);
    setAvailabilityDeleteMessage("空き枠を削除しています...");
    try {
      const body = await postLearningAdmin<{ slots?: Array<Record<string, unknown>> }>({ action: "delete-availability", slotId });
      const nextSlots = body.slots?.map(mapAdminSlot);
      if (nextSlots) setAvailabilitySlots(nextSlots);
      else setAvailabilitySlots((current) => current.filter((slot) => slot.id !== slotId));
      setAvailabilityDeleteMessage(body.message || "空き枠を削除しました。");
    } catch (error) {
      setAvailabilityDeleteMessage(error instanceof Error ? error.message : "空き枠を削除できませんでした。");
    } finally {
      setDeletingAvailabilityId("");
    }
  };

  const updateStudentZoomLink = (email: string, zoomLink: string) => {
    const normalizedEmail = email.toLowerCase();
    const existingProfile = studentProfiles.find((profile) => profile.email.toLowerCase() === normalizedEmail);
    const nextProfile = existingProfile ?? {
      studentId: generateStudentId(studentProfiles),
      name: normalizedEmail,
      email: normalizedEmail,
      provider: "email" as const,
      createdAt: new Date().toISOString()
    };
    const nextProfiles = existingProfile
      ? studentProfiles.map((profile) => (
          profile.email.toLowerCase() === normalizedEmail ? { ...profile, zoomLink } : profile
        ))
      : [...studentProfiles, { ...nextProfile, zoomLink }];
    setStudentProfiles(nextProfiles);
    setAdminStudents((current) => current.map((student) => (
      student.email.toLowerCase() === normalizedEmail ? { ...student, zoom_link: zoomLink } : student
    )));
  };

  const registerStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminBusy(true);
    setAdminMessage("");
    try {
      const body = await postLearningAdmin<{ student?: LearningAdminStudent }>({
        action: "upsert-student",
        ...studentRegistrationForm
      });
      if (body.student) {
        setAdminStudents((current) => [
          body.student as LearningAdminStudent,
          ...current.filter((student) => student.id !== body.student?.id)
        ]);
      }
      setStudentRegistrationForm({ studentId: "", name: "", email: "" });
      setAdminMessage(body.message || "生徒情報を登録しました。");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "生徒情報を登録できませんでした。");
    } finally {
      setAdminBusy(false);
    }
  };

  const updateLessonNoteDraft = (bookingId: string, note: string) => {
    setLessonNoteDrafts({ ...lessonNoteDrafts, [bookingId]: note });
  };

  const sendLessonNote = async (booking: BookingRecord) => {
    const note = (lessonNoteDrafts[booking.id] ?? booking.reason ?? "").trim();
    if (!note) return;
    setLessonNoteMessages({ ...lessonNoteMessages, [booking.id]: `送信中: ${booking.studentEmail}` });

    const sent = await sendPlatformNotification({
      name: booking.student,
      email: booking.studentEmail,
      inquiryType: "Learningレッスンノート",
      subject: "レッスンノートをお送りします",
      copyToRequester: true,
      displayLanguage: language,
      message: [
        "レッスンノートをお送りします。",
        "",
        `予約ID: ${booking.id}`,
        `レッスン: ${formatLessonKind(booking.lessonKind, "ja")}`,
        `日時: ${formatDateTime(booking.requestedSlot)} (${booking.timezone})`,
        "",
        "レッスンノート:",
        note
      ].join("\n")
    });

    if (!sent) {
      setLessonNoteMessages({ ...lessonNoteMessages, [booking.id]: `送信に失敗しました: ${booking.studentEmail}` });
      return;
    }

    setBookings((current) => current.map((item) => (
      item.id === booking.id ? { ...item, reason: note, lessonNoteSent: true } : item
    )));
    const nextDrafts = { ...lessonNoteDrafts };
    delete nextDrafts[booking.id];
    setLessonNoteDrafts(nextDrafts);
    setLessonNoteMessages({ ...lessonNoteMessages, [booking.id]: `送信完了: ${booking.studentEmail}` });
  };

  const persistStudentZoomLink = async (summary: ReturnType<typeof buildStudentPackageSummary>, zoomLink: string) => {
    try {
      await fetch("/api/student-zoom-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          studentId: summary.studentId,
          name: summary.name,
          email: summary.email,
          zoomLink
        })
      });
    } catch (error) {
      console.error("Student zoom link save failed.", {
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  };

  const toggleRecurringDay = (day: number) => {
    const weekdays = recurringForm.weekdays.includes(day)
      ? recurringForm.weekdays.filter((item) => item !== day)
      : [...recurringForm.weekdays, day].sort((a, b) => a - b);
    setRecurringForm({ ...recurringForm, weekdays });
  };

  const addRecurringAvailabilitySlots = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recurringForm.startDate || !recurringForm.startTime || !recurringForm.endTime || recurringForm.weekdays.length === 0) return;
    if (timeToMinutes(recurringForm.endTime) <= timeToMinutes(recurringForm.startTime)) return;

    const startDate = parseDateInput(recurringForm.startDate);
    const weeks = Math.min(12, Math.max(1, recurringForm.weeks || 1));
    const nextSlots = Array.from({ length: weeks * 7 }, (_, index) => addDays(startDate, index))
      .filter((date) => recurringForm.weekdays.includes(date.getDay()))
      .map((date, index): TutorAvailabilitySlot => {
        const dateKey = toInputDateString(date);
        const dayLabel = weekDayLabels.find((day) => day.value === date.getDay())?.label ?? "";
        return {
          id: `AV-R-${Date.now()}-${index}`,
          start: `${dateKey}T${recurringForm.startTime}`,
          end: `${dateKey}T${recurringForm.endTime}`,
          timezone: recurringForm.timezone,
          deliveryMode: recurringForm.deliveryMode,
          note: recurringForm.note.trim() || `定期予約設定枠（${dayLabel}）`
        };
      });

    setAdminBusy(true);
    setAdminMessage("");
    try {
      const body = await postLearningAdmin<{ slots?: Array<Record<string, unknown>> }>({ action: "save-availability", slots: nextSlots });
      const saved = (body.slots ?? []).map(mapAdminSlot);
      setAvailabilitySlots(Array.from(new Map([...availabilitySlots, ...saved].map((slot) => [slot.id, slot])).values())
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
      setAdminMessage(body.message || "定期予約枠を保存しました。");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "定期予約枠を保存できませんでした。");
    } finally {
      setAdminBusy(false);
    }
  };

  const sendPurchaseOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminBusy(true);
    setAdminMessage("");
    try {
      const body = await postLearningAdmin<{ offer?: LearningPurchaseOffer }>({ action: "send-purchase-offer", ...purchaseOfferForm });
      if (body.offer) setPurchaseOffers([body.offer, ...purchaseOffers]);
      setAdminMessage(body.message || "購入案内を送信しました。");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "購入案内を送信できませんでした。");
    } finally {
      setAdminBusy(false);
    }
  };

  const markPurchaseOfferPaid = async (offerId: string) => {
    setAdminBusy(true);
    setAdminMessage("");
    try {
      const body = await postLearningAdmin<{ offer?: LearningPurchaseOffer }>({ action: "mark-offer-paid", offerId });
      if (body.offer) setPurchaseOffers(purchaseOffers.map((offer) => offer.id === offerId ? body.offer as LearningPurchaseOffer : offer));
      setAdminMessage(body.message || "入金確認を反映しました。");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "入金確認を反映できませんでした。");
    } finally {
      setAdminBusy(false);
    }
  };

  const publishReview = (reviewId: string) => {
    setReviews(reviews.map((review) => (
      review.id === reviewId ? { ...review, status: "approved" } : review
    )));
  };

  const approveBooking = async (bookingId: string) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;
    const conflicts = findOverlappingBookings(booking, bookings);
    const nextBookings = bookings.map((item) => (
      item.id === bookingId
        ? { ...item, status: "approved" as BookingStatus, approvalGate: "none" as const, creditAction: "consumed" as const }
        : item
    ));
    setBookings(nextBookings);
    void updateLearningScheduleReservation(booking.id, true);

    await sendPlatformNotification({
      name: booking.student,
      email: booking.studentEmail,
      inquiryType: "Learning予約完了通知",
      subject: "レッスン予約が確定しました",
      copyToRequester: true,
      displayLanguage: language,
      message: [
        "レッスン予約が確定しました。",
        "",
        `予約ID: ${booking.id}`,
        `生徒名: ${booking.student}`,
        `メールアドレス: ${booking.studentEmail}`,
        `レッスン種別: ${formatLessonKind(booking.lessonKind, "ja")}`,
        `日時: ${formatDateTime(booking.requestedSlot)} (${booking.timezone})`,
        "",
        "当日は予定時刻にご参加ください。"
      ].join("\n")
    });

    if (conflicts.length > 0) {
      await sendPlatformNotification({
        name: "Schedule overlap monitor",
        email: ownerEmail,
        inquiryType: "Learning予約枠重複アラート",
        subject: "予約枠の重複を検知しました",
        displayLanguage: language,
        message: [
          "予約承認時に、同一時間帯の予約重複を検知しました。",
          "",
          `承認した予約ID: ${booking.id}`,
          `日時: ${formatDateTime(booking.requestedSlot)} (${booking.timezone})`,
          "",
          "重複候補:",
          ...conflicts.map((item) => `- ${item.id} / ${item.student} / ${formatDateTime(item.requestedSlot)}`)
        ].join("\n")
      });
    }
  };

  const rejectBooking = async (bookingId: string) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;
    setBookings(bookings.map((item) => (
      item.id === bookingId
        ? { ...item, status: "cancelled" as BookingStatus, approvalGate: "none" as const, creditAction: "restored" as const }
        : item
    )));
    void updateLearningScheduleReservation(booking.id, false);

    await sendPlatformNotification({
      name: booking.student,
      email: booking.studentEmail,
      inquiryType: "Learning予約リクエスト確認結果",
      subject: "レッスン予約リクエストについて",
      copyToRequester: true,
      displayLanguage: language,
      message: [
        "お送りいただいたレッスン予約リクエストについて、今回は日程確定を見送らせていただきました。",
        "",
        `予約ID: ${booking.id}`,
        `日時: ${formatDateTime(booking.requestedSlot)} (${booking.timezone})`,
        "",
        "別の候補枠で再度リクエストをお願いいたします。"
      ].join("\n")
    });
  };

  if (!isOwner) {
    return (
      <form className="platform-card platform-form login-card" onSubmit={handleLogin}>
        <p className="eyebrow">Tutor only</p>
        <h2>講師専用 空き時間設定</h2>
        <p>講師の空き枠を設定するための専用画面です。運営者メールアドレスで確認できます。</p>
        <label>
          講師メールアドレス
          <input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder={tutorLoginPlaceholder} required />
        </label>
        <label>
          パスワード
          <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {adminMessage ? <p className="form-error">{adminMessage}</p> : null}
        <button className="button primary" type="submit" disabled={adminBusy}>
          {adminBusy ? "確認中..." : "講師画面を開く"}
        </button>
        <p className="platform-note">講師本人のみが使用する管理画面です。</p>
      </form>
    );
  }

  return (
    <div className="platform-stack">
      <div className="platform-band">
        <div>
          <p className="eyebrow">Tutor Availability</p>
          <h2>講師管理画面</h2>
          <p>空き枠、予約リクエスト、受講者ごとのパッケージ状況を確認できます。</p>
        </div>
        <div className="student-session">
          <p className="platform-badge">{tutorEmail}</p>
        </div>
      </div>

      {adminMessage ? <p className={adminMessage.includes("できません") || adminMessage.includes("失敗") ? "form-error" : "form-success"}>{adminMessage}</p> : null}

      <section className="platform-card">
        <h3>予約リクエスト管理</h3>
        <p className="platform-muted">生徒から送信された予約リクエストを確認し、承認または見送りを選択できます。承認時は生徒と講師へメール通知を送信します。</p>
        <div className="record-list">
          {pendingBookings.length > 0 ? pendingBookings.map((booking) => (
            <article key={booking.id}>
              <strong>{booking.id} / {booking.student}</strong>
              <span>{formatLessonKind(booking.lessonKind, "ja")} / {formatDateTime(booking.requestedSlot)} ({booking.timezone})</span>
              {booking.reason ? <p>{booking.reason}</p> : null}
              <div className="button-row">
                <button className="button primary" type="button" onClick={() => approveBooking(booking.id)}>
                  承認して予約確定
                </button>
                <button className="button secondary" type="button" onClick={() => rejectBooking(booking.id)}>
                  見送る
                </button>
              </div>
            </article>
          )) : <p className="platform-muted">確認待ちの予約リクエストはありません。</p>}
        </div>
      </section>

      <div className="platform-grid two">
        <section className="platform-card">
          <h3>予約カレンダー</h3>
          <p className="platform-muted">予約済み・リクエスト中の枠をクリックすると、受講者とパッケージ消化状況を確認できます。</p>
          <BookingCalendar
            month={bookingCalendarMonth}
            setMonth={setBookingCalendarMonth}
            bookings={bookings.filter((booking) => booking.status !== "cancelled")}
            onSelectBooking={setSelectedTutorBooking}
            language="ja"
          />
        </section>

        <section className="platform-card" id="student-package-summary">
          <h3>生徒別パッケージ一覧</h3>
          <form onSubmit={registerStudent} className="platform-form">
            <p className="platform-muted">既存のStudent IDを使う生徒は、ここで登録すると一覧とZoomリンク設定に反映されます。</p>
            <div className="platform-grid two">
              <label>
                Student ID
                <input
                  value={studentRegistrationForm.studentId}
                  onChange={(event) => setStudentRegistrationForm({ ...studentRegistrationForm, studentId: event.target.value })}
                  placeholder="7852-85"
                  required
                />
              </label>
              <label>
                生徒名
                <input
                  value={studentRegistrationForm.name}
                  onChange={(event) => setStudentRegistrationForm({ ...studentRegistrationForm, name: event.target.value })}
                  placeholder="Emma"
                  required
                />
              </label>
            </div>
            <label>
              メールアドレス
              <input
                type="email"
                value={studentRegistrationForm.email}
                onChange={(event) => setStudentRegistrationForm({ ...studentRegistrationForm, email: event.target.value })}
                placeholder="student@example.com"
                required
              />
            </label>
            <button className="button secondary" type="submit" disabled={adminBusy}>生徒情報を登録</button>
          </form>
          <label className="student-search-field">
            生徒検索
            <input
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="StudentID / メール / 名前 / コース名"
            />
          </label>
          <div className="record-list">
            {filteredStudentPackageSummaries.map((summary) => (
              <article key={summary.email}>
                <strong>{summary.name} / {summary.email}</strong>
                <span>StudentID: {summary.studentId}</span>
                <p>購入済: {summary.purchased}回 / 予約済: {summary.reserved}回 / 完了済: {summary.completed}回 / 未予約: {summary.unbooked}回</p>
                <div className="purchase-history-list">
                  <span>購入:</span>
                  {summary.purchaseHistory.length > 0 ? summary.purchaseHistory.map((purchase) => (
                    <p key={`${summary.email}-${purchase.packageLabel}-${purchase.purchasedAt}`}>
                      {purchase.packageLabel} / {purchase.purchasedLessons}回 / 残{purchase.remainingLessons}回 / {formatDateTime(purchase.purchasedAt)}
                    </p>
                  )) : <p>未登録</p>}
                </div>
                <label className="zoom-link-editor">
                  Zoomリンク
                  <input
                    type="url"
                    value={summary.zoomLink}
                    onChange={(event) => updateStudentZoomLink(summary.email, event.target.value)}
                    onBlur={(event) => void persistStudentZoomLink(summary, event.target.value)}
                    placeholder="https://zoom.us/j/..."
                  />
                </label>
                {summary.zoomLink ? (
                  <a className="button secondary" href={summary.zoomLink} target="_blank" rel="noreferrer">
                    レッスンリンクを開く
                  </a>
                ) : null}
              </article>
            ))}
            {filteredStudentPackageSummaries.length === 0 ? <p className="platform-muted">該当する生徒は見つかりません。</p> : null}
          </div>
        </section>
      </div>

      <section className="platform-card platform-form">
        <h3>レッスンノート未送信</h3>
        <p className="platform-muted">完了済みレッスンのうち、レッスンノート送信が未完了のものを表示します。記載後に完了を押すと、生徒宛にメール送信されます。</p>
        <div className="record-list">
          {completedBookingsWithoutNotes.length > 0 ? completedBookingsWithoutNotes.map((booking) => (
            <article key={booking.id} className="lesson-note-record">
              <strong>{booking.id} / {booking.student}</strong>
              <span>{formatLessonKind(booking.lessonKind, "ja")} / {formatDateTime(booking.requestedSlot)} ({booking.timezone})</span>
              <span>送信先: {booking.studentEmail}</span>
              {lessonNoteMessages[booking.id] ? (
                <p className={lessonNoteMessages[booking.id].startsWith("送信完了") ? "form-success" : "form-error"}>
                  {lessonNoteMessages[booking.id]}
                </p>
              ) : null}
              <label>
                レッスンノート
                <textarea
                  value={lessonNoteDrafts[booking.id] ?? booking.reason ?? ""}
                  rows={5}
                  onChange={(event) => updateLessonNoteDraft(booking.id, event.target.value)}
                  placeholder="生徒へ共有するレッスン内容、宿題、次回に向けたメモを入力"
                />
              </label>
              <button className="button primary" type="button" onClick={() => void sendLessonNote(booking)} disabled={!(lessonNoteDrafts[booking.id] ?? booking.reason ?? "").trim()}>
                完了
              </button>
            </article>
          )) : <p className="platform-muted">レッスンノート未送信の完了レッスンはありません。</p>}
        </div>
      </section>

      <section className="platform-card platform-form">
        <h3>空き時間を登録</h3>
        <div className="segmented-control" aria-label="空き時間登録方法">
          <button className={registrationMode === "single" ? "active" : ""} type="button" onClick={() => setRegistrationMode("single")}>
            単日登録
          </button>
          <button className={registrationMode === "recurring" ? "active" : ""} type="button" onClick={() => setRegistrationMode("recurring")}>
            定期予約設定
          </button>
        </div>

        {registrationMode === "single" ? (
          <form className="platform-form nested-form" onSubmit={addAvailabilitySlot}>
            <div className="platform-grid two">
              <label>
                開始日
                <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required />
              </label>
              <TimeSliderControl
                label="開始時刻"
                value={form.startTime}
                onChange={(startTime) => setForm({ ...form, startTime })}
              />
            </div>
            <div className="platform-grid two">
              <label>
                レッスン時間
                <select value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })}>
                  {availabilityDurationOptions.map((duration) => (
                    <option key={duration} value={duration}>{duration}分</option>
                  ))}
                </select>
              </label>
              <label>
                タイムゾーン
                <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} required />
              </label>
            </div>
            <div className="platform-grid two">
              <label>
                実施方法
                <select value={form.deliveryMode} onChange={(event) => setForm({ ...form, deliveryMode: event.target.value as DeliveryMode })}>
                  <option value="online">オンライン</option>
                  <option value="inPerson">対面</option>
                </select>
              </label>
            </div>
            <label>
              メモ
              <textarea value={form.note} rows={4} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="例：日本語レッスン優先 / 英語発音コーチング可" />
            </label>
            <button className="button primary" type="submit" disabled={adminBusy}>
              {adminBusy ? "保存中..." : "単日枠を追加"}
            </button>
          </form>
        ) : (
          <form className="platform-form nested-form" onSubmit={addRecurringAvailabilitySlots}>
            <p className="platform-note">曜日を選択し、共通の開始時刻と終了時刻を指定して、Student画面の候補枠として登録します。</p>
            <div className="platform-grid three">
              <label>
                適用開始日
                <input type="date" value={recurringForm.startDate} onChange={(event) => setRecurringForm({ ...recurringForm, startDate: event.target.value })} required />
              </label>
              <label>
                登録週数
                <input type="number" min="1" max="12" value={recurringForm.weeks} onChange={(event) => setRecurringForm({ ...recurringForm, weeks: Number(event.target.value) })} required />
              </label>
              <label>
                タイムゾーン
                <input value={recurringForm.timezone} onChange={(event) => setRecurringForm({ ...recurringForm, timezone: event.target.value })} required />
              </label>
            </div>
            <fieldset className="weekday-picker">
              <legend>登録する曜日</legend>
              {weekDayLabels.map((day) => (
                <button key={day.value} className={recurringForm.weekdays.includes(day.value) ? "active" : ""} type="button" onClick={() => toggleRecurringDay(day.value)}>
                  {day.label}
                </button>
              ))}
            </fieldset>
            <div className="platform-grid three">
              <TimeSliderControl
                label="開始時刻"
                value={recurringForm.startTime}
                onChange={(startTime) => setRecurringForm({ ...recurringForm, startTime })}
              />
              <TimeSliderControl
                label="終了時刻"
                value={recurringForm.endTime}
                onChange={(endTime) => setRecurringForm({ ...recurringForm, endTime })}
              />
              <label>
                実施方法
                <select value={recurringForm.deliveryMode} onChange={(event) => setRecurringForm({ ...recurringForm, deliveryMode: event.target.value as DeliveryMode })}>
                  <option value="online">オンライン</option>
                  <option value="inPerson">対面</option>
                </select>
              </label>
            </div>
            <label>
              メモ
              <textarea value={recurringForm.note} rows={4} onChange={(event) => setRecurringForm({ ...recurringForm, note: event.target.value })} placeholder="例：毎週同じ時間の定期予約候補" />
            </label>
            {recurringEndTimeInvalid ? <p className="form-error">終了時刻は開始時刻より後に設定してください。</p> : null}
            <button className="button primary" type="submit" disabled={recurringEndTimeInvalid || adminBusy}>
              {adminBusy ? "保存中..." : "定期予約枠を追加"}
            </button>
          </form>
        )}
      </section>

      <section className="platform-card">
        <h3>Student表示プレビュー</h3>
        <p className="platform-muted">削除したい枠はプレビュー上の枠をクリックすると削除できます。</p>
        <AvailabilityCalendar
          month={calendarMonth}
          setMonth={setCalendarMonth}
          slots={availabilitySlots}
          onSelectSlot={(slot) => void removeAvailabilitySlot(slot.id)}
          disabledSlotId={deletingAvailabilityId}
          slotActionLabel="空き枠を削除"
        />
        {availabilityDeleteMessage ? (
          <p
            className={availabilityDeleteMessage.includes("できません") || availabilityDeleteMessage.includes("見つかりません") ? "form-error" : "form-success"}
            aria-live="polite"
          >
            {availabilityDeleteMessage}
          </p>
        ) : null}
      </section>

      <section className="platform-card platform-form" id="purchase-offer">
        <p className="eyebrow">Student Purchase Offer</p>
        <h3>生徒別購入案内</h3>
        <p className="platform-muted">25分または50分のレッスン、回数、単価、決済リンクを指定して生徒へ購入案内を送信します。入金確認後はパッケージへ反映し、領収書希望者には領収書ファイルをメール添付します。</p>
        {!purchaseOffersReady ? <p className="form-error">購入案内を利用するには、更新後の supabase/schema.sql をSupabase SQL Editorで実行してください。空き枠登録はこのまま利用できます。</p> : null}
        <form className="platform-form nested-form" onSubmit={sendPurchaseOffer}>
          <div className="platform-grid two">
            <label>
              生徒名
              <input value={purchaseOfferForm.name} onChange={(event) => setPurchaseOfferForm({ ...purchaseOfferForm, name: event.target.value })} placeholder="表示名" list="learning-student-names" required />
            </label>
            <label>
              生徒メールアドレス
              <input type="email" value={purchaseOfferForm.email} onChange={(event) => {
                const email = event.target.value;
                const student = adminStudents.find((item) => item.email.toLowerCase() === email.toLowerCase());
                setPurchaseOfferForm({ ...purchaseOfferForm, email, name: student?.name || purchaseOfferForm.name });
              }} placeholder="student@example.com" list="learning-student-emails" required />
            </label>
          </div>
          <datalist id="learning-student-names">
            {adminStudents.map((student) => <option key={student.id} value={student.name || student.email}>{student.email}</option>)}
          </datalist>
          <datalist id="learning-student-emails">
            {adminStudents.map((student) => <option key={student.id} value={student.email}>{student.name || student.student_id}</option>)}
          </datalist>
          <div className="platform-grid two">
            <label>
              サービス
              <select value={purchaseOfferForm.lessonKind} onChange={(event) => {
                const lessonKind = event.target.value as LessonKind;
                setPurchaseOfferForm((current) => ({
                  ...current,
                  lessonKind,
                  lessonMenuId: lessonKind === "japanese" ? "jp-custom-50" : "en-custom-50",
                  packageLabel: lessonKind === "japanese" ? "1on1日本語レッスン 50分 特別パッケージ" : "英語発音コーチング 50分 特別パッケージ"
                }));
              }}>
                <option value="japanese">1on1日本語レッスン</option>
                <option value="english">英語発音コーチング</option>
              </select>
            </label>
            <label>
              コース名
              <input value={purchaseOfferForm.packageLabel} onChange={(event) => setPurchaseOfferForm({ ...purchaseOfferForm, packageLabel: event.target.value })} required />
            </label>
          </div>
          <div className="platform-grid three">
            <label>
              1枠の時間
              <select value={purchaseOfferForm.durationMinutes} onChange={(event) => setPurchaseOfferForm({ ...purchaseOfferForm, durationMinutes: Number(event.target.value) as 25 | 50 })}>
                <option value={25}>25分</option>
                <option value={50}>50分</option>
              </select>
            </label>
            <label>
              発行回数
              <input type="number" min="1" max="100" value={purchaseOfferForm.quantity} onChange={(event) => setPurchaseOfferForm({ ...purchaseOfferForm, quantity: Number(event.target.value) })} required />
            </label>
            <label>
              通貨
              <select value={purchaseOfferForm.currency} onChange={(event) => {
                const currency = event.target.value as "USD" | "JPY";
                setPurchaseOfferForm((current) => ({
                  ...current,
                  currency,
                  unitPrice: currency === "USD" ? 28 : 5_000
                }));
              }}>
                <option value="USD">USD</option>
                <option value="JPY">JPY</option>
              </select>
            </label>
          </div>
          <div className="platform-grid three">
            <label className="time-slider-control">
              {purchaseOfferForm.currency === "USD" ? (
                <>
                  <span>1枠あたり単価 <strong>{purchaseOfferForm.unitPrice} USD</strong></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={purchaseOfferForm.unitPrice}
                    onChange={(event) => setPurchaseOfferForm((current) => ({ ...current, unitPrice: Number(event.target.value) }))}
                    onWheel={(event) => {
                      event.preventDefault();
                      const direction = event.deltaY < 0 ? 1 : -1;
                      setPurchaseOfferForm((current) => ({
                        ...current,
                        unitPrice: Math.min(100, Math.max(0, current.unitPrice + direction))
                      }));
                    }}
                    aria-label="1枠あたり単価（USD）"
                  />
                </>
              ) : (
                <>
                  <span>1枠あたり単価 <strong>{purchaseOfferForm.unitPrice.toLocaleString()} JPY</strong></span>
                  <input
                    type="range"
                    min="0"
                    max={jpyUnitPriceOptions.length - 1}
                    step="1"
                    value={getClosestJpyUnitPriceIndex(purchaseOfferForm.unitPrice)}
                    onChange={(event) => setPurchaseOfferForm((current) => ({
                      ...current,
                      unitPrice: jpyUnitPriceOptions[Number(event.target.value)]
                    }))}
                    onWheel={(event) => {
                      event.preventDefault();
                      const direction = event.deltaY < 0 ? 1 : -1;
                      setPurchaseOfferForm((current) => {
                        const currentIndex = getClosestJpyUnitPriceIndex(current.unitPrice);
                        const nextIndex = Math.min(jpyUnitPriceOptions.length - 1, Math.max(0, currentIndex + direction));
                        return { ...current, unitPrice: jpyUnitPriceOptions[nextIndex] };
                      });
                    }}
                    aria-label="1枠あたり単価（JPY）"
                  />
                </>
              )}
            </label>
            <label>
              合計
              <input value={`${purchaseOfferForm.currency} ${purchaseOfferTotal.toLocaleString(undefined, { minimumFractionDigits: purchaseOfferForm.currency === "USD" && !Number.isInteger(purchaseOfferTotal) ? 2 : 0, maximumFractionDigits: purchaseOfferForm.currency === "USD" ? 2 : 0 })}`} readOnly />
            </label>
            <label>
              表示言語
              <select value={purchaseOfferForm.displayLanguage} onChange={(event) => setPurchaseOfferForm({ ...purchaseOfferForm, displayLanguage: event.target.value as PlatformLanguage })}>
                <option value="ja">日本語</option>
                <option value="en">English</option>
                <option value="zh-Hant">繁體中文</option>
              </select>
            </label>
          </div>
          <div className="platform-grid two">
            <label>
              決済方法
              <select value={purchaseOfferForm.paymentMethod} onChange={(event) => {
                const paymentMethod = event.target.value as "PayPal" | "PayPay";
                setPurchaseOfferForm({ ...purchaseOfferForm, paymentMethod, paypalFeeIncluded: paymentMethod === "PayPal" ? purchaseOfferForm.paypalFeeIncluded : false });
              }}>
                <option value="PayPal">PayPal</option>
                <option value="PayPay">PayPay</option>
              </select>
            </label>
            <label>
              決済リンク
              <input type="url" value={purchaseOfferForm.paymentLink} onChange={(event) => setPurchaseOfferForm({ ...purchaseOfferForm, paymentLink: event.target.value })} placeholder="https://..." required />
            </label>
          </div>
          {purchaseOfferForm.paymentMethod === "PayPal" ? (
            <label className="checkbox-row receipt-request-row">
              <span>PayPal決済手数料4.1%を請求額に加算する</span>
              <input
                type="checkbox"
                checked={purchaseOfferForm.paypalFeeIncluded}
                onChange={(event) => setPurchaseOfferForm({ ...purchaseOfferForm, paypalFeeIncluded: event.target.checked })}
              />
            </label>
          ) : null}
          <label className="checkbox-row receipt-request-row">
            <span>領収書を発行する</span>
            <input type="checkbox" checked={purchaseOfferForm.receiptRequested} onChange={(event) => setPurchaseOfferForm({ ...purchaseOfferForm, receiptRequested: event.target.checked })} />
          </label>
          {purchaseOfferForm.receiptRequested ? (
            <label>
              領収書宛名
              <input value={purchaseOfferForm.receiptName} onChange={(event) => setPurchaseOfferForm({ ...purchaseOfferForm, receiptName: event.target.value })} placeholder="未入力の場合は生徒名" />
            </label>
          ) : null}
          <button className="button primary" type="submit" disabled={adminBusy || !purchaseOffersReady}>{adminBusy ? "送信中..." : "購入案内を送信"}</button>
        </form>

        <div className="record-list purchase-offer-list">
          <h4>購入案内履歴</h4>
          {purchaseOffers.length > 0 ? purchaseOffers.map((offer) => (
            <article key={offer.id}>
              <strong>{offer.offer_id} / {offer.students.name || offer.students.email}</strong>
              <span>{offer.package_label} / {offer.duration_minutes}分 × {offer.quantity}回</span>
              <span>{offer.currency} {Number(offer.unit_price).toLocaleString()} × {offer.quantity} = {offer.currency} {Number(offer.total_amount).toLocaleString()}</span>
              <span>状態: {offer.status === "paid" ? "入金確認済み" : offer.status === "cancelled" ? "取消" : "入金待ち"} / 領収書: {offer.receipt_requested ? (offer.receipt_sent_at ? "送信済み" : "希望あり") : "希望なし"}</span>
              {offer.status === "pending_payment" ? (
                <button className="button primary" type="button" onClick={() => void markPurchaseOfferPaid(offer.id)} disabled={adminBusy}>
                  入金確認・パッケージ反映
                </button>
              ) : null}
            </article>
          )) : <p className="platform-muted">購入案内履歴はまだありません。</p>}
        </div>
      </section>

      <section className="platform-card">
        <h3>レビュー管理</h3>
        <p className="platform-muted">投稿されたレビューを確認し、掲載するものを選択できます。</p>
        <div className="review-grid">
          {pendingReviews.length > 0 ? pendingReviews.map((review) => (
            <div className="review-card-pending" key={review.id}>
              <ReviewCard review={review} />
              <button className="button primary" type="button" onClick={() => publishReview(review.id)}>
                掲載する
              </button>
            </div>
          )) : <p className="platform-muted">確認待ちのレビューはありません。</p>}
        </div>
      </section>

      {selectedTutorBooking ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="予約詳細">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={() => setSelectedTutorBooking(null)} aria-label="閉じる">×</button>
            <p className="eyebrow">Booking Detail</p>
            <h3>{selectedTutorBooking.id} / {selectedTutorBooking.student}</h3>
            <p>{formatLessonKind(selectedTutorBooking.lessonKind, "ja")} / {formatDateTime(selectedTutorBooking.requestedSlot)} ({selectedTutorBooking.timezone})</p>
            <p>ステータス: <StatusBadge status={selectedTutorBooking.status} language="ja" /></p>
            <p>メール: {selectedTutorBooking.studentEmail}</p>
            <p>{formatPackageProgressForBooking(selectedTutorBooking, bookings, customer)}</p>
            {selectedTutorBookingZoomLink ? (
              <a className="button secondary" href={selectedTutorBookingZoomLink} target="_blank" rel="noreferrer">
                レッスンリンクを開く
              </a>
            ) : null}
            <button className="button secondary" type="button" onClick={() => {
              document.getElementById("student-package-summary")?.scrollIntoView({ behavior: "smooth", block: "start" });
              setSelectedTutorBooking(null);
            }}>
              生徒別パッケージ一覧へ
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudentDashboard({
  language,
  bookings,
  customer,
  studentProfiles,
  setStudentProfiles,
  availabilitySlots,
  studentEmail,
  setStudentEmail,
  blockedStudents,
  setBlockedStudents,
  bookingForm,
  setBookingForm,
  submitBooking,
  changeRequest,
  setChangeRequest,
  submitChangeRequest,
  bookingMessage,
  supabaseAvailable,
  authStatus,
  authStatusMessage
}: {
  language: PlatformLanguage;
  bookings: BookingRecord[];
  customer: CustomerRecord;
  studentProfiles: StudentProfile[];
  setStudentProfiles: (profiles: StudentProfile[]) => void;
  availabilitySlots: TutorAvailabilitySlot[];
  studentEmail: string;
  setStudentEmail: (email: string) => void;
  blockedStudents: string[];
  setBlockedStudents: (emails: string[]) => void;
  bookingForm: BookingFormState;
  setBookingForm: (form: BookingFormState) => void;
  submitBooking: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  changeRequest: RequestChange;
  setChangeRequest: (request: RequestChange) => void;
  submitChangeRequest: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  bookingMessage: string;
  supabaseAvailable: boolean;
  authStatus: AuthStatus;
  authStatusMessage: string;
}) {
  const [loginEmail, setLoginEmail] = useState(studentEmail);
  const [loginName, setLoginName] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authProvider, setAuthProvider] = useState<StudentProfile["provider"]>("email");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [blockEmail, setBlockEmail] = useState("");
  const emailAuthRef = useRef<HTMLDivElement>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date("2026-07-01T00:00:00+09:00"));
  const [availabilityMonth, setAvailabilityMonth] = useState(() => new Date("2026-07-01T00:00:00+09:00"));
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);
  const [studentRequestTab, setStudentRequestTab] = useState<"change" | "contact">("change");
  const [contactForm, setContactForm] = useState({ subject: "", message: "" });
  const [contactMessage, setContactMessage] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const text = getStudentPageCopy(language);

  useEffect(() => {
    if (authStatusMessage) {
      setAuthMessage(authStatusMessage);
      if (authStatus === "checking") {
        setAuthProvider("google");
      }
    }
  }, [authStatus, authStatusMessage]);
  const normalizedEmail = studentEmail.toLowerCase();
  const isOwner = normalizedEmail === ownerEmail;
  const visibleBookings = bookings.filter((booking) => booking.studentEmail.toLowerCase() === normalizedEmail);
  const openAvailabilitySlots = availabilitySlots.filter((slot) => !isAvailabilitySlotBooked(slot, bookings));
  const activeCustomer = normalizedEmail === customer.email.toLowerCase()
    ? customer
    : {
        ...customer,
        name: visibleBookings[0]?.student ?? "Guest student",
        email: normalizedEmail,
        packageRemaining: visibleBookings.filter((booking) => booking.status === "approved").length,
        lessonCredits: [],
        renewalDue: "未設定"
      };

  const activeProfile = studentProfiles.find((profile) => profile.email.toLowerCase() === normalizedEmail);
  const packageSummary = buildStudentPackageSummary(activeCustomer.email, bookings, activeCustomer, activeProfile?.studentId, activeProfile?.zoomLink);

  const submitStudentContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactForm.message.trim()) {
      setContactMessage(text.contactValidationError);
      return;
    }

    setContactSubmitting(true);
    setContactMessage("");
    const subjectText = contactForm.subject.trim();
    const messageText = contactForm.message.trim();
    const requesterCopy = [
      `${activeCustomer.name} 様`,
      "",
      "講師への問い合わせを受け付けました。",
      "内容を確認のうえ、メールで返信します。",
      "",
      "問い合わせ内容",
      subjectText ? `件名: ${subjectText}` : "",
      messageText,
      "",
      "Leo de Noir / Workaholic Owl"
    ].filter(Boolean).join("\n");

    const sent = await sendPlatformNotification({
      name: activeCustomer.name,
      email: activeCustomer.email,
      inquiryType: "Learning生徒問い合わせ",
      subject: subjectText ? `【生徒からの問い合わせ】${subjectText}` : "【生徒からの問い合わせ】",
      recipientGroup: "learningTutor",
      copyToRequester: true,
      copySubject: "講師への問い合わせを受け付けました",
      copyMessage: requesterCopy,
      displayLanguage: language,
      message: [
        "生徒から問い合わせが届きました。",
        "",
        `StudentID: ${packageSummary.studentId}`,
        `生徒名: ${activeCustomer.name}`,
        `メールアドレス: ${activeCustomer.email}`,
        subjectText ? `件名: ${subjectText}` : "",
        "",
        "問い合わせ内容:",
        messageText
      ].filter(Boolean).join("\n")
    });

    setContactSubmitting(false);
    setContactMessage(sent ? text.contactSuccess : text.contactFailure);
    if (sent) {
      setContactForm({ subject: "", message: "" });
    }
  };

  const startGoogleAuth = async () => {
    setAuthProvider("google");
    setAuthMessage("");

    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthMessage("Google認証はSupabase設定後に利用できます。Emailを選択してください。");
      return;
    }

    setAuthBusy(true);
    window.sessionStorage.setItem(authPendingKey, "google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/learning/student`
      }
    });
    if (error) {
      window.sessionStorage.removeItem(authPendingKey);
      setAuthMessage(error.message);
      setAuthBusy(false);
    }
  };

  const selectEmailAuth = () => {
    setAuthProvider("email");
    setAuthMessage("");
    window.setTimeout(() => {
      emailAuthRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = loginEmail.trim().toLowerCase();

    if (supabaseAvailable) {
      if (authProvider === "google") {
        await startGoogleAuth();
        return;
      }

      if (authMode === "signup") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
          setAuthMessage(text.emailValidationError);
          return;
        }
      }

      setAuthBusy(true);
      setAuthMessage("");
      try {
        const response = await fetch("/api/student-auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            mode: authMode,
            identifier: loginEmail.trim(),
            name: loginName.trim(),
            provider: authProvider,
            redirectTo: `${window.location.origin}/learning/student`
          })
        });
        if (!response.ok) {
          setAuthMessage(response.status === 404 ? text.authNotFound : text.authRequestFailure);
          return;
        }
        window.sessionStorage.setItem(authPendingKey, "email");
        setAuthMessage(authMode === "signup" ? text.signUpLinkSent : text.signInLinkSent);
      } catch {
        setAuthMessage(text.authRequestFailure);
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    if (authProvider === "google") {
      await startGoogleAuth();
      return;
    }

    if (authMode === "signup") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return;
      const existingProfile = studentProfiles.find((profile) => profile.email.toLowerCase() === nextEmail);
      const profile = existingProfile ?? {
        studentId: generateStudentId(studentProfiles),
        name: loginName.trim() || nextEmail.split("@")[0],
        email: nextEmail,
        provider: authProvider,
        createdAt: new Date().toISOString(),
        zoomLink: ""
      };
      if (!existingProfile) {
        setStudentProfiles([...studentProfiles, profile]);
      }
      setStudentEmail(nextEmail);
      setBookingForm({ ...bookingForm, email: nextEmail, name: profile.name });
      window.localStorage.setItem(studentEmailKey, nextEmail);
      setAuthMessage(`StudentID: ${profile.studentId}`);
      return;
    }

    const identifier = loginEmail.trim().toLowerCase();
    const profile = studentProfiles.find((item) => (
      item.email.toLowerCase() === identifier || item.studentId.toLowerCase() === identifier
    ));
    if (!profile) {
      setAuthMessage("StudentIDまたはメールアドレスを確認してください。");
      return;
    }
    setStudentEmail(profile.email);
    setBookingForm({ ...bookingForm, email: profile.email, name: profile.name });
    window.localStorage.setItem(studentEmailKey, profile.email);
    setAuthMessage("");
  };

  const toggleAvailabilitySlot = (slot: TutorAvailabilitySlot) => {
    const slotExists = bookingForm.requestedSlots.some((selectedSlot) => selectedSlot.id === slot.id);
    const requestedSlots = slotExists
      ? bookingForm.requestedSlots.filter((selectedSlot) => selectedSlot.id !== slot.id)
      : [...bookingForm.requestedSlots, slot].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const firstSlot = requestedSlots[0];

    setBookingForm({
      ...bookingForm,
      deliveryMode: firstSlot?.deliveryMode ?? "online",
      requestedSlot: firstSlot ? toDateTimeLocalValue(firstSlot.start) : "",
      requestedSlots,
      timezone: firstSlot?.timezone ?? "Asia/Tokyo",
      recurringRequest: requestedSlots.length > 1 ? true : bookingForm.recurringRequest
    });
  };

  if (!studentEmail) {
    return (
      <div className="platform-stack">
        <form className="platform-card platform-form login-card" onSubmit={handleLogin}>
          <p className="eyebrow">Student</p>
          <h2>{text.loginTitle}</h2>
          <p>{text.loginLead}</p>
          <p className="platform-note">{supabaseAvailable ? text.secureAuthEnabled : text.localAuthFallback}</p>
          <div className="segmented-control" aria-label="Sign in or sign up">
            <button className={authMode === "signin" ? "active" : ""} type="button" onClick={() => setAuthMode("signin")}>
              {text.signIn}
            </button>
            <button className={authMode === "signup" ? "active" : ""} type="button" onClick={() => setAuthMode("signup")}>
              {text.signUp}
            </button>
          </div>
          <div className="auth-provider-grid">
            <button className={`button secondary ${authProvider === "google" ? "active" : ""}`} type="button" onClick={() => void startGoogleAuth()} disabled={authBusy || authStatus === "checking"}>
              {authBusy || authStatus === "checking" ? "Google確認中..." : "Google"}
            </button>
            <button className={`button secondary ${authProvider === "email" ? "active" : ""}`} type="button" onClick={selectEmailAuth}>
              Email
            </button>
          </div>
          {authProvider === "email" ? (
            <div ref={emailAuthRef} className="email-auth-fields is-active">
              {authMode === "signup" ? (
                <label>
                  {text.name}
                  <input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="Mika Chen" />
                </label>
              ) : null}
              <label>
                {authMode === "signup" ? text.registeredEmail : text.signInIdentifier}
                <input type={authMode === "signup" ? "email" : "text"} value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder={authMode === "signup" ? "mika@example.com" : "STU-2201 / mika@example.com"} required />
              </label>
            </div>
          ) : null}
          {authMessage ? (
            <p className={
              authStatus === "checking" || authStatus === "signed-in" || authMessage.startsWith("StudentID") || authMessage === text.signUpLinkSent || authMessage === text.signInLinkSent
                ? "form-success"
                : "form-error"
            }>
              {authMessage}
            </p>
          ) : null}
          {authProvider === "email" ? (
            <button className="button primary" type="submit" disabled={authBusy || authStatus === "checking"}>
              {authBusy ? text.authSending : authMode === "signup" ? text.signUpButton : text.loginButton}
            </button>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <div className="platform-stack">
      <div className="platform-band">
        <div>
          <p className="eyebrow">Student Dashboard</p>
          <h2>{text.dashboardTitle}</h2>
          <p>{text.dashboardLead}</p>
        </div>
        <div className="student-session">
          <p className="platform-badge">{activeCustomer.email}</p>
          <button className="button secondary" type="button" onClick={() => {
            void getSupabaseClient()?.auth.signOut();
            setStudentEmail("");
            window.localStorage.removeItem(studentEmailKey);
            window.sessionStorage.removeItem(authPendingKey);
          }}>
            {text.switchButton}
          </button>
        </div>
      </div>

      <div className="platform-grid three">
        <KpiCard label="StudentID" value={packageSummary.studentId} />
        <KpiCard label={text.customerStatus} value={formatCustomerStatus(activeCustomer.status, language)} />
        <KpiCard label={text.completedLessons} value={text.lessonCount(packageSummary.completed)} />
      </div>
      <div className="platform-grid three">
        <KpiCard label={text.unbookedLessons} value={text.lessonCount(packageSummary.unbooked)} />
        <KpiCard label={text.reservedLessons} value={text.lessonCount(packageSummary.reserved)} />
        <KpiCard label={text.purchasedLessons} value={text.lessonCount(packageSummary.purchased)} />
      </div>
      <section className="platform-card">
        <h3>{text.bookingTimelineTitle}</h3>
        {visibleBookings.length > 0 ? (
          <div className="booking-tile-scroll" aria-label={text.bookingTimelineTitle}>
            {visibleBookings.map((booking) => (
              <BookingSummaryTile key={booking.id} booking={booking} language={language} onSelect={setSelectedBooking} />
            ))}
          </div>
        ) : <p className="platform-muted">{text.noConfirmedBookings}</p>}
      </section>

      <BookingRequestCard
        language={language}
        customer={activeCustomer}
        studentEmail={studentEmail}
        blockedStudents={blockedStudents}
        bookingForm={bookingForm}
        setBookingForm={setBookingForm}
        submitBooking={submitBooking}
        bookingMessage={bookingMessage}
      />

      <section className="platform-card">
        <h3>{text.availabilityTitle}</h3>
        <p className="platform-muted">{text.availabilityLead}</p>
        <AvailabilityCalendar
          month={availabilityMonth}
          setMonth={setAvailabilityMonth}
          slots={openAvailabilitySlots}
          selectedSlotIds={bookingForm.requestedSlots.map((slot) => slot.id)}
          onSelectSlot={toggleAvailabilitySlot}
          language={language}
        />
      </section>

      {isOwner ? (
        <OwnerBlockControls
          blockEmail={blockEmail}
          setBlockEmail={setBlockEmail}
          blockedStudents={blockedStudents}
          setBlockedStudents={setBlockedStudents}
        />
      ) : null}

      <div className="platform-grid two">
        <section className="platform-card">
          <h3>{text.bookingCalendarTitle}</h3>
          <BookingCalendar
            month={calendarMonth}
            setMonth={setCalendarMonth}
            bookings={visibleBookings}
            onSelectBooking={setSelectedBooking}
            language={language}
          />
        </section>

        <section className="platform-card platform-form">
          <h3>{text.requestPanelTitle}</h3>
          <div className="segmented-control" aria-label={text.requestPanelTitle}>
            <button className={studentRequestTab === "change" ? "active" : ""} type="button" onClick={() => setStudentRequestTab("change")}>
              {text.changeTab}
            </button>
            <button className={studentRequestTab === "contact" ? "active" : ""} type="button" onClick={() => setStudentRequestTab("contact")}>
              {text.contactTab}
            </button>
          </div>
          {studentRequestTab === "change" ? (
            <form className="platform-form nested-form" onSubmit={submitChangeRequest}>
              <p className="platform-muted">{text.changeLead}</p>
              {bookingMessage ? <p className="form-success">{bookingMessage}</p> : null}
              <label>
                {text.requestType}
                <select value={changeRequest.type} onChange={(event) => setChangeRequest({ ...changeRequest, type: event.target.value as RequestChange["type"] })}>
                  <option value="reschedule_requested">{text.reschedule}</option>
                  <option value="cancel_requested">{text.cancel}</option>
                </select>
              </label>
              <label>
                {text.targetBooking}
                <select value={changeRequest.bookingId} onChange={(event) => setChangeRequest({ ...changeRequest, bookingId: event.target.value })}>
                  {visibleBookings.map((booking) => (
                    <option key={booking.id} value={booking.id}>
                      {booking.id} / {formatDateTime(booking.requestedSlot)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {text.reasonRequired}
                <textarea value={changeRequest.reason} rows={5} onChange={(event) => setChangeRequest({ ...changeRequest, reason: event.target.value })} required />
              </label>
              <button className="button primary" type="submit" disabled={visibleBookings.length === 0}>
                {text.changeSubmit}
              </button>
            </form>
          ) : (
            <form className="platform-form nested-form" onSubmit={submitStudentContact}>
              <p className="platform-muted">{text.contactLead}</p>
              {contactMessage ? <p className={contactMessage === text.contactSuccess ? "form-success" : "form-error"}>{contactMessage}</p> : null}
              <label>
                {text.contactSubject}
                <input value={contactForm.subject} onChange={(event) => setContactForm({ ...contactForm, subject: event.target.value })} />
              </label>
              <label>
                {text.contactBody}
                <textarea value={contactForm.message} rows={6} onChange={(event) => setContactForm({ ...contactForm, message: event.target.value })} required />
              </label>
              <button className="button primary" type="submit" disabled={contactSubmitting}>
                {contactSubmitting ? text.contactSending : text.contactSubmit}
              </button>
            </form>
          )}
        </section>
      </div>

      {selectedBooking ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Lesson notes">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={() => setSelectedBooking(null)} aria-label="閉じる">×</button>
            <p className="eyebrow">Booking Detail</p>
            <h3>{selectedBooking.id} / {formatDateTime(selectedBooking.requestedSlot)}</h3>
            <p>{formatLessonKind(selectedBooking.lessonKind, language)}</p>
            {packageSummary.zoomLink && !isPastBooking(selectedBooking.requestedSlot) ? (
              <a className="button secondary" href={packageSummary.zoomLink} target="_blank" rel="noreferrer">
                {text.openLessonLink}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BookingCalendar({
  month,
  setMonth,
  bookings,
  onSelectBooking,
  language = "ja"
}: {
  month: Date;
  setMonth: (month: Date) => void;
  bookings: BookingRecord[];
  onSelectBooking: (booking: BookingRecord) => void;
  language?: PlatformLanguage;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const cells = [
    ...Array.from({ length: firstDay.getDay() }, () => null),
    ...Array.from({ length: lastDay.getDate() }, (_, index) => new Date(year, monthIndex, index + 1))
  ];

  const moveMonth = (delta: number) => {
    setMonth(new Date(year, monthIndex + delta, 1));
  };

  return (
    <div className="booking-calendar">
      <div className="calendar-toolbar">
        <button type="button" onClick={() => moveMonth(-1)} aria-label={getStudentPageCopy(language).previousMonth}>&lt;</button>
        <strong>{formatCalendarMonth(year, monthIndex, language)}</strong>
        <button type="button" onClick={() => moveMonth(1)} aria-label={getStudentPageCopy(language).nextMonth}>&gt;</button>
      </div>
      <div className="calendar-weekdays">
        {getWeekdayNames(language).map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid">
        {cells.map((date, index) => {
          const dateKey = date ? toDateKey(date) : `blank-${index}`;
          const dayBookings = date ? bookings.filter((booking) => toDateKey(new Date(booking.requestedSlot)) === dateKey) : [];
          return (
            <div className={date ? "calendar-cell" : "calendar-cell blank"} key={dateKey}>
              {date ? <span className="calendar-date">{date.getDate()}</span> : null}
              {dayBookings.map((booking) => (
                <button key={booking.id} className={`calendar-booking ${booking.status} ${getBookingVisualState(booking)}`} type="button" onClick={() => onSelectBooking(booking)}>
                  {formatTime(booking.requestedSlot)} {booking.lessonKind === "japanese" ? "JP" : "EN"}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BookingSummaryTile({
  booking,
  language,
  onSelect
}: {
  booking: BookingRecord;
  language: PlatformLanguage;
  onSelect: (booking: BookingRecord) => void;
}) {
  const text = getStudentPageCopy(language);
  const lessonTitle = formatLessonKind(booking.lessonKind, language);
  const courseName = getBookingCourseName(booking, language);

  return (
    <button className={`booking-summary-tile ${getBookingVisualState(booking)}`} type="button" onClick={() => onSelect(booking)}>
      <span className="booking-summary-date">{formatDateTime(booking.requestedSlot)}</span>
      <strong>{lessonTitle} / {courseName}</strong>
      <span>{booking.timezone}</span>
      <span>{text.statusLabel}: {formatBookingDisplayStatus(booking, language)}</span>
    </button>
  );
}

function AvailabilityCalendar({
  month,
  setMonth,
  slots,
  selectedSlotIds = [],
  onSelectSlot,
  disabledSlotId = "",
  slotActionLabel = "",
  language = "ja"
}: {
  month: Date;
  setMonth: (month: Date) => void;
  slots: TutorAvailabilitySlot[];
  selectedSlotIds?: string[];
  onSelectSlot?: (slot: TutorAvailabilitySlot) => void;
  disabledSlotId?: string;
  slotActionLabel?: string;
  language?: PlatformLanguage;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const cells = [
    ...Array.from({ length: firstDay.getDay() }, () => null),
    ...Array.from({ length: lastDay.getDate() }, (_, index) => new Date(year, monthIndex, index + 1))
  ];

  const moveMonth = (delta: number) => {
    setMonth(new Date(year, monthIndex + delta, 1));
  };

  return (
    <div className="booking-calendar availability-calendar">
      <div className="calendar-toolbar">
        <button type="button" onClick={() => moveMonth(-1)} aria-label={getStudentPageCopy(language).previousMonth}>&lt;</button>
        <strong>{formatCalendarMonth(year, monthIndex, language)}</strong>
        <button type="button" onClick={() => moveMonth(1)} aria-label={getStudentPageCopy(language).nextMonth}>&gt;</button>
      </div>
      <div className="calendar-weekdays">
        {getWeekdayNames(language).map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid">
        {cells.map((date, index) => {
          const dateKey = date ? toDateKey(date) : `blank-${index}`;
          const daySlots = date ? slots.filter((slot) => toDateKey(new Date(slot.start)) === dateKey) : [];
          return (
            <div className={date ? "calendar-cell" : "calendar-cell blank"} key={dateKey}>
              {date ? <span className="calendar-date">{date.getDate()}</span> : null}
              {daySlots.map((slot) => {
                const selected = selectedSlotIds.includes(slot.id);
                return (
                  <button
                    key={slot.id}
                    className={`calendar-booking available ${slot.deliveryMode}${selected ? " selected" : ""}`}
                    type="button"
                    onClick={() => onSelectSlot?.(slot)}
                    disabled={!onSelectSlot || slot.id === disabledSlotId}
                    aria-pressed={onSelectSlot ? selected : undefined}
                    aria-label={slotActionLabel ? `${formatTime(slot.start)}-${formatTime(slot.end)} ${slot.id === disabledSlotId ? "削除中" : slotActionLabel}` : undefined}
                  >
                    {formatTime(slot.start)}-{formatTime(slot.end)} {formatDeliveryMode(slot.deliveryMode, language)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeSliderControl({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="time-slider-control">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input
        type="range"
        min="0"
        max={availabilityTimeStepMax}
        step="1"
        value={timeToSliderValue(value)}
        onChange={(event) => onChange(sliderValueToTime(Number(event.target.value)))}
      />
    </label>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatCustomerStatus(status: CustomerRecord["status"], language: PlatformLanguage) {
  const labels: Record<PlatformLanguage, Record<CustomerRecord["status"], string>> = {
    ja: {
      active: "受講中",
      watch: "確認中",
      restricted: "一部制限中",
      blocked: "受付停止"
    },
    en: {
      active: "Active",
      watch: "Under review",
      restricted: "Restricted",
      blocked: "Not available"
    },
    "zh-Hant": {
      active: "上課中",
      watch: "確認中",
      restricted: "部分限制",
      blocked: "暫停受理"
    }
  };
  return labels[language][status] ?? status;
}

function formatBookingStatus(status: BookingStatus, language: PlatformLanguage) {
  const labels: Record<PlatformLanguage, Record<BookingStatus, string>> = {
    ja: {
      requested: "リクエスト送信済み",
      approved: "予約確定",
      reschedule_requested: "日程変更リクエスト中",
      cancel_requested: "キャンセルリクエスト中",
      cancelled: "キャンセル済み"
    },
    en: {
      requested: "Request sent",
      approved: "Confirmed",
      reschedule_requested: "Reschedule requested",
      cancel_requested: "Cancellation requested",
      cancelled: "Cancelled"
    },
    "zh-Hant": {
      requested: "已送出申請",
      approved: "預約已確認",
      reschedule_requested: "已提出改期申請",
      cancel_requested: "已提出取消申請",
      cancelled: "已取消"
    }
  };
  return labels[language][status] ?? status;
}

function getBookingVisualState(booking: BookingRecord) {
  if (booking.status === "approved" && isPastBooking(booking.requestedSlot)) return "completed";
  if (booking.status === "approved") return "confirmed";
  if (booking.status === "requested") return "pending";
  return "pending";
}

function formatBookingDisplayStatus(booking: BookingRecord, language: PlatformLanguage) {
  if (booking.status === "approved" && isPastBooking(booking.requestedSlot)) {
    const labels: Record<PlatformLanguage, string> = {
      ja: "完了",
      en: "Completed",
      "zh-Hant": "已完成"
    };
    return labels[language];
  }
  return formatBookingStatus(booking.status, language);
}

function StatusBadge({ status, language = "ja" }: { status: BookingStatus; language?: PlatformLanguage }) {
  return <span className={`status-badge ${status}`}>{formatBookingStatus(status, language)}</span>;
}

function formatLessonKind(kind: LessonKind, language: PlatformLanguage) {
  const labels: Record<PlatformLanguage, Record<LessonKind, string>> = {
    ja: {
      japanese: "1on1日本語レッスン",
      english: "英語発音コーチング"
    },
    en: {
      japanese: "1-on-1 Japanese Lesson",
      english: "English Pronunciation Coaching"
    },
    "zh-Hant": {
      japanese: "1對1日語課程",
      english: "英語發音教練課"
    }
  };
  return labels[language][kind];
}

function formatDeliveryMode(mode: DeliveryMode, language: PlatformLanguage) {
  const labels: Record<PlatformLanguage, Record<DeliveryMode, string>> = {
    ja: {
      online: "オンライン",
      inPerson: "対面"
    },
    en: {
      online: "Online",
      inPerson: "In person"
    },
    "zh-Hant": {
      online: "線上",
      inPerson: "實體"
    }
  };
  return labels[language][mode];
}

function formatAuthProvider(provider: StudentProfile["provider"]) {
  const labels: Record<StudentProfile["provider"], string> = {
    google: "Google",
    email: "Email"
  };
  return labels[provider];
}

function mapSupabaseProvider(provider: unknown): StudentProfile["provider"] {
  if (provider === "google") return "google";
  return "email";
}

function buildStudentProfileFromSupabaseUser(user: SupabaseUserLike, localProfiles: StudentProfile[]): StudentProfile {
  const email = user.email?.toLowerCase() ?? "";
  const provider = mapSupabaseProvider(user.app_metadata?.provider);
  const fallbackName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : email.split("@")[0];
  const localProfile = localProfiles.find((profile) => profile.email.toLowerCase() === email);

  return localProfile ?? {
    studentId: generateStudentId(localProfiles),
    name: fallbackName,
    email,
    provider,
    createdAt: new Date().toISOString(),
    zoomLink: ""
  };
}

async function ensureSupabaseStudentProfile(user: SupabaseUserLike, localProfiles: StudentProfile[]) {
  const supabase = getSupabaseClient();
  const email = user.email?.toLowerCase() ?? "";
  const provider = mapSupabaseProvider(user.app_metadata?.provider);
  const fallbackName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : email.split("@")[0];
  const localProfile = localProfiles.find((profile) => profile.email.toLowerCase() === email);

  if (!supabase || !email) {
    return localProfile ?? {
      studentId: generateStudentId(localProfiles),
      name: fallbackName,
      email,
      provider,
      createdAt: new Date().toISOString(),
      zoomLink: ""
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    throw new Error(sessionError?.message || "Supabase session token was not found.");
  }

  const response = await fetch("/api/student-profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      name: localProfile?.name ?? fallbackName,
      provider
    })
  });

  const body = await response.json().catch(() => ({})) as { profile?: Partial<StudentProfile>; message?: string };
  if (!response.ok || !body.profile?.email || !body.profile?.studentId) {
    throw new Error(body.message || "Student profile sync failed.");
  }

  return {
    studentId: String(body.profile.studentId),
    name: String(body.profile.name || localProfile?.name || fallbackName),
    email: String(body.profile.email).toLowerCase(),
    provider: mapSupabaseProvider(body.profile.provider),
    createdAt: String(body.profile.createdAt || localProfile?.createdAt || new Date().toISOString()),
    zoomLink: String(body.profile.zoomLink || localProfile?.zoomLink || "")
  };
}

function generateStudentId(profiles: StudentProfile[]) {
  let id = "";
  do {
    id = `STU-${Math.floor(100000 + Math.random() * 900000)}`;
  } while (profiles.some((profile) => profile.studentId === id));
  return id;
}

function buildStudentPackageSummary(email: string, bookings: BookingRecord[], customer: CustomerRecord, studentId?: string, zoomLink?: string, studentName?: string) {
  const credits = getStudentLessonCredits(email, customer);
  const purchased = credits.reduce((total, credit) => total + credit.purchasedLessons, 0);
  const completed = bookings.filter((booking) => booking.studentEmail.toLowerCase() === email.toLowerCase() && booking.status === "approved" && isPastBooking(booking.requestedSlot)).length;
  const reserved = bookings.filter((booking) => booking.studentEmail.toLowerCase() === email.toLowerCase() && booking.status === "approved" && !isPastBooking(booking.requestedSlot)).length;
  const unbooked = Math.max(0, purchased - completed - reserved);
  const primaryCredit = credits[0];
  const purchaseHistory = credits
    .slice()
    .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
    .slice(0, 3)
    .map((credit) => ({
      packageLabel: credit.packageLabel,
      purchasedLessons: credit.purchasedLessons,
      remainingLessons: credit.remainingLessons,
      purchasedAt: credit.purchasedAt
    }));

  return {
    email,
    name: studentName || (customer.email.toLowerCase() === email.toLowerCase() ? customer.name : email),
    studentId: studentId ?? "未発行",
    purchased,
    reserved,
    completed,
    unbooked,
    packageLabel: primaryCredit?.packageLabel ?? "未登録",
    purchasedAt: primaryCredit?.purchasedAt ?? "",
    purchaseHistory,
    zoomLink: zoomLink ?? ""
  };
}

function buildStudentPackageSummaries(bookings: BookingRecord[], customer: CustomerRecord, profiles: StudentProfile[]) {
  const emails = Array.from(new Set([
    customer.email.toLowerCase(),
    ...bookings.map((booking) => booking.studentEmail.toLowerCase()),
    ...profiles.map((profile) => profile.email.toLowerCase())
  ]));
  return emails.map((email) => {
    const profile = profiles.find((item) => item.email.toLowerCase() === email.toLowerCase());
    return buildStudentPackageSummary(email, bookings, customer, profile?.studentId, profile?.zoomLink, profile?.name);
  });
}

function getBookingSequenceNumber(booking: BookingRecord, bookings: BookingRecord[]) {
  const sameStudentBookings = bookings
    .filter((item) => item.studentEmail.toLowerCase() === booking.studentEmail.toLowerCase() && item.lessonKind === booking.lessonKind && item.status === "approved")
    .sort((a, b) => new Date(a.requestedSlot).getTime() - new Date(b.requestedSlot).getTime());
  const index = sameStudentBookings.findIndex((item) => item.id === booking.id);
  return index >= 0 ? index + 1 : sameStudentBookings.length + 1;
}

function formatPackageProgressForBooking(booking: BookingRecord, bookings: BookingRecord[], customer: CustomerRecord) {
  const credits = getStudentLessonCredits(booking.studentEmail, customer).filter((credit) => credit.lessonKind === booking.lessonKind);
  const purchased = credits.reduce((total, credit) => total + credit.purchasedLessons, 0);
  if (purchased === 0) return "購入パッケージ情報は未登録です。";
  return `購入パッケージ総数 ${purchased}回中 ${getBookingSequenceNumber(booking, bookings)}回目`;
}

function getBookingCourseName(booking: BookingRecord, language: PlatformLanguage = "ja") {
  const firstDetail = booking.reason?.split(" / ")[0]?.trim();
  if (firstDetail && !firstDetail.startsWith("完了済みレッスン")) return firstDetail;
  const fallbackMenu = getLessonMenus(booking.lessonKind)[0];
  if (!fallbackMenu) return formatLessonKind(booking.lessonKind, language);
  const display = getMenuText(fallbackMenu, language);
  return `${display.category}：${display.name}`;
}

function findOverlappingBookings(target: BookingRecord, bookings: BookingRecord[]) {
  const targetTime = new Date(target.requestedSlot).getTime();
  if (Number.isNaN(targetTime)) return [];
  return bookings.filter((booking) => {
    if (booking.id === target.id || booking.status !== "approved") return false;
    const bookingTime = new Date(booking.requestedSlot).getTime();
    return !Number.isNaN(bookingTime) && bookingTime === targetTime;
  });
}

function formatCalendarMonth(year: number, monthIndex: number, language: PlatformLanguage) {
  if (language === "en") return `${new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(year, monthIndex, 1))} ${year}`;
  if (language === "zh-Hant") return `${year}年${monthIndex + 1}月`;
  return `${year}年 ${monthIndex + 1}月`;
}

function getWeekdayNames(language: PlatformLanguage) {
  const labels: Record<PlatformLanguage, string[]> = {
    ja: ["日", "月", "火", "水", "木", "金", "土"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    "zh-Hant": ["日", "一", "二", "三", "四", "五", "六"]
  };
  return labels[language];
}

function getStudentPageCopy(language: PlatformLanguage) {
  const copies = {
    ja: {
      loginTitle: "受講者ダッシュボード",
      loginLead: "登録メールアドレスを入力すると、そのメールアドレスに紐づく予約状況を確認できます。",
      registeredEmail: "登録メールアドレス",
      signInIdentifier: "StudentID または メールアドレス",
      signIn: "サインイン",
      signUp: "サインアップ",
      loginButton: "確認する",
      signUpButton: "StudentIDを発行する",
      authSending: "送信中",
      signInLinkSent: "サインイン用リンクをメールで送信しました。メールをご確認ください。",
      signUpLinkSent: "StudentID登録リンクをメールで送信しました。メールをご確認ください。",
      authRequestFailure: "認証リンクを送信できませんでした。時間をおいて再度お試しください。",
      authNotFound: "StudentIDまたはメールアドレスを確認してください。",
      emailValidationError: "メールアドレスの形式を確認してください。",
      secureAuthEnabled: "安全な認証サービスに接続されています。",
      localAuthFallback: "現在は確認用のローカルログインです。Supabase設定後に安全な認証へ切り替わります。",
      dashboardTitle: "予約状況、パッケージ、学習履歴",
      dashboardLead: "予約希望、確定済みの予約、パッケージ状況を確認できます。日程については内容確認後にメールでご案内します。",
      switchButton: "ログアウト",
      remainingLessons: "残レッスン",
      purchasedLessons: "購入済",
      reservedLessons: "予約済",
      completedLessons: "完了済",
      unbookedLessons: "未予約",
      lessonLinkTitle: "Lesson Link",
      lessonLinkLead: "受講用リンク",
      openLessonLink: "レッスンリンクを開く",
      nextCheck: "次回確認目安",
      customerStatus: "受講状況",
      lessonCount: (count: number) => `${count}回`,
      bookingRequestTitle: "予約リクエストを送る",
      bookingRequestLead: "希望日時と受講内容を送信してください。内容を確認のうえ、日程についてメールでご案内します。",
      blockedMessage: "このメールアドレスからの予約リクエストは受付できません。",
      validationError: "必須項目とメール形式を確認してください。予約はまだ送信されていません。",
      bookingSuccess: (count: number) => `${count}件の予約希望を送信しました。内容確認後、日程についてメールでご案内します。`,
      bookingMailError: (count: number) => `${count}件の予約リクエストを作成しました。ただしメール通知に失敗したため、必要に応じて直接ご連絡ください。`,
      name: "お名前",
      loginEmail: "ログインメール",
      lessonKind: "レッスン種別",
      japaneseLesson: "1on1日本語レッスン",
      englishLesson: "英語発音コーチング",
      lessonMenu: "レッスンメニュー",
      bookableMenuNote: "購入済みパッケージ、および同価格のコースのみ選択できます。",
      noPurchasedPackage: "購入済みパッケージがありません",
      noPurchasedPackageLead: "予約リクエストには、先にレッスンパッケージの購入希望を送信してください。",
      deliveryNote: "実施方法は、選択した講師空き枠に合わせて自動反映されます。対面枠は開催地の事前確認が必要です。",
      selectedSlots: "選択中の候補枠",
      selectedSlotPlaceholder: "講師空き時間カレンダーから候補枠を選択してください。",
      selectedSlotCount: (count: number) => `${count}枠を選択中`,
      deliveryMode: "実施方法",
      deliveryAuto: "空き枠を選択すると自動反映されます。",
      mixedDelivery: "複数（オンライン・対面）",
      noManualSlot: "日時は講師空き時間カレンダーから選択してください。手入力による予約リクエストは受け付けていません。",
      recurringRequest: "定期予約としてリクエストする",
      recurringNote: "複数枠を選択した場合は、定期予約候補としてまとめて講師へリクエストされます。",
      purpose: "目的・相談内容（任意）",
      availabilityTitle: "講師空き時間カレンダー",
      availabilityLead: "講師が公開した候補枠のうち、まだ予約が入っていない枠だけを表示しています。枠をクリックすると、予約リクエストの希望日時に反映されます。",
      bookingCalendarTitle: "予約カレンダー",
      requestPanelTitle: "連絡・各種リクエスト",
      changeTab: "日程変更・キャンセル",
      contactTab: "講師に問い合わせ",
      changeTitle: "日程変更・キャンセルリクエスト",
      changeLead: "予約確定後、日程変更やキャンセルが必要な場合は、理由を添えてリクエストを送信してください。内容確認後、メールでご案内します。",
      contactLead: "レッスンや受講に関する問い合わせを講師へ送信できます。返信はメールでご案内します。",
      contactSubject: "件名（任意）",
      contactBody: "問い合わせ内容",
      contactSubmit: "問い合わせを送信",
      contactSending: "送信中",
      contactValidationError: "問い合わせ内容を入力してください。",
      contactSuccess: "問い合わせを送信しました。講師よりメールでご案内します。",
      contactFailure: "問い合わせを送信できませんでした。時間をおいて再度お試しください。",
      requestType: "リクエスト種別",
      reschedule: "日程変更",
      cancel: "キャンセル",
      targetBooking: "対象予約",
      reasonRequired: "理由（必須）",
      changeSubmit: "リクエストを送信",
      changeValidationError: "日程変更・キャンセルリクエストには理由の入力が必要です。",
      changeSuccess: (requestType: string) => `${requestType}リクエストを送信しました。内容確認後、メールでご案内します。`,
      changeMailError: (requestType: string) => `${requestType}リクエストを記録しました。ただしメール通知に失敗したため、必要に応じて直接ご連絡ください。`,
      bookingTimelineTitle: "予約タイムライン",
      statusLabel: "ステータス",
      detailLabel: "詳細",
      twelveHourLabel: "12時間前ルール",
      twelveHourClose: "個別確認が必要です",
      twelveHourOpen: "通常受付期間内です",
      noConfirmedBookings: "確定した予約はまだありません。",
      noLessonNote: "この予約のレッスンメモはまだ登録されていません。",
      futureLessonNote: "未来の予約です。レッスン終了後にノートを表示します。",
      previousMonth: "前月",
      nextMonth: "翌月"
    },
    en: {
      loginTitle: "Student Dashboard",
      loginLead: "Enter your registered email address to view booking information linked to that address.",
      registeredEmail: "Registered email address",
      signInIdentifier: "StudentID or email address",
      signIn: "Sign in",
      signUp: "Sign up",
      loginButton: "Continue",
      signUpButton: "Issue StudentID",
      authSending: "Sending",
      signInLinkSent: "A sign-in link has been sent to your email.",
      signUpLinkSent: "A StudentID registration link has been sent to your email.",
      authRequestFailure: "The authentication link could not be sent. Please try again later.",
      authNotFound: "Please check your StudentID or email address.",
      emailValidationError: "Please check the email address format.",
      secureAuthEnabled: "Secure authentication is connected.",
      localAuthFallback: "Local preview login is currently active. Secure authentication will be enabled after Supabase configuration.",
      dashboardTitle: "Bookings, Packages, and Lesson History",
      dashboardLead: "You can check booking requests, confirmed bookings, and package status. Schedule details will be shared by email after review.",
      switchButton: "Log out",
      remainingLessons: "Remaining lessons",
      purchasedLessons: "Purchased",
      reservedLessons: "Booked",
      completedLessons: "Completed",
      unbookedLessons: "Unbooked",
      lessonLinkTitle: "Lesson Link",
      lessonLinkLead: "Lesson access link",
      openLessonLink: "Open lesson link",
      nextCheck: "Next check",
      customerStatus: "Lesson status",
      lessonCount: (count: number) => `${count} lesson${count === 1 ? "" : "s"}`,
      bookingRequestTitle: "Send Booking Request",
      bookingRequestLead: "Send your preferred schedule and lesson details. Schedule information will be shared by email after review.",
      blockedMessage: "Booking requests cannot be accepted from this email address.",
      validationError: "Please check the required fields and email format. The booking request has not been sent yet.",
      bookingSuccess: (count: number) => `${count} booking request${count === 1 ? "" : "s"} sent. Schedule details will be shared by email after review.`,
      bookingMailError: (count: number) => `${count} booking request${count === 1 ? "" : "s"} created, but the email notification could not be sent. Please contact us directly if needed.`,
      name: "Name",
      loginEmail: "Login email",
      lessonKind: "Lesson type",
      japaneseLesson: "1-on-1 Japanese Lesson",
      englishLesson: "English Pronunciation Coaching",
      lessonMenu: "Lesson menu",
      bookableMenuNote: "Only purchased packages and courses at the same price are available here.",
      noPurchasedPackage: "No purchased package",
      noPurchasedPackageLead: "Please send a lesson package purchase request before submitting a booking request.",
      deliveryNote: "The delivery format is set automatically from the selected tutor availability slot. In-person lessons require location confirmation in advance.",
      selectedSlots: "Selected time slots",
      selectedSlotPlaceholder: "Please select a time slot from the tutor availability calendar.",
      selectedSlotCount: (count: number) => `${count} slot${count === 1 ? "" : "s"} selected`,
      deliveryMode: "Delivery format",
      deliveryAuto: "This will update automatically after you select a time slot.",
      mixedDelivery: "Mixed (online / in person)",
      noManualSlot: "Please select a time slot from the tutor availability calendar. Manual date entry is not accepted for booking requests.",
      recurringRequest: "Request as recurring booking",
      recurringNote: "When multiple slots are selected, they will be sent together as recurring booking candidates.",
      purpose: "Purpose / message (optional)",
      availabilityTitle: "Tutor Availability Calendar",
      availabilityLead: "Only open tutor slots without existing bookings are shown. Click a slot to add it to your booking request.",
      bookingCalendarTitle: "Booking Calendar",
      requestPanelTitle: "Contact and Requests",
      changeTab: "Reschedule / Cancel",
      contactTab: "Contact Tutor",
      changeTitle: "Reschedule / Cancellation Request",
      changeLead: "If you need to reschedule or cancel after your booking is confirmed, please send a request with the reason. Details will be shared by email after review.",
      contactLead: "Send lesson-related questions to your tutor. The reply will be sent by email.",
      contactSubject: "Subject (optional)",
      contactBody: "Message",
      contactSubmit: "Send Inquiry",
      contactSending: "Sending",
      contactValidationError: "Please enter your message.",
      contactSuccess: "Your inquiry has been sent. The tutor will reply by email.",
      contactFailure: "Your inquiry could not be sent. Please try again later.",
      requestType: "Request type",
      reschedule: "Reschedule",
      cancel: "Cancel",
      targetBooking: "Target booking",
      reasonRequired: "Reason (required)",
      changeSubmit: "Send Request",
      changeValidationError: "A reason is required for reschedule or cancellation requests.",
      changeSuccess: (requestType: string) => `${requestType} request sent. Details will be shared by email after review.`,
      changeMailError: (requestType: string) => `${requestType} request recorded, but the email notification could not be sent. Please contact us directly if needed.`,
      bookingTimelineTitle: "Booking Timeline",
      statusLabel: "Status",
      detailLabel: "Details",
      twelveHourLabel: "12-hour policy",
      twelveHourClose: "Individual review required",
      twelveHourOpen: "Within the standard request window",
      noConfirmedBookings: "There are no confirmed bookings yet.",
      noLessonNote: "Lesson notes have not been added for this booking yet.",
      futureLessonNote: "This is a future booking. Lesson notes will appear after the lesson.",
      previousMonth: "Previous month",
      nextMonth: "Next month"
    },
    "zh-Hant": {
      loginTitle: "學生頁面",
      loginLead: "輸入註冊電子郵件後，可?看與該信箱相關的預約資訊。",
      registeredEmail: "註冊電子郵件",
      signInIdentifier: "StudentID 或電子郵件",
      signIn: "登入",
      signUp: "註冊",
      loginButton: "確認",
      signUpButton: "發行 StudentID",
      authSending: "送出中",
      signInLinkSent: "已將登入連結寄到您的電子郵件。",
      signUpLinkSent: "已將 StudentID 註冊連結寄到您的電子郵件。",
      authRequestFailure: "無法寄出認證連結，請稍後再試。",
      authNotFound: "請確認 StudentID 或電子郵件。",
      emailValidationError: "請確認電子郵件格式。",
      secureAuthEnabled: "已連接安全認證服務。",
      localAuthFallback: "目前使用本機預覽登入。完成 Supabase 設定後會切換為安全認證。",
      dashboardTitle: "預約、套裝課程與學習紀?",
      dashboardLead: "可確認預約申請、已確認的預約與課程套裝?態。日程確認後會以電子郵件通知。",
      switchButton: "登出",
      remainingLessons: "剩餘課程",
      purchasedLessons: "已購買",
      reservedLessons: "已預約",
      completedLessons: "已完成",
      unbookedLessons: "未預約",
      lessonLinkTitle: "Lesson Link",
      lessonLinkLead: "課程連結",
      openLessonLink: "開?課程連結",
      nextCheck: "下次確認",
      customerStatus: "上課?態",
      lessonCount: (count: number) => `${count}堂`,
      bookingRequestTitle: "送出預約申請",
      bookingRequestLead: "請送出希望時間與課程?容。確認後會以電子郵件通知日程。",
      blockedMessage: "此電子郵件無法送出預約申請。",
      validationError: "請確認必填項目與電子郵件格式。預約申請尚未送出。",
      bookingSuccess: (count: number) => `已送出 ${count} 件預約申請。確認後會以電子郵件通知日程。`,
      bookingMailError: (count: number) => `已建立 ${count} 件預約申請，但電子郵件通知未能送出。如有需要請直接聯絡。`,
      name: "姓名",
      loginEmail: "登入電子郵件",
      lessonKind: "課程類型",
      japaneseLesson: "1對1日語課程",
      englishLesson: "英語發音教練課",
      lessonMenu: "課程選單",
      bookableMenuNote: "此處僅可選擇已購買套裝課程，以及相同價格的課程。",
      noPurchasedPackage: "尚無已購買的套裝課程",
      noPurchasedPackageLead: "送出預約申請前，請先送出課程套裝購買申請。",
      deliveryNote: "上課方式會依選擇的講師空?自動反映。實體課程需事先確認地點。",
      selectedSlots: "已選候選時段",
      selectedSlotPlaceholder: "請從講師空?日?選擇候選時段。",
      selectedSlotCount: (count: number) => `已選擇 ${count} 個時段`,
      deliveryMode: "上課方式",
      deliveryAuto: "選擇空?後會自動反映。",
      mixedDelivery: "多種方式（線上／實體）",
      noManualSlot: "請從講師空?日?選擇時間。預約申請不接受手動輸入日期。",
      recurringRequest: "作為固定預約提出申請",
      recurringNote: "選擇多個時段時，會作為固定預約候選一併送出。",
      purpose: "目的／諮詢?容（選填）",
      availabilityTitle: "講師空?日?",
      availabilityLead: "僅顯示講師公開且尚未被預約的候選時段。點選時段後會加入預約申請。",
      bookingCalendarTitle: "預約日?",
      requestPanelTitle: "聯絡與各種申請",
      changeTab: "改期／取消",
      contactTab: "聯絡講師",
      changeTitle: "改期／取消申請",
      changeLead: "預約確認後，如需改期或取消，請附上理由送出申請。確認後會以電子郵件通知。",
      contactLead: "可將課程相關問題送給講師。回覆將以電子郵件通知。",
      contactSubject: "主旨（選填）",
      contactBody: "詢問內容",
      contactSubmit: "送出詢問",
      contactSending: "送出中",
      contactValidationError: "請輸入詢問內容。",
      contactSuccess: "詢問已送出。講師將以電子郵件回覆。",
      contactFailure: "詢問未能送出，請稍後再試。",
      requestType: "申請類型",
      reschedule: "改期",
      cancel: "取消",
      targetBooking: "對象預約",
      reasonRequired: "理由（必填）",
      changeSubmit: "送出申請",
      changeValidationError: "改期或取消申請必須填寫理由。",
      changeSuccess: (requestType: string) => `已送出${requestType}申請。確認後會以電子郵件通知。`,
      changeMailError: (requestType: string) => `已記?${requestType}申請，但電子郵件通知未能送出。如有需要請直接聯絡。`,
      bookingTimelineTitle: "預約時間軸",
      statusLabel: "?態",
      detailLabel: "詳細?容",
      twelveHourLabel: "12小時規則",
      twelveHourClose: "需個別確認",
      twelveHourOpen: "在一般受理期間?",
      noConfirmedBookings: "目前尚無已確認的預約。",
      noLessonNote: "此預約尚未登?課程筆記。",
      futureLessonNote: "這是未來的預約。課程結束後會顯示課程筆記。",
      previousMonth: "上個月",
      nextMonth: "下個月"
    }
  };

  return copies[language];
}

function getMode(path: string) {
  if (path === "/learning") return "learning";
  if (path === "/learning/student" || path === "/platform") return "student";
  if (path === "/learning/reviews") return "reviews";
  if (path === "/learning/tutor") return "tutor";
  if (path.startsWith("/learning/")) return "lesson";
  return "student";
}

function getLessonMenus(kind: LessonKind) {
  return kind === "japanese" ? japaneseLessonMenus : englishPronunciationMenus;
}

function getBookableLessonKinds(email: string, customer: CustomerRecord) {
  const credits = getStudentLessonCredits(email, customer);
  return Array.from(new Set(credits.filter((credit) => credit.remainingLessons > 0).map((credit) => credit.lessonKind)));
}

function getEligibleBookingMenus(kind: LessonKind, email: string, customer: CustomerRecord) {
  const credits = getStudentLessonCredits(email, customer).filter((credit) => credit.lessonKind === kind && credit.remainingLessons > 0);
  if (credits.length === 0) return [];

  const menus = getLessonMenus(kind);
  const purchasedMenuIds = new Set(credits.map((credit) => credit.lessonMenuId));
  const purchasedPriceKeys = new Set(credits.map((credit) => `${credit.currency}:${credit.unitPrice}`));

  return menus.filter((menu) => (
    purchasedMenuIds.has(menu.id) || purchasedPriceKeys.has(`${menu.currency}:${menu.unitPrice}`)
  ));
}

function getStudentLessonCredits(email: string, customer: CustomerRecord) {
  return customer.email.toLowerCase() === email.toLowerCase() ? customer.lessonCredits : [];
}

function getBookingLessonKind(form: BookingFormState): LessonKind {
  return form.lessonMenuId.startsWith("en-") ? "english" : "japanese";
}

function getLessonMenuLabelCopy(language: PlatformLanguage) {
  const copies = {
    ja: {
      menuTitle: "Lesson Menu",
      menuLead: "カテゴリごとにコース内容を整理しています。各コースはタイルで確認できます。購入回数・時間は下の「コース購入」で選択できます。",
      purchaseTitle: "コース購入",
      purchaseLead: "こちらからレッスンパッケージの購入が可能です。オンラインレッスンは、ご希望のレッスン形態を選択し「購入画面へ」を押してください。予約確定後に請求・決済導線をご案内します。",
      lessonMenu: "レッスンメニュー",
      selected: "選択中",
      duration: "授業時間",
      minutes: "分",
      count: "購入回数",
      lessons: "回",
      online: "オンライン",
      inPerson: "対面",
      deliverySelectTitle: "実施方法",
      deliveryOnlineKicker: "Online",
      deliveryOnlineTitle: "オンラインレッスン",
      deliveryOnlineDescription: "Zoom等のオンライン会議システムを想定しています。",
      deliveryInPersonKicker: "In person",
      deliveryInPersonTitle: "対面レッスン",
      deliveryInPersonDescription: "オンライン単価の1.8倍を目安に個別調整します。開催地は相談可能。初回予約の方は必ず問い合わせください。",
      inPersonNote: "対面レッスンはオンライン単価の1.8倍を目安に個別調整します。",
      purchaseButton: "購入画面へ",
      contactButton: "お問い合わせ",
      studentButton: "Student画面へ",
      course: "コース",
      deliveryMode: "実施方法",
      priceEstimate: "金額目安"
    },
    en: {
      menuTitle: "Lesson Menu",
      menuLead: "Lesson options are organized by learning purpose. Course details are shown as tiles, and lesson count and duration can be selected in Course Purchase below.",
      purchaseTitle: "Course Purchase",
      purchaseLead: "You can request a lesson package purchase here. For online lessons, select your preferred lesson format and press “Purchase screen”. Invoice and payment instructions will be shared after the booking is confirmed.",
      lessonMenu: "Lesson menu",
      selected: "Selected",
      duration: "Duration",
      minutes: " min.",
      count: "Purchase count",
      lessons: " lesson(s)",
      online: "Online",
      inPerson: "In person",
      deliverySelectTitle: "Delivery mode",
      deliveryOnlineKicker: "Online",
      deliveryOnlineTitle: "Online lesson",
      deliveryOnlineDescription: "Lessons are designed for Zoom or another online meeting system.",
      deliveryInPersonKicker: "In person",
      deliveryInPersonTitle: "In-person lesson",
      deliveryInPersonDescription: "The fee is adjusted individually using 1.8x the online unit price as a guide. Location is negotiable. First-time students must inquire before booking.",
      inPersonNote: "In-person lessons are adjusted individually using 1.8x the online unit price as a guide.",
      purchaseButton: "Go to purchase screen",
      contactButton: "Contact",
      studentButton: "Go to Student",
      course: "Course",
      deliveryMode: "Delivery mode",
      priceEstimate: "Estimated amount"
    },
    "zh-Hant": {
      menuTitle: "課程選單",
      menuLead: "課程依學習目的整理。各課程以?片呈現，購買堂數與時間可在下方「課程購買」中選擇。",
      purchaseTitle: "課程購買",
      purchaseLead: "可在此申請購買課程套組。線上課程請選擇希望的課程形式，並點選「前往購買畫面」。預約確認後，將提供請款與付款方式。",
      lessonMenu: "課程選單",
      selected: "目前選擇",
      duration: "課程時間",
      minutes: "分鐘",
      count: "購買堂數",
      lessons: "堂",
      online: "線上",
      inPerson: "實體",
      deliverySelectTitle: "上課方式",
      deliveryOnlineKicker: "Online",
      deliveryOnlineTitle: "線上課程",
      deliveryOnlineDescription: "課程預計使用 Zoom 等線上會議工具進行。",
      deliveryInPersonKicker: "In person",
      deliveryInPersonTitle: "實體課程",
      deliveryInPersonDescription: "實體課程以線上單價的 1.8 倍為參考，個別協調。地點可討論，首次預約者請務必先詢問。",
      inPersonNote: "實體課程將以線上單價的 1.8 倍為參考，個別協調。",
      purchaseButton: "前往購買畫面",
      contactButton: "聯絡諮詢",
      studentButton: "前往學生頁面",
      course: "課程",
      deliveryMode: "上課方式",
      priceEstimate: "預估金額"
    }
  };

  return copies[language];
}

function getMenuText(menu: LessonMenu, language: PlatformLanguage): MenuDisplayText {
  const translations: Record<string, Partial<Record<PlatformLanguage, MenuDisplayText>>> = {
    "jp-trial": {
      en: { category: "Trial", name: "Trial lesson", description: "A first lesson to check your Japanese level, goals, and learning needs." },
      "zh-Hant": { category: "體驗", name: "體驗課", description: "確認目前日語程度、學習目標與課題的初次課程。" }
    },
    "jp-free-talk": {
      en: { category: "Conversation", name: "Free Talk Course", description: "Practice natural responses, vocabulary, and paraphrasing through everyday topics." },
      "zh-Hant": { category: "會話", name: "自由會話課程", description: "透過日常話題練習自然回應、詞彙與換句話?的能力。" }
    },
    "jp-daily-conversation": {
      en: { category: "Conversation", name: "Daily Conversation Course", description: "Practice natural responses and expressions used in daily life." },
      "zh-Hant": { category: "會話", name: "日常會話課程", description: "練習日常生活中使用的自然回應與實用表達。" }
    },
    "jp-travel-conversation": {
      en: { category: "Conversation", name: "Japan Travel Conversation Course", description: "Practice expressions for transportation, dining, shopping, lodging, and travel situations in Japan." },
      "zh-Hant": { category: "會話", name: "日本旅行會話課程", description: "練習在日本旅行時交通、用餐、購物、住宿等情境中使用的表達。" }
    },
    "jp-business-negotiation": {
      en: { category: "Practical Business Japanese", name: "Internal Negotiation Training", description: "Practice requests, adjustments, objections, and consensus building at work." },
      "zh-Hant": { category: "商務實用日語", name: "公司?部協調訓練", description: "練習工作中請求、協調、反駁與達成共識的表達。" }
    },
    "jp-business-conversation": {
      en: { category: "Practical Business Japanese", name: "Business Conversation (meetings / reports / small talk)", description: "Build natural workplace speaking skills for meetings, updates, and casual communication." },
      "zh-Hant": { category: "商務實用日語", name: "商務會話（會議 / 報告 / 閒聊）", description: "練習會議、報告與職場閒聊中自然使用的日語。" }
    },
    "jp-business-writing": {
      en: { category: "Practical Business Japanese", name: "Business Writing", description: "Refine emails, chat messages, and reports so they are clear to the reader." },
      "zh-Hant": { category: "商務實用日語", name: "商務寫作", description: "整理電子郵件、聊天訊息與報告文章，使?容更容易傳達。" }
    },
    "jp-business-presentation": {
      en: { category: "Practical Business Japanese", name: "Business Presentation", description: "Practice structure, explanation, and Q&A so you can present in Japanese with clarity." },
      "zh-Hant": { category: "商務實用日語", name: "商務簡報", description: "練習架構、?明與問答，提升用日語清楚表達的能力。" }
    },
    "jp-expat-prep": {
      en: { category: "Practical Business Japanese", name: "Japan Assignment Preparation", description: "Prepare workplace, daily life, and relationship-building Japanese before or after assignment in Japan." },
      "zh-Hant": { category: "商務實用日語", name: "日本派駐準備", description: "準備赴日前後職場、生活與建立關係所需的日語。" }
    },
    "jp-intensive-interview": {
      en: { category: "Intensive Package within 3 months", name: "Interview Preparation (business / school / qualification)", description: "Work backward from the deadline to refine answers, structure, pronunciation, and natural responses.", note: "For intensive preparation within 2 weeks, 35 USD / 50min. is used as a guide." },
      "zh-Hant": { category: "3個月?短期集中方案", name: "面試準備（商務 / 入學 / 資格考試）", description: "依照期限整理預想問題、回答架構、發音與自然回應。", note: "2週?短期集中以 35 USD / 50min. 為參考，個別討論。" }
    },
    "jp-intensive-presentation": {
      en: { category: "Intensive Package within 3 months", name: "Presentation Preparation", description: "Refine script, structure, Q&A, and delivery from the deadline backward.", note: "For intensive preparation within 2 weeks, 35 USD / 50min. is used as a guide." },
      "zh-Hant": { category: "3個月?短期集中方案", name: "簡報準備", description: "依照期限整理發表稿、架構、問答與?話方式。", note: "2週?短期集中以 35 USD / 50min. 為參考，個別討論。" }
    },
    "jp-intensive-exhibition": {
      en: { category: "Intensive Package within 3 months", name: "Exhibition Preparation", description: "Practice visitor support, product explanations, business card exchange, and opening sales conversations.", note: "For intensive preparation within 2 weeks, 35 USD / 50min. is used as a guide." },
      "zh-Hant": { category: "3個月?短期集中方案", name: "展覽會準備", description: "練習接待、商品?明、交換名片與商談開場的日語。", note: "2週?短期集中以 35 USD / 50min. 為參考，個別討論。" }
    },
    "jp-study-abroad": {
      en: { category: "Study Abroad Preparation", name: "Japan Study Abroad Preparation", description: "Prepare Japanese for classes, daily life, interviews, and school procedures.", note: "U20 discount available." },
      "zh-Hant": { category: "留學準備", name: "日本留學準備課程", description: "準備上課、生活、面試與學校手續中需要的日語。", note: "提供 U20 優惠。" }
    },
    "jp-jlpt-n5": {
      en: { category: "JLPT Preparation", name: "N5 Preparation Course", description: "Build grammar, vocabulary, reading, and listening foundations steadily." },
      "zh-Hant": { category: "JLPT 應試準備", name: "N5 準備課程", description: "穩定打好基礎文法、詞彙、?讀與聽解。" }
    },
    "jp-jlpt-n4-n2": {
      en: { category: "JLPT Preparation", name: "N4-N2 Preparation Course", description: "Organize weak points by level and improve scores through practice and review." },
      "zh-Hant": { category: "JLPT 應試準備", name: "N4-N2 準備課程", description: "依程度整理弱點，透過練習與講解提升得分能力。" }
    },
    "jp-jlpt-n1": {
      en: { category: "JLPT Preparation", name: "N1 Preparation Course", description: "Prepare for advanced vocabulary, reading, and listening with practical exam focus." },
      "zh-Hant": { category: "JLPT 應試準備", name: "N1 準備課程", description: "以高階詞彙、?讀與聽解為中心，進行實戰準備。" }
    },
    "en-trial": {
      en: { category: "Trial", name: "Trial Lesson", description: "A 25-minute first lesson to check pronunciation issues and training direction." },
      "zh-Hant": { category: "體驗", name: "體驗課", description: "25分鐘初次課程，確認目前發音課題與練習方向。" }
    },
    "en-single": {
      en: { category: "Pronunciation Coaching", name: "1 Lesson", description: "" },
      "zh-Hant": { category: "發音教練", name: "1堂課", description: "" }
    },
    "en-five": {
      en: { category: "Pronunciation Coaching", name: "5 Lessons", description: "" },
      "zh-Hant": { category: "發音教練", name: "5堂課", description: "" }
    },
    "en-ten": {
      en: { category: "Pronunciation Coaching", name: "10 Lessons", description: "" },
      "zh-Hant": { category: "發音教練", name: "10堂課", description: "" }
    }
  };

  return translations[menu.id]?.[language] ?? {
    category: menu.category,
    name: menu.name,
    description: menu.description,
    note: menu.note
  };
}

function getLessonRuleCopy(language: PlatformLanguage, lessonKind: LessonKind) {
  const priceRule = lessonKind === "japanese"
    ? {
        ja: "日本語レッスンは米ドル表記です。レッスン購入時点のレートに基づき請求いたします",
        en: "Japanese lessons are shown in USD and billed based on the exchange rate at the time of purchase.",
        "zh-Hant": "日語課以美元標示，依購買課程當時的匯率請款。"
      }
    : {
        ja: "英語発音コーチングは日本円表記です。購入時点の条件に基づき請求いたします",
        en: "English pronunciation coaching is shown in JPY and billed based on the conditions at the time of purchase.",
        "zh-Hant": "英語發音教練以日圓標示，依購買當時條件請款。"
      };

  const copies = {
    ja: {
      title: "レッスンルール",
      ruleTitle: "レッスンのルール",
      rules: [
        "ご希望日時を送信後、日程をご案内します",
        "オンラインレッスンは、Zoomにて行います",
        "Zoom録画も可能です。希望される方は事前にお知らせください",
        "レッスン受講前に通信環境・デバイスの確認をお願いします",
        "日程変更やキャンセルが必要な場合は、理由を添えてご連絡ください。確認後にご案内します",
        "12時間前を過ぎたタイミングでの日程変更は、原則として返金いたしかねます",
        priceRule.ja
      ]
    },
    en: {
      title: "Lesson Rules",
      ruleTitle: "Lesson Rules",
      rules: [
        "Send your preferred time, and schedule details will be shared by email.",
        "Online lessons are held on Zoom.",
        "Zoom recording is available upon advance request.",
        "Please check your internet connection and device before the lesson.",
        "If you need to reschedule or cancel, please send a request with the reason. Details will be confirmed by email.",
        "Reschedule requests made within 12 hours of the lesson are generally non-refundable.",
        priceRule.en
      ]
    },
    "zh-Hant": {
      title: "課程規則",
      ruleTitle: "課程規則",
      rules: [
        "送出希望時間後，將以電子郵件通知日程。",
        "線上課程使用 Zoom 進行。",
        "如需 Zoom ?影，請事先告知。",
        "上課前請確認網路環境與設備。",
        "如需改期或取消，請附上理由提出申請。確認後將以郵件通知。",
        "課程開始前 12 小時?提出改期，原則上不予退款。",
        priceRule["zh-Hant"]
      ]
    }
  };

  return copies[language];
}

function getReviewCopy(language: PlatformLanguage) {
  const copies = {
    ja: {
      title: "レッスンレビュー",
      summary: "受講者から寄せられたレッスンレビューを掲載しています。",
      badge: "Learner voices",
      reviewsTitle: "レッスンレビュー",
      reviewsNote: "受講者から寄せられたレビューを掲載しています。",
      noReviews: "掲載中のレビューはまだありません。",
      formTitle: "新しいレビューを書く",
      formLead: "レビューを投稿できます。ご感想や受講後の変化などをお聞かせください。",
      name: "表示名",
      email: "メールアドレス",
      rating: "評価",
      comment: "コメント",
      submit: "レビューを送信"
    },
    en: {
      title: "Lesson Reviews",
      summary: "Lesson reviews from students are shown here.",
      badge: "Learner voices",
      reviewsTitle: "Lesson Reviews",
      reviewsNote: "Reviews from students are shown here.",
      noReviews: "No reviews are published yet.",
      formTitle: "Write a new review",
      formLead: "You can leave a lesson review here. Share your experience or what changed after the lesson.",
      name: "Display name",
      email: "Email",
      rating: "Rating",
      comment: "Comment",
      submit: "Submit review"
    },
    "zh-Hant": {
      title: "課程評價",
      summary: "此處刊登學生留下的課程評價。",
      badge: "Learner voices",
      reviewsTitle: "課程評價",
      reviewsNote: "此處刊登學生留下的評價。",
      noReviews: "目前尚無公開評價。",
      formTitle: "留下新的評價",
      formLead: "可在此留下課程評價。歡迎分享上課感想或學習後的變化。",
      name: "顯示名稱",
      email: "電子郵件",
      rating: "評分",
      comment: "留言",
      submit: "送出評價"
    }
  };

  return copies[language];
}

function getReceiptCopy(language: PlatformLanguage) {
  const copies = {
    ja: {
      title: "領収書プレビュー",
      badge: "Receipt preview",
      receiptNo: "領収書番号",
      issueDate: "発行日",
      recipient: "宛名",
      amount: "金額",
      service: "但し書き・役務内容",
      paymentMethod: "支払い方法",
      issuer: "発行者",
      email: "送付先",
      online: "オンライン",
      inPerson: "対面",
      notSet: "未入力",
      note: "入金確認後に正式領収書として発行します。法人提出を想定し、宛名、発行日、金額、役務内容、支払方法、発行者情報、領収書番号を記載します。"
    },
    en: {
      title: "Receipt Preview",
      badge: "Receipt preview",
      receiptNo: "Receipt No.",
      issueDate: "Issue Date",
      recipient: "Recipient",
      amount: "Amount",
      service: "Description",
      paymentMethod: "Payment Method",
      issuer: "Issuer",
      email: "Delivery Email",
      online: "Online",
      inPerson: "In person",
      notSet: "Not entered",
      note: "The official receipt will be issued after payment confirmation. It includes the recipient, issue date, amount, service description, payment method, issuer information, and receipt number."
    },
    "zh-Hant": {
      title: "收據預覽",
      badge: "Receipt preview",
      receiptNo: "收據編號",
      issueDate: "開立日期",
      recipient: "抬頭",
      amount: "金額",
      service: "服務?容",
      paymentMethod: "付款方式",
      issuer: "開立者",
      email: "寄送信箱",
      online: "線上",
      inPerson: "實體",
      notSet: "未輸入",
      note: "確認入款後，將開立正式收據。收據會包含抬頭、開立日期、金額、服務?容、付款方式、開立者資訊與收據編號。"
    }
  } satisfies Record<PlatformLanguage, Record<string, string>>;

  return copies[language];
}

function formatReceiptDate(date: Date, language: PlatformLanguage) {
  const locales: Record<PlatformLanguage, string> = {
    ja: "ja-JP",
    en: "en-US",
    "zh-Hant": "zh-TW"
  };

  return new Intl.DateTimeFormat(locales[language], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function groupMenusByCategory<T extends { category: string }>(menus: T[]) {
  return menus.reduce<Array<{ category: string; menus: T[] }>>((groups, menu) => {
    const existing = groups.find((group) => group.category === menu.category);
    if (existing) {
      existing.menus.push(menu);
    } else {
      groups.push({ category: menu.category, menus: [menu] });
    }
    return groups;
  }, []);
}

function buildPriceSummary(menu: LessonMenu, deliveryMode: DeliveryMode, durationMinutes: number, lessonCount: number) {
  const multiplier = deliveryMode === "inPerson" ? 1.8 : 1;
  const total = calculateTotal(menu, durationMinutes, lessonCount, multiplier);
  return `${formatMoney(total, menu.currency)} / ${durationMinutes}分 x ${lessonCount}回`;
}

function calculateTotal(menu: LessonMenu, durationMinutes: number, lessonCount: number, multiplier = 1) {
  return menu.unitPrice * (durationMinutes / menu.unitMinutes) * lessonCount * multiplier;
}

function formatUnitPrice(menu: LessonMenu, multiplier = 1) {
  return `${formatMoney(menu.unitPrice * multiplier, menu.currency)} / ${menu.unitMinutes}min.`;
}

function formatMoney(value: number, currency: "USD" | "JPY") {
  if (currency === "JPY") {
    return `${Math.round(value).toLocaleString("ja-JP")} JPY`;
  }

  return `${Number.isInteger(value) ? value.toString() : value.toFixed(1)} USD`;
}

function formatDateTime(value: string) {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatAvailabilityRange(slot: TutorAvailabilitySlot) {
  return `${formatDateTime(slot.start)} - ${formatTime(slot.end)}`;
}

function isAvailabilitySlotBooked(slot: TutorAvailabilitySlot, bookings: BookingRecord[]) {
  const slotKey = toDateTimeLocalValue(slot.start);
  return bookings.some((booking) => booking.status !== "cancelled" && toDateTimeLocalValue(booking.requestedSlot) === slotKey);
}

function getSlotDurationMinutes(slot: TutorAvailabilitySlot) {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function summarizeDeliveryModes(slots: TutorAvailabilitySlot[], language: PlatformLanguage) {
  const copy = getStudentPageCopy(language);
  if (slots.length === 0) return copy.deliveryAuto;
  const hasOnline = slots.some((slot) => slot.deliveryMode === "online");
  const hasInPerson = slots.some((slot) => slot.deliveryMode === "inPerson");
  if (hasOnline && hasInPerson) return copy.mixedDelivery;
  return hasOnline ? formatDeliveryMode("online", language) : formatDeliveryMode("inPerson", language);
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toInputDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMinutesToLocalDateTime(value: string, minutes: number) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return `${toInputDateString(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function timeToSliderValue(value: string) {
  return Math.max(0, Math.min(availabilityTimeStepMax, Math.round(timeToMinutes(value) / availabilityTimeStepMinutes)));
}

function sliderValueToTime(value: number) {
  const totalMinutes = Math.max(0, Math.min(availabilityTimeStepMax, value)) * availabilityTimeStepMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toDateTimeLocalValue(value: string) {
  if (!value) return "";
  return value.slice(0, 16);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isInsideTwelveHours(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() - Date.now() < 12 * 60 * 60 * 1000;
}

function isPastBooking(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}


import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../App";
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
};

type SupabaseUserLike = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

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

const storageKey = "ldn-platform-language";
const studentEmailKey = "ldn-platform-student-email";
const availabilityStorageKey = "ldn-platform-tutor-availability";
const bookingsStorageKey = "ldn-platform-bookings";
const studentProfilesStorageKey = "ldn-platform-student-profiles";
const ownerEmail = "yu.leobiz003@outlook.com";
const tutorLoginPlaceholder = "yourtutor@info.com";

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

type PlatformNotification = {
  name: string;
  email: string;
  inquiryType: string;
  message: string;
  subject?: string;
  copyToRequester?: boolean;
};

async function sendPlatformNotification({ name, email, inquiryType, message, subject, copyToRequester }: PlatformNotification) {
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
        copyToRequester
      })
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
    createdAt: "2026-07-20T10:00:00+09:00"
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
  const [changeRequest, setChangeRequest] = useState<RequestChange>({
    bookingId: demoBookings[0]?.id ?? "",
    type: "reschedule_requested",
    reason: ""
  });

  const mode = getMode(route.path);
  const selectedProduct = lessonProducts.find((product) => route.path.endsWith(product.kind)) ?? lessonProducts[0];
  const supabaseAvailable = isSupabaseConfigured();

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let mounted = true;

    const applyUser = async (user: SupabaseUserLike | null) => {
      if (!mounted || !user?.email) return;
      let profile: StudentProfile;
      try {
        profile = await ensureSupabaseStudentProfile(user, studentProfiles);
      } catch (error) {
        console.error("Supabase student profile sync failed.", {
          message: error instanceof Error ? error.message : "Unknown error"
        });
        profile = buildStudentProfileFromSupabaseUser(user, studentProfiles);
      }
      if (!mounted) return;
      if (!studentProfiles.some((item) => item.email.toLowerCase() === profile.email.toLowerCase())) {
        setStudentProfiles([...studentProfiles, profile]);
      }
      setStudentEmail(profile.email);
      setBookingForm((current) => ({ ...current, email: profile.email, name: profile.name }));
      window.localStorage.setItem(studentEmailKey, profile.email);
    };

    const resolveAuthSession = async () => {
      const hasAuthCode = new URLSearchParams(window.location.search).has("code");
      if (hasAuthCode) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          console.error("Supabase OAuth callback exchange failed.", { message: error.message });
        } else {
          window.history.replaceState({}, "", window.location.pathname);
          await applyUser(data.session?.user ?? null);
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Supabase session lookup failed.", { message: error.message });
      }
      await applyUser(data.session?.user ?? null);
    };

    void resolveAuthSession();
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.error("Supabase user lookup failed.", { message: error.message });
      }
      return applyUser(data.user);
    });
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

  const setAvailabilitySlots = (slots: TutorAvailabilitySlot[]) => {
    setAvailabilitySlotsBase(slots);
    window.localStorage.setItem(availabilityStorageKey, JSON.stringify(slots));
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
        `${menu.name} / ${slot.deliveryMode === "online" ? "オンライン" : "対面"}`,
        `${getSlotDurationMinutes(slot)}分`,
        requestGroupLabel,
        `候補枠: ${formatAvailabilityRange(slot)}`
      ].join(" / "),
      approvalGate: "tutor",
      creditAction: "hold"
    }));

    const notificationSent = await sendPlatformNotification({
      name: nameForRequest,
      email: emailForRequest,
      inquiryType: "Learning予約リクエスト",
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
      <Seo title="Learning Platform" description="Leo de Noir の日本語レッスン・英語発音コーチング予約ページです。" />
      <section className="page-hero platform-hero">
        <div className="container platform-hero-grid">
          <div>
            <p className="eyebrow">Learning</p>
            <h1>Learning Menu</h1>
            <p>1on1日本語レッスンと英語発音コーチングのメニュー確認、予約リクエスト、受講者向け予約確認ページです。</p>
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
              bookings={bookings}
              setBookings={setBookings}
              customer={customer}
              studentProfiles={studentProfiles}
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
              availabilitySlots={availabilitySlots}
              supabaseAvailable={supabaseAvailable}
            />
          )}
        </div>
      </section>
    </>
  );
}

function PlatformNav({ route, activePath }: { route: Route; activePath: string }) {
  const links = [
    { href: "/learning", label: "Summary" },
    { href: "/learning/japanese", label: "Japanese" },
    { href: "/learning/english", label: "英語発音コーチング" },
    { href: "/platform", label: "Student Page" },
    { href: "/learning/reviews", label: "Lesson Review" }
  ];

  return (
    <nav className="platform-nav" aria-label="Learning platform navigation">
      {links.map((link) => (
        <a
          key={link.href}
          className={activePath === link.href ? "active" : ""}
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
          <div className="video-placeholder" aria-label={product.demoVideoLabel}>
            <span>Video</span>
            <strong>準備中</strong>
          </div>
          <p className="platform-note">{product.timezoneLabel}</p>
          <button className="button secondary" type="button" onClick={() => route.navigate("/platform")}>
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
  const [receiptName, setReceiptName] = useState(bookingForm.name);
  const [receiptEmail, setReceiptEmail] = useState(bookingForm.email);
  const [purchaseMessage, setPurchaseMessage] = useState("");
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

    const notificationSent = await sendPlatformNotification({
      name: receiptName || "Lesson purchase draft",
      email: receiptEmail,
      inquiryType: "Learning購入希望内容確認",
      message: [
        "Learningページから購入希望内容が送信されました。",
        "",
        `コース: ${selectedMenuText.category}：${selectedMenuText.name}`,
        `実施方法: ${bookingForm.deliveryMode === "online" ? text.online : text.inPerson}`,
        `時間: ${bookingForm.durationMinutes}${text.minutes}`,
        `購入回数: ${bookingForm.lessonCount}${text.lessons}`,
        `金額目安: ${priceSummary}`,
        `支払い方法: ${paymentMethod}`,
        `領収書宛名: ${receiptName || "未入力"}`,
        `送付先メール: ${receiptEmail || "未入力"}`,
        `領収書番号: ${receiptNumber}`
      ].join("\n")
    });

    setPurchaseMessage(
      notificationSent
        ? "購入希望を送信しました。内容確認後、支払い方法に応じてPayPalまたはPayPayのご案内をメールでお送りします。"
        : "購入希望内容を保存しました。ただしメール通知に失敗したため、必要に応じて直接ご連絡ください。"
    );
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel purchase-panel" role="dialog" aria-modal="true" aria-labelledby="purchase-dialog-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="購入画面を閉じる">
          ×
        </button>
        <h3 id="purchase-dialog-title">購入希望内容確認</h3>
        {purchaseMessage ? <p className={isBlocked ? "form-error" : "form-success"}>{purchaseMessage}</p> : null}
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
              <input type="radio" name="payment-method" checked={paymentMethod === "PayPal"} onChange={() => setPaymentMethod("PayPal")} />
              PayPal
            </label>
            <label>
              <input type="radio" name="payment-method" checked={paymentMethod === "PayPay"} onChange={() => setPaymentMethod("PayPay")} />
              PayPay
            </label>
          </fieldset>
          <label>
            領収書宛名
            <input value={receiptName} onChange={(event) => setReceiptName(event.target.value)} />
          </label>
          <label>
            領収書送付先メールアドレス
            <input type="email" value={receiptEmail} onChange={(event) => setReceiptEmail(event.target.value)} />
          </label>
        </div>
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
        <p className="platform-note">この画面では購入希望内容を送信します。決済はこの場では完了しません。内容確認後、PayPalまたはPayPayの支払い案内をメールでお送りします。</p>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            閉じる
          </button>
          <button className="button primary" type="button" onClick={savePurchaseDraft} disabled={isBlocked}>
            購入希望を送信
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
  bookings,
  setBookings,
  customer,
  studentProfiles,
  studentEmail,
  setStudentEmail,
  availabilitySlots,
  setAvailabilitySlots,
  reviews,
  setReviews
}: {
  bookings: BookingRecord[];
  setBookings: (bookings: BookingRecord[] | ((current: BookingRecord[]) => BookingRecord[])) => void;
  customer: CustomerRecord;
  studentProfiles: StudentProfile[];
  studentEmail: string;
  setStudentEmail: (email: string) => void;
  availabilitySlots: TutorAvailabilitySlot[];
  setAvailabilitySlots: (slots: TutorAvailabilitySlot[]) => void;
  reviews: LessonReview[];
  setReviews: (reviews: LessonReview[]) => void;
}) {
  const [loginEmail, setLoginEmail] = useState(studentEmail);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date("2026-07-01T00:00:00+09:00"));
  const [bookingCalendarMonth, setBookingCalendarMonth] = useState(() => new Date("2026-07-01T00:00:00+09:00"));
  const [selectedTutorBooking, setSelectedTutorBooking] = useState<BookingRecord | null>(null);
  const [form, setForm] = useState({
    start: "",
    durationMinutes: 50,
    timezone: "Asia/Tokyo",
    deliveryMode: "online" as DeliveryMode,
    note: ""
  });
  const [registrationMode, setRegistrationMode] = useState<"single" | "recurring">("single");
  const [recurringForm, setRecurringForm] = useState<{
    startDate: string;
    weeks: number;
    startTime: string;
    durationMinutes: number;
    timezone: string;
    deliveryMode: DeliveryMode;
    note: string;
    weekdays: number[];
  }>({
    startDate: "",
    weeks: 4,
    startTime: "19:00",
    durationMinutes: 50,
    timezone: "Asia/Tokyo",
    deliveryMode: "online",
    note: "",
    weekdays: [1, 3, 5]
  });
  const isOwner = studentEmail.toLowerCase() === ownerEmail;
  const pendingReviews = reviews.filter((review) => review.status === "pending");
  const pendingBookings = bookings.filter((booking) => booking.status === "requested");
  const studentPackageSummaries = buildStudentPackageSummaries(bookings, customer, studentProfiles);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = loginEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return;
    setStudentEmail(nextEmail);
    window.localStorage.setItem(studentEmailKey, nextEmail);
  };

  const addAvailabilitySlot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.start) return;

    const nextSlot: TutorAvailabilitySlot = {
      id: `AV-${Math.floor(2000 + Math.random() * 7000)}`,
      start: form.start,
      end: addMinutesToLocalDateTime(form.start, form.durationMinutes),
      timezone: form.timezone,
      deliveryMode: form.deliveryMode,
      note: form.note.trim() || "単日登録枠"
    };

    setAvailabilitySlots([...availabilitySlots, nextSlot].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
    setForm({ ...form, start: "", note: "" });
  };

  const removeAvailabilitySlot = (slotId: string) => {
    setAvailabilitySlots(availabilitySlots.filter((slot) => slot.id !== slotId));
  };

  const toggleRecurringDay = (day: number) => {
    const weekdays = recurringForm.weekdays.includes(day)
      ? recurringForm.weekdays.filter((item) => item !== day)
      : [...recurringForm.weekdays, day].sort((a, b) => a - b);
    setRecurringForm({ ...recurringForm, weekdays });
  };

  const addRecurringAvailabilitySlots = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recurringForm.startDate || !recurringForm.startTime || recurringForm.weekdays.length === 0) return;

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
          end: addMinutesToLocalDateTime(`${dateKey}T${recurringForm.startTime}`, recurringForm.durationMinutes),
          timezone: recurringForm.timezone,
          deliveryMode: recurringForm.deliveryMode,
          note: recurringForm.note.trim() || `定期予約設定枠（${dayLabel}）`
        };
      });

    setAvailabilitySlots([...availabilitySlots, ...nextSlots].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
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

    await sendPlatformNotification({
      name: booking.student,
      email: booking.studentEmail,
      inquiryType: "Learning予約完了通知",
      subject: "レッスン予約が確定しました",
      copyToRequester: true,
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

    await sendPlatformNotification({
      name: booking.student,
      email: booking.studentEmail,
      inquiryType: "Learning予約リクエスト確認結果",
      subject: "レッスン予約リクエストについて",
      copyToRequester: true,
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
        <button className="button primary" type="submit">
          講師画面を開く
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
          <p className="platform-badge">{studentEmail}</p>
        </div>
      </div>

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
          <div className="record-list">
            {studentPackageSummaries.map((summary) => (
              <article key={summary.email}>
                <strong>{summary.name} / {summary.email}</strong>
                <span>StudentID: {summary.studentId}</span>
                <p>購入済: {summary.purchased}回 / 予約済: {summary.reserved}回 / 完了済: {summary.completed}回 / 未予約: {summary.unbooked}回</p>
                <p>購入: {summary.packageLabel} / {formatDateTime(summary.purchasedAt)}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

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
                開始日時
                <input type="datetime-local" step="900" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} required />
              </label>
              <label>
                レッスン時間
                <select value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })}>
                  {availabilityDurationOptions.map((duration) => (
                    <option key={duration} value={duration}>{duration}分</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="platform-grid two">
              <label>
                タイムゾーン
                <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} required />
              </label>
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
            <button className="button primary" type="submit">
              単日枠を追加
            </button>
          </form>
        ) : (
          <form className="platform-form nested-form" onSubmit={addRecurringAvailabilitySlots}>
            <p className="platform-note">曜日を選択し、共通の開始時刻とレッスン時間を指定して、Student画面の候補枠として登録します。</p>
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
              <label>
                開始時刻
                <input type="time" step="900" value={recurringForm.startTime} onChange={(event) => setRecurringForm({ ...recurringForm, startTime: event.target.value })} required />
              </label>
              <label>
                レッスン時間
                <select value={recurringForm.durationMinutes} onChange={(event) => setRecurringForm({ ...recurringForm, durationMinutes: Number(event.target.value) })}>
                  {availabilityDurationOptions.map((duration) => (
                    <option key={duration} value={duration}>{duration}分</option>
                  ))}
                </select>
              </label>
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
            <button className="button primary" type="submit">
              定期予約枠を追加
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
          onSelectSlot={(slot) => removeAvailabilitySlot(slot.id)}
        />
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
  supabaseAvailable
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
  const text = getStudentPageCopy(language);
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
  const packageSummary = buildStudentPackageSummary(activeCustomer.email, bookings, activeCustomer, activeProfile?.studentId);

  const startGoogleAuth = async () => {
    setAuthProvider("google");
    setAuthMessage("");

    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthMessage("Google認証はSupabase設定後に利用できます。Emailを選択してください。");
      return;
    }

    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/platform`
      }
    });
    if (error) {
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
      const supabase = getSupabaseClient();
      if (!supabase) return;

      if (authProvider === "google") {
        await startGoogleAuth();
        return;
      }

      if (authMode === "signup") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return;
        const { error } = await supabase.auth.signInWithOtp({
          email: nextEmail,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: `${window.location.origin}/platform`,
            data: {
              name: loginName.trim() || nextEmail.split("@")[0],
              provider: authProvider
            }
          }
        });
        setAuthMessage(error ? error.message : "サインアップ用リンクをメールで送信しました。メールをご確認ください。");
        return;
      }

      const response = await fetch("/api/student-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          identifier: loginEmail.trim(),
          redirectTo: `${window.location.origin}/platform`
        })
      });
      setAuthMessage(response.ok ? "サインイン用リンクをメールで送信しました。メールをご確認ください。" : "StudentIDまたはメールアドレスを確認してください。");
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
        createdAt: new Date().toISOString()
      };
      if (!existingProfile) {
        setStudentProfiles([...studentProfiles, profile]);
      }
      setStudentEmail(nextEmail);
      setBookingForm({ ...bookingForm, email: nextEmail, name: profile.name });
      window.localStorage.setItem(studentEmailKey, nextEmail);
      setAuthMessage(`StudentID: ${profile.studentId}`);
      await sendPlatformNotification({
        name: profile.name,
        email: nextEmail,
        inquiryType: "Learning生徒サインアップ",
        subject: "Learning生徒サインアップがありました",
        message: [
          "Learningページで生徒サインアップがありました。",
          "",
          `StudentID: ${profile.studentId}`,
          `登録メールアドレス: ${nextEmail}`,
          `サインアップ方法: ${formatAuthProvider(authProvider)}`,
          `登録日時: ${profile.createdAt}`
        ].join("\n")
      });
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
            <button className={`button secondary ${authProvider === "google" ? "active" : ""}`} type="button" onClick={() => void startGoogleAuth()} disabled={authBusy}>
              {authBusy ? "Googleへ移動中..." : "Google"}
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
          {authMessage ? <p className={authMessage.startsWith("StudentID") ? "form-success" : "form-error"}>{authMessage}</p> : null}
          {authProvider === "email" ? (
            <button className="button primary" type="submit">
              {authMode === "signup" ? text.signUpButton : text.loginButton}
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
            setStudentEmail("");
            window.localStorage.removeItem(studentEmailKey);
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
      {packageSummary.zoomLink ? (
        <section className="platform-card lesson-link-card">
          <div>
            <p className="eyebrow">{text.lessonLinkTitle}</p>
            <h3>{text.lessonLinkLead}</h3>
          </div>
          <a className="button secondary" href={packageSummary.zoomLink} target="_blank" rel="noreferrer">
            {text.openLessonLink}
          </a>
        </section>
      ) : null}

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

        <form className="platform-card platform-form" onSubmit={submitChangeRequest}>
          <h3>{text.changeTitle}</h3>
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
      </div>

      {selectedBooking ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Lesson notes">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={() => setSelectedBooking(null)} aria-label="閉じる">×</button>
            <p className="eyebrow">Booking Detail</p>
            <h3>{selectedBooking.id} / {formatDateTime(selectedBooking.requestedSlot)}</h3>
            <p>{getBookingCourseName(selectedBooking)}</p>
            {packageSummary.zoomLink ? (
              <a className="button secondary" href={packageSummary.zoomLink} target="_blank" rel="noreferrer">
                {text.openLessonLink}
              </a>
            ) : null}
            {isPastBooking(selectedBooking.requestedSlot) ? (
              <p>{selectedBooking.reason ?? text.noLessonNote}</p>
            ) : (
              <p>{text.futureLessonNote}</p>
            )}
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
        <button type="button" onClick={() => moveMonth(-1)} aria-label={getStudentPageCopy(language).previousMonth}>?</button>
        <strong>{formatCalendarMonth(year, monthIndex, language)}</strong>
        <button type="button" onClick={() => moveMonth(1)} aria-label={getStudentPageCopy(language).nextMonth}>?</button>
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
                <button key={booking.id} className={`calendar-booking ${booking.status}`} type="button" onClick={() => onSelectBooking(booking)}>
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
  const courseName = getBookingCourseName(booking);

  return (
    <button className="booking-summary-tile" type="button" onClick={() => onSelect(booking)}>
      <span className="booking-summary-date">{formatDateTime(booking.requestedSlot)}</span>
      <strong>{courseName}</strong>
      <span>{formatLessonKind(booking.lessonKind, language)}</span>
      <span>{booking.timezone}</span>
      <span>{text.statusLabel}: {formatBookingStatus(booking.status, language)}</span>
    </button>
  );
}

function AvailabilityCalendar({
  month,
  setMonth,
  slots,
  selectedSlotIds = [],
  onSelectSlot,
  language = "ja"
}: {
  month: Date;
  setMonth: (month: Date) => void;
  slots: TutorAvailabilitySlot[];
  selectedSlotIds?: string[];
  onSelectSlot?: (slot: TutorAvailabilitySlot) => void;
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
        <button type="button" onClick={() => moveMonth(-1)} aria-label={getStudentPageCopy(language).previousMonth}>?</button>
        <strong>{formatCalendarMonth(year, monthIndex, language)}</strong>
        <button type="button" onClick={() => moveMonth(1)} aria-label={getStudentPageCopy(language).nextMonth}>?</button>
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
                    disabled={!onSelectSlot}
                    title={slot.note}
                    aria-pressed={onSelectSlot ? selected : undefined}
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
    createdAt: new Date().toISOString()
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
      createdAt: new Date().toISOString()
    };
  }

  const { data: existing } = await supabase
    .from("students")
    .select("student_id,name,email,provider,created_at")
    .or(`auth_user_id.eq.${user.id},email.eq.${email}`)
    .maybeSingle();

  if (existing?.email && existing?.student_id) {
    return {
      studentId: String(existing.student_id),
      name: String(existing.name || fallbackName),
      email: String(existing.email).toLowerCase(),
      provider: mapSupabaseProvider(existing.provider),
      createdAt: String(existing.created_at || new Date().toISOString())
    };
  }

  const nextProfile: StudentProfile = {
    studentId: localProfile?.studentId ?? generateStudentId(localProfiles),
    name: localProfile?.name ?? fallbackName,
    email,
    provider,
    createdAt: new Date().toISOString()
  };

  const { data: inserted, error } = await supabase
    .from("students")
    .insert({
      auth_user_id: user.id,
      student_id: nextProfile.studentId,
      email: nextProfile.email,
      name: nextProfile.name,
      provider: nextProfile.provider
    })
    .select("student_id,name,email,provider,created_at")
    .single();

  if (!error && inserted?.email && inserted?.student_id) {
    return {
      studentId: String(inserted.student_id),
      name: String(inserted.name || nextProfile.name),
      email: String(inserted.email).toLowerCase(),
      provider: mapSupabaseProvider(inserted.provider),
      createdAt: String(inserted.created_at || nextProfile.createdAt)
    };
  }

  return nextProfile;
}

function generateStudentId(profiles: StudentProfile[]) {
  let id = "";
  do {
    id = `STU-${Math.floor(100000 + Math.random() * 900000)}`;
  } while (profiles.some((profile) => profile.studentId === id));
  return id;
}

function buildStudentPackageSummary(email: string, bookings: BookingRecord[], customer: CustomerRecord, studentId?: string) {
  const credits = getStudentLessonCredits(email, customer);
  const purchased = credits.reduce((total, credit) => total + credit.purchasedLessons, 0);
  const completed = bookings.filter((booking) => booking.studentEmail.toLowerCase() === email.toLowerCase() && booking.status === "approved" && isPastBooking(booking.requestedSlot)).length;
  const reserved = bookings.filter((booking) => booking.studentEmail.toLowerCase() === email.toLowerCase() && booking.status === "approved" && !isPastBooking(booking.requestedSlot)).length;
  const unbooked = Math.max(0, purchased - completed - reserved);
  const primaryCredit = credits[0];

  return {
    email,
    name: customer.email.toLowerCase() === email.toLowerCase() ? customer.name : email,
    studentId: studentId ?? "未発行",
    purchased,
    reserved,
    completed,
    unbooked,
    packageLabel: primaryCredit?.packageLabel ?? "未登録",
    purchasedAt: primaryCredit?.purchasedAt ?? "",
    zoomLink: primaryCredit?.zoomLink ?? ""
  };
}

function buildStudentPackageSummaries(bookings: BookingRecord[], customer: CustomerRecord, profiles: StudentProfile[]) {
  const emails = Array.from(new Set([customer.email, ...bookings.map((booking) => booking.studentEmail.toLowerCase())]));
  return emails.map((email) => {
    const profile = profiles.find((item) => item.email.toLowerCase() === email.toLowerCase());
    return buildStudentPackageSummary(email, bookings, customer, profile?.studentId);
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

function getBookingCourseName(booking: BookingRecord) {
  const firstDetail = booking.reason?.split(" / ")[0]?.trim();
  return firstDetail || formatLessonKind(booking.lessonKind, "ja");
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
      secureAuthEnabled: "安全な認証サービスに接続されています。",
      localAuthFallback: "現在は確認用のローカルログインです。Supabase設定後に安全な認証へ切り替わります。",
      dashboardTitle: "予約状況、パッケージ、学習履歴",
      dashboardLead: "予約希望、確定済みの予約、パッケージ状況を確認できます。日程については内容確認後にメールでご案内します。",
      switchButton: "切り替え",
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
      changeTitle: "日程変更・キャンセルリクエスト",
      changeLead: "予約確定後、日程変更やキャンセルが必要な場合は、理由を添えてリクエストを送信してください。内容確認後、メールでご案内します。",
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
      secureAuthEnabled: "Secure authentication is connected.",
      localAuthFallback: "Local preview login is currently active. Secure authentication will be enabled after Supabase configuration.",
      dashboardTitle: "Bookings, Packages, and Lesson History",
      dashboardLead: "You can check booking requests, confirmed bookings, and package status. Schedule details will be shared by email after review.",
      switchButton: "Switch",
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
      changeTitle: "Reschedule / Cancellation Request",
      changeLead: "If you need to reschedule or cancel after your booking is confirmed, please send a request with the reason. Details will be shared by email after review.",
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
      secureAuthEnabled: "已連接安全認證服務。",
      localAuthFallback: "目前使用本機預覽登入。完成 Supabase 設定後會切換為安全認證。",
      dashboardTitle: "預約、套裝課程與學習紀?",
      dashboardLead: "可確認預約申請、已確認的預約與課程套裝?態。日程確認後會以電子郵件通知。",
      switchButton: "切換",
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
      changeTitle: "改期／取消申請",
      changeLead: "預約確認後，如需改期或取消，請附上理由送出申請。確認後會以電子郵件通知。",
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


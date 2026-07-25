import { type FormEvent, useMemo, useState } from "react";
import type { Route } from "../App";
import { Seo } from "../components/Seo";
import { importedLessonReviews } from "../data/lessonReviews";
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
  lessonProducts,
  platformUi
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
const ownerEmail = "yu.leobiz003@outlook.com";

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
};

async function sendPlatformNotification({ name, email, inquiryType, message }: PlatformNotification) {
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
        message
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}

const initialAvailabilitySlots: TutorAvailabilitySlot[] = [
  {
    id: "AV-1001",
    start: "2026-07-29T19:00",
    end: "2026-07-29T20:00",
    timezone: "Asia/Tokyo",
    deliveryMode: "online",
    note: "日本語レッスン / 英語発音コーチングどちらも相談可"
  },
  {
    id: "AV-1004",
    start: "2026-07-30T09:00",
    end: "2026-07-30T10:00",
    timezone: "Asia/Tokyo",
    deliveryMode: "online",
    note: "朝のオンライン枠"
  },
  {
    id: "AV-1005",
    start: "2026-07-30T20:30",
    end: "2026-07-30T21:30",
    timezone: "Asia/Tokyo",
    deliveryMode: "online",
    note: "夜のオンライン枠"
  },
  {
    id: "AV-1002",
    start: "2026-07-31T10:00",
    end: "2026-07-31T11:00",
    timezone: "Asia/Tokyo",
    deliveryMode: "online",
    note: "オンライン枠"
  },
  {
    id: "AV-1006",
    start: "2026-08-01T18:00",
    end: "2026-08-01T19:00",
    timezone: "Asia/Tokyo",
    deliveryMode: "online",
    note: "定期予約サンプル枠"
  },
  {
    id: "AV-1003",
    start: "2026-08-02T14:00",
    end: "2026-08-02T15:00",
    timezone: "Asia/Tokyo",
    deliveryMode: "inPerson",
    note: "対面相談候補枠。初回は問い合わせ必須"
  },
  {
    id: "AV-1007",
    start: "2026-08-05T19:00",
    end: "2026-08-05T20:00",
    timezone: "Asia/Tokyo",
    deliveryMode: "online",
    note: "水曜夜の定期予約候補"
  },
  {
    id: "AV-1008",
    start: "2026-08-12T19:00",
    end: "2026-08-12T20:00",
    timezone: "Asia/Tokyo",
    deliveryMode: "online",
    note: "水曜夜の定期予約候補"
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
  const [bookings, setBookings] = useState<BookingRecord[]>(demoBookings);
  const [customer] = useState<CustomerRecord>(demoCustomer);
  const [studentEmail, setStudentEmail] = useState(() => window.localStorage.getItem(studentEmailKey) ?? "");
  const [bookingForm, setBookingForm] = useState<BookingFormState>(initialBookingForm);
  const [bookingMessage, setBookingMessage] = useState("");
  const [blockedStudents, setBlockedStudents] = useState<string[]>(initialBlockedStudents);
  const [reviews, setReviews] = useState<LessonReview[]>(importedLessonReviews);
  const [availabilitySlots, setAvailabilitySlotsBase] = useState<TutorAvailabilitySlot[]>(() => {
    const saved = window.localStorage.getItem(availabilityStorageKey);
    if (!saved) return initialAvailabilitySlots;
    try {
      const parsed = JSON.parse(saved) as TutorAvailabilitySlot[];
      return Array.isArray(parsed) ? parsed : initialAvailabilitySlots;
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
  const ui = platformUi[language];
  const selectedProduct = lessonProducts.find((product) => route.path.endsWith(product.kind)) ?? lessonProducts[0];

  const handleLanguageChange = (nextLanguage: PlatformLanguage) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem(storageKey, nextLanguage);
  };

  const setAvailabilitySlots = (slots: TutorAvailabilitySlot[]) => {
    setAvailabilitySlotsBase(slots);
    window.localStorage.setItem(availabilityStorageKey, JSON.stringify(slots));
  };

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const emailForRequest = (bookingForm.email || studentEmail).trim().toLowerCase();
    const nameForRequest = bookingForm.name.trim();
    const lessonKind = getBookingLessonKind(bookingForm);
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForRequest);
    const menus = getLessonMenus(lessonKind);
    const menu = menus.find((item) => item.id === bookingForm.lessonMenuId) ?? menus[0];
    const requestedSlots = bookingForm.requestedSlots.filter((slot) => !isAvailabilitySlotBooked(slot, bookings));

    if (blockedStudents.includes(emailForRequest)) {
      setBookingMessage("このメールアドレスからの予約リクエストは受付できません。");
      return;
    }

    if (!nameForRequest || !emailForRequest || !emailIsValid || requestedSlots.length === 0 || !menu) {
      setBookingMessage("必須項目とメール形式を確認してください。予約はまだ送信されていません。");
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
        `候補枠: ${formatAvailabilityRange(slot)}`,
        bookingForm.purpose ? `目的: ${bookingForm.purpose}` : "目的・相談内容: 未記入"
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
        "",
        `目的・相談内容: ${bookingForm.purpose || "未記入"}`
      ].join("\n")
    });

    setBookings((current) => [...nextBookings, ...current]);
    setStudentEmail(emailForRequest);
    window.localStorage.setItem(studentEmailKey, emailForRequest);
    setBookingForm({ ...initialBookingForm, name: nameForRequest, email: emailForRequest, lessonMenuId: lessonKind === "japanese" ? "jp-trial" : "en-trial" });
    setChangeRequest((current) => ({ ...current, bookingId: nextBookings[0].id }));
    setBookingMessage(
      notificationSent
        ? `${nextBookings.length}件の予約リクエストを作成し、運営者へメール通知しました。講師承認後に予約確定となります。`
        : `${nextBookings.length}件の予約リクエストを作成しました。ただしメール通知に失敗したため、必要に応じて直接ご連絡ください。`
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

    if (!changeRequest.bookingId || !changeRequest.reason.trim()) {
      setBookingMessage("日程変更リクエストには理由の入力が必要です。");
      return;
    }

    const booking = bookings.find((item) => item.id === changeRequest.bookingId);
    const requestLabel = changeRequest.type === "cancel_requested" ? "キャンセル" : "日程変更";
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
        ? `${requestLabel}リクエストを記録し、運営者へメール通知しました。講師の承認があるまで予定は変更されません。`
        : `${requestLabel}リクエストを記録しました。ただしメール通知に失敗したため、必要に応じて直接ご連絡ください。`
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
              studentEmail={studentEmail}
              setStudentEmail={setStudentEmail}
              availabilitySlots={availabilitySlots}
              setAvailabilitySlots={setAvailabilitySlots}
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
              ui={ui}
              language={language}
              bookings={bookings}
              customer={customer}
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
            />
          )}
        </div>
      </section>
    </>
  );
}

function PlatformNav({ route, activePath }: { route: Route; activePath: string }) {
  const links = [
    { href: "/learning", label: "summary" },
    { href: "/learning/japanese", label: "Japanese" },
    { href: "/learning/english", label: "English Pronunciation" },
    { href: "/platform", label: "Student" },
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
          <h2>学習メニューと予約リクエスト</h2>
          <p>オンラインと対面の入口を分け、レッスンメニュー・料金・予約リクエストを確認できます。予約は即時確定ではなく、講師承認後に確定します。</p>
        </div>
        <p className="platform-badge">予約リクエスト / 講師承認制</p>
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
            <span>Demo Video</span>
            <strong>Embed placeholder</strong>
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
                  <p>{menu.display.description}</p>
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
      inquiryType: "Learning購入内容確認",
      message: [
        "Learningページから購入内容確認が送信されました。",
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
        ? "購入内容確認を保存し、運営者へメール通知しました。実決済は決済サービス接続後に有効化します。"
        : "購入内容確認を保存しました。ただしメール通知に失敗したため、必要に応じて直接ご連絡ください。"
    );
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel purchase-panel" role="dialog" aria-modal="true" aria-labelledby="purchase-dialog-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="購入画面を閉じる">
          ×
        </button>
        <h3 id="purchase-dialog-title">購入内容確認</h3>
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
        <p className="platform-note">この画面は購入内容確認用の仮画面です。実際の決済・領収書発行は、決済サービス接続後に有効化します。</p>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            閉じる
          </button>
          <button className="button primary" type="button" onClick={savePurchaseDraft} disabled={isBlocked}>
            確認内容を保存
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingRequestCard({
  ui,
  language,
  studentEmail,
  blockedStudents,
  bookingForm,
  setBookingForm,
  submitBooking,
  bookingMessage
}: {
  ui: (typeof platformUi)[PlatformLanguage];
  language: PlatformLanguage;
  studentEmail: string;
  blockedStudents: string[];
  bookingForm: BookingFormState;
  setBookingForm: (form: BookingFormState) => void;
  submitBooking: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  bookingMessage: string;
}) {
  const lessonKind = getBookingLessonKind(bookingForm);
  const menus = getLessonMenus(lessonKind);
  const selectedMenu = menus.find((menu) => menu.id === bookingForm.lessonMenuId) ?? menus[0];
  const currentEmail = (bookingForm.email || studentEmail).trim().toLowerCase();
  const isBlocked = blockedStudents.includes(currentEmail);
  const selectedSlots = bookingForm.requestedSlots;
  const selectedDeliveryLabel = summarizeDeliveryModes(selectedSlots);

  return (
    <form className="platform-card platform-form" id="booking-request" onSubmit={submitBooking}>
      <h3>{ui.requestLesson}</h3>
      <p className="platform-muted">このフォームはStudentログイン後のみ表示されます。送信後、講師承認をもって予約確定となります。</p>
      {isBlocked ? <p className="form-error">このメールアドレスからの予約リクエストは受付できません。</p> : null}
      {bookingMessage ? <p className="form-success">{bookingMessage}</p> : null}
      <div className="platform-grid two">
        <label>
          お名前
          <input value={bookingForm.name} onChange={(event) => setBookingForm({ ...bookingForm, name: event.target.value })} required />
        </label>
        <label>
          ログインメール
          <input type="email" value={bookingForm.email || studentEmail} onChange={(event) => setBookingForm({ ...bookingForm, email: event.target.value })} required />
        </label>
      </div>
      <div className="platform-grid two">
        <label>
          レッスン種別
          <select
            value={lessonKind}
            onChange={(event) => {
              const nextKind = event.target.value as LessonKind;
              const nextMenu = getLessonMenus(nextKind)[0];
              setBookingForm({
                ...bookingForm,
                lessonMenuId: nextMenu.id,
                durationMinutes: nextMenu.durations[0],
                lessonCount: nextMenu.purchaseCounts[0]
              });
            }}
          >
            <option value="japanese">1on1日本語レッスン</option>
            <option value="english">英語発音コーチング</option>
          </select>
        </label>
        <label>
          レッスンメニュー
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
      </div>
      <p className="platform-note">実施方法は、選択した講師空き枠に合わせて自動反映されます。対面枠は開催地の事前確認が必要です。</p>
      <div className="platform-grid two">
        <label>
          選択中の候補枠
          <input value={selectedSlots.length > 0 ? `${selectedSlots.length}枠を選択中` : "講師空き時間カレンダーから候補枠を選択してください。"} readOnly />
        </label>
        <label>
          実施方法
          <input value={selectedDeliveryLabel} readOnly />
        </label>
      </div>
      <div className="selected-slot-list">
        {selectedSlots.length > 0 ? selectedSlots.map((slot) => (
          <span key={slot.id}>
            {formatAvailabilityRange(slot)} / {slot.deliveryMode === "online" ? "オンライン" : "対面"}
          </span>
        )) : <span>日時は講師空き時間カレンダーから選択してください。手入力による予約リクエストは受け付けていません。</span>}
      </div>
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={bookingForm.recurringRequest}
          onChange={(event) => setBookingForm({ ...bookingForm, recurringRequest: event.target.checked })}
        />
        定期予約としてリクエストする
      </label>
      <p className="platform-note">複数枠を選択した場合は、定期予約候補としてまとめて講師へリクエストされます。</p>
      <label>
        目的・相談内容（任意）
        <textarea value={bookingForm.purpose} rows={5} onChange={(event) => setBookingForm({ ...bookingForm, purpose: event.target.value })} />
      </label>
      <button className="button primary" type="submit" disabled={isBlocked || selectedSlots.length === 0}>
        {ui.requestLesson}
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
      <p className="platform-muted">ブロックリストに追加されたメールアドレスからの予約リクエストおよび購入確認は、自動的に拒否されます。V1ではローカル状態での確認用です。</p>
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
  const isOwner = studentEmail.toLowerCase() === ownerEmail;
  const approvedReviews = reviews.filter((review) => review.status === "approved");
  const pendingReviews = reviews.filter((review) => review.status === "pending");
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

  const approveReview = (reviewId: string) => {
    setReviews(reviews.map((review) => review.id === reviewId ? { ...review, status: "approved" } : review));
  };

  return (
    <div className="platform-stack">
      <div className="platform-band">
        <div>
          <p className="eyebrow">Lesson Review</p>
          <h2>{text.title}</h2>
          <p>{text.summary}</p>
        </div>
        <p className="platform-badge">Approved reviews only</p>
      </div>

      <form className="platform-card platform-form review-form-compact" onSubmit={submitReview}>
        <div>
          <h3>{text.formTitle}</h3>
          <p className="platform-muted">{text.approvalRule}</p>
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

      {isOwner ? (
        <section className="platform-card">
          <h3>承認待ちレビュー</h3>
          <div className="review-grid">
            {pendingReviews.length > 0 ? pendingReviews.map((review) => (
              <div className="review-card-pending" key={review.id}>
                <ReviewCard review={review} />
                <button className="button primary" type="button" onClick={() => approveReview(review.id)}>
                  掲載を承認
                </button>
              </div>
            )) : <p className="platform-muted">承認待ちレビューはありません。</p>}
          </div>
        </section>
      ) : null}
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
  studentEmail,
  setStudentEmail,
  availabilitySlots,
  setAvailabilitySlots
}: {
  studentEmail: string;
  setStudentEmail: (email: string) => void;
  availabilitySlots: TutorAvailabilitySlot[];
  setAvailabilitySlots: (slots: TutorAvailabilitySlot[]) => void;
}) {
  const [loginEmail, setLoginEmail] = useState(studentEmail);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date("2026-07-01T00:00:00+09:00"));
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

  const addSampleAvailabilitySlots = () => {
    const existingIds = new Set(availabilitySlots.map((slot) => slot.id));
    const nextSlots = [
      ...availabilitySlots,
      ...initialAvailabilitySlots.filter((slot) => !existingIds.has(slot.id))
    ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    setAvailabilitySlots(nextSlots);
  };

  if (!isOwner) {
    return (
      <form className="platform-card platform-form login-card" onSubmit={handleLogin}>
        <p className="eyebrow">Tutor only</p>
        <h2>講師専用 空き時間設定</h2>
        <p>講師の空き枠を設定するための専用画面です。V1では運営者メールで疑似ログインします。</p>
        <label>
          講師メールアドレス
          <input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder={ownerEmail} required />
        </label>
        <button className="button primary" type="submit">
          講師画面を開く
        </button>
        <p className="platform-note">本番運用では、ここに認証機能と権限管理を接続してください。</p>
      </form>
    );
  }

  return (
    <div className="platform-stack">
      <div className="platform-band">
        <div>
          <p className="eyebrow">Tutor Availability</p>
          <h2>講師空き時間設定</h2>
          <p>Student画面に表示する空き枠を追加・削除できます。ここで追加した枠は予約確定ではなく、予約リクエストの候補として表示されます。</p>
        </div>
        <div className="student-session">
          <p className="platform-badge">{studentEmail}</p>
          <button className="button secondary" type="button" onClick={addSampleAvailabilitySlots}>
            サンプル枠を登録
          </button>
        </div>
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
    </div>
  );
}

function StudentDashboard({
  ui,
  language,
  bookings,
  customer,
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
  bookingMessage
}: {
  ui: (typeof platformUi)[PlatformLanguage];
  language: PlatformLanguage;
  bookings: BookingRecord[];
  customer: CustomerRecord;
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
}) {
  const [loginEmail, setLoginEmail] = useState(studentEmail);
  const [blockEmail, setBlockEmail] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date("2026-07-01T00:00:00+09:00"));
  const [availabilityMonth, setAvailabilityMonth] = useState(() => new Date("2026-07-01T00:00:00+09:00"));
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);
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
        renewalDue: "未設定"
      };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = loginEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return;
    setStudentEmail(nextEmail);
    setBookingForm({ ...bookingForm, email: nextEmail });
    window.localStorage.setItem(studentEmailKey, nextEmail);
    await sendPlatformNotification({
      name: "Student dashboard login",
      email: nextEmail,
      inquiryType: "Learning生徒ログイン登録",
      message: [
        "Learningページで生徒ダッシュボードへのログイン登録がありました。",
        "",
        `登録メールアドレス: ${nextEmail}`,
        `登録日時: ${new Date().toISOString()}`
      ].join("\n")
    });
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
          <h2>受講者ダッシュボード</h2>
          <p>登録メールアドレスを入力すると、そのメールアドレスに紐づく予約状況を確認できます。</p>
          <label>
            登録メールアドレス
            <input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="mika@example.com" required />
          </label>
          <button className="button primary" type="submit">
            確認する
          </button>
          <p className="platform-note">V1の疑似ログインです。IPアドレスは本人確認として信頼できないため、ここでは使用しません。実運用には認証機能が必要です。</p>
        </form>
      </div>
    );
  }

  return (
    <div className="platform-stack">
      <div className="platform-band">
        <div>
          <p className="eyebrow">Student Dashboard</p>
          <h2>予約状況、パッケージ、学習履歴</h2>
          <p>予約確定と予約リクエストを明確に分けます。生徒側から直接キャンセルはできず、日程変更も講師承認後に反映されます。</p>
        </div>
        <div className="student-session">
          <p className="platform-badge">{activeCustomer.email}</p>
          <button className="button secondary" type="button" onClick={() => {
            setStudentEmail("");
            window.localStorage.removeItem(studentEmailKey);
          }}>
            切り替え
          </button>
        </div>
      </div>

      <div className="platform-grid three">
        <KpiCard label="Package remaining" value={`${activeCustomer.packageRemaining} lessons`} />
        <KpiCard label="Renewal due" value={activeCustomer.renewalDue} />
        <KpiCard label="Customer status" value={activeCustomer.status} />
      </div>

      <BookingRequestCard
        ui={ui}
        language={language}
        studentEmail={studentEmail}
        blockedStudents={blockedStudents}
        bookingForm={bookingForm}
        setBookingForm={setBookingForm}
        submitBooking={submitBooking}
        bookingMessage={bookingMessage}
      />

      <section className="platform-card">
        <h3>講師空き時間カレンダー</h3>
        <p className="platform-muted">講師が公開した候補枠のうち、まだ予約が入っていない枠だけを表示しています。枠をクリックすると、予約リクエストの希望日時に反映されます。</p>
        <AvailabilityCalendar
          month={availabilityMonth}
          setMonth={setAvailabilityMonth}
          slots={openAvailabilitySlots}
          selectedSlotIds={bookingForm.requestedSlots.map((slot) => slot.id)}
          onSelectSlot={toggleAvailabilitySlot}
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
          <h3>Booking calendar</h3>
          <BookingCalendar
            month={calendarMonth}
            setMonth={setCalendarMonth}
            bookings={visibleBookings}
            onSelectBooking={setSelectedBooking}
          />
        </section>

        <form className="platform-card platform-form" onSubmit={submitChangeRequest}>
          <h3>日程変更・キャンセルリクエスト</h3>
          <p className="platform-muted">生徒側からレッスン予定を直接キャンセルすることはできません。日程変更も、講師の承認があるまで確定しません。</p>
          {bookingMessage ? <p className="form-success">{bookingMessage}</p> : null}
          <label>
            リクエスト種別
            <select value={changeRequest.type} onChange={(event) => setChangeRequest({ ...changeRequest, type: event.target.value as RequestChange["type"] })}>
              <option value="reschedule_requested">日程変更</option>
              <option value="cancel_requested">キャンセル</option>
            </select>
          </label>
          <label>
            対象予約
            <select value={changeRequest.bookingId} onChange={(event) => setChangeRequest({ ...changeRequest, bookingId: event.target.value })}>
              {visibleBookings.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.id} / {formatDateTime(booking.requestedSlot)}
                </option>
              ))}
            </select>
          </label>
          <label>
            理由（必須）
            <textarea value={changeRequest.reason} rows={5} onChange={(event) => setChangeRequest({ ...changeRequest, reason: event.target.value })} required />
          </label>
          <button className="button primary" type="submit" disabled={visibleBookings.length === 0}>
            リクエストを記録
          </button>
        </form>
      </div>

      <section className="platform-card">
        <h3>Booking timeline</h3>
        <div className="record-list">
          {visibleBookings.length > 0 ? visibleBookings.map((booking) => (
            <article key={booking.id}>
              <strong>{booking.id} / {booking.lessonKind}</strong>
              <span>{formatDateTime(booking.requestedSlot)} ({booking.timezone})</span>
              <p>Status: <StatusBadge status={booking.status} /> / Approval: {booking.approvalGate}</p>
              {booking.reason ? <p>Reason: {booking.reason}</p> : null}
              <p>12-hour policy: {isInsideTwelveHours(booking.requestedSlot) ? "Exception review required" : "Standard change window"}</p>
            </article>
          )) : <p className="platform-muted">このメールアドレスに紐づくデモ予約はまだありません。</p>}
        </div>
      </section>

      {selectedBooking ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Lesson notes">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={() => setSelectedBooking(null)} aria-label="閉じる">×</button>
            <p className="eyebrow">Lesson Notes</p>
            <h3>{selectedBooking.id} / {formatDateTime(selectedBooking.requestedSlot)}</h3>
            {isPastBooking(selectedBooking.requestedSlot) ? (
              <p>{selectedBooking.reason ?? "この予約のレッスンメモはまだ登録されていません。"}</p>
            ) : (
              <p>未来の予約です。レッスン終了後にノートを表示します。</p>
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
  onSelectBooking
}: {
  month: Date;
  setMonth: (month: Date) => void;
  bookings: BookingRecord[];
  onSelectBooking: (booking: BookingRecord) => void;
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
        <button type="button" onClick={() => moveMonth(-1)} aria-label="前月">‹</button>
        <strong>{year}年 {monthIndex + 1}月</strong>
        <button type="button" onClick={() => moveMonth(1)} aria-label="翌月">›</button>
      </div>
      <div className="calendar-weekdays">
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => <span key={day}>{day}</span>)}
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

function AvailabilityCalendar({
  month,
  setMonth,
  slots,
  selectedSlotIds = [],
  onSelectSlot
}: {
  month: Date;
  setMonth: (month: Date) => void;
  slots: TutorAvailabilitySlot[];
  selectedSlotIds?: string[];
  onSelectSlot?: (slot: TutorAvailabilitySlot) => void;
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
        <button type="button" onClick={() => moveMonth(-1)} aria-label="前月">‹</button>
        <strong>{year}年 {monthIndex + 1}月</strong>
        <button type="button" onClick={() => moveMonth(1)} aria-label="翌月">›</button>
      </div>
      <div className="calendar-weekdays">
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => <span key={day}>{day}</span>)}
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
                    {formatTime(slot.start)}-{formatTime(slot.end)} {slot.deliveryMode === "online" ? "Online" : "In person"}
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

function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`status-badge ${status}`}>{status.replace(/_/g, " ")}</span>;
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

function getBookingLessonKind(form: BookingFormState): LessonKind {
  return form.lessonMenuId.startsWith("en-") ? "english" : "japanese";
}

function getLessonMenuLabelCopy(language: PlatformLanguage) {
  const copies = {
    ja: {
      menuTitle: "Lesson Menu",
      menuLead: "カテゴリごとにコース内容を整理しています。各コースはタイルで確認できます。購入回数・時間は下の「コース購入」で選択できます。",
      purchaseTitle: "コース購入",
      purchaseLead: "予約確定後に請求・決済導線をご案内します。ここでは希望コースと購入回数の目安を確認できます。",
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
      purchaseLead: "After the booking is confirmed, invoice and payment instructions will be shared. This area lets you check your preferred course and purchase count.",
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
      menuLead: "課程依學習目的整理。各課程以卡片呈現，購買堂數與時間可在下方「課程購買」中選擇。",
      purchaseTitle: "課程購買",
      purchaseLead: "預約確認後，將提供請款與付款方式。此區可先確認希望課程與購買堂數。",
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
      "zh-Hant": { category: "會話", name: "自由會話課程", description: "透過日常話題練習自然回應、詞彙與換句話說的能力。" }
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
      "zh-Hant": { category: "商務實用日語", name: "公司內部協調訓練", description: "練習工作中請求、協調、反駁與達成共識的表達。" }
    },
    "jp-business-conversation": {
      en: { category: "Practical Business Japanese", name: "Business Conversation (meetings / reports / small talk)", description: "Build natural workplace speaking skills for meetings, updates, and casual communication." },
      "zh-Hant": { category: "商務實用日語", name: "商務會話（會議 / 報告 / 閒聊）", description: "練習會議、報告與職場閒聊中自然使用的日語。" }
    },
    "jp-business-writing": {
      en: { category: "Practical Business Japanese", name: "Business Writing", description: "Refine emails, chat messages, and reports so they are clear to the reader." },
      "zh-Hant": { category: "商務實用日語", name: "商務寫作", description: "整理電子郵件、聊天訊息與報告文章，使內容更容易傳達。" }
    },
    "jp-business-presentation": {
      en: { category: "Practical Business Japanese", name: "Business Presentation", description: "Practice structure, explanation, and Q&A so you can present in Japanese with clarity." },
      "zh-Hant": { category: "商務實用日語", name: "商務簡報", description: "練習架構、說明與問答，提升用日語清楚表達的能力。" }
    },
    "jp-expat-prep": {
      en: { category: "Practical Business Japanese", name: "Japan Assignment Preparation", description: "Prepare workplace, daily life, and relationship-building Japanese before or after assignment in Japan." },
      "zh-Hant": { category: "商務實用日語", name: "日本派駐準備", description: "準備赴日前後職場、生活與建立關係所需的日語。" }
    },
    "jp-intensive-interview": {
      en: { category: "Intensive Package within 3 months", name: "Interview Preparation (business / school / qualification)", description: "Work backward from the deadline to refine answers, structure, pronunciation, and natural responses.", note: "For intensive preparation within 2 weeks, 35 USD / 50min. is used as a guide." },
      "zh-Hant": { category: "3個月內短期集中方案", name: "面試準備（商務 / 入學 / 資格考試）", description: "依照期限整理預想問題、回答架構、發音與自然回應。", note: "2週內短期集中以 35 USD / 50min. 為參考，個別討論。" }
    },
    "jp-intensive-presentation": {
      en: { category: "Intensive Package within 3 months", name: "Presentation Preparation", description: "Refine script, structure, Q&A, and delivery from the deadline backward.", note: "For intensive preparation within 2 weeks, 35 USD / 50min. is used as a guide." },
      "zh-Hant": { category: "3個月內短期集中方案", name: "簡報準備", description: "依照期限整理發表稿、架構、問答與說話方式。", note: "2週內短期集中以 35 USD / 50min. 為參考，個別討論。" }
    },
    "jp-intensive-exhibition": {
      en: { category: "Intensive Package within 3 months", name: "Exhibition Preparation", description: "Practice visitor support, product explanations, business card exchange, and opening sales conversations.", note: "For intensive preparation within 2 weeks, 35 USD / 50min. is used as a guide." },
      "zh-Hant": { category: "3個月內短期集中方案", name: "展覽會準備", description: "練習接待、商品說明、交換名片與商談開場的日語。", note: "2週內短期集中以 35 USD / 50min. 為參考，個別討論。" }
    },
    "jp-study-abroad": {
      en: { category: "Study Abroad Preparation", name: "Japan Study Abroad Preparation", description: "Prepare Japanese for classes, daily life, interviews, and school procedures.", note: "U20 discount available." },
      "zh-Hant": { category: "留學準備", name: "日本留學準備課程", description: "準備上課、生活、面試與學校手續中需要的日語。", note: "提供 U20 優惠。" }
    },
    "jp-jlpt-n5": {
      en: { category: "JLPT Preparation", name: "N5 Preparation Course", description: "Build grammar, vocabulary, reading, and listening foundations steadily." },
      "zh-Hant": { category: "JLPT 應試準備", name: "N5 準備課程", description: "穩定打好基礎文法、詞彙、閱讀與聽解。" }
    },
    "jp-jlpt-n4-n2": {
      en: { category: "JLPT Preparation", name: "N4-N2 Preparation Course", description: "Organize weak points by level and improve scores through practice and review." },
      "zh-Hant": { category: "JLPT 應試準備", name: "N4-N2 準備課程", description: "依程度整理弱點，透過練習與講解提升得分能力。" }
    },
    "jp-jlpt-n1": {
      en: { category: "JLPT Preparation", name: "N1 Preparation Course", description: "Prepare for advanced vocabulary, reading, and listening with practical exam focus." },
      "zh-Hant": { category: "JLPT 應試準備", name: "N1 準備課程", description: "以高階詞彙、閱讀與聽解為中心，進行實戰準備。" }
    },
    "en-trial": {
      en: { category: "Trial", name: "Trial Lesson", description: "A 25-minute first lesson to check pronunciation issues and training direction." },
      "zh-Hant": { category: "體驗", name: "體驗課", description: "25分鐘初次課程，確認目前發音課題與練習方向。" }
    },
    "en-single": {
      en: { category: "Pronunciation Coaching", name: "1 Lesson", description: "A single session to check pronunciation, reading aloud, interviews, or presentation scripts." },
      "zh-Hant": { category: "發音教練", name: "1堂課", description: "單次確認發音、朗讀、面試或簡報稿。" }
    },
    "en-five": {
      en: { category: "Pronunciation Coaching", name: "5 Lessons", description: "A short package to steadily refine difficult sounds, rhythm, and intonation." },
      "zh-Hant": { category: "發音教練", name: "5堂課", description: "短期方案，持續調整較困難的音、節奏與語調。" }
    },
    "en-ten": {
      en: { category: "Pronunciation Coaching", name: "10 Lessons", description: "A continuing package to stabilize pronunciation patterns." },
      "zh-Hant": { category: "發音教練", name: "10堂課", description: "持續方案，協助發音習慣穩定下來。" }
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
        "予約はリクエスト制です",
        "オンラインレッスンは、Zoomにて行います",
        "Zoom録画も可能です。希望される方は事前にお知らせください",
        "レッスン受講前に通信環境・デバイスの確認をお願いします",
        "生徒側からレッスン予定を直接キャンセルすることはできません。日程変更は講師承認後に反映されます",
        "12時間前を過ぎたタイミングでの日程変更は、原則として返金いたしかねます",
        priceRule.ja
      ]
    },
    en: {
      title: "Lesson Rules",
      ruleTitle: "Lesson Rules",
      rules: [
        "Bookings are request-based.",
        "Online lessons are held on Zoom.",
        "Zoom recording is available upon advance request.",
        "Please check your internet connection and device before the lesson.",
        "Students cannot directly cancel a confirmed lesson. Schedule changes apply only after tutor approval.",
        "Reschedule requests made within 12 hours of the lesson are generally non-refundable.",
        priceRule.en
      ]
    },
    "zh-Hant": {
      title: "課程規則",
      ruleTitle: "課程規則",
      rules: [
        "預約採申請制。",
        "線上課程使用 Zoom 進行。",
        "如需 Zoom 錄影，請事先告知。",
        "上課前請確認網路環境與設備。",
        "學生不能自行取消已排定課程。改期需經教師核准後才會生效。",
        "課程開始前 12 小時內提出改期，原則上不予退款。",
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
      summary: "Leoが承認したレビューのみ掲載します。",
      reviewsTitle: "レッスンレビュー",
      reviewsNote: "受講者から寄せられたレビューを掲載しています。",
      noReviews: "掲載中のレビューはまだありません。",
      formTitle: "新しいレビューを書く",
      approvalRule: "投稿されたレビューは、講師の承認後に掲載されます。",
      name: "表示名",
      email: "メールアドレス",
      rating: "評価",
      comment: "コメント",
      submit: "レビューを送信"
    },
    en: {
      title: "Lesson Reviews",
      summary: "Only reviews approved by Leo are displayed.",
      reviewsTitle: "Lesson Reviews",
      reviewsNote: "Reviews from students are shown here after approval.",
      noReviews: "No reviews are published yet.",
      formTitle: "Write a new review",
      approvalRule: "Submitted reviews are published only after tutor approval.",
      name: "Display name",
      email: "Email",
      rating: "Rating",
      comment: "Comment",
      submit: "Submit review"
    },
    "zh-Hant": {
      title: "課程評價",
      summary: "只會顯示 Leo 核准的評價。",
      reviewsTitle: "課程評價",
      reviewsNote: "此處刊登學生留下並經核准的評價。",
      noReviews: "目前尚無公開評價。",
      formTitle: "留下新的評價",
      approvalRule: "提交的評價需經教師核准後才會公開。",
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
      service: "服務內容",
      paymentMethod: "付款方式",
      issuer: "開立者",
      email: "寄送信箱",
      online: "線上",
      inPerson: "實體",
      notSet: "未輸入",
      note: "確認入款後，將開立正式收據。收據會包含抬頭、開立日期、金額、服務內容、付款方式、開立者資訊與收據編號。"
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

function summarizeDeliveryModes(slots: TutorAvailabilitySlot[]) {
  if (slots.length === 0) return "空き枠を選択すると自動反映されます。";
  const hasOnline = slots.some((slot) => slot.deliveryMode === "online");
  const hasInPerson = slots.some((slot) => slot.deliveryMode === "inPerson");
  if (hasOnline && hasInPerson) return "複数（オンライン・対面）";
  return hasOnline ? "オンライン" : "対面";
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


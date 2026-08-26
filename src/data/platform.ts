export type PlatformLanguage = "ja" | "en" | "zh-Hant";

export type LessonKind = "japanese" | "english";
export type DeliveryMode = "online" | "inPerson";
export type BookingStatus = "requested" | "approved" | "reschedule_requested" | "cancel_requested" | "cancelled";
export type ApprovalGate = "owner" | "tutor" | "customer_success" | "none";

export type LessonCopy = {
  eyebrow: string;
  title: string;
  summary: string;
  outcomes: string[];
  method: string[];
};

export type LessonProduct = {
  kind: LessonKind;
  path: string;
  image: string;
  demoVideoLabel: string;
  timezoneLabel: string;
  copy: Record<PlatformLanguage, LessonCopy>;
  packageOptions: LessonPackage[];
};

export type LessonPackage = {
  id: string;
  name: string;
  lessons: number;
  minutes: number;
  priceLabel: string;
  status: "draft" | "ready_for_invoice";
};

export type LessonVideo = {
  id: string;
  title: string;
  description: string;
  order: number;
  youtubeId?: string;
  youtubeUrl?: string;
};

export type LessonMenu = {
  id: string;
  category: string;
  name: string;
  description: string;
  currency: "USD" | "JPY";
  unitPrice: number;
  unitMinutes: number;
  durations: number[];
  purchaseCounts: number[];
  note?: string;
};

export type BookingRecord = {
  id: string;
  student: string;
  studentEmail: string;
  lessonKind: LessonKind;
  requestedAt: string;
  requestedSlot: string;
  timezone: string;
  status: BookingStatus;
  reason?: string;
  approvalGate: ApprovalGate;
  creditAction?: "hold" | "restore_pending" | "restored" | "consumed";
  lessonNoteSent?: boolean;
};

export type TimelineEvent = {
  at: string;
  title: string;
  detail: string;
  source: string;
};

export type CustomerRecord = {
  id: string;
  name: string;
  email: string;
  status: "active" | "watch" | "restricted" | "blocked";
  language: PlatformLanguage;
  timezone: string;
  packageRemaining: number;
  lessonCredits: {
    lessonKind: LessonKind;
    lessonMenuId: string;
    packageLabel: string;
    currency: "USD" | "JPY";
    unitPrice: number;
    purchasedLessons: number;
    remainingLessons: number;
    purchasedAt: string;
  }[];
  renewalDue: string;
  consent: {
    marketing: boolean;
    dataExportRequested: boolean;
    deletionRequested: boolean;
  };
  timeline: TimelineEvent[];
};

export const languageLabels: Record<PlatformLanguage, string> = {
  ja: "日本語",
  en: "English",
  "zh-Hant": "繁體中文"
};

export const platformUi = {
  ja: {
    requestLesson: "予約リクエストを送る",
    dashboard: "受講者ダッシュボード",
    notLivePayment: "購入希望の送信後、内容確認のうえPayPalまたはPayPayの支払い案内をメールでお送りします。PayPalを選択した場合は4.1%の決済手数料が加算されます。",
    timezone: "表示タイムゾーン",
    approvalRequired: "日程調整後にご案内"
  },
  en: {
    requestLesson: "Send booking request",
    dashboard: "Student dashboard",
    notLivePayment: "After you send a purchase request, payment instructions for PayPal or PayPay will be shared by email. A 4.1% processing fee is added when PayPal is selected.",
    timezone: "Display timezone",
    approvalRequired: "Schedule details by email"
  },
  "zh-Hant": {
    requestLesson: "送出預約申請",
    dashboard: "學生儀表板",
    notLivePayment: "送出購買申請後，將透過電子郵件提供 PayPal 或 PayPay 付款資訊。選擇 PayPal 時將加收 4.1% 付款手續費。",
    timezone: "顯示時區",
    approvalRequired: "日程確認後以郵件通知"
  }
};

export const lessonProducts: LessonProduct[] = [
  {
    kind: "japanese",
    path: "/learning/japanese",
    image: "/images/service_online-japanese-lesson.png",
    demoVideoLabel: "Japanese conversation lesson video",
    timezoneLabel: "Asia/Tokyo / learner local time shown together",
    copy: {
      ja: {
        eyebrow: "1on1日本語レッスン",
        title: "知っている日本語から、伝わる日本語へ。",
        summary: "仕事・面接・日常会話で自然に使える日本語を、目的に合わせて練習する1on1レッスンです。",
        outcomes: ["自然な言い換えと敬語", "面接・職場会話の練習", "発音・イントネーション確認", "日本語で考えを整理する力"],
        method: ["オンライン・対面の受講形式に対応", "目的に合わせて内容を調整", "PayPal選択時はレッスン料金に4.1%の決済手数料を加算"]
      },
      en: {
        eyebrow: "1-on-1 Japanese Lessons",
        title: "Japanese that communicates.",
        summary: "A practical online lesson for interviews, work conversations, and natural daily communication.",
        outcomes: ["Natural phrasing and keigo", "Interview and workplace practice", "Pronunciation and intonation checks", "Organizing thoughts in Japanese"],
        method: ["Online and in-person formats available", "Lesson content is adjusted to your goals", "A 4.1% processing fee is added when PayPal is selected"]
      },
      "zh-Hant": {
        eyebrow: "線上日語課",
        title: "從知道日語，到能自然傳達。",
        summary: "依照面試、工作與日常溝通目標設計的實用線上日語課。",
        outcomes: ["自然表達與敬語", "面試與職場會話練習", "發音與語調確認", "用日語整理想法"],
        method: ["可選擇線上或面對面課程", "依照學習目標調整內容", "選擇 PayPal 時將加收 4.1% 付款手續費"]
      }
    },
    packageOptions: [
      { id: "jp-trial", name: "Trial / Intake", lessons: 1, minutes: 25, priceLabel: "Payment details by email", status: "draft" },
      { id: "jp-4", name: "4 Lesson Package", lessons: 4, minutes: 50, priceLabel: "Payment details by email", status: "ready_for_invoice" },
      { id: "jp-8", name: "8 Lesson Package", lessons: 8, minutes: 50, priceLabel: "Payment details by email", status: "ready_for_invoice" }
    ]
  },
  {
    kind: "english",
    path: "/learning/english",
    image: "/images/service_english-pronunciation-coaching.png",
    demoVideoLabel: "English pronunciation coaching video",
    timezoneLabel: "Asia/Tokyo / learner local time shown together",
    copy: {
      ja: {
        eyebrow: "英語発音コーチング",
        title: "伝わる英語は、発音から整える。",
        summary: "日本語話者が聞き返されにくい英語へ近づくための、口・舌・息・リズムに特化したオンラインコーチングです。",
        outcomes: ["日本語話者が苦手な音の整理", "面接・会議・プレゼンの音読練習", "録音フィードバック", "話す負担を減らす発音設計"],
        method: ["オンライン・対面の受講形式に対応", "目的に合わせて発音課題を整理", "PayPal選択時はレッスン料金に4.1%の決済手数料を加算"]
      },
      en: {
        eyebrow: "English Pronunciation Coaching",
        title: "Clearer English starts with pronunciation.",
        summary: "A focused online coaching program for Japanese speakers to improve clarity, rhythm, and confidence.",
        outcomes: ["Sounds Japanese speakers often struggle with", "Interview, meeting, and presentation read-aloud practice", "Recording-based feedback", "Pronunciation design that reduces speaking load"],
        method: ["Online and in-person formats available", "Pronunciation focus is adjusted to your goals", "A 4.1% processing fee is added when PayPal is selected"]
      },
      "zh-Hant": {
        eyebrow: "英語發音教練",
        title: "更容易傳達的英語，從發音開始整理。",
        summary: "為日語母語者設計，聚焦口型、舌位、氣息、節奏與清晰度的線上發音教練。",
        outcomes: ["整理日語母語者常卡住的音", "面試、會議、簡報朗讀練習", "錄音回饋", "降低開口負擔的發音設計"],
        method: ["可選擇線上或面對面課程", "依照目標調整發音練習重點", "選擇 PayPal 時將加收 4.1% 付款手續費"]
      }
    },
    packageOptions: [
      { id: "en-trial", name: "Pronunciation Check", lessons: 1, minutes: 25, priceLabel: "Payment details by email", status: "draft" },
      { id: "en-4", name: "4 Coaching Sessions", lessons: 4, minutes: 50, priceLabel: "Payment details by email", status: "ready_for_invoice" },
      { id: "en-8", name: "8 Coaching Sessions", lessons: 8, minutes: 50, priceLabel: "Payment details by email", status: "ready_for_invoice" }
    ]
  }
];

export const lessonVideos: Record<LessonKind, Record<PlatformLanguage, LessonVideo[]>> = {
  japanese: {
    ja: [
      { id: "introduction-ja", title: "自己紹介", description: "", order: 1, youtubeId: "OgsQqh4evww" },
      { id: "lesson-benefits-ja", title: "レッスンの利点", description: "", order: 2, youtubeId: "Ff4zyDseiGU" },
      { id: "course-features-ja", title: "コースの特徴", description: "", order: 3, youtubeId: "QHqSnFG4icU" }
    ],
    en: [
      { id: "introduction-en", title: "Introduction", description: "", order: 1, youtubeId: "9tlVmnbNT_s" },
      { id: "lesson-benefits-en", title: "Lesson Benefits", description: "", order: 2, youtubeId: "DQAthtpz_4g" },
      { id: "course-features-en", title: "Course Features", description: "", order: 3, youtubeId: "qaIOagr07Lc" }
    ],
    "zh-Hant": [
      { id: "introduction-zh-hant", title: "自我介紹", description: "", order: 1, youtubeId: "OgsQqh4evww" },
      { id: "lesson-benefits-zh-hant", title: "課程優勢", description: "", order: 2, youtubeId: "Ff4zyDseiGU" },
      { id: "course-features-zh-hant", title: "課程特色", description: "", order: 3, youtubeId: "QHqSnFG4icU" }
    ]
  },
  english: {
    ja: [
      { id: "english-introduction-ja", title: "自己紹介", description: "講師と、発音コーチングで大切にしている考え方をご紹介します。", order: 1, youtubeId: "" },
      { id: "english-benefits-ja", title: "発音コーチングの利点", description: "伝わりやすい英語へ近づくための練習方法をご案内します。", order: 2, youtubeId: "" },
      { id: "english-features-ja", title: "コースの特徴", description: "目的と回数に合わせて選べるコースをご紹介します。", order: 3, youtubeId: "" }
    ],
    en: [
      { id: "english-introduction-en", title: "Introduction", description: "Meet your coach and learn the approach behind each session.", order: 1, youtubeId: "" },
      { id: "english-benefits-en", title: "Coaching Benefits", description: "See how focused pronunciation practice improves clarity.", order: 2, youtubeId: "" },
      { id: "english-features-en", title: "Course Features", description: "Explore session options for different pronunciation goals.", order: 3, youtubeId: "" }
    ],
    "zh-Hant": [
      { id: "english-introduction-zh-hant", title: "自我介紹", description: "認識教練及每堂發音課重視的學習方式。", order: 1, youtubeId: "" },
      { id: "english-benefits-zh-hant", title: "發音教練的優勢", description: "了解如何透過集中練習提升英語清晰度。", order: 2, youtubeId: "" },
      { id: "english-features-zh-hant", title: "課程特色", description: "依照不同發音目標介紹可選擇的課程方案。", order: 3, youtubeId: "" }
    ]
  }
};

export const japaneseLessonMenus: LessonMenu[] = [
  {
    id: "jp-trial",
    category: "体験",
    name: "体験レッスン",
    description: "現在の日本語レベル、学習目的、課題を確認する初回向けレッスンです。",
    currency: "USD",
    unitPrice: 12,
    unitMinutes: 25,
    durations: [25],
    purchaseCounts: [1]
  },
  {
    id: "jp-free-talk",
    category: "会話",
    name: "フリートークコース",
    description: "日常の話題を使い、自然な受け答え、語彙、言い換えを増やします。",
    currency: "USD",
    unitPrice: 25,
    unitMinutes: 50,
    durations: [25, 50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-daily-conversation",
    category: "会話",
    name: "日常会話コース",
    description: "生活場面で使う自然な受け答えや表現を、場面別に実践練習します。",
    currency: "USD",
    unitPrice: 30,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-travel-conversation",
    category: "会話",
    name: "日本旅行会話コース",
    description: "移動、飲食、買い物、宿泊など、日本旅行中に使う表現を実践練習します。",
    currency: "USD",
    unitPrice: 30,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-business-negotiation",
    category: "ビジネス実践日本語",
    name: "社内交渉トレーニング",
    description: "依頼、調整、反論、合意形成など、社内での交渉場面を練習します。",
    currency: "USD",
    unitPrice: 35,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-business-conversation",
    category: "ビジネス実践日本語",
    name: "ビジネス会話（会議 / 報告 / 雑談 等）",
    description: "会議、報連相、雑談など、職場で自然に話すための表現を磨きます。",
    currency: "USD",
    unitPrice: 30,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-business-writing",
    category: "ビジネス実践日本語",
    name: "ビジネス作文",
    description: "メール、チャット、報告文など、読み手に伝わる文章を整えます。",
    currency: "USD",
    unitPrice: 30,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-business-presentation",
    category: "ビジネス実践日本語",
    name: "ビジネスプレゼンテーション",
    description: "構成、説明、質疑応答まで、日本語で伝える力を実践的に練習します。",
    currency: "USD",
    unitPrice: 35,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-expat-prep",
    category: "ビジネス実践日本語",
    name: "日本駐在準備",
    description: "赴任前後に必要な職場・生活・関係構築の日本語を準備します。",
    currency: "USD",
    unitPrice: 35,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-intensive-interview",
    category: "3か月以内 短期集中型パッケージ",
    name: "面接対策（ビジネス / 入試 / 資格受験）",
    description: "短期間で想定質問、回答構成、発音、自然な受け答えを整えます。",
    currency: "USD",
    unitPrice: 30,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20],
    note: "2週間以内の短期集中は 35 USD / 50min. を目安に個別相談"
  },
  {
    id: "jp-intensive-presentation",
    category: "3か月以内 短期集中型パッケージ",
    name: "プレゼンテーション準備",
    description: "発表原稿、構成、質疑応答、話し方を期限から逆算して整えます。",
    currency: "USD",
    unitPrice: 30,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20],
    note: "2週間以内の短期集中は 35 USD / 50min. を目安に個別相談"
  },
  {
    id: "jp-intensive-exhibition",
    category: "3か月以内 短期集中型パッケージ",
    name: "展示会準備",
    description: "来場者対応、商品説明、名刺交換、商談導入の日本語を練習します。",
    currency: "USD",
    unitPrice: 30,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20],
    note: "2週間以内の短期集中は 35 USD / 50min. を目安に個別相談"
  },
  {
    id: "jp-study-abroad",
    category: "留学準備",
    name: "日本留学準備コース",
    description: "授業、生活、面接、学校手続きで必要になる日本語を準備します。",
    currency: "USD",
    unitPrice: 30,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20],
    note: "U20割引あり"
  },
  {
    id: "jp-jlpt-n5",
    category: "JLPT受験対策",
    name: "N5対策コース",
    description: "基礎文法、語彙、読解、聴解を無理なく積み上げます。",
    currency: "USD",
    unitPrice: 25,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-jlpt-n4-n2",
    category: "JLPT受験対策",
    name: "N4〜N2対策コース",
    description: "レベル別に弱点を整理し、問題演習と解説で得点力を高めます。",
    currency: "USD",
    unitPrice: 30,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  },
  {
    id: "jp-jlpt-n1",
    category: "JLPT受験対策",
    name: "N1対策コース",
    description: "高度な語彙、読解、聴解を中心に、実戦的に対策します。",
    currency: "USD",
    unitPrice: 35,
    unitMinutes: 50,
    durations: [50, 75],
    purchaseCounts: [1, 10, 20]
  }
];

export const englishPronunciationMenus: LessonMenu[] = [
  {
    id: "en-trial",
    category: "体験",
    name: "体験レッスン",
    description: "現在の発音課題を確認し、練習方針を整理する25分の初回レッスンです。",
    currency: "JPY",
    unitPrice: 2500,
    unitMinutes: 25,
    durations: [25],
    purchaseCounts: [1]
  },
  {
    id: "en-single",
    category: "発音コーチング",
    name: "1レッスン",
    description: "",
    currency: "JPY",
    unitPrice: 5000,
    unitMinutes: 50,
    durations: [50],
    purchaseCounts: [1]
  },
  {
    id: "en-five",
    category: "発音コーチング",
    name: "5レッスン",
    description: "",
    currency: "JPY",
    unitPrice: 4800,
    unitMinutes: 50,
    durations: [50],
    purchaseCounts: [5]
  },
  {
    id: "en-ten",
    category: "発音コーチング",
    name: "10レッスン",
    description: "",
    currency: "JPY",
    unitPrice: 4500,
    unitMinutes: 50,
    durations: [50],
    purchaseCounts: [10]
  }
];

export const demoBookings: BookingRecord[] = [
  {
    id: "BR-1029",
    student: "Mika Chen",
    studentEmail: "mika@example.com",
    lessonKind: "japanese",
    requestedAt: "2026-07-11T10:00:00+09:00",
    requestedSlot: "2026-07-18T14:00:00+09:00",
    timezone: "Asia/Tokyo",
    status: "approved",
    reason: "完了済みレッスン。敬語での依頼表現と会議内発言を練習。",
    approvalGate: "none",
    creditAction: "consumed"
  },
  {
    id: "BR-1042",
    student: "Mika Chen",
    studentEmail: "mika@example.com",
    lessonKind: "japanese",
    requestedAt: "2026-07-25T09:30:00+09:00",
    requestedSlot: "2026-07-28T20:00:00+09:00",
    timezone: "Asia/Tokyo",
    status: "requested",
    approvalGate: "tutor",
    creditAction: "hold"
  },
  {
    id: "BR-1038",
    student: "Ken Watanabe",
    studentEmail: "ken@example.com",
    lessonKind: "english",
    requestedAt: "2026-07-24T18:10:00+09:00",
    requestedSlot: "2026-07-26T08:30:00+09:00",
    timezone: "Asia/Tokyo",
    status: "reschedule_requested",
    reason: "仕事の会議が入り、同日夜へ変更希望。",
    approvalGate: "tutor",
    creditAction: "restore_pending"
  }
];

export const demoCustomer: CustomerRecord = {
  id: "CUS-2201",
  name: "Mika Chen",
  email: "mika@example.com",
  status: "active",
  language: "zh-Hant",
  timezone: "Asia/Tokyo",
  packageRemaining: 3,
  lessonCredits: [
    {
      lessonKind: "japanese",
      lessonMenuId: "jp-business-conversation",
      packageLabel: "ビジネス会話 10レッスン",
      currency: "USD",
      unitPrice: 30,
      purchasedLessons: 10,
      remainingLessons: 3,
      purchasedAt: "2026-07-20T10:00:00+09:00"
    }
  ],
  renewalDue: "2026-08-12",
  consent: {
    marketing: true,
    dataExportRequested: false,
    deletionRequested: false
  },
  timeline: [
    { at: "2026-07-18", title: "Trial completed", detail: "Needs business Japanese for internal presentations.", source: "Manual intake" },
    { at: "2026-07-20", title: "Package started", detail: "4 lesson package. Payment guidance was handled manually.", source: "Owner dashboard" },
    { at: "2026-07-25", title: "Booking request", detail: "Requested next Japanese conversation lesson.", source: "Student dashboard" }
  ]
};

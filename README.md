# Leo de Noir｜Workaholic Owl 公式サイト

Leo de Noir / Workaholic Owl の公式Webサイトです。Vite + React + TypeScript で構成した静的サイトとして実装しています。

## 技術構成

- Vite
- React
- TypeScript
- 通常CSS
- 静的ビルド対応

## ローカル起動

```bash
pnpm install
pnpm run dev
```

`npm` を使う場合は、`npm install` / `npm run dev` でも起動できます。

起動後、表示されたローカルURLをブラウザで開いてください。

## ビルド

```bash
pnpm run build
```

生成物は `dist/` に出力されます。

## プレビュー

```bash
pnpm run preview
```

## デプロイ想定

Cloudflare Pages / Netlify / Vercel のいずれにも静的サイトとして公開できます。

- Build command: `pnpm run build`
- Output directory: `dist`
- Node.js: 20系以上を推奨

Netlify では `public/_redirects` により、下層URLへ直接アクセスした場合も `index.html` にフォールバックします。

## Vercelで公開する場合

Vercelでは、`pnpm-lock.yaml` があるため pnpm プロジェクトとして自動判定されます。

- Framework Preset: `Vite`
- Install Command: `pnpm install`
- Build Command: `pnpm run build`
- Output Directory: `dist`

`vercel.json` により、サービス詳細ページやLegalページなどの下層URLへ直接アクセスした場合も `index.html` にフォールバックします。`/external/...` の外部リンク用リダイレクトも `vercel.json` で管理しています。

独自ドメイン `leodenoir.com` は、Vercelの Project Settings → Domains から追加し、Vercelに表示されるDNSレコードをドメイン管理側へ設定してください。反映後、`https://leodenoir.com` でアクセスできることを確認します。

## 主なファイル構成

```text
.
├── public/
│   ├── images/               # 差し替え用画像
│   ├── _redirects            # Netlify用SPAフォールバック
│   └── favicon.svg
├── src/
│   ├── components/           # 共通レイアウト、SEO、カード
│   ├── data/
│   │   ├── site.ts           # サイト名、SNS、メール、ナビゲーション
│   │   ├── services.ts       # サービス一覧と詳細本文
│   │   └── legal.ts          # Legalページ本文
│   ├── pages/                # 各ページ
│   ├── App.tsx               # ルーティング
│   ├── main.tsx
│   └── styles.css
├── .env.example
├── index.html
└── package.json
```

## サービス情報の更新方法

サービス一覧、料金、詳細ページ本文は `src/data/services.ts` を編集します。

主に差し替える項目:

- `title`: サービス名
- `price`: 料金表記
- `summary`: 一覧カードの短い説明
- `catchCopy`: 詳細ページ冒頭のキャッチコピー
- `overview`: サービス概要
- `availableFor`: 相談・依頼できること
- `audience`: 対象となる方
- `method`: 実施方法
- `notes`: 注意事項
- `externalUrl`: 外部サイトURL
- `bookingUrl`: 予約ページURL

`externalUrl` または `bookingUrl` が空の場合、詳細ページのボタンは Contact ページへ誘導します。

## SNSリンクや外部リンクの差し替え

SNSリンク、サイト名、運営者、メールアドレス、ナビゲーションは `src/data/site.ts` を編集します。

```ts
snsLinks: [
  {
    label: "YouTube：Leo de Noir｜レオのよろず相談待合室",
    url: "https://example.com"
  }
]
```

## Legal本文の差し替え

利用規約、プライバシーポリシー、特定商取引法に基づく表記は `src/data/legal.ts` を編集します。現在は仮本文です。

## 画像の差し替え

画像は `public/images/` にまとめています。

- `profile-placeholder.svg`: About Me のプロフィール画像
- `service-placeholder.svg`: サービスカード・詳細ページの仮画像
- `ogp-placeholder.svg`: OGP画像

同じファイル名で置き換えるか、`src/data/services.ts` の `image` を新しいパスに変更してください。

## Learning / Platform V1

日本語レッスン・英語発音コーチング用のV1プラットフォーム画面を追加しています。

- `/learning`: 学習サービス入口
- `/learning/japanese`: 1on1日本語レッスン
- `/learning/english`: 英語発音コーチング
- `/platform`: 受講者ダッシュボード
- `/platform/tutor`: 講師ダッシュボード
- `/platform/agents`: Sales Growth / Customer Success / Business Intelligence コンソール

画面内の予約、請求、チャット、ファイル、AI部門の実行はV1デモです。認証と生徒情報管理はSupabaseへ接続できる構成を用意しています。決済、外部カレンダー、ストレージ等の本番連携は未接続で、実運用前に権限・データベース・決済プロバイダの設定が必要です。

### レッスン動画

`src/data/platform.ts` の `lessonVideos` で、動画ごとの `youtubeId` または `youtubeUrl`、`title`、`description`、`order` を設定すると、各レッスンページのカルーセルへ反映されます。実動画が未登録の項目は「準備中」と表示されます。公開動画と限定公開動画はブラウザ内で再生できますが、限定公開動画はリンクを知る人が視聴できます。YouTubeの非公開動画は一般の受講者には埋め込み再生できません。

## 問い合わせフォーム

Contactページのフォームは Vercel Functions の `/api/contact` へ送信し、Resend 経由でメール送信します。

Vercelの Project Settings → Environment Variables に以下を設定してください。

- `RESEND_API_KEY`: Resend のAPIキー
- `CONTACT_TO_EMAIL`: 問い合わせの受信先メールアドレス。未設定時は `LEARNING_TUTOR_TO_EMAIL` または既定の講師メールアドレスを使用
- `CONTACT_FROM_EMAIL`: Resendで送信元として利用するメールアドレス。未設定時は `STUDENT_AUTH_FROM_EMAIL` を使用
- `PURCHASE_TO_EMAIL`: Learningの購入希望通知の受信先メールアドレス
- `LEARNING_TUTOR_TO_EMAIL`: Learningの講師問い合わせ受信先メールアドレス。未設定時は既定の講師メールアドレスを使用

送信先メールアドレス: `yu.leobiz003@outlook.com`

## Supabase認証の設定

Student Page のサインイン / サインアップは、Supabase Auth に接続できる構成です。Vercel以外へ移行する場合も、Supabase側の認証・データベース設定をそのまま利用できます。

1. Supabaseでプロジェクトを作成します。
2. `supabase/schema.sql` を Supabase SQL Editor で実行します。
3. Supabase Auth の Redirect URL に以下を追加します。
   - `http://127.0.0.1:5173/learning/student`
   - `https://leodenoir.com/learning/student`
   - `http://127.0.0.1:5173/counseling/admin`
   - `https://leodenoir.com/counseling/admin`
4. Googleサインインを使う場合は、Supabase Auth Providers でGoogleを有効化します。Emailリンク認証もSupabase AuthのEmail設定で有効化します。
5. Vercelの Project Settings → Environment Variables に以下を設定します。
   - `VITE_SUPABASE_URL`: Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY`: Supabase anon public key
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
   - `RESEND_API_KEY`: StudentID登録・サインインリンク送信用のResend APIキー
   - `CONTACT_FROM_EMAIL`: Resendで認証済みの送信元メールアドレス
   - `STUDENT_AUTH_FROM_EMAIL`: Student認証メール専用の送信元メールアドレス。未設定時は `CONTACT_FROM_EMAIL` を使用

`SUPABASE_SERVICE_ROLE_KEY` はサーバー側だけで使用します。GitHub、フロントエンドコード、公開ページには記載しないでください。

### 講師の空き枠・生徒別購入案内

講師管理画面で登録した単日・定期の空き枠は、`availability_slots` に保存され、Student Pageの候補枠へ反映されます。購入案内では25分または50分、回数、単価、PayPalまたはPayPayの決済リンクを指定できます。単価はUSDでは0〜100ドル、JPYでは0〜30,000円（10,000円までは500円刻み、それ以降は1,000円刻み）で設定できます。講師が入金確認を実行すると、生徒の保有回数へ反映し、領収書希望時は領収書ファイルをメールへ添付します。

この機能を初めて公開する前に、`supabase/migrations/20260825_learning_purchase_offers.sql` をSupabase SQL Editorで実行してください。既存テーブルを残したまま、今回必要な購入案内テーブルとポリシーだけを追加できます。PayPal / PayPayの決済完了を自動検知するWebhookは未接続です。現時点では、講師による入金確認を正式な確定操作とし、その操作時に `LEARNING_TUTOR_TO_EMAIL`（未設定時は `yu.leobiz003@outlook.com`）へ完了通知を送ります。

## 個別カウンセリング予約

- 公開予約ページ: `/counseling/booking`
- カウンセラー専用ページ: `/counseling/admin`
- API: `/api/counseling`
- 18時間前リマインド: `/api/counseling-reminders`

初回反映時は、更新後の `supabase/schema.sql` をSupabase SQL Editorで実行してください。カウンセリングのクライエント、予約、案内文、受付設定、Learningと共通の予約占有を保存するテーブルが追加されます。

VercelのEnvironment Variablesには、既存のメール・Supabase変数に加えて以下を設定します。

- `COUNSELING_FROM_EMAIL`: Resendで認証済みの送信元メールアドレス。未設定時は `CONTACT_FROM_EMAIL` を使用
- `CRON_SECRET`: 十分に長いランダム文字列。Vercel Cronからのリマインド実行を検証するために使用

Supabase Authのメールアドレスは認証メール用です。予約通知・決済案内・リマインドのような任意のトランザクションメールは、既存のResend送信基盤を使用します。`COUNSELING_FROM_EMAIL` にはResendで認証した独自ドメインの送信元を設定してください。

`vercel.json` のリマインドCronは1時間ごとに実行します。Vercel HobbyプランではCronの実行頻度に制約があるため、開始約18時間前の通知を安定運用する場合は、時間単位のCronを利用できるプラン、または同等の外部スケジューラが必要です。

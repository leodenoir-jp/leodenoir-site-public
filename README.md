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

## 問い合わせフォーム

Contactページのフォームは仮実装です。現在は送信完了表示のみ行います。

外部フォームへ接続する場合は、`src/pages/ContactPage.tsx` の `form` の `action` や送信処理、または `.env` の `VITE_CONTACT_FORM_ENDPOINT` を使う実装へ変更してください。

送信先メールアドレス: `yu.leobiz003@outlook.com`

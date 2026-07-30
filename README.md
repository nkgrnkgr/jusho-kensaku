# 郵便番号・デジタルアドレス検索

日本郵便「郵便番号・デジタルアドレス API」を使った住所検索アプリです。
[React Router v7 (framework mode)](https://reactrouter.com/) + Vite +
[shadcn/ui](https://ui.shadcn.com/) で構築しています。

郵便番号（例: `100-0004`）やデジタルアドレス（例: `A7E2F8`）を入力すると、
対応する住所を検索して一覧表示します。

## 公式ドキュメント

| リンク | 内容 |
| --- | --- |
| [郵便番号・デジタルアドレスAPI（案内）](https://lp-api.da.pf.japanpost.jp/) | サービス概要・仕様の入口 |
| [API リファレンス（Swagger）](https://ent-api.biz.da.pf.japanpost.jp/apireference/digiadd-swagger-biz.html) | `token` / `searchcode` / `addresszip` の正式仕様 |
| [郵便番号・デジタルアドレス for Biz](https://biz.da.pf.japanpost.jp/) | アカウント登録・認証情報の発行 |
| [デジタルアドレス（一般向け）](https://lp.da.pf.japanpost.jp/) | デジタルアドレスとは何かの説明 |

> 認証情報の発行には「ゆうID」と「郵便番号・デジタルアドレス for Biz」の
> 登録が必要です。テスト用API情報・APIリファレンス・利用ガイドラインは
> ログイン後に閲覧できます。

### 提供エンドポイント（scope）

- `token` — API利用トークンを発行
- `searchcode` — 郵便番号／事業所コード／デジタルアドレス → 住所（本アプリで使用）
- `addresszip` — 住所 → 郵便番号（逆引き。本アプリでは未使用）

## アーキテクチャ

当APIは **CORS でブラウザから直接呼び出せず**、また `CLIENT_SECRET` を
秘匿する必要があります。そのため API 呼び出しはすべて **React Router の
サーバー側 `loader`** から行い、認証情報がクライアントに漏れないようにしています。

- `app/lib/japanpost.server.ts` — サーバー専用の API クライアント
  （トークン取得＋メモリキャッシュ、`searchcode` 呼び出し、型定義）。
  `.server.ts` サフィックスによりクライアントバンドルには含まれません。
- `app/routes/home.tsx` — 検索フォーム（`GET`）と `loader`、結果テーブル。
  検索キーは URL の `?q=` に載るためブックマーク・共有が可能です。

### 呼び出しフロー

1. `POST /api/v2/j/token` — `grant_type=client_credentials` と
   `client_id` / `secret_key` でトークン（JWT）を取得。`x-forwarded-for` が必須。
2. `GET /api/v2/searchcode/{code}` — `Authorization: Bearer <token>` で住所検索。

トークンは `expires_in` に基づきサーバープロセス内でキャッシュし、
401 時は一度だけ再取得してリトライします。

## 実装のポイント

- **秘匿情報をクライアントに出さない** — `CLIENT_SECRET` を使うコードは
  `*.server.ts`（`japanpost.server.ts`）に隔離。React Router が
  クライアントバンドルから確実に除外するため、ブラウザ側に漏れません。
- **CORS 回避** — 当APIはブラウザからの直接呼び出し（CORS）に対応しないため、
  fetch はすべてサーバー側 `loader` から実行します。フロントは同一オリジンの
  自アプリだけを叩きます。
- **`x-forwarded-for` が必須** — トークン取得時にアクセス元IPを送る必要があり、
  事前登録したIPと一致しないと弾かれます。`JP_FORWARDED_FOR` で切り替え可能
  （ローカル検証は `127.0.0.1` で通ることが多い）。
- **トークンのキャッシュとリトライ** — `expires_in` から満了時刻を計算し、
  30秒のマージンを引いてプロセス内メモリにキャッシュ。`searchcode` が 401 を
  返したらキャッシュを捨てて一度だけ再取得 → 再試行します。
- **検索状態は URL に持つ** — フォームは `method="get"` で `?q=` に検索キーを
  載せます。ブックマーク・共有・リロードに強く、`loader` が唯一の取得経路に
  なります（`useNavigation` で送信中の状態を表示）。
- **404 は「該当なし」** — API が 404 を返す場合はエラーではなく空の結果として
  扱い、「見つかりませんでした」を表示します。
- **`.env` の読み込み** — Node ネイティブの `process.loadEnvFile()` を使用
  （dotenv 等の依存を追加しない）。`.env` が無い本番環境では try/catch で無視し、
  ホスティングの環境変数をそのまま利用します。
- **郵便番号の整形** — API は `zip_code` を数値で返すため、先頭ゼロを補って
  `100-0004` 形式に整形して表示します。

### 主なファイル

| ファイル | 役割 |
| --- | --- |
| [`app/lib/japanpost.server.ts`](app/lib/japanpost.server.ts) | サーバー専用APIクライアント（トークン取得＋キャッシュ、`searchcode`、型定義） |
| [`app/routes/home.tsx`](app/routes/home.tsx) | 検索フォーム・`loader`・結果テーブル（shadcn/ui） |

## セットアップ

```bash
npm install
```

`.env` に認証情報を設定します（`.env.example` を参照）。

```dotenv
CLIENT_ID=発行されたクライアントID
CLIENT_SECRET=発行されたクライアントシークレット
# 任意:
# JP_FORWARDED_FOR=127.0.0.1
# JP_API_BASE=https://api.da.pf.japanpost.jp
```

> 認証情報は [郵便番号・デジタルアドレス for Biz](https://biz.da.pf.japanpost.jp/)
> の登録後に発行されます。`x-forwarded-for`（アクセス元IP）は事前登録した
> IP と一致している必要があります。

## 開発

```bash
npm run dev
```

http://localhost:5173 で起動します。

## 型チェック / ビルド

```bash
npm run typecheck
npm run build
npm run start   # 本番サーバー
```

本番では `.env` の代わりにホスティング環境の環境変数として
`CLIENT_ID` / `CLIENT_SECRET` を設定してください。

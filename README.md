# 郵便番号・デジタルアドレス検索

日本郵便「郵便番号・デジタルアドレス API」を使った住所検索アプリです。
[React Router v7 (framework mode)](https://reactrouter.com/) + Vite +
[shadcn/ui](https://ui.shadcn.com/) で構築しています。

郵便番号（例: `100-0004`）やデジタルアドレス（例: `A7E2F8`）を入力すると、
対応する住所を検索して一覧表示します。

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

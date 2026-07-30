/**
 * 日本郵便「郵便番号・デジタルアドレス API」サーバー専用クライアント。
 *
 * `.server.ts` サフィックスにより、このモジュールはクライアントバンドルに
 * 含まれず、CLIENT_SECRET などの秘匿情報がブラウザに漏れることはありません。
 * また、当APIはCORSでブラウザから直接叩けないため、必ずサーバー側から呼びます。
 *
 * 仕様: https://ent-api.biz.da.pf.japanpost.jp/apireference/digiadd-swagger-biz.html
 */

// 開発時は .env を Node ネイティブ機能で process.env に読み込む。
// 本番などで .env が無い場合は、プラットフォーム側の環境変数をそのまま使う。
try {
  process.loadEnvFile?.();
} catch {
  // .env が存在しない環境では無視
}

/** APIのベースURL（本番）。テスト環境を使う場合は JP_API_BASE で上書き。 */
const API_BASE = process.env.JP_API_BASE ?? "https://api.da.pf.japanpost.jp";

/**
 * トークン取得時に必須の x-forwarded-for（アクセス元IP）。
 * 事前に登録したIPと一致する必要があります。ローカル/検証時は 127.0.0.1 で通ることが多い。
 */
const FORWARDED_FOR = process.env.JP_FORWARDED_FOR ?? "127.0.0.1";

/** searchcode の1レコード（住所情報）。 */
export interface JapanPostAddress {
  /** デジタルアドポイント（デジタルアドレス）。該当なしは null。 */
  dgacode: string | null;
  /** 郵便番号（7桁の数値）。 */
  zip_code: number;
  pref_code: string;
  pref_name: string;
  pref_kana: string | null;
  pref_roma: string | null;
  city_code: number;
  city_name: string;
  city_kana: string | null;
  city_roma: string | null;
  town_name: string;
  town_kana: string | null;
  town_roma: string | null;
  biz_name: string | null;
  biz_kana: string | null;
  biz_roma: string | null;
  block_name: string | null;
  other_name: string | null;
  /** 法人番号（ビジネスデジタルアドレスの場合）。 */
  corporate_number: string | null;
  business_name: string | null;
  business_name_kana: string | null;
  tel_number: string | null;
  url: string | null;
  /** 整形済みの住所文字列。 */
  address: string;
  longitude: string | null;
  latitude: string | null;
  usage: string | null;
  locations: unknown[];
}

/** searchcode のレスポンス全体。 */
export interface SearchCodeResponse {
  page: number;
  limit: number;
  count: number;
  searchtype: string;
  addresses: JapanPostAddress[];
}

interface TokenResponse {
  token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/** API呼び出しに失敗したときに投げるエラー（HTTPステータスを保持）。 */
export class JapanPostApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "JapanPostApiError";
    this.status = status;
  }
}

// --- トークンのメモリキャッシュ（サーバープロセス内で共有） ---
let cachedToken: { value: string; expiresAt: number } | null = null;
/** 満了直前の取り違えを避けるためのマージン（ミリ秒）。 */
const EXPIRY_MARGIN_MS = 30_000;

function getCredentials(): { clientId: string; secretKey: string } {
  const clientId = process.env.CLIENT_ID;
  const secretKey = process.env.CLIENT_SECRET;
  if (!clientId || !secretKey) {
    throw new JapanPostApiError(
      "CLIENT_ID / CLIENT_SECRET が未設定です。.env を確認してください。",
      500,
    );
  }
  return { clientId, secretKey };
}

/** トークンを取得（有効なキャッシュがあれば再利用）。 */
async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  const { clientId, secretKey } = getCredentials();

  const res = await fetch(`${API_BASE}/api/v2/j/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": FORWARDED_FOR,
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      secret_key: secretKey,
    }),
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new JapanPostApiError(
      `トークン取得に失敗しました (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }

  const data = (await res.json()) as TokenResponse;
  cachedToken = {
    value: data.token,
    expiresAt: now + data.expires_in * 1000 - EXPIRY_MARGIN_MS,
  };
  return data.token;
}

export interface SearchOptions {
  page?: number;
  limit?: number;
  /** 町域フィールド形式: 1=括弧なし(既定) / 2=括弧あり。 */
  choikitype?: 1 | 2;
  /** 検索範囲: 1=すべて(既定) / 2=郵便番号・デジタルアドレスのみ。 */
  searchtype?: 1 | 2;
}

/**
 * 郵便番号・デジタルアドレス・事業所コードから住所を検索する。
 * @param searchCode 検索キー（3桁以上。7桁未満は前方一致）。
 */
export async function searchCode(
  searchCode: string,
  options: SearchOptions = {},
): Promise<SearchCodeResponse> {
  const code = searchCode.trim();
  if (!code) {
    throw new JapanPostApiError("検索キーを入力してください。", 400);
  }

  const token = await getToken();

  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.choikitype) params.set("choikitype", String(options.choikitype));
  if (options.searchtype) params.set("searchtype", String(options.searchtype));
  const qs = params.toString();

  const url =
    `${API_BASE}/api/v2/searchcode/${encodeURIComponent(code)}` +
    (qs ? `?${qs}` : "");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-forwarded-for": FORWARDED_FOR,
    },
  });

  // トークン失効時は一度だけ再取得してリトライ。
  if (res.status === 401) {
    cachedToken = null;
    const retryToken = await getToken();
    const retry = await fetch(url, {
      headers: {
        Authorization: `Bearer ${retryToken}`,
        "x-forwarded-for": FORWARDED_FOR,
      },
    });
    return handleSearchResponse(retry);
  }

  return handleSearchResponse(res);
}

async function handleSearchResponse(
  res: Response,
): Promise<SearchCodeResponse> {
  if (res.status === 404) {
    // 該当なし: 空の結果として扱う。
    return { page: 1, limit: 0, count: 0, searchtype: "", addresses: [] };
  }
  if (!res.ok) {
    const detail = await safeText(res);
    throw new JapanPostApiError(
      `住所検索に失敗しました (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }
  return (await res.json()) as SearchCodeResponse;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

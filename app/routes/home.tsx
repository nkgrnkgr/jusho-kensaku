import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/home";
import {
  searchCode,
  JapanPostApiError,
  type JapanPostAddress,
} from "~/lib/japanpost.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "郵便番号・デジタルアドレス検索" },
    {
      name: "description",
      content:
        "日本郵便の郵便番号・デジタルアドレスAPIを使った住所検索アプリ。",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return { q, result: null, error: null };
  }

  try {
    const result = await searchCode(q, { limit: 100 });
    return { q, result, error: null };
  } catch (err) {
    const message =
      err instanceof JapanPostApiError
        ? err.message
        : "予期しないエラーが発生しました。";
    return { q, result: null, error: message };
  }
}

/** 郵便番号（数値）を 100-0004 形式に整形。 */
function formatZip(zip: number): string {
  const s = String(zip).padStart(7, "0");
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { q, result, error } = loaderData;
  const navigation = useNavigation();
  const isSearching =
    navigation.state !== "idle" &&
    new URLSearchParams(navigation.location?.search).has("q");

  return (
    <main className="mx-auto min-h-svh max-w-5xl px-4 py-10 sm:py-14">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          郵便番号・デジタルアドレス検索
        </h1>
        <p className="text-muted-foreground text-sm">
          郵便番号（例: 100-0004）やデジタルアドレス（例: A7E2F8）から住所を検索します。
          <br className="hidden sm:block" />
          日本郵便「郵便番号・デジタルアドレスAPI」を利用しています。
        </p>
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>検索</CardTitle>
          <CardDescription>
            3桁以上で検索できます（7桁未満は前方一致）。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="get" className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="1000004 / 100-0004 / A7E2F8"
              autoComplete="off"
              autoFocus
              className="sm:flex-1"
              aria-label="郵便番号またはデジタルアドレス"
            />
            <Button type="submit" disabled={isSearching}>
              {isSearching ? "検索中…" : "検索"}
            </Button>
          </Form>
        </CardContent>
      </Card>

      {error && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mb-6 rounded-md border px-4 py-3 text-sm"
        >
          {error}
        </div>
      )}

      {result && <Results result={result} query={q} />}
    </main>
  );
}

function Results({
  result,
  query,
}: {
  result: NonNullable<Route.ComponentProps["loaderData"]["result"]>;
  query: string;
}) {
  if (result.addresses.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        「{query}」に一致する住所は見つかりませんでした。
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">検索結果</h2>
        <span className="text-muted-foreground text-sm">
          {result.count.toLocaleString()} 件
          {result.count > result.addresses.length &&
            `（${result.addresses.length} 件表示）`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">郵便番号</TableHead>
              <TableHead className="whitespace-nowrap">
                デジタルアドレス
              </TableHead>
              <TableHead>住所</TableHead>
              <TableHead>事業所・法人</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.addresses.map((addr, i) => (
              <AddressRow
                key={`${addr.zip_code}-${addr.dgacode ?? i}`}
                addr={addr}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function AddressRow({ addr }: { addr: JapanPostAddress }) {
  const roma = [addr.town_roma, addr.city_roma, addr.pref_roma]
    .filter(Boolean)
    .join(", ");

  return (
    <TableRow>
      <TableCell className="font-mono tabular-nums whitespace-nowrap">
        {formatZip(addr.zip_code)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {addr.dgacode ? (
          <Badge variant="secondary" className="font-mono">
            {addr.dgacode}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="font-medium">
          {addr.pref_name}
          {addr.city_name}
          {addr.town_name}
          {addr.block_name ?? ""}
        </div>
        {roma && <div className="text-muted-foreground text-xs">{roma}</div>}
      </TableCell>
      <TableCell>
        {addr.business_name ? (
          <div>
            <div className="font-medium">{addr.business_name}</div>
            {addr.corporate_number && (
              <div className="text-muted-foreground text-xs">
                法人番号: {addr.corporate_number}
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

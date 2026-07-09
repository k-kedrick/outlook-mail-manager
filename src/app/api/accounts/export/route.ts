import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";

// Whitelisted export columns, emitted in this fixed order regardless of the
// order they appear in the query. Rows are ordered by createdAt asc to match the
// list display order. Empty values are exported as the literal "error".
const FIELD_ORDER = ["email", "password", "clientId", "refreshToken", "cardKey", "totp"] as const;
type Field = (typeof FIELD_ORDER)[number];

type ExportAccount = Prisma.MailAccountGetPayload<{ include: { cardKey: true } }>;

function valueFor(field: Field, a: ExportAccount): string {
  try {
    switch (field) {
      case "email":
        return a.email || "";
      case "password":
        return decryptSecret(a.passwordCipher) || "";
      case "clientId":
        return a.clientId || "";
      case "refreshToken":
        return decryptSecret(a.refreshTokenCipher) || "";
      case "cardKey":
        return a.cardKey?.code || "";
      case "totp":
        return a.totpSecretCipher ? decryptSecret(a.totpSecretCipher) || "" : "";
    }
  } catch {
    return "";
  }
}

// Exports selected columns of the given accounts as a downloadable text file,
// one account per line, chosen fields joined by "----" in the fixed column order,
// always ordered by createdAt ascending to match the list display order
// (independent of how the ids were selected/ordered on the client).
// Empty fields become "error".
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const url = new URL(request.url);
    const idsParam = url.searchParams.get("ids")?.trim() ?? "";
    const fieldsParam = url.searchParams.get("fields")?.trim() ?? "";

    const fields = fieldsParam
      .split(",")
      .map((f) => f.trim())
      .filter((f): f is Field => (FIELD_ORDER as readonly string[]).includes(f));
    // Keep the canonical order, drop duplicates.
    const selected = FIELD_ORDER.filter((f) => fields.includes(f));
    if (selected.length === 0) return new Response("未选择任何导出字段。", { status: 400 });

    const ids = idsParam.split(",").filter(Boolean);
    const where: Prisma.MailAccountWhereInput = {};
    if (ids.length) where.id = { in: ids };

    const accounts = await prisma.mailAccount.findMany({
      where,
      include: { cardKey: true },
      orderBy: { createdAt: "asc" },
    });

    const lines = accounts.map((a) =>
      selected.map((f) => valueFor(f, a) || "error").join("----"),
    );

    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="accounts-${Date.now()}.txt"`,
      },
    });
  } catch {
    return new Response("导出失败或未登录。", { status: 401 });
  }
}

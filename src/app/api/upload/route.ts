import { writeFile, mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "application/zip",
]);

function sanitize(name: string): string {
  return name.replace(/[^\w.\-가-힣 ]/g, "_").slice(0, 80);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "파일이 너무 큽니다. 최대 10MB입니다." },
        { status: 400 },
      );
    }
    if (
      file.type &&
      !ALLOWED.has(file.type) &&
      !file.type.startsWith("text/") &&
      !file.type.startsWith("image/")
    ) {
      return NextResponse.json(
        { error: `지원하지 않는 파일 형식입니다: ${file.type}` },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const id = randomUUID();
    // path.extname already includes the leading dot (e.g. ".txt")
    const ext = path.extname(file.name) || "";
    const safe = `${id}${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const fsPath = path.join(dir, safe);
    await writeFile(fsPath, buf);

    const url = `/uploads/${safe}`;
    return NextResponse.json({
      url,
      name: sanitize(file.name) || safe,
      type: file.type || "application/octet-stream",
      size: file.size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "업로드 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

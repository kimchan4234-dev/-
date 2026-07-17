import { readFile } from "node:fs/promises";
import path from "node:path";

export interface AttachmentMeta {
  url: string;
  name: string;
  type: string;
  size: number;
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string };
    };

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/xml",
  "text/xml",
]);

function isTextLike(type: string, name: string): boolean {
  if (TEXT_TYPES.has(type) || type.startsWith("text/")) return true;
  return /\.(txt|md|csv|json|js|ts|tsx|jsx|py|html|css|xml|yml|yaml|sh|log|sql)$/i.test(
    name,
  );
}

function isImage(type: string, name: string): boolean {
  if (type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}

function resolveUploadPath(url: string): string | null {
  if (!url.startsWith("/uploads/")) return null;
  const base = path.basename(url);
  // 경로 순회 방지: 파일명에 슬래시/백슬래시만 금지 (확장자의 ".." 은 허용)
  if (!base || base.includes("/") || base.includes("\\") || base === ".." || base === ".") {
    return null;
  }
  return path.join(process.cwd(), "public", "uploads", base);
}

/**
 * 업로드된 첨부파일을 디스크에서 읽어 AI가 실제로 이해할 수 있는 형태로 변환한다.
 * - 이미지: data URL (비전 모델용)
 * - 텍스트: 파일 본문
 * - 기타: 메타데이터 안내
 */
export async function buildAttachmentContext(
  attachments: AttachmentMeta[],
  userText: string,
): Promise<{
  text: string;
  imageDataUrls: string[];
  parts: ChatContentPart[];
}> {
  const imageDataUrls: string[] = [];
  const notes: string[] = [];

  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    const fsPath = resolveUploadPath(a.url);
    if (!fsPath) {
      notes.push(`[첨부 ${i + 1}] ${a.name}: 파일을 찾을 수 없습니다.`);
      continue;
    }

    try {
      const buf = await readFile(fsPath);

      if (isImage(a.type, a.name)) {
        const mime =
          a.type && a.type.startsWith("image/")
            ? a.type
            : a.name.toLowerCase().endsWith(".png")
              ? "image/png"
              : a.name.toLowerCase().endsWith(".webp")
                ? "image/webp"
                : a.name.toLowerCase().endsWith(".gif")
                  ? "image/gif"
                  : "image/jpeg";
        // 비전 입력 크기 제한 (대략 4MB base64 전)
        if (buf.length > 4 * 1024 * 1024) {
          notes.push(
            `[이미지 ${i + 1}] ${a.name}: 파일이 너무 커서 미리보기만 제공합니다 (${Math.round(a.size / 1024)}KB).`,
          );
          continue;
        }
        const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
        imageDataUrls.push(dataUrl);
        notes.push(
          `[이미지 ${i + 1}] ${a.name} (${mime}, ${Math.round(buf.length / 1024)}KB) — 아래에 이미지가 포함되어 있습니다. 내용을 보고 답하세요.`,
        );
      } else if (isTextLike(a.type, a.name)) {
        const text = buf.toString("utf8");
        const clipped =
          text.length > 120_000
            ? text.slice(0, 120_000) + "\n\n…(파일이 길어 일부만 포함)"
            : text;
        notes.push(
          `[텍스트 파일 ${i + 1}] ${a.name}\n\`\`\`\n${clipped}\n\`\`\``,
        );
      } else if (a.type === "application/pdf" || a.name.toLowerCase().endsWith(".pdf")) {
        // PDF 바이너리를 그대로 넣지 않고, 메타 + 추출 가능한 텍스트 시도
        const asText = buf.toString("utf8");
        const printable = asText.replace(/[^\x09\x0A\x0D\x20-\x7E가-힣]/g, " ");
        const cleaned = printable.replace(/\s+/g, " ").trim().slice(0, 8000);
        notes.push(
          cleaned.length > 50
            ? `[PDF ${i + 1}] ${a.name}\n추출된 텍스트(부분):\n${cleaned}`
            : `[PDF ${i + 1}] ${a.name}: PDF 바이너리 파일입니다. 텍스트 추출이 제한적일 수 있습니다.`,
        );
      } else {
        notes.push(
          `[파일 ${i + 1}] ${a.name} (${a.type || "unknown"}, ${Math.round(a.size / 1024)}KB) — 바이너리 파일이라 내용을 직접 읽지 못했습니다.`,
        );
      }
    } catch {
      notes.push(`[첨부 ${i + 1}] ${a.name}: 읽기 실패`);
    }
  }

  const text =
    (userText || "첨부된 파일을 분석해 주세요.") +
    (notes.length
      ? `\n\n--- 첨부 파일 내용 ---\n${notes.join("\n\n")}`
      : "");

  const parts: ChatContentPart[] = [{ type: "text", text }];
  for (const url of imageDataUrls) {
    parts.push({ type: "image_url", image_url: { url } });
  }

  return { text, imageDataUrls, parts };
}

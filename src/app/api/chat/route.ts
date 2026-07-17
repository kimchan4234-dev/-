import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { streamClaude, backendMode, hasFreeAIKey, type ChatMessage } from "@/lib/anthropic";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { buildAttachmentContext } from "@/lib/attachments";

export const dynamic = "force-dynamic";

interface Attachment {
  url: string;
  name: string;
  type: string;
  size: number;
}

interface ChatRequestBody {
  model?: string;
  conversationId?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  attachments?: Attachment[];
}

function makeTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "새 대화";
  return clean.slice(0, 40) + (clean.length > 40 ? "…" : "");
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages 배열이 필요합니다." }, { status: 400 });
  }

  const model = body.model || DEFAULT_MODEL_ID;
  const attachments: Attachment[] = Array.isArray(body.attachments)
    ? body.attachments
    : [];
  const userText = body.messages[body.messages.length - 1]?.content ?? "";

  // 첨부파일을 실제로 읽어 AI가 볼 수 있는 형태(텍스트 추출 + 이미지 data URL)로 변환
  const attachmentCtx =
    attachments.length > 0
      ? await buildAttachmentContext(attachments, userText)
      : null;

  // Resolve or create the conversation.
  let conversationId = body.conversationId;
  if (!conversationId) {
    const [conv] = await db
      .insert(conversations)
      .values({ title: makeTitle(userText || attachments.map((a) => a.name).join(", ")) })
      .returning();
    conversationId = conv.id;
  } else {
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  }

  // Persist the user's message (with attachments).
  await db.insert(messages).values({
    conversationId,
    role: "user",
    content: userText,
    attachments: attachments.length ? JSON.stringify(attachments) : null,
  });

  // AI에게 보낼 히스토리: 마지막 user 메시지에 첨부 내용(텍스트/이미지)을 포함한다.
  const history: ChatMessage[] = body.messages.map((m, i) => {
    if (i === body.messages.length - 1 && m.role === "user" && attachmentCtx) {
      // 이미지가 있으면 멀티모달 파트, 없으면 텍스트만
      if (attachmentCtx.imageDataUrls.length > 0) {
        return { role: m.role, content: attachmentCtx.parts };
      }
      return { role: m.role, content: attachmentCtx.text };
    }
    return { role: m.role, content: m.content };
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let thinking = "";
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        for await (const chunk of streamClaude(model, history, req.signal)) {
          if (chunk.startsWith("__THINK__")) {
            const delta = chunk.slice(9);
            thinking += delta;
            emit({ type: "thinking", delta });
            continue;
          }

          full += chunk;
          emit({ type: "content", delta: chunk });
        }

        // 무료 API 광고는 "응답 끝"에만 붙으므로, 누적 본문의 후미에서만 제거한다.
        // (중간에 우연히 같은 단어가 나와도 답변을 자르지 않도록 주의)
        const adPatterns = [
          "Support Pollinations.AI",
          "🌸 Ad 🌸",
          "Powered by Pollinations.AI",
        ];
        let cut = -1;
        for (const pattern of adPatterns) {
          const idx = full.lastIndexOf(`\n\n${pattern}`);
          const idx2 = full.lastIndexOf(pattern);
          const at = idx >= 0 ? idx : idx2 >= 0 ? idx2 : -1;
          // 광고는 보통 본문의 마지막 25% 이후에만 등장한다고 가정
          if (at >= 0 && at > full.length * 0.75) {
            cut = at;
            break;
          }
        }
        if (cut >= 0) {
          full = full.slice(0, cut).trimEnd();
        }

        // 최종 안전장치: 코드 펜스(```)가 홀수 개로 남아 있으면(=닫히지 않은 코드
        // 블록) 마크다운이 깨지지 않도록 서버에서 마지막에 닫아준다.
        const fenceCount = (full.match(/```/g) || []).length;
        if (fenceCount % 2 === 1) {
          full = full.trimEnd() + "\n```";
        }

        await db.insert(messages).values({
          conversationId,
          role: "assistant",
          content: full,
          model,
          thinking: thinking || null,
        });
        await db
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
        emit({ type: "done", content: full });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-conversation-id": conversationId,
      "x-backend": backendMode(),
      "x-mapped": hasFreeAIKey() ? "full" : "tiered",
    },
  });
}

// Lightweight list endpoint so the client can refresh the sidebar.
export async function GET() {
  try {
    const rows = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .limit(50);
    return Response.json({ conversations: rows });
  } catch {
    return Response.json({ conversations: [] });
  }
}

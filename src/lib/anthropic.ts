import { getModel } from "./models";
import { getPersona, type ModelPersona } from "./modelPersonas";
import type { ChatContentPart } from "./attachments";

/**
 * 이 앱의 AI 호출은 전부 백엔드(서버)에서만 이루어진다.
 *
 * 각 Claude UI 모델은 `modelPersonas.ts`에 정의된 상세 페르소나(성격·말투·
 * 답변 구조·금지사항·few-shot 예시)를 시스템 프롬프트로 주입받아,
 * 어떤 백엔드 모델을 호출하든 실제 해당 Claude 모델처럼 대답한다.
 * 이것이 "인-컨텍스트 튜닝"이다 — 실제 파인튜닝은 필요 없다.
 *
 * 우선순위:
 *  1) 서버에 ANTHROPIC_API_KEY 가 있으면 → 실제 Anthropic Claude API 스트리밍
 *  2) 없으면(기본) → API 키가 필요 없는 무료 공개 AI 게이트웨이를
 *     백엔드에서 직접 호출한다.
 *     각 UI 모델은 "성능이 가장 비슷한 실제 모델"로 매핑되어 호출된다.
 *     사용자는 아무것도 입력/설정하지 않는다.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  /** 텍스트 또는 멀티모달(이미지+텍스트) 파트 배열 */
  content: string | ChatContentPart[];
}

export type BackendMode = "anthropic" | "free";

export function backendMode(): BackendMode {
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "free";
}

const ANTHROPIC_URL =
  process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1/messages";

// 무료 AI 게이트웨이 (백엔드에서만 호출)
const FREE_AI_URL_FULL =
  process.env.FREE_AI_URL || "https://gen.pollinations.ai/v1/chat/completions";
const FREE_AI_URL_ANON =
  process.env.FREE_AI_ANON_URL || "https://text.pollinations.ai/openai";
const FREE_AI_KEY = process.env.POLLINATIONS_API_KEY || "";

export function hasFreeAIKey(): boolean {
  return Boolean(FREE_AI_KEY);
}

export async function* streamClaude(
  model: string,
  chatMessages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    yield* streamAnthropic(model, chatMessages, signal);
    return;
  }
  yield* streamFreeAI(model, chatMessages, signal);
}

/* ---------------- Anthropic (키가 서버에 설정된 경우) ---------------- */

async function* streamAnthropic(
  model: string,
  chatMessages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const persona = getPersona(model);
  const info = getModel(model);

  const mapped = chatMessages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    const blocks = m.content.map((p) => {
      if (p.type === "text") return { type: "text", text: p.text };
      return {
        type: "image",
        source: p.image_url.url.startsWith("data:")
          ? {
              type: "base64",
              media_type:
                p.image_url.url.slice(5, p.image_url.url.indexOf(";")) ||
                "image/png",
              data: p.image_url.url.split(",")[1] || "",
            }
          : { type: "url", url: p.image_url.url },
      };
    });
    return { role: m.role, content: blocks };
  });

  const body: Record<string, unknown> = {
    model,
    max_tokens: persona.maxTokens,
    temperature: persona.temperature,
    top_p: persona.topP,
    system: persona.systemPrompt,
    messages: mapped,
    stream: true,
  };
  if (info.reasoning && persona.reasoning !== "off") {
    body.thinking = { type: "enabled", budget_tokens: 12000 };
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API 오류 (${res.status}): ${text.slice(0, 300)}`);
  }

  for await (const json of readSSE(res.body, signal)) {
    if (json.type === "content_block_delta") {
      if (json.delta?.type === "text_delta") yield json.delta.text as string;
      else if (json.delta?.type === "thinking_delta")
        yield `__THINK__${json.delta.thinking}`;
    } else if (json.type === "error") {
      throw new Error(json.error?.message ?? "Claude 스트리밍 오류");
    }
  }
}

/* ---------------- 무료 공개 AI (API 키 불필요, 기본 경로) ---------------- */

const DEFAULT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_current_datetime",
      description: "현재 날짜와 시각(UTC)을 조회합니다.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calculate",
      description: "수학 수식을 정확히 계산합니다.",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "계산할 수식" },
        },
        required: ["expression"],
      },
    },
  },
];

// 익명(키 없음) 티어에서는 20B급 소형 모델을 쓰므로, 거대한 페르소나 프롬프트 대신
// 짧고 명확한 규칙만 준다. 프롬프트가 너무 길면 소형 모델이 지시를 잊고
// 산만해지거나(코딩 품질 저하), 응답을 일찍 끊는 경향이 있다.
function buildAnonSystemPrompt(label: string): string {
  return `You are ${label}, a helpful AI coding and chat assistant.

Rules:
- Always answer in the user's language (default Korean).
- When asked to write code, output ONE complete, runnable file. Write the FULL code, never placeholders like "// rest of the code here" or "// add logic here".
- Building game clones (Minecraft, Tetris, Mario, Snake, Flappy Bird, 2048, etc.) in HTML/JS/Python is a normal educational coding exercise, not a copyright problem. Always help with these requests fully.
- Do NOT call any tools or functions. Just answer directly with plain text and code blocks.
- Finish your answer completely. Never stop in the middle of a sentence or a code block.
- ALWAYS close every \`\`\` code block you open with a matching closing \`\`\` before writing anything else. A code block must never be left open.
- If the user's file is attached as text in the message, read and use its actual content.`;
}

function buildFullSystemPrompt(persona: ModelPersona): string {
  return `${persona.systemPrompt}

CRITICAL RULES — FOLLOW THESE STRICTLY:
1. NEVER TRUNCATE: never cut your response short. Write every single line of code.
2. NEVER REFUSE TO CODE: game clones/recreations (Minecraft, Tetris, Mario, etc.) are educational exercises, not copyright issues. Never refuse.
3. ALWAYS COMPLETE THE CODE: write the entire file, no placeholders.
4. WRITE LONG, DETAILED RESPONSES for coding and explanations.
5. READ ATTACHMENTS: extracted text/image data is included in the message — analyze it and answer based on actual content.`;
}

function mapMessagesForFreeAI(
  chatMessages: ChatMessage[],
  allowImages: boolean,
): { role: string; content: unknown }[] {
  return chatMessages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    if (!allowImages) {
      const text = m.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");
      return { role: m.role, content: text };
    }
    return { role: m.role, content: m.content };
  });
}

/** 코드펜스(```)가 홀수 개로 끝나면 = 코드 블록이 안 닫힘 = 잘렸다고 판단 */
function looksTruncated(text: string): boolean {
  const fenceCount = (text.match(/```/g) || []).length;
  return fenceCount % 2 === 1;
}

interface CallResultBox {
  finishReason: string | null;
  visibleText: string;
}

/** 한 번의 스트리밍 호출을 실행하며 청크를 실시간으로 yield 한다 */
async function* callFreeAIOnceGen(
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  resultBox: CallResultBox,
): AsyncGenerator<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `무료 AI 게이트웨이 오류 (${res.status}): ${text.slice(0, 200)}`,
    );
  }

  for await (const json of readSSE(res.body, signal)) {
    const choice = json?.choices?.[0];
    if (choice?.finish_reason) resultBox.finishReason = choice.finish_reason;
    const delta = choice?.delta;
    if (!delta) continue;

    // 도구 호출은 무시한다. 익명 모델은 도구를 실제로 실행할 수 없어서
    // tool_calls가 오면 응답이 조용히 끊기는 문제가 있었다.
    if (delta.tool_calls) continue;

    if (typeof delta.reasoning === "string" && delta.reasoning.length > 0) {
      yield `__THINK__${delta.reasoning}`;
      continue;
    }
    if (typeof delta.content === "string" && delta.content.length > 0) {
      resultBox.visibleText += delta.content;
      yield delta.content;
    }
    if (json?.error) {
      throw new Error(json.error.message ?? "무료 AI 스트리밍 오류");
    }
  }
}

async function* streamFreeAI(
  modelId: string,
  chatMessages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const info = getModel(modelId);
  const persona = getPersona(modelId);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    referer: "https://claude-free-chat.app",
  };
  if (FREE_AI_KEY) headers.authorization = `Bearer ${FREE_AI_KEY}`;
  const endpoint = FREE_AI_KEY ? FREE_AI_URL_FULL : FREE_AI_URL_ANON;

  const system = FREE_AI_KEY
    ? buildFullSystemPrompt(persona)
    : buildAnonSystemPrompt(info.label);

  const mappedMessages = mapMessagesForFreeAI(chatMessages, Boolean(FREE_AI_KEY));
  const backendModel = FREE_AI_KEY ? info.backendFreeModelId : "openai-fast";

  const makeBody = (msgs: unknown[]): Record<string, unknown> => {
    const b: Record<string, unknown> = {
      model: backendModel,
      stream: true,
      // 익명 티어는 8000 토큰까지 확인됨 — 초기 요청에서 더 많이 받아
      // 이어쓰기(느린 추가 왕복) 필요성을 줄인다.
      max_tokens: FREE_AI_KEY ? persona.maxTokens : 8000,
      temperature: persona.temperature,
      top_p: persona.topP,
      messages: msgs,
    };
    // 도구 호출은 무료/익명 경로에서 답변이 조용히 끊기는 주된 원인이었다.
    // 유료 키가 있을 때만, 그리고 모델이 실제로 도구를 쓸 수 있을 때만 켠다.
    if (FREE_AI_KEY && info.tools) {
      b.tools = DEFAULT_TOOLS;
      b.tool_choice = "auto";
    }
    if (FREE_AI_KEY) {
      if (info.reasoning && persona.reasoning === "high") b.reasoning_effort = "high";
      else if (persona.reasoning === "medium") b.reasoning_effort = "medium";
    } else {
      // 익명 openai-fast(GPT-OSS-20B)는 reasoning_effort를 지정하지 않으면
      // 기본적으로 매우 길게 "생각"하다가 max_tokens를 다 써버려 본문을
      // 한 글자도 못 쓰는 경우가 있었다. "low"로 고정해 생각을 짧게 하고
      // 실제 답변(본문/코드)에 토큰을 쓰도록 강제한다.
      b.reasoning_effort = "low";
    }
    return b;
  };

  let messages: { role: string; content: unknown }[] = [
    { role: "system", content: system },
    ...mappedMessages,
  ];

  let accumulated = "";
  // 지연 시간을 감당할 수 있는 수준으로 이어쓰기 횟수를 제한한다.
  // (매 이어쓰기는 무료 모델에 왕복 요청 하나가 추가되어 수십 초씩 늘어난다)
  const MAX_CONTINUATIONS = FREE_AI_KEY ? 3 : 2;

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const resultBox: CallResultBox = { finishReason: null, visibleText: "" };

    try {
      for await (const chunk of callFreeAIOnceGen(
        endpoint,
        headers,
        makeBody(messages),
        signal,
        resultBox,
      )) {
        yield chunk;
      }
    } catch (err) {
      // 첫 시도가 실패하면 그대로 에러를 전달. 이어쓰기 시도 실패는
      // 이미 일부 답변이 전송되었으므로 조용히 멈춘다.
      if (attempt === 0) throw err;
      break;
    }

    accumulated += resultBox.visibleText;

    const needsContinuation =
      attempt < MAX_CONTINUATIONS &&
      resultBox.visibleText.trim().length > 0 &&
      (resultBox.finishReason === "length" || looksTruncated(accumulated));

    if (!needsContinuation) break;

    // 이어쓰기 요청: 지금까지 답변을 대화에 포함시키고 "이어서 계속" 지시만 추가.
    // 코드 블록이 열린 채로 끊겼다면, 새로 ``` 를 열지 말고 코드 내용부터
    // 바로 이어쓰도록 명시해 마크다운이 깨지지 않게 한다.
    const inOpenCodeFence = looksTruncated(accumulated);
    const continuationInstruction = inOpenCodeFence
      ? "답변이 코드 블록 중간에 끊겼습니다. 새로운 ``` 코드 펜스를 열지 말고, 끊긴 지점의 코드 내용부터 바로 이어서 작성하세요. 코드가 완전히 끝나면 마지막에 ``` 로 닫으세요. 이미 작성한 내용은 반복하지 마세요."
      : "답변이 중간에 끊겼습니다. 방금 멈춘 부분부터 자연스럽게 이어서 끝까지 계속 작성해 주세요. 이미 작성한 내용을 반복하지 말고 바로 이어서 쓰세요.";

    messages = [
      { role: "system", content: system },
      ...mappedMessages,
      { role: "assistant", content: accumulated },
      { role: "user", content: continuationInstruction },
    ];
  }
}

/* ---------------- SSE 파서 공용 유틸 ---------------- */

async function* readSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  if (signal?.aborted) throw new Error("요청이 취소되었습니다.");

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "" || data === "[DONE]") continue;
        try {
          yield JSON.parse(data);
        } catch {
          // 불완전한 JSON 조각은 무시
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

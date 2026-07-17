"use client";

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MODELS, DEFAULT_MODEL_ID, getModel } from "@/lib/models";
import { MarkdownLite } from "./MarkdownLite";
import { fetchGreeting } from "@/lib/greeting";
import { AttachmentGallery, type Attachment } from "./Attachments";

interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
}

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  thinking?: string | null;
  attachments?: Attachment[];
}

function parseAttachments(raw: unknown): Attachment[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (a) => a && typeof a.url === "string" && typeof a.name === "string",
    );
  } catch {
    return [];
  }
}

function Asterisk({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13.6 2.2v6.4l5.6-3.2 1.7 2.9-5.6 3.2 5.6 3.2-1.7 2.9-5.6-3.2v6.4h-3.2v-6.4l-5.6 3.2-1.7-2.9 5.6-3.2-5.6-3.2 1.7-2.9 5.6 3.2V2.2h3.2z" />
    </svg>
  );
}

function groupByDate(convs: ConversationMeta[]) {
  const today: ConversationMeta[] = [];
  const yesterday: ConversationMeta[] = [];
  const older: ConversationMeta[] = [];
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday.getTime() - 86400000);
  for (const c of convs) {
    const t = new Date(c.updatedAt);
    if (t >= startToday) today.push(c);
    else if (t >= startYesterday) yesterday.push(c);
    else older.push(c);
  }
  return [
    { label: "오늘", items: today },
    { label: "어제", items: yesterday },
    { label: "이전", items: older },
  ];
}

export default function ChatApp() {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [greeting, setGreeting] = useState<string>("사용자님, 좋은 저녁이에요");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropDepthRef = useRef(0);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFilesSelected = useCallback(async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files as FileList | File[]);
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const added: Attachment[] = [];
      for (const file of list) {
        if (!(file instanceof File)) continue;
        // 빈 파일/폴더 드롭 무시
        if (file.size === 0 && !file.type) continue;
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${file.name} 업로드 실패`);
        }
        const data = (await res.json()) as Attachment;
        added.push(data);
      }
      if (added.length) {
        setPendingAttachments((prev) => [...prev, ...added]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const removePending = (i: number) =>
    setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i));

  // 붙여넣기: 클립보드 이미지/파일 첨부
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) {
            // 붙여넣은 이미지에 이름 부여
            const named =
              f.name && f.name !== "image.png"
                ? f
                : new File(
                    [f],
                    f.type.startsWith("image/")
                      ? `paste-${Date.now()}.${f.type.split("/")[1] || "png"}`
                      : f.name || `paste-${Date.now()}`,
                    { type: f.type },
                  );
            files.push(named);
          }
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void handleFilesSelected(files);
      }
    },
    [handleFilesSelected],
  );

  // 드래그 앤 드롭
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropDepthRef.current += 1;
    if (e.dataTransfer?.types?.includes("Files")) setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropDepthRef.current -= 1;
    if (dropDepthRef.current <= 0) {
      dropDepthRef.current = 0;
      setDragOver(false);
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropDepthRef.current = 0;
    setDragOver(false);
    if (e.dataTransfer?.files?.length) {
      void handleFilesSelected(e.dataTransfer.files);
    }
  };

  const selectedModel = getModel(model);

  // 실시간 기상/시간인사 로드
  useEffect(() => {
    fetchGreeting()
      .then(setGreeting)
      .catch(() => setGreeting("사용자님, 좋은 저녁이에요"));
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const loadConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setMessages(
        (data.messages ?? []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          model: m.model,
          thinking: m.thinking ?? null,
          attachments: parseAttachments(m.attachments),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "대화 불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  const startNew = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setInput("");
    setThinking(false);
    setPendingAttachments([]);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) startNew();
      } catch {
        /* ignore */
      }
    },
    [activeId, startNew],
  );

  const sendMessage = useCallback(async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if ((!text && pendingAttachments.length === 0) || loading) return;

    setError(null);
    setInput("");

    const userMsg: UIMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text || "(첨부파일)",
      attachments: [...pendingAttachments],
    };
    const assistantMsg: UIMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      model,
      thinking: "",
    };

    const history = [
      ...messages
        .filter((m) => m.content.trim() !== "")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: text || "(첨부파일)" },
    ];

    const attachmentsToSend = pendingAttachments;
    setPendingAttachments([]);
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setLoading(true);
    const usesReasoning = selectedModel.reasoning;
    setThinking(usesReasoning);
    if (usesReasoning) {
      setExpandedThinking((prev) => ({ ...prev, [assistantMsg.id]: true }));
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          conversationId: activeId ?? undefined,
          messages: history,
          attachments: attachmentsToSend,
        }),
        signal: controller.signal,
      });

      const convId = res.headers.get("x-conversation-id");
      if (convId && !activeId) setActiveId(convId);

      if (!res.body) throw new Error("응답 스트림이 없습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let contentAcc = "";
      let thinkingAcc = "";

      const applyEvent = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as {
          type: "thinking" | "content" | "done" | "error";
          delta?: string;
          message?: string;
          content?: string;
        };

        if (event.type === "thinking" && event.delta) {
          thinkingAcc += event.delta;
          setThinking(true);
          setExpandedThinking((prev) => ({ ...prev, [assistantMsg.id]: true }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, thinking: thinkingAcc } : m,
            ),
          );
        } else if (event.type === "content" && event.delta) {
          contentAcc += event.delta;
          setThinking(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: contentAcc } : m,
            ),
          );
        } else if (event.type === "error") {
          throw new Error(event.message || "AI 응답 오류");
        } else if (event.type === "done") {
          setThinking(false);
          const finalContent = event.content;
          if (typeof finalContent === "string" && finalContent) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: finalContent } : m,
              ),
            );
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) applyEvent(line);
      }
      buffer += decoder.decode();
      if (buffer.trim()) applyEvent(buffer);
      setThinking(false);

      if (convId) await loadConversations();
    } catch (e) {
      setThinking(false);
      if ((e as any)?.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id && m.content === ""
              ? { ...m, content: "_(응답이 중단되었습니다)_" }
              : m,
          ),
        );
      } else {
        setError(e instanceof Error ? e.message : "전송 실패");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, messages, model, activeId, loadConversations, selectedModel, pendingAttachments]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setThinking(false);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleThinking = (id: string) =>
    setExpandedThinking((p) => ({ ...p, [id]: !p[id] }));

  const groups = groupByDate(conversations);

  return (
    <div
      className="relative flex h-screen w-full overflow-hidden bg-[#F9F8F6] text-[#191919]"
      style={{ fontFamily: "var(--font-claude), sans-serif" }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* ---------------- Sidebar (Claude 1:1 Color & Structure) ---------------- */}
      <aside
        className={`${
          sidebarOpen ? "w-[260px] translate-x-0" : "w-0 -translate-x-full md:w-0"
        } relative z-40 flex h-full flex-shrink-0 flex-col border-r border-[#E5E4E2] bg-[#F3F2EE] transition-all duration-200 ease-in-out md:relative`}
      >
        <div className="flex h-full w-[260px] flex-col p-3 text-[#191919]">
          {/* Header Row */}
          <div className="flex items-center justify-between px-1.5 py-2">
            <button
              onClick={startNew}
              className="flex items-center gap-2 text-left text-sm font-semibold hover:opacity-85"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md bg-[#D97757] text-white">
                <Asterisk className="h-3.5 w-3.5" />
              </span>
              <span className="font-semibold tracking-tight text-[#191919]">Claude</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button className="rounded-lg p-1.5 text-[#6B6960] hover:bg-[#E5E4E2]" title="검색">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-1.5 text-[#6B6960] hover:bg-[#E5E4E2]"
                title="닫기"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* New chat button */}
          <div className="mt-2.5">
            <button
              onClick={startNew}
              className="flex w-full items-center justify-between rounded-lg border border-[#D1D0CE] bg-white px-3 py-2 text-sm font-normal text-[#191919] transition hover:bg-[#FAF9F6]"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm">＋</span> 새 채팅
              </span>
              <span className="text-xs text-[#8A8881]">Ctrl K</span>
            </button>
          </div>

          {/* Menu Items */}
          <nav className="mt-4 space-y-0.5 px-0.5">
            <button
              onClick={startNew}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[#191919] hover:bg-[#E5E4E2]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-[#6B6960]">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              채팅
            </button>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[#191919] hover:bg-[#E5E4E2]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-[#6B6960]">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
              프로젝트
            </button>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[#191919] hover:bg-[#E5E4E2]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-[#6B6960]">
                <polygon points="12 2 2 7 12 12 22 7 12 2 12 12 12 22" />
              </svg>
              아티팩트
            </button>
            <div className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[#191919] hover:bg-[#E5E4E2]">
              <span className="flex items-center gap-2.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-[#6B6960]">
                  <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
                </svg>
                코드
              </span>

            </div>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[#191919] hover:bg-[#E5E4E2]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-[#6B6960]">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </svg>
              사용자 지정
            </button>
          </nav>

          {/* Recent chats group */}
          <div className="mt-5 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between px-2.5 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B6960]">
                최근 항목
              </span>
              <button className="text-[#6B6960] hover:text-[#191919]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                  <path d="M3 6h18M6 12h12M10 18h4" />
                </svg>
              </button>
            </div>

            <div className="space-y-0.5">
              {conversations.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-[#8A8881]">대화 없음</p>
              ) : (
                groups.map(
                  (g: { label: string; items: ConversationMeta[] }) =>
                    g.items.length > 0 && (
                      <div key={g.label} className="mb-2">
                        {g.items.map((c: ConversationMeta) => (
                          <div
                            key={c.id}
                            className={`group flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] ${
                              c.id === activeId
                                ? "bg-[#E5E4E2] font-medium text-[#191919]"
                                : "text-[#4A4943] hover:bg-[#E5E4E2]"
                            }`}
                          >
                            <button
                              onClick={() => loadConversation(c.id)}
                              className="flex-1 truncate text-left"
                              title={c.title}
                            >
                              {c.title}
                            </button>
                            <button
                              onClick={() => deleteConversation(c.id)}
                              className="opacity-0 transition group-hover:opacity-100 text-[#8A8881] hover:text-rose-600"
                              title="삭제"
                            >
                              🗑
                            </button>
                          </div>
                        ))}
                      </div>
                    ),
                )
              )}
            </div>
          </div>

          {/* User Row (as requested) */}
          <div className="mt-auto border-t border-[#E5E4E2] pt-2.5">
            <div className="flex items-center justify-between rounded-lg px-1.5 py-1.5 hover:bg-[#E5E4E2]">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#E5E4E2] text-[11px] font-semibold text-[#6B6960] ring-1 ring-[#D1D0CE]">
                  에
                </span>
                <div className="leading-none">
                  <p className="text-[12px] font-semibold text-[#191919]">사용자</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[#6B6960]">
                <button className="rounded p-1 hover:bg-[#D1D0CE]" title="내보내기">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Floating Toggle Button for Sidebar on Mobile */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-3 top-3.5 z-50 rounded-lg border border-[#E5E4E2] bg-white p-1.5 shadow-sm hover:bg-[#F3F2EE]"
          title="사이드바 열기"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5 text-[#191919]">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
        </button>
      )}

      {/* ---------------- Main Chat Area ---------------- */}
      <div className="relative flex min-w-0 flex-1 flex-col bg-white">
        

        {/* Dynamic header if active thread */}
        {activeId && (
          <header className="flex h-12 w-full items-center justify-between border-b border-[#E5E4E2] px-4 py-2">
            <div className="flex items-center gap-2">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="mr-1.5 rounded-lg p-1 hover:bg-[#F3F2EE]"
                >
                  ☰
                </button>
              )}
              <span className="text-sm font-medium truncate max-w-sm">
                {conversations.find((c) => c.id === activeId)?.title || "대화 중"}
              </span>
            </div>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border border-[#D1D0CE] hover:bg-[#F3F2EE]"
              >
                {selectedModel.label} ∨
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-[#E5E4E2] bg-white p-1 shadow-lg">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setModel(m.id);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-[#F3F2EE]"
                    >
                      <span>{m.label}</span>
                      {m.id === model && <span className="text-[#D97757]">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </header>
        )}

        {/* Content viewport */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            /* ------- Claude 1:1 Empty State (matching screenshot exactly!) ------- */
            <div className="flex h-full flex-col items-center justify-center px-4 pb-20">
              <div className="mb-6 flex flex-col items-center">
                <div className="glow-wrap">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#D97757] text-white shadow-md">
                    <Asterisk className="h-8 w-8" />
                  </div>
                </div>
                {/* Greeting (timeOfDay, weather, dayOfWeek integrated!) */}
                <h1 className="mt-6 text-center text-3xl font-normal tracking-tight text-[#191919]">
                  ✳ {greeting}
                </h1>
              </div>

              {/* Composer card container */}
              <div className="w-full max-w-[640px] rounded-2xl border border-[#D1D0CE] bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
                {pendingAttachments.length > 0 && (
                  <AttachmentGallery
                    attachments={pendingAttachments}
                    onRemove={removePending}
                  />
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  onPaste={handlePaste}
                  rows={2}
                  placeholder={pendingAttachments.length ? "파일에 대해 물어보거나 메시지를 추가하세요…" : "오늘 어떤 도움을 드릴까요?"}
                  className="w-full resize-none bg-transparent px-1 py-2 text-[15px] text-[#191919] outline-none placeholder:text-[#8A8881]"
                />

                <div className="mt-2 flex items-center justify-between border-t border-[#F0EFEA] pt-3">
                  <div className="flex items-center gap-1 text-[#6B6960]">
                    {/* Add attachment btn */}
                    <button
                      onClick={openFilePicker}
                      className="rounded-lg p-2 hover:bg-[#F3F2EE] disabled:opacity-50"
                      title="이미지/파일 첨부"
                      disabled={uploading}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Model selector drop inside composer */}
                    <div className="relative" ref={menuRef}>
                      <button
                        onClick={() => setMenuOpen((o) => !o)}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-normal text-[#6B6960] hover:bg-[#F3F2EE]"
                      >
                        {selectedModel.label} <span className="text-[10px] text-[#8A8881]">낮음</span> ∨
                      </button>
                      {menuOpen && (
                        <div className="absolute right-0 bottom-full z-50 mb-1 w-64 rounded-xl border border-[#E5E4E2] bg-white p-1 shadow-lg">
                          {MODELS.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setModel(m.id);
                                setMenuOpen(false);
                              }}
                              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-[#F3F2EE]"
                            >
                              <span>{m.label}</span>
                              {m.id === model && <span className="text-[#D97757]">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Mic */}
                    <button className="rounded-lg p-2 text-[#6B6960] hover:bg-[#F3F2EE]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v4M8 23h8" />
                      </svg>
                    </button>

                    {/* Send btn */}
                    <button
                      onClick={() => sendMessage()}
                      disabled={!input.trim() && pendingAttachments.length === 0}
                      className="grid h-8 w-8 place-items-center rounded-full bg-[#191919] text-white hover:bg-[#333330] disabled:opacity-20"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-4 w-4">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>



              {/* Quick-action helper chips (as in screenshot) */}
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-[600px]">
                {[
                  { label: "작성하기", icon: "✍️" },
                  { label: "학습하기", icon: "🎓" },
                  { label: "코드", icon: "</>" },
                  { label: "일상생활", icon: "☕" },
                  { label: "Claude의 선택", icon: "💡" },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => setInput(`${chip.label}에 대해 알려줘`)}
                    className="flex items-center gap-1.5 rounded-full border border-[#D1D0CE] bg-white px-3 py-1.5 text-xs text-[#6B6960] hover:bg-[#F3F2EE] hover:text-[#191919]"
                  >
                    <span>{chip.icon}</span>
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ------- Dynamic chat stream viewport ------- */
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
              {messages.map((m) => (
                <div key={m.id} className="w-full">
                  {m.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#E5E4E2] px-4 py-2.5 text-[15px] leading-relaxed text-[#191919]">
                        {m.attachments && m.attachments.length > 0 && (
                          <div className={`${m.content ? "mb-2 " : ""}grid grid-cols-2 gap-2 sm:grid-cols-3`}>
                            {m.attachments.map((a, i) =>
                              a.type.startsWith("image/") ? (
                                <a
                                  key={i}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block overflow-hidden rounded-lg border border-white/40"
                                >
                                  <img
                                    src={a.url}
                                    alt={a.name}
                                    className="h-32 w-full object-cover"
                                  />
                                </a>
                              ) : (
                                <a
                                  key={i}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex flex-col items-start gap-1 rounded-lg bg-white/70 p-2 text-[11px] text-[#4A4943] hover:bg-white"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <path d="M14 2v6h6" />
                                  </svg>
                                  <span className="max-w-[100px] truncate font-medium">{a.name}</span>
                                  <span className="text-[10px] text-[#8A8881]">{Math.round(a.size / 1024)} KB</span>
                                </a>
                              ),
                            )}
                          </div>
                        )}
                        {m.content && m.content !== "(첨부파일)" && (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-[#D97757] text-white">
                        <Asterisk className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {/* thinking panel */}
                        {m.thinking && (
                          <div className="mb-2">
                            <button
                              onClick={() => toggleThinking(m.id)}
                              className="flex items-center gap-1.5 text-xs font-medium text-[#8A8881] hover:text-[#6B6960]"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 8v4l2 2" />
                              </svg>
                              생각 과정
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3 w-3 transition-transform ${expandedThinking[m.id] ? "rotate-180" : ""}`}>
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </button>
                            {expandedThinking[m.id] && (
                              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[#E6E4DC] bg-[#FAF9F5] p-3 text-xs leading-relaxed text-[#6B6960]">
                                <p className="whitespace-pre-wrap">{m.thinking}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {m.content ? (
                          <MarkdownLite content={m.content} />
                        ) : thinking ? (
                          <div className="flex items-center gap-2 text-sm text-[#8A8881]">
                            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent" />
                            생각 중…
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[#B9B6AD]">
                            <span className="h-2 w-2 animate-bounce rounded-full bg-[#B9B6AD] [animation-delay:-0.2s]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-[#B9B6AD] [animation-delay:-0.1s]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-[#B9B6AD]" />
                          </div>
                        )}

                        {m.model && m.content && (
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-[#B9B6AD]">
                            <span>{getModel(m.model).label}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {error && (
                <div className="rounded-xl border border-[#F0D5CC] bg-[#FBEDE8] px-4 py-3 text-sm text-[#B4563A]">
                  ⚠️ {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Persistent composer only shown if in active chat */}
        {messages.length > 0 && (
          <div className="border-t border-[#E5E4E2] bg-white px-4 pb-4 pt-2 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <div className="rounded-2xl border border-[#D1D0CE] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus-within:border-[#B9B6AD]">
                {pendingAttachments.length > 0 && (
                  <AttachmentGallery
                    attachments={pendingAttachments}
                    onRemove={removePending}
                  />
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  onPaste={handlePaste}
                  rows={1}
                  placeholder={pendingAttachments.length ? "파일에 대해 물어보거나 메시지를 추가하세요…" : "메시지를 입력하세요"}
                  className="max-h-[200px] w-full resize-none rounded-t-2xl bg-transparent px-4 pb-2 pt-3 text-[15px] text-[#191919] outline-none placeholder:text-[#B9B6AD]"
                />
                <div className="flex items-center gap-2 px-3 pb-3">
                  <button
                    onClick={openFilePicker}
                    disabled={uploading}
                    className="grid h-8 w-8 place-items-center rounded-lg text-[#6B6960] hover:bg-[#F3F2EE] disabled:opacity-50"
                    title="이미지/파일 첨부"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  <button className="grid h-8 w-8 place-items-center rounded-lg text-[#6B6960] hover:bg-[#F3F2EE]" title="도구">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                      <path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4L14 13l-3-3 3.7-3.7z" />
                    </svg>
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="hidden text-[11px] text-[#B9B6AD] sm:block">
                      {selectedModel.label}
                    </span>
                    {loading ? (
                      <button
                        onClick={stop}
                        className="grid h-9 w-9 place-items-center rounded-full bg-[#191919] text-white transition hover:bg-[#333330]"
                        title="중단"
                      >
                        <span className="block h-3 w-3 rounded-sm bg-white" />
                      </button>
                    ) : (
                      <button
                        onClick={() => sendMessage()}
                        disabled={!input.trim() && pendingAttachments.length === 0}
                        className="grid h-9 w-9 place-items-center rounded-full bg-[#D97757] text-white transition hover:bg-[#C4653F] disabled:opacity-30"
                        title="전송"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-center text-[10px] leading-relaxed text-[#A3A29A]">
                클로드는 실패할 수 있습니다. 이것은 클로드 클론이므로, 뭔가 부족하거나 결함이 있거나, 성능이 안좋거나, 최신 모델을 빨리 적용하지 못할 수 있습니다.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input shared by both composers */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,text/plain,text/csv,application/json,.md,.txt,.csv,.pdf,.json,.zip,.png,.jpg,.jpeg,.gif,.webp,.svg"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
        }}
      />

      {/* 드래그 앤 드롭 오버레이 */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center bg-[#191919]/40 backdrop-blur-[2px]">
          <div className="rounded-2xl border-2 border-dashed border-white bg-white/95 px-10 py-8 text-center shadow-2xl">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#D97757] text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <p className="text-base font-semibold text-[#191919]">여기에 파일을 놓으세요</p>
            <p className="mt-1 text-xs text-[#6B6960]">이미지 · PDF · 텍스트 파일 지원</p>
          </div>
        </div>
      )}

      {uploading && (
        <div className="absolute bottom-24 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-[#191919] px-4 py-2 text-xs font-medium text-white shadow-lg">
          파일 업로드 중…
        </div>
      )}
    </div>
  );
}

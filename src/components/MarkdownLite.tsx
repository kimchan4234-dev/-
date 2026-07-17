"use client";

import { type ReactNode, useState } from "react";
import { ArtifactCard } from "@/components/ArtifactCard";

// Clean language identifiers and file extensions
interface LanguageMeta {
  ext: string;
  label: string;
  color: string;
}

const LANGUAGE_MAP: Record<string, LanguageMeta> = {
  html: { ext: "html", label: "HTML", color: "text-orange-500" },
  htm: { ext: "html", label: "HTML", color: "text-orange-500" },
  css: { ext: "css", label: "CSS", color: "text-blue-500" },
  javascript: { ext: "js", label: "JavaScript", color: "text-yellow-500" },
  js: { ext: "js", label: "JavaScript", color: "text-yellow-500" },
  jsx: { ext: "jsx", label: "React JSX", color: "text-sky-500" },
  typescript: { ext: "ts", label: "TypeScript", color: "text-blue-600" },
  ts: { ext: "ts", label: "TypeScript", color: "text-blue-600" },
  tsx: { ext: "tsx", label: "React TSX", color: "text-blue-600" },
  python: { ext: "py", label: "Python", color: "text-blue-400" },
  py: { ext: "py", label: "Python", color: "text-blue-400" },
  java: { ext: "java", label: "Java", color: "text-red-500" },
  cpp: { ext: "cpp", label: "C++", color: "text-blue-500" },
  c: { ext: "c", label: "C", color: "text-blue-500" },
  sql: { ext: "sql", label: "SQL", color: "text-amber-600" },
  json: { ext: "json", label: "JSON", color: "text-slate-400" },
  yaml: { ext: "yml", label: "YAML", color: "text-red-400" },
  yml: { ext: "yml", label: "YAML", color: "text-red-400" },
  xml: { ext: "xml", label: "XML", color: "text-orange-400" },
  sh: { ext: "sh", label: "Shell", color: "text-green-400" },
  bash: { ext: "sh", label: "Bash", color: "text-green-400" },
  md: { ext: "md", label: "Markdown", color: "text-gray-400" },
  markdown: { ext: "md", label: "Markdown", color: "text-gray-400" },
};

// Claude style keywords (serif feel)
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-[#1F1E1B]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-[#EBEBEB] px-1.5 py-0.5 font-mono text-[0.85em] text-[#D97757]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + token.length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MarkdownLite({ content }: { content: string }) {
  const blocks = content.split(/```/);

  // Determine file name from context (infer content topic)
  const makeTitle = (meta: LanguageMeta, rawCode: string): string => {
    const text = `${rawCode} ${content}`.toLowerCase();
    if (/minecraft|마인크래프트|beta 19/.test(text)) return `Minecraft_beta_19_update.${meta.ext}`;
    if (/game|게임|platformer|rpg/.test(text)) return `game_engine.${meta.ext}`;
    if (/server|fastapi|flask|backend|api/.test(text)) return `server.${meta.ext}`;
    if (/chatgpt|llm|ai|openai|api_key/.test(text)) return `ai_core.${meta.ext}`;
    if (/excel|엑셀|report|dashboard/.test(text)) return `report_view.${meta.ext}`;
    return `script_v${Math.floor(Math.random() * 90 + 10)}.${meta.ext}`;
  };

  return (
    <div className="space-y-4 font-[var(--font-claude)] text-[15.5px] leading-[1.55] text-[#1F1E1B]">
      {blocks.map((block, idx) => {
        if (idx % 2 === 1) {
          // Code Fence logic
          const firstNewline = block.indexOf("\n");
          let rawLang = "text";
          if (firstNewline >= 0) {
            rawLang = block.slice(0, firstNewline).trim().toLowerCase().split(/\s+/)[0];
          }
          const isArtifact = content.includes("```") && firstNewline !== -1 && firstNewline !== block.lastIndexOf("```");
          const code = block.slice(firstNewline + 1).replace(/\n$/, "");
          const meta = LANGUAGE_MAP[rawLang] ?? { ext: "txt", label: "텍스트", color: "text-slate-500" };

          // Extract explicit artifact filename if present at top line
          let artifactTitle = "";
          const titleMatch = /^(?:\s*# File: |file=)([^\n\r#@]+)/.exec(code);
          if (titleMatch) artifactTitle = titleMatch[1].trim();

          const filename = artifactTitle || makeTitle(meta, code);
          const handleDownload = () => {
            const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          };

          return (
            <div key={idx} className="space-y-2">
              <ArtifactCard filename={filename} content={code} url={`#code-${idx}`} />
              <pre className="overflow-x-auto rounded-xl bg-[#333330] p-4 text-[12.5px] leading-relaxed text-slate-100 shadow-md">
                <code className={`font-mono ${meta.color}`}>{code}</code>
              </pre>
            </div>
          );
        }

        // Text section
        const lines = block.split("\n");
        const elements: ReactNode[] = [];
        let listBuffer: string[] = [];
        let key = 0;

        const flushList = () => {
          if (listBuffer.length > 0) {
            const items = [...listBuffer];
            elements.push(
              <ul key={`ul-${key++}`} className="ml-1 list-disc space-y-2 pl-6 marker:text-[#8A8881]">
                {items.map((it, li) => (
                  <li key={li} className="text-[#1F1E1B]">
                    {renderInline(it, `li-${key}-${li}`)}
                  </li>
                ))}
              </ul>,
            );
            listBuffer = [];
          }
        };

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === "") {
            flushList();
            continue;
          }
          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            listBuffer.push(trimmed.slice(2));
            continue;
          }
          if (trimmed.startsWith("> ")) {
            flushList();
            elements.push(
              <blockquote
                key={`bq-${key++}`}
                className="border-l-4 border-[#D97757] pl-4 italic text-[#6B6960] py-1"
              >
                {renderInline(trimmed.slice(2), `bq-${key}`)}
              </blockquote>,
            );
            continue;
          }
          flushList();
          elements.push(
            <p key={`p-${key++}`} className="mb-1">
              {renderInline(line, `p-${key}`)}
            </p>,
          );
        }
        flushList();
        return <div key={idx}>{elements}</div>;
      })}
    </div>
  );
}

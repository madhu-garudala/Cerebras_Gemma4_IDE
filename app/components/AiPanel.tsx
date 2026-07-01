"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type ContextMode = "none" | "active-file";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiPanelProps {
  activeFile: string | null;
  activeFileContent: string;
  activeLanguage: string;
  onCreateFile?: (filename: string, content: string) => Promise<void>;
}

// ── message parser ─────────────────────────────────────────────────────────
type Segment =
  | { type: "text"; content: string }
  | { type: "code"; lang: string; filename: string | null; content: string };

function parseMessage(text: string, isStreaming: boolean): Segment[] {
  // While streaming, render raw so the user sees tokens as they arrive
  if (isStreaming) return [{ type: "text", content: text }];

  const segments: Segment[] = [];
  const lines = text.split("\n");
  let i = 0;
  let textAccum = "";

  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^```(\w*)$/);

    if (fenceMatch) {
      // Look for "FILE: name.ext" on the last accumulated line
      const textLines = textAccum.split("\n");
      const lastLine = textLines[textLines.length - 1] ?? "";
      const fileMatch = lastLine.match(/^FILE:\s*(.+)$/);
      let filename: string | null = null;

      if (fileMatch) {
        filename = fileMatch[1].trim();
        textAccum = textLines.slice(0, -1).join("\n");
      }

      if (textAccum.trim()) {
        segments.push({ type: "text", content: textAccum });
        textAccum = "";
      } else {
        textAccum = "";
      }

      const lang = fenceMatch[1] ?? "";
      const codeLines: string[] = [];
      i++;

      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }

      segments.push({ type: "code", lang, filename, content: codeLines.join("\n") });
      i++; // skip closing ```
    } else {
      textAccum += (i === 0 ? "" : "\n") + line;
      i++;
    }
  }

  if (textAccum) segments.push({ type: "text", content: textAccum });
  return segments;
}

// ── code block renderer ────────────────────────────────────────────────────
function CodeBlock({
  seg,
  onCreateFile,
}: {
  seg: Extract<Segment, { type: "code" }>;
  onCreateFile?: (filename: string, content: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [customName, setCustomName] = useState(seg.filename ?? "");
  const [editingName, setEditingName] = useState(false);

  async function handleCreate() {
    const name = customName.trim();
    if (!name || !onCreateFile) return;
    setCreating(true);
    setErr(null);
    try {
      await onCreateFile(name, seg.content);
      setCreated(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="my-1 rounded overflow-hidden border border-[#3c3c3c]">
      {/* header bar */}
      <div className="flex items-center justify-between bg-[#1e1e1e] px-2 py-0.5 text-[10px] text-[#888]">
        <span>{seg.lang || "code"}</span>
        {onCreateFile && (
          <div className="flex items-center gap-1">
            {created ? (
              <span className="text-green-400">✓ Created</span>
            ) : (
              <>
                {editingName ? (
                  <input
                    className="bg-[#3c3c3c] text-[#d4d4d4] text-[10px] px-1 rounded w-32 outline-none"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { setEditingName(false); handleCreate(); }
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    className="text-[#888] hover:text-[#aaa] underline underline-offset-2"
                    onClick={() => setEditingName(true)}
                    title="Edit filename"
                  >
                    {customName || "name file…"}
                  </button>
                )}
                <button
                  className="px-1.5 py-0.5 bg-[#0078d4] hover:bg-[#006bbf] text-white rounded disabled:opacity-40"
                  onClick={handleCreate}
                  disabled={creating || !customName.trim()}
                >
                  {creating ? "…" : "Create file"}
                </button>
              </>
            )}
            {err && <span className="text-red-400 ml-1">{err}</span>}
          </div>
        )}
      </div>
      {/* code body */}
      <pre className="text-[11px] leading-relaxed overflow-x-auto px-3 py-2 bg-[#1a1a1a] text-[#d4d4d4] whitespace-pre">
        {seg.content}
      </pre>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────
export default function AiPanel({
  activeFile,
  activeFileContent,
  activeLanguage,
  onCreateFile,
}: AiPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [contextMode, setContextMode] = useState<ContextMode>("active-file");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildSystem = useCallback((): string | undefined => {
    const fileInstructions = [
      "When generating a complete file that should be saved to disk, put this annotation on the line IMMEDIATELY before the opening fence:",
      "FILE: <filename.ext>",
      "```<lang>",
      "<code>",
      "```",
      "This lets the IDE show a 'Create file' button. Always include the correct extension.",
    ].join("\n");

    if (contextMode === "none" || !activeFile) {
      return [
        "You are an expert coding assistant inside an IDE.",
        "Keep answers concise and technical.",
        fileInstructions,
      ].join("\n\n");
    }

    const truncated =
      activeFileContent.length > 20000
        ? activeFileContent.slice(0, 20000) + "\n\n[...file truncated...]"
        : activeFileContent;

    return [
      "You are an expert coding assistant inside an IDE.",
      `The user is editing: ${activeFile} (language: ${activeLanguage})`,
      "When proposing code changes, show the full revised snippet.",
      "Keep answers concise and technical.",
      fileInstructions,
      "",
      `=== FILE CONTENT: ${activeFile} ===`,
      truncated,
      "=== END FILE CONTENT ===",
    ].join("\n");
  }, [contextMode, activeFile, activeFileContent, activeLanguage]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          system: buildSystem(),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated };
          return updated;
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `[Error: ${errMsg}]`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function renderMessage(msg: Message, idx: number) {
    const isLastAssistant = msg.role === "assistant" && idx === messages.length - 1;
    const isCurrentlyStreaming = isLastAssistant && streaming;

    if (msg.role === "user") {
      return (
        <div key={idx} className="text-right">
          <span className="inline-block px-3 py-2 rounded text-xs leading-relaxed whitespace-pre-wrap text-left max-w-full bg-[#0078d4] text-white">
            {msg.content}
          </span>
        </div>
      );
    }

    const segments = parseMessage(msg.content, isCurrentlyStreaming);

    return (
      <div key={idx} className="text-left">
        <div className="text-xs leading-relaxed text-[#d4d4d4]">
          {segments.map((seg, si) =>
            seg.type === "text" ? (
              <span key={si} className="whitespace-pre-wrap block font-mono">
                {seg.content}
                {isCurrentlyStreaming && si === segments.length - 1 && (
                  <span className="animate-pulse ml-0.5">▋</span>
                )}
              </span>
            ) : (
              <CodeBlock
                key={si}
                seg={seg}
                onCreateFile={onCreateFile}
              />
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#252526]">
      {/* Header */}
      <div className="px-3 py-2 text-xs font-semibold text-[#bdbdbd] uppercase tracking-wider shrink-0 flex items-center justify-between border-b border-[#3c3c3c]">
        <span>AI — GEMMA-4-31B</span>
        {streaming && (
          <span className="text-[#0078d4] animate-pulse text-[10px] normal-case font-normal">
            streaming…
          </span>
        )}
      </div>

      {/* Context toggle */}
      <div className="px-3 py-1.5 shrink-0 flex gap-2 border-b border-[#3c3c3c]">
        <button
          className={`text-[10px] px-2 py-0.5 rounded ${
            contextMode === "none"
              ? "bg-[#0078d4] text-white"
              : "bg-[#3c3c3c] text-[#aaa] hover:text-white"
          }`}
          onClick={() => setContextMode("none")}
        >
          No context
        </button>
        <button
          className={`text-[10px] px-2 py-0.5 rounded ${
            contextMode === "active-file"
              ? "bg-[#0078d4] text-white"
              : "bg-[#3c3c3c] text-[#aaa] hover:text-white"
          }`}
          onClick={() => setContextMode("active-file")}
          title={activeFile ?? "No file open"}
        >
          Active file
        </button>
        {activeFile && contextMode === "active-file" && (
          <span className="text-[10px] text-[#555] truncate my-auto">
            {activeFile.split("/").pop()}
          </span>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-sm">
        {messages.length === 0 && (
          <p className="text-[#555] text-xs text-center mt-8">
            Ask anything about your code.
            <br />
            {contextMode === "active-file" && activeFile
              ? `Context: ${activeFile.split("/").pop()}`
              : "No file context."}
          </p>
        )}
        {messages.map((msg, i) => renderMessage(msg, i))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-[#3c3c3c] shrink-0">
        <div className="flex gap-2">
          <textarea
            className="flex-1 bg-[#3c3c3c] text-[#d4d4d4] text-xs rounded px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-[#0078d4] placeholder-[#666]"
            rows={2}
            placeholder="Ask about this file… (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
          />
          <button
            className="px-3 py-1 bg-[#0078d4] hover:bg-[#006bbf] text-white text-xs rounded disabled:opacity-40 shrink-0"
            onClick={send}
            disabled={streaming || !input.trim()}
          >
            {streaming ? "…" : "Send"}
          </button>
        </div>
        {streaming && (
          <button
            className="mt-1 text-[10px] text-[#888] hover:text-red-400"
            onClick={() => abortRef.current?.abort()}
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

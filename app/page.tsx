"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Group, Panel, Separator } from "react-resizable-panels";
import FileTree from "./components/FileTree";
import TabBar from "./components/TabBar";
import AiPanel from "./components/AiPanel";
import { useEditorStore } from "./lib/editor-store";
import { fsProvider, type FileNode } from "./lib/fs-provider";

const CodeEditor = dynamic(() => import("./components/CodeEditor"), { ssr: false });

function extToLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go",
    rs: "rust", java: "java", c: "c", cpp: "cpp",
    cs: "csharp", html: "html", css: "css",
    json: "json", md: "markdown", mdx: "markdown",
    yaml: "yaml", yml: "yaml", toml: "toml",
    sh: "shell", bash: "shell", zsh: "shell",
    sql: "sql", graphql: "graphql",
    xml: "xml", svg: "xml",
  };
  return map[ext] ?? "plaintext";
}

export default function Home() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);

  // Open-folder state
  const [currentRoot, setCurrentRoot] = useState<string | null>(null);
  const [openFolderOpen, setOpenFolderOpen] = useState(false);
  const [openFolderValue, setOpenFolderValue] = useState("");
  const [openFolderError, setOpenFolderError] = useState<string | null>(null);
  const [openFolderBusy, setOpenFolderBusy] = useState(false);

  // File contents keyed by path — source of truth for Monaco values
  const fileContents = useRef<Map<string, string>>(new Map());
  const [, forceRender] = useState(0);

  const { tabs, activeTab, openTab, closeTab, setActive, markDirty } = useEditorStore();
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");

  function refreshTree() {
    setLoadingTree(true);
    setTreeError(null);
    fsProvider
      .listTree()
      .then(setTree)
      .catch((e) => setTreeError(e.message))
      .finally(() => setLoadingTree(false));
  }

  // Load tree + current root on mount
  useEffect(() => {
    refreshTree();
    fsProvider.getRoot().then(setCurrentRoot).catch(() => null);
  }, []);

  async function handleOpenFolder() {
    const path = openFolderValue.trim();
    if (!path) return;
    setOpenFolderBusy(true);
    setOpenFolderError(null);
    try {
      const real = await fsProvider.setRoot(path);
      setCurrentRoot(real);
      setOpenFolderOpen(false);
      setOpenFolderValue("");
      // Clear stale editor state
      fileContents.current.clear();
      forceRender((n) => n + 1);
      refreshTree();
    } catch (e) {
      setOpenFolderError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpenFolderBusy(false);
    }
  }

  const handleFileClick = useCallback(
    async (node: FileNode) => {
      if (node.type !== "file") return;
      openTab(node.path, node.name);

      if (!fileContents.current.has(node.path)) {
        try {
          const content = await fsProvider.readFile(node.path);
          fileContents.current.set(node.path, content);
          forceRender((n) => n + 1);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          fileContents.current.set(node.path, `// Error loading file: ${msg}`);
          forceRender((n) => n + 1);
        }
      }
    },
    [openTab]
  );

  const handleEditorChange = useCallback(
    (path: string, value: string) => {
      fileContents.current.set(path, value);
      markDirty(path, true);
    },
    [markDirty]
  );

  const handleSave = useCallback(
    async (path: string) => {
      const content = fileContents.current.get(path);
      if (content === undefined) return;
      setSaveStatus("saving");
      try {
        await fsProvider.writeFile(path, content);
        markDirty(path, false);
        setSaveStatus("saved");
      } catch (e) {
        console.error("Save failed:", e);
        setSaveStatus("error");
      }
    },
    [markDirty]
  );

  // Called by AI panel when the user clicks "Create file"
  const handleCreateFile = useCallback(
    async (filename: string, content: string) => {
      await fsProvider.writeFile(filename, content);
      fileContents.current.set(filename, content);
      openTab(filename, filename.split("/").pop() ?? filename);
      forceRender((n) => n + 1);
      refreshTree();
    },
    [openTab]
  );

  const activeContent = activeTab ? (fileContents.current.get(activeTab) ?? "") : "";
  const activeLanguage = activeTab
    ? extToLanguage(activeTab.split("/").pop() ?? "")
    : "plaintext";
  const activeDirty = tabs.find((t) => t.path === activeTab)?.dirty ?? false;

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-[#d4d4d4] overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center h-9 bg-[#3c3c3c] px-4 text-sm shrink-0 select-none">
        <span className="font-semibold text-white">Cerebras IDE</span>
        {activeTab && (
          <span className="ml-2 text-[#a0a0a0] truncate">— {activeTab}</span>
        )}
      </div>

      {/* Tab bar */}
      <TabBar tabs={tabs} activeTab={activeTab} onSelect={setActive} onClose={closeTab} />

      {/* Main three-pane body — resizable */}
      <Group className="flex-1 overflow-hidden" orientation="horizontal">
        {/* Left: file explorer */}
        <Panel
          id="explorer"
          defaultSize="260px"
          minSize="150px"
          maxSize="480px"
          groupResizeBehavior="preserve-pixel-size"
          className="flex flex-col bg-[#252526] overflow-hidden"
        >
          {/* Explorer header */}
          <div className="px-3 py-2 text-xs font-semibold text-[#bdbdbd] uppercase tracking-wider shrink-0 flex items-center justify-between">
            <span>Explorer</span>
            <div className="flex items-center gap-2">
              <button
                className="text-[#bdbdbd] hover:text-white text-base leading-none"
                title="Refresh tree"
                onClick={refreshTree}
              >
                ↻
              </button>
              <button
                className="text-[#bdbdbd] hover:text-white text-sm leading-none"
                title="Open folder…"
                onClick={() => {
                  setOpenFolderOpen((v) => !v);
                  setOpenFolderValue(currentRoot ?? "");
                  setOpenFolderError(null);
                }}
              >
                📂
              </button>
            </div>
          </div>

          {/* Current root path hint */}
          {currentRoot && !openFolderOpen && (
            <div
              className="px-3 pb-1 text-[10px] text-[#555] truncate leading-tight"
              title={currentRoot}
            >
              {currentRoot}
            </div>
          )}

          {/* Open folder input */}
          {openFolderOpen && (
            <div className="px-3 pb-2 flex flex-col gap-1 shrink-0 border-b border-[#3c3c3c]">
              <input
                className="bg-[#3c3c3c] text-[#d4d4d4] text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-[#0078d4] placeholder-[#666] w-full"
                placeholder="/absolute/path/to/folder"
                value={openFolderValue}
                onChange={(e) => setOpenFolderValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleOpenFolder();
                  if (e.key === "Escape") setOpenFolderOpen(false);
                }}
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  className="flex-1 py-0.5 text-[10px] bg-[#0078d4] hover:bg-[#006bbf] text-white rounded disabled:opacity-40"
                  onClick={handleOpenFolder}
                  disabled={openFolderBusy || !openFolderValue.trim()}
                >
                  {openFolderBusy ? "Opening…" : "Open"}
                </button>
                <button
                  className="px-2 py-0.5 text-[10px] bg-[#3c3c3c] text-[#aaa] hover:text-white rounded"
                  onClick={() => setOpenFolderOpen(false)}
                >
                  Cancel
                </button>
              </div>
              {openFolderError && (
                <p className="text-[10px] text-red-400 break-all">{openFolderError}</p>
              )}
            </div>
          )}

          {/* File tree */}
          <div className="flex-1 overflow-y-auto">
            {loadingTree && (
              <p className="text-xs text-[#888] px-3 py-2">Loading…</p>
            )}
            {treeError && (
              <p className="text-xs text-red-400 px-3 py-2 break-all">{treeError}</p>
            )}
            {!loadingTree && !treeError && (
              <FileTree nodes={tree} onFileClick={handleFileClick} activeFile={activeTab} />
            )}
          </div>
        </Panel>

        <Separator style={{ width: "2px" }} />

        {/* Center: editor */}
        <Panel id="editor" minSize="200px" className="overflow-hidden">
          {activeTab && fileContents.current.has(activeTab) ? (
            <CodeEditor
              path={activeTab}
              value={activeContent}
              language={activeLanguage}
              onChange={(v) => handleEditorChange(activeTab, v)}
              onSave={() => handleSave(activeTab)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-[#555] text-sm">
              {tabs.length === 0
                ? "Select a file from the explorer to start editing"
                : "Loading…"}
            </div>
          )}
        </Panel>

        <Separator style={{ width: "2px" }} />

        {/* Right: AI panel */}
        <Panel
          id="ai-panel"
          defaultSize="300px"
          minSize="220px"
          maxSize="560px"
          groupResizeBehavior="preserve-pixel-size"
          className="overflow-hidden"
        >
          <AiPanel
            activeFile={activeTab}
            activeFileContent={activeContent}
            activeLanguage={activeLanguage}
            onCreateFile={handleCreateFile}
          />
        </Panel>
      </Group>

      {/* Status bar */}
      <div className="flex items-center h-6 bg-[#007acc] px-3 text-xs text-white shrink-0 select-none gap-4">
        <span>{activeLanguage}</span>
        {activeDirty && <span className="text-yellow-200">● Unsaved</span>}
        {saveStatus === "saving" && <span className="text-yellow-200">Saving…</span>}
        {saveStatus === "error" && <span className="text-red-300">Save failed</span>}
        {!activeDirty && saveStatus === "saved" && activeTab && <span>Saved</span>}
        <span className="ml-auto">{activeTab ?? "No file open"}</span>
      </div>
    </div>
  );
}

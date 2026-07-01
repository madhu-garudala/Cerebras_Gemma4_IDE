"use client";

import Editor, { type OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  path: string;
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
}

export default function CodeEditor({ path, value, language = "plaintext", onChange, onSave }: CodeEditorProps) {
  const handleMount: OnMount = (editor, monaco) => {
    // Cmd/Ctrl+S → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });
  };

  return (
    <Editor
      key={path}
      height="100%"
      theme="vs-dark"
      language={language}
      value={value}
      path={path}        // Monaco model key — preserves undo history per file
      onMount={handleMount}
      onChange={(v) => onChange?.(v ?? "")}
      options={{
        fontSize: 14,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2,
      }}
    />
  );
}

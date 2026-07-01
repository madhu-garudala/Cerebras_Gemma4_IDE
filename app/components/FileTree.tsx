"use client";

import { useState } from "react";
import type { FileNode } from "../lib/fs-provider";
import { fsProvider } from "../lib/fs-provider";

interface FileTreeProps {
  nodes: FileNode[];
  onFileClick: (node: FileNode) => void;
  activeFile?: string | null;
  depth?: number;
}

export default function FileTree({ nodes, onFileClick, activeFile, depth = 0 }: FileTreeProps) {
  return (
    <ul className="text-sm select-none">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          onFileClick={onFileClick}
          activeFile={activeFile}
          depth={depth}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  onFileClick,
  activeFile,
  depth,
}: {
  node: FileNode;
  onFileClick: (node: FileNode) => void;
  activeFile?: string | null;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const indent = depth * 12;
  const isActive = node.path === activeFile;

  async function handleFolderClick() {
    const nextOpen = !open;
    setOpen(nextOpen);

    // Fetch children the first time this folder is opened
    if (nextOpen && children === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const result = await fsProvider.listDir(node.path);
        setChildren(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
  }

  if (node.type === "folder") {
    return (
      <li>
        <button
          className="flex items-center gap-1 w-full px-2 py-0.5 hover:bg-[#2a2d2e] text-[#cccccc] text-left"
          style={{ paddingLeft: `${indent + 8}px` }}
          onClick={handleFolderClick}
        >
          <span className="text-[10px] mr-1">{open ? "▼" : "▶"}</span>
          <span className="text-[#e8c07d]">📁</span>
          <span className="ml-1">{node.name}</span>
        </button>
        {open && (
          loading ? (
            <p className="text-[10px] text-[#888] px-2 py-0.5" style={{ paddingLeft: `${indent + 32}px` }}>
              Loading…
            </p>
          ) : error ? (
            <p className="text-[10px] text-red-400 px-2 py-0.5 break-all" style={{ paddingLeft: `${indent + 32}px` }}>
              {error}
            </p>
          ) : children && children.length > 0 ? (
            <FileTree
              nodes={children}
              onFileClick={onFileClick}
              activeFile={activeFile}
              depth={depth + 1}
            />
          ) : children && children.length === 0 ? (
            <p className="text-[10px] text-[#555] px-2 py-0.5" style={{ paddingLeft: `${indent + 32}px` }}>
              Empty
            </p>
          ) : null
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        className={`flex items-center w-full px-2 py-0.5 text-left ${
          isActive ? "bg-[#37373d] text-white" : "text-[#cccccc] hover:bg-[#2a2d2e]"
        }`}
        style={{ paddingLeft: `${indent + 20}px` }}
        onClick={() => onFileClick(node)}
      >
        {node.name}
      </button>
    </li>
  );
}

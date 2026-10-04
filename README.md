# Cerebras IDE

A lightweight, browser-based local code editor with a built-in AI assistant powered by Google's Gemma 4 (31B) running on Cerebras inference.

Cerebras IDE is a Next.js app you run on your own machine. It opens a folder on your local disk, lets you browse and edit files in a Monaco editor (the editor component behind VS Code), and puts a streaming chat panel alongside it that can see the file you are working on and write new files back into the project.

## Features

- **Three-pane, resizable layout**: file explorer, tabbed editor, and AI panel.
- **Local file explorer**: lazily loads one directory level at a time. It hides dotfiles (except `.env.local`) and skips `node_modules`, `.git`, `.next`, `dist`, and `.turbo`.
- **Open folder at runtime**: point the IDE at any absolute directory path from the UI without restarting the server.
- **Monaco editor with tabs**: syntax highlighting is picked from the file extension. Open files appear as tabs, unsaved changes are marked, and `Cmd/Ctrl+S` saves to disk.
- **AI assistant (Gemma 4 31B on Cerebras)**:
  - Responses stream token by token, and you can stop a reply partway through.
  - A context toggle switches between **No context** and **Active file**. In Active file mode, up to 20,000 characters of the open file go into the system prompt.
  - When the model returns a complete file, it labels it with a `FILE: <name>` line. The panel shows a **Create file** button on that code block, and the file name can be edited before the file is written to the project.
  - If a reply hits the token limit, the server asks the model to continue and joins the parts into one stream. It does this up to 8 times.
- **Sandboxed file access**: all file reads and writes go through a "path jail" that rejects absolute paths, `../` traversal, and symlinks that point outside the project root.

## How it works

```
Browser (React client)                        Next.js server (route handlers)
-----------------------                       -------------------------------
page.tsx  ── fsProvider ──► /api/fs/tree     ─┐
                            /api/fs/file      ├─► path-jail.ts ──► local filesystem
                            /api/fs/setroot  ─┘
AiPanel   ── fetch ───────► /api/chat  ──► Cerebras Cloud SDK ──► gemma-4-31b
          ◄── text/plain stream ──────────┘
```

- **Filesystem API** (`app/api/fs/*`): Node.js route handlers that list directories, read files (5 MB limit), write files, and get or set the project root. Every user-supplied path goes through `resolveSafe()` in `app/api/fs/lib/path-jail.ts`. That function resolves symlinks with `fs.realpath` and throws if the result falls outside the root. The root starts as the `PROJECT_ROOT` environment variable and can be changed at runtime from the UI. The change is held in server memory only.
- **Chat API** (`app/api/chat/route.ts`): receives `{ messages, system }`, calls `client.chat.completions.create` on the Cerebras SDK with `model: "gemma-4-31b"`, `stream: true`, and `max_completion_tokens: 16384`, and passes the output to the browser as a plain-text stream. If the stream ends with `finish_reason: "length"`, the handler adds a "continue" turn and keeps streaming.
- **Client state**: open tabs and dirty flags are kept in a small Zustand store (`app/lib/editor-store.ts`). File contents are cached in a ref in `app/page.tsx`.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, route handlers), React 19, TypeScript
- [@monaco-editor/react](https://github.com/suren-atoyan/monaco-react) for the editor
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) for the pane layout
- [Zustand](https://github.com/pmndrs/zustand) for editor and tab state
- Tailwind CSS v4
- [@cerebras/cerebras_cloud_sdk](https://www.npmjs.com/package/@cerebras/cerebras_cloud_sdk) for model inference (`gemma-4-31b`)

## Prerequisites

- Node.js (a version supported by Next.js 16) and npm
- A Cerebras Cloud API key with access to the `gemma-4-31b` model

## Setup

```bash
git clone <this-repo>
cd cerebras_gemma4_ide
npm install
```

Create a `.env.local` file in the repository root. `.env*` files are gitignored.

```bash
# Required: API key for Cerebras inference
CEREBRAS_API_KEY=your-cerebras-api-key

# Required at startup: absolute path of the folder the IDE opens first
# (you can switch folders later from the UI with "Open folder…")
PROJECT_ROOT=/absolute/path/to/your/project
```

| Variable           | Used in                       | Purpose                                                                     |
| ------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| `CEREBRAS_API_KEY` | `app/api/chat/route.ts`       | Authenticates calls to Cerebras. `/api/chat` returns 500 if it is missing.  |
| `PROJECT_ROOT`     | `app/api/fs/lib/path-jail.ts` | The first folder the file explorer and file API work in.                    |

## Running

```bash
npm run dev     # development server on http://127.0.0.1:3000
npm run build   # production build
npm run start   # serve the production build on 127.0.0.1
```

Both `dev` and `start` bind to `127.0.0.1` on purpose. The app reads and writes files on the host machine and has no authentication, so it is only meant to run locally. Do not expose it on a network.

### Path-jail test

A standalone test checks the path-sandboxing logic against traversal, absolute-path, URL-decoded, and symlink-escape cases:

```bash
node scripts/test-path-jail.mjs
```

The script exits with code 0 if every case passes and 1 if any fails. It tests a copy of `resolveSafe` written inside the script, not the module in `app/`. If you change `path-jail.ts`, update the script to match.

## Project structure

```
app/
  page.tsx                  Main IDE layout: explorer, tabs, editor, AI panel; open-folder UI
  layout.tsx                Root layout and fonts
  globals.css               Tailwind and global styles
  components/
    FileTree.tsx            Lazily expanding file explorer
    TabBar.tsx              Open-file tabs with unsaved indicator
    CodeEditor.tsx          Monaco wrapper (Cmd/Ctrl+S to save)
    AiPanel.tsx             Chat UI, context toggle, streaming, "Create file" code blocks
  lib/
    editor-store.ts         Zustand store for tabs and dirty state
    fs-provider.ts          Client wrapper around the /api/fs endpoints
  api/
    chat/route.ts           Streams Gemma 4 completions from Cerebras with auto-continue
    fs/tree/route.ts        GET: list a directory (one level)
    fs/file/route.ts        GET: read a file; POST: write a file
    fs/setroot/route.ts     GET/POST: get or change the project root
    fs/lib/path-jail.ts     Project-root state and resolveSafe() path sandboxing
scripts/
  test-path-jail.mjs        Standalone path-jail test
public/                     Static assets
```

## Limitations

- Single user and local only: there is no authentication, and a root folder changed at runtime resets when the server restarts.
- The AI panel gets only the active file as context (or none), not the whole project.
- Files larger than 5 MB cannot be opened. All files are read as UTF-8 text.

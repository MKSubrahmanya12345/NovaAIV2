import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { X, Copy, Check, Braces, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  isOpen:          boolean;
  onClose:         () => void;
  diagram:         object;
  onDiagramChange: (d: object) => void;
}

export default function DiagramViewer({ isOpen, onClose, diagram, onDiagramChange }: Props) {
  const [copied,     setCopied]     = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // ??$$$ Track whether the latest diagram change came from this editor
  // so we don't overwrite the user's cursor position on external updates
  const fromEditorRef = useRef(false);
  const editorRef     = useRef<Parameters<OnMount>[0] | null>(null);
  const prevJson      = useRef('');

  const toJson = (d: object) => JSON.stringify(d, null, 2);

  // When diagram changes externally (drag, add part, wire) → push into editor
  useEffect(() => {
    if (!editorRef.current) return;
    if (fromEditorRef.current) {
      fromEditorRef.current = false;
      return;
    }
    const next = toJson(diagram);
    if (next !== prevJson.current) {
      prevJson.current = next;
      editorRef.current.setValue(next);
    }
  }, [diagram]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    const initial = toJson(diagram);
    prevJson.current = initial;
    editor.setValue(initial);

    // ??$$$ Configure JSON language options: no trailing commas etc.
    editor.updateOptions({
      minimap: { enabled: false },
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      tabSize: 2,
      formatOnType: true,
      wordWrap: 'off',
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!value) return;
    prevJson.current = value;
    try {
      const parsed = JSON.parse(value);
      fromEditorRef.current = true;
      setParseError(null);
      onDiagramChange(parsed);
    } catch (e: unknown) {
      const msg = e instanceof SyntaxError ? e.message : 'Invalid JSON';
      setParseError(msg);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(toJson(diagram));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const diagramAsAny = diagram as { parts?: unknown[]; connections?: unknown[] };

  return (
    <>
      {/* Dismiss backdrop */}
      <div className="absolute inset-0 z-20" onClick={onClose} style={{ background: 'transparent' }} />

      {/* Panel */}
      <div
        className="absolute bottom-5 left-5 z-30 flex flex-col rounded-2xl border border-neutral-800 overflow-hidden"
        style={{
          width: '520px',
          height: '460px',
          background: 'rgba(5,5,5,0.97)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 24px 60px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <Braces className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-sm font-semibold text-white tracking-tight">diagram.json</span>
            <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 text-[9px] text-indigo-400 font-medium uppercase tracking-wider">
              editable
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 px-2.5 py-1 text-[11px] text-neutral-400 hover:text-white transition-all"
            >
              {copied
                ? <><Check className="h-3 w-3 text-green-400" /><span className="text-green-400">Copied!</span></>
                : <><Copy className="h-3 w-3" />Copy</>}
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center h-6 w-6 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 relative overflow-hidden">
          <Editor
            height="100%"
            language="json"
            theme="vs-dark"
            onMount={handleMount}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: 'off',
              padding: { top: 10, bottom: 10 },
            }}
          />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-800 shrink-0">
          {/* Parse status */}
          <div className="flex items-center gap-1.5">
            {parseError
              ? <>
                  <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                  <span className="text-[10px] text-red-400 font-mono truncate max-w-[280px]">{parseError}</span>
                </>
              : <>
                  <CheckCircle className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span className="text-[10px] text-emerald-400">Valid JSON — canvas synced</span>
                </>
            }
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-[10px] text-neutral-600">
            <span>{diagramAsAny.parts?.length ?? 0} parts</span>
            <span>{diagramAsAny.connections?.length ?? 0} connections</span>
          </div>
        </div>
      </div>
    </>
  );
}

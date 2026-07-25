"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useEffect, useCallback, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  content: string;
  onChange: (html: string, text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
}

// ── Personalization variables ─────────────────────────────────────────────────

const MERGE_VARS = [
  { label: "First Name",       variable: "{{firstName}}" },
  { label: "Last Name",        variable: "{{lastName}}" },
  { label: "Event Name",       variable: "{{eventName}}" },
  { label: "Event Date",       variable: "{{eventDate}}" },
  { label: "Venue",            variable: "{{eventVenue}}" },
  { label: "Reporting Time",   variable: "{{reportingTime}}" },
  { label: "Registration ID",  variable: "{{registrationId}}" },
  { label: "Category",         variable: "{{category}}" },
  { label: "BIB Number",       variable: "{{bibNumber}}" },
  { label: "Support Phone",    variable: "{{supportPhone}}" },
  { label: "Support Email",    variable: "{{supportEmail}}" },
];

const TEXT_COLORS = [
  "#ffffff", "#f0f0f0", "#aaaaaa", "#e8620a", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7",
];

const HIGHLIGHT_COLORS = [
  "#e8620a33", "#ef444433", "#22c55e33", "#3b82f633", "#a855f733",
  "#eab30833", "#fbbf2433",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ToolBtn({ active, disabled, onClick, title, children }: {
  active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      disabled={disabled}
      style={{
        padding: "4px 7px", border: "none", borderRadius: 5, cursor: disabled ? "default" : "pointer",
        background: active ? "rgba(232,98,10,0.25)" : "transparent",
        color: active ? "#e8620a" : disabled ? "#444" : "#ccc",
        fontSize: 12, fontWeight: active ? 700 : 400, fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 26, height: 26, transition: "background 0.1s",
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, background: "rgba(255,255,255,0.1)", margin: "2px 3px", alignSelf: "stretch" }} />;
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor | null }) {
  const [colorOpen,     setColorOpen]     = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [mergeOpen,     setMergeOpen]     = useState(false);
  const [linkUrl,       setLinkUrl]       = useState("");
  const [linkOpen,      setLinkOpen]      = useState(false);
  const [imageUrl,      setImageUrl]      = useState("");
  const [imageOpen,     setImageOpen]     = useState(false);

  const closeAll = () => { setColorOpen(false); setHighlightOpen(false); setMergeOpen(false); setLinkOpen(false); setImageOpen(false); };

  if (!editor) return null;

  function setLink() {
    if (!linkUrl) { editor!.chain().focus().unsetLink().run(); closeAll(); return; }
    editor!.chain().focus().setLink({ href: linkUrl, target: "_blank", rel: "noopener noreferrer" }).run();
    setLinkUrl(""); closeAll();
  }

  function insertImage() {
    if (!imageUrl) { closeAll(); return; }
    editor!.chain().focus().setImage({ src: imageUrl }).run();
    setImageUrl(""); closeAll();
  }

  function insertMerge(v: string) {
    editor!.chain().focus().insertContent(v).run();
    closeAll();
  }

  return (
    <div
      style={{
        display: "flex", flexWrap: "wrap", gap: 1, padding: "6px 8px",
        background: "#111", borderBottom: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px 8px 0 0", alignItems: "center", position: "relative",
      }}
      onMouseLeave={closeAll}
    >
      {/* History */}
      <ToolBtn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↩</ToolBtn>
      <ToolBtn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↪</ToolBtn>
      <Divider />

      {/* Block type */}
      <ToolBtn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolBtn>
      <ToolBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolBtn>
      <ToolBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolBtn>
      <ToolBtn title="Paragraph" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>¶</ToolBtn>
      <Divider />

      {/* Inline format */}
      <ToolBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolBtn>
      <ToolBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolBtn>
      <ToolBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolBtn>
      <ToolBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolBtn>
      <Divider />

      {/* Lists */}
      <ToolBtn title="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</ToolBtn>
      <ToolBtn title="Numbered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1≡</ToolBtn>
      <ToolBtn title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</ToolBtn>
      <Divider />

      {/* Alignment */}
      <ToolBtn title="Align Left"   active={editor.isActive({ textAlign: "left" })}   onClick={() => editor.chain().focus().setTextAlign("left").run()}>⬛L</ToolBtn>
      <ToolBtn title="Align Center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>⬛C</ToolBtn>
      <ToolBtn title="Align Right"  active={editor.isActive({ textAlign: "right" })}  onClick={() => editor.chain().focus().setTextAlign("right").run()}>⬛R</ToolBtn>
      <Divider />

      {/* Color */}
      <div style={{ position: "relative" }}>
        <ToolBtn title="Text Color" active={colorOpen} onClick={() => { closeAll(); setColorOpen(o => !o); }}>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>A</span>
            <span style={{ width: 14, height: 3, background: editor.getAttributes("textStyle").color ?? "#e8620a", borderRadius: 2 }} />
          </span>
        </ToolBtn>
        {colorOpen && (
          <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 8, display: "flex", gap: 4, flexWrap: "wrap", width: 120, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
            {TEXT_COLORS.map(c => (
              <button key={c} type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().setColor(c).run(); closeAll(); }}
                style={{ width: 20, height: 20, borderRadius: 4, background: c, border: editor.getAttributes("textStyle").color === c ? "2px solid #e8620a" : "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }} />
            ))}
            <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetColor().run(); closeAll(); }}
              style={{ fontSize: 9, color: "#888", background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left", padding: "2px 0" }}>Clear</button>
          </div>
        )}
      </div>

      {/* Highlight */}
      <div style={{ position: "relative" }}>
        <ToolBtn title="Background Highlight" active={highlightOpen || editor.isActive("highlight")} onClick={() => { closeAll(); setHighlightOpen(o => !o); }}>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <span style={{ fontSize: 11 }}>ab</span>
            <span style={{ width: 14, height: 3, background: "#e8620a55", borderRadius: 2 }} />
          </span>
        </ToolBtn>
        {highlightOpen && (
          <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 8, display: "flex", gap: 4, flexWrap: "wrap", width: 120, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
            {HIGHLIGHT_COLORS.map(c => (
              <button key={c} type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHighlight({ color: c }).run(); closeAll(); }}
                style={{ width: 20, height: 20, borderRadius: 4, background: c, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer" }} />
            ))}
            <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetHighlight().run(); closeAll(); }}
              style={{ fontSize: 9, color: "#888", background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left", padding: "2px 0" }}>Clear</button>
          </div>
        )}
      </div>
      <Divider />

      {/* Horizontal rule */}
      <ToolBtn title="Horizontal Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>─</ToolBtn>

      {/* Table */}
      <ToolBtn title="Insert Table" active={editor.isActive("table")}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞</ToolBtn>
      <Divider />

      {/* Link */}
      <div style={{ position: "relative" }}>
        <ToolBtn title="Link" active={editor.isActive("link") || linkOpen} onClick={() => {
          const prev = editor.getAttributes("link").href ?? "";
          setLinkUrl(prev); closeAll(); setLinkOpen(o => !o);
        }}>🔗</ToolBtn>
        {linkOpen && (
          <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 10, display: "flex", gap: 6, width: 260, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
            <input
              autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") setLink(); if (e.key === "Escape") closeAll(); }}
              placeholder="https://..." style={{ flex: 1, padding: "5px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            <button type="button" onMouseDown={e => { e.preventDefault(); setLink(); }}
              style={{ padding: "5px 10px", background: "#e8620a", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Set</button>
            {editor.isActive("link") && (
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetLink().run(); closeAll(); }}
                style={{ padding: "5px 10px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#aaa", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            )}
          </div>
        )}
      </div>

      {/* Image */}
      <div style={{ position: "relative" }}>
        <ToolBtn title="Insert Image" onClick={() => { closeAll(); setImageOpen(o => !o); }}>🖼</ToolBtn>
        {imageOpen && (
          <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 10, display: "flex", gap: 6, width: 300, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
            <input
              autoFocus value={imageUrl} onChange={e => setImageUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") insertImage(); if (e.key === "Escape") closeAll(); }}
              placeholder="https://example.com/image.png" style={{ flex: 1, padding: "5px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            <button type="button" onMouseDown={e => { e.preventDefault(); insertImage(); }}
              style={{ padding: "5px 10px", background: "#e8620a", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Insert</button>
          </div>
        )}
      </div>
      <Divider />

      {/* Merge variables */}
      <div style={{ position: "relative" }}>
        <ToolBtn title="Insert Personalization Variable" active={mergeOpen} onClick={() => { closeAll(); setMergeOpen(o => !o); }}>
          {"{{ }}"}
        </ToolBtn>
        {mergeOpen && (
          <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 100, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 6, width: 200, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 9, color: "#555", fontWeight: 700, textTransform: "uppercase", padding: "2px 6px 6px", letterSpacing: ".06em" }}>Personalization</div>
            {MERGE_VARS.map(v => (
              <button key={v.variable} type="button" onMouseDown={e => { e.preventDefault(); insertMerge(v.variable); }}
                style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "5px 8px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", borderRadius: 5, transition: "background 0.1s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                <span style={{ fontSize: 11, color: "#ccc" }}>{v.label}</span>
                <code style={{ fontSize: 10, color: "#e8620a", background: "rgba(232,98,10,0.1)", padding: "1px 4px", borderRadius: 3 }}>{v.variable}</code>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Editor CSS ────────────────────────────────────────────────────────────────

const EDITOR_CSS = `
.tiptap-editor .tiptap {
  outline: none;
  padding: 14px 16px;
  min-height: inherit;
  color: #e0e0e0;
  font-size: 13px;
  line-height: 1.8;
  font-family: inherit;
}
.tiptap-editor .tiptap p { margin: 0 0 10px; }
.tiptap-editor .tiptap h1 { font-size: 22px; font-weight: 800; color: #fff; margin: 16px 0 8px; }
.tiptap-editor .tiptap h2 { font-size: 18px; font-weight: 700; color: #fff; margin: 14px 0 6px; }
.tiptap-editor .tiptap h3 { font-size: 15px; font-weight: 700; color: #fff; margin: 12px 0 4px; }
.tiptap-editor .tiptap strong { color: #fff; font-weight: 700; }
.tiptap-editor .tiptap em { font-style: italic; color: #ddd; }
.tiptap-editor .tiptap u { text-decoration: underline; }
.tiptap-editor .tiptap s { text-decoration: line-through; color: #888; }
.tiptap-editor .tiptap a { color: #e8620a; text-decoration: underline; cursor: pointer; }
.tiptap-editor .tiptap ul { padding-left: 20px; margin: 6px 0 10px; }
.tiptap-editor .tiptap ol { padding-left: 20px; margin: 6px 0 10px; }
.tiptap-editor .tiptap li { margin-bottom: 3px; }
.tiptap-editor .tiptap blockquote { border-left: 3px solid #e8620a; padding-left: 12px; color: #999; margin: 10px 0; }
.tiptap-editor .tiptap hr { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 16px 0; }
.tiptap-editor .tiptap img { max-width: 100%; border-radius: 6px; margin: 8px 0; }
.tiptap-editor .tiptap table { border-collapse: collapse; width: 100%; margin: 12px 0; }
.tiptap-editor .tiptap td, .tiptap-editor .tiptap th { border: 1px solid rgba(255,255,255,0.12); padding: 6px 10px; text-align: left; }
.tiptap-editor .tiptap th { background: rgba(255,255,255,0.06); font-weight: 700; color: #fff; }
.tiptap-editor .tiptap .is-editor-empty::before { content: attr(data-placeholder); float: left; color: #444; pointer-events: none; height: 0; }
.tiptap-editor .tiptap mark { border-radius: 3px; padding: 1px 2px; }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function RichEmailEditor({ content, onChange, disabled, placeholder, minHeight = 300 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Write your email body here… Use the {{ }} button to insert personalization variables." }),
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getText());
    },
    editorProps: {
      attributes: { class: "tiptap" },
    },
  });

  // Sync external content changes (e.g. template selection)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <>
      <style>{EDITOR_CSS}</style>
      <div
        className="tiptap-editor"
        style={{
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          background: "rgba(255,255,255,0.03)",
          overflow: "hidden",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Toolbar editor={editor} />
        <div style={{ minHeight }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}

// ── Exported helpers ──────────────────────────────────────────────────────────

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export { MERGE_VARS };

// UltimateRichTextEditor.tsx
import { useEditor, EditorContent, Node, mergeAttributes } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Link } from "@tiptap/extension-link";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { CharacterCount } from "@tiptap/extension-character-count";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Typography } from "@tiptap/extension-typography";
import Youtube from "@tiptap/extension-youtube";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";

const sanitizeHTML = (html: string | null | undefined) =>
  DOMPurify.sanitize(html || "", {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "loading",
      "referrerpolicy",
      "style",
      "target",
      "rel",
    ],
  });

const lowlight = createLowlight(common);

// ── Custom: font-size support ─────────────────────────────────────────────
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

// ── Custom: code block with copy button ──────────────────────────────────
const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper relative group my-2";

      const copyBtn = document.createElement("button");
      copyBtn.textContent = "📋 Copy";
      copyBtn.type = "button";
      copyBtn.contentEditable = "false";
      copyBtn.className =
        "copy-code-btn absolute top-2 right-2 text-xs bg-gray-700 text-gray-200 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition z-10";
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(node.textContent);
        copyBtn.textContent = "✓ Copied";
        setTimeout(() => (copyBtn.textContent = "📋 Copy"), 1500);
      });

      const pre = document.createElement("pre");
      pre.className = "bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-sm";
      const code = document.createElement("code");
      pre.appendChild(code);
      wrapper.appendChild(copyBtn);
      wrapper.appendChild(pre);

      return { dom: wrapper, contentDOM: code };
    };
  },
});

// ── Custom: terminal block ────────────────────────────────────────────────
const TerminalBlock = Node.create({
  name: "terminalBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  parseHTML() {
    return [{ tag: "pre.terminal-block" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, {
        class:
          "terminal-block bg-black text-green-400 font-mono text-sm p-4 rounded-lg overflow-x-auto my-2",
      }),
      ["code", 0],
    ];
  },
  addCommands() {
    // Fix 1: cast to Record<string, any> to avoid type mismatch with RawCommands
    return {
      toggleTerminalBlock:
        () =>
        ({ commands }) =>
          commands.toggleNode(this.name, "paragraph"),
    } as Record<string, any>;
  },
});

// ── Custom: callout boxes ─────────────────────────────────────────────────
const CALLOUT_STYLES = {
  warning: { classes: "bg-amber-50 border-amber-400 text-amber-900", icon: "⚠️" },
  note: { classes: "bg-blue-50 border-blue-400 text-blue-900", icon: "📝" },
  tip: { classes: "bg-emerald-50 border-emerald-400 text-emerald-900", icon: "💡" },
};

const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      type: {
        default: "note",
        parseHTML: (el) => el.getAttribute("data-callout-type") || "note",
        renderHTML: (attrs) => ({ "data-callout-type": attrs.type }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout-type]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const style = CALLOUT_STYLES[node.attrs.type] || CALLOUT_STYLES.note;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `callout border-l-4 rounded-r-lg p-4 my-3 ${style.classes}`,
      }),
      [
        "div",
        { class: "font-bold text-xs uppercase mb-1 not-prose" },
        `${style.icon} ${node.attrs.type}`,
      ],
      ["div", { class: "callout-content" }, 0],
    ];
  },
  addCommands() {
    // Fix 2: cast to Record<string, any> and add type annotations for commands
    return {
      setCallout:
        (type: string) =>
        ({ commands }: { commands: any }) =>
          commands.wrapIn(this.name, { type }),
      unsetCallout:
        () =>
        ({ commands }: { commands: any }) =>
          commands.lift(this.name),
    } as Record<string, any>;
  },
});

// ── Stable Extension Array (Defined Outside Component) ───────────────────
const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    codeBlock: false, // Replaced by CodeBlockWithCopy
    link: false,      // Disabled here to avoid duplicate extension name conflicts
  }),
  FontSize,
  Color,
  Highlight.configure({ multicolor: true }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
  }),
  TextAlign.configure({
    types: ["heading", "paragraph"],
    alignments: ["left", "center", "right", "justify"],
  }),
  Image.configure({ inline: false, allowBase64: false }),
  CharacterCount.configure({ limit: 10000 }),
  Youtube.configure({
    width: 640,
    height: 360,
    HTMLAttributes: { class: "rounded-lg my-3 mx-auto" },
  }),
  CodeBlockWithCopy.configure({ lowlight }),
  TerminalBlock,
  Callout,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem.configure({ nested: true }),
  Typography,
].filter((ext, index, self) => index === self.findIndex((e) => e.name === ext.name));

export default function UltimateRichTextEditor({
  content,
  onChange,
  onImageUpload,
  compact = false,
}) {
  // ── UI state ────────────────────────────────────────────────────────────
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [fontSize, setFontSize] = useState("16");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCalloutMenu, setShowCalloutMenu] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState("saved");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: sanitizeHTML(content),
    editorProps: {
      attributes: {
        class: "prose prose-lg max-w-none focus:outline-none p-6 min-h-[300px] text-gray-800",
      },
    },
    onUpdate: ({ editor }) => {
      setAutoSaveStatus("typing...");
      if (onChange) onChange(editor.getHTML());
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setAutoSaveStatus("saved"), 1500);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = sanitizeHTML(content);
    if (incoming !== editor.getHTML()) {
      // Fix 3: setContent expects an options object, not boolean
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  // ── Toolbar helpers ─────────────────────────────────────────────────────
  const brandColors = [
    { name: "Navy Blue", value: "#1B2A6B" },
    { name: "Green", value: "#3AAA35" },
    { name: "Orange", value: "#F47920" },
    { name: "Red", value: "#FF0000" },
  ];
  const highlightColors = [
    { name: "Yellow", value: "#FEF08A" },
    { name: "Green", value: "#BBF7D0" },
    { name: "Blue", value: "#BFDBFE" },
    { name: "Pink", value: "#FBCFE8" },
    { name: "Purple", value: "#E9D5FF" },
    { name: "Red", value: "#FEE2E2" },
  ];
  const fontSizes = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
  const emojis = ["👉", "➡️", "✅", "😀", "😂", "😍", "🤔", "👍", "🎉", "❤️", "🔥", "✨", "⭐", "📚", "💡", "🚀", "💯"];
  const codeLanguages = ["bash", "python", "javascript", "typescript", "json", "yaml", "sql", "plaintext"];

  // ── Image handling ──────────────────────────────────────────────────────
  const addImage = () => {
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
      setImageUrl("");
      setShowImageModal(false);
    }
  };
  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!onImageUpload) {
      setShowImageModal(true);
      return;
    }
    setUploadingImage(true);
    try {
      const url = await onImageUpload(file);
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      } else {
        alert("Image upload failed. Please check the network or file size.");
      }
    } catch (err) {
      alert("Image upload error: " + (err.message || "Unknown error"));
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── YouTube embed ───────────────────────────────────────────────────────
  const addYoutube = () => {
    if (!youtubeUrl) return;
    try {
      editor.chain().focus().insertContent({ type: "youtube", attrs: { src: youtubeUrl } }).run();
    } catch (err) {
      editor.chain().focus().insertContent(`<p><a href="${youtubeUrl}" target="_blank" rel="noopener noreferrer">${youtubeUrl}</a></p>`).run();
    }
    setYoutubeUrl("");
    setShowYoutubeModal(false);
  };

  // ── Table insertion ────────────────────────────────────────────────────
  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: true }).run();
    setShowTableModal(false);
  };

  // ── Emoji picker ────────────────────────────────────────────────────────
  const addEmoji = (emoji) => {
    editor.chain().focus().insertContent(emoji).run();
    setShowEmojiPicker(false);
  };

  // ── Export / copy ──────────────────────────────────────────────────────
  const exportHTML = () => {
    const html = editor.getHTML();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.html";
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportJSON = () => {
    const json = editor.getJSON();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyHTML = () => {
    navigator.clipboard.writeText(editor.getHTML());
    alert("HTML copied to clipboard!");
  };

  const characterCount = editor.storage.characterCount?.characters() || 0;
  const characterLimit = 10000;
  const isNearLimit = characterCount > characterLimit * 0.9;

  return (
    <div className="relative border border-gray-200 rounded-xl overflow-hidden shadow-lg bg-white">
      {/* Auto-save indicator */}
      <div className="absolute top-2 right-2 z-30 bg-white px-2 py-1 rounded shadow text-xs border border-gray-100">
        {autoSaveStatus === "saved" && "✓ Saved"}
        {autoSaveStatus === "saving" && "💾 Saving..."}
        {autoSaveStatus === "typing..." && "✎ Typing..."}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-gray-50 sticky top-0 z-20 max-h-[300px] overflow-y-auto">
        <div className="flex gap-1">
          <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50" title="Undo">↶</button>
          <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50" title="Redo">↷</button>
        </div>
        <div className="w-px h-6 bg-gray-300" />

        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`px-3 py-1 rounded text-sm font-bold ${editor.isActive("bold") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`} title="Bold">B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`px-3 py-1 rounded text-sm italic ${editor.isActive("italic") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`} title="Italic">I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={`px-3 py-1 rounded text-sm line-through ${editor.isActive("strike") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`} title="Strikethrough">S</button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={`px-3 py-1 rounded text-sm font-mono ${editor.isActive("code") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`} title="Inline Code">&lt;/&gt;</button>

        {!compact && (
          <>
            <div className="w-px h-6 bg-gray-300" />
            <div className="relative">
              <button type="button" onClick={() => setShowFontSize(!showFontSize)} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">Size {fontSize}</button>
              {showFontSize && (
                <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg p-2 z-30 w-20">
                  {fontSizes.map((size) => (
                    <button
                      type="button"
                      key={size}
                      onClick={() => {
                        editor.chain().focus().setMark("textStyle", { fontSize: `${size}px` }).run();
                        // Fix 4: convert number to string
                        setFontSize(size.toString());
                        setShowFontSize(false);
                      }}
                      className="block w-full text-left px-2 py-1 hover:bg-gray-100 text-sm"
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="w-px h-6 bg-gray-300" />
        <select
          onChange={(e) => {
            const value = e.target.value;
            if (value === "paragraph") editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: parseInt(value) }).run();
          }}
          className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300"
          value={editor.isActive("heading") ? editor.getAttributes("heading").level : "paragraph"}
        >
          <option value="paragraph">Normal</option>
          <option value="1">H1</option>
          <option value="2">H2</option>
          <option value="3">H3</option>
          <option value="4">H4</option>
          <option value="5">H5</option>
          <option value="6">H6</option>
        </select>

        <div className="w-px h-6 bg-gray-300" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={`px-3 py-1 rounded text-sm ${editor.isActive("bulletList") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`} title="Bullet List">• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`px-3 py-1 rounded text-sm ${editor.isActive("orderedList") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`} title="Numbered List">1. List</button>
        {!compact && (
          <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} className={`px-3 py-1 rounded text-sm ${editor.isActive("taskList") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`} title="Task List">☑ Tasks</button>
        )}

        {!compact && (
          <>
            <div className="w-px h-6 bg-gray-300" />
            <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} className={`px-2 py-1 rounded text-sm ${editor.isActive({ textAlign: "left" }) ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}>←</button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} className={`px-2 py-1 rounded text-sm ${editor.isActive({ textAlign: "center" }) ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}>↔</button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()} className={`px-2 py-1 rounded text-sm ${editor.isActive({ textAlign: "right" }) ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}>→</button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign("justify").run()} className={`px-2 py-1 rounded text-sm ${editor.isActive({ textAlign: "justify" }) ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}>⇔</button>
            <div className="w-px h-6 bg-gray-300" />
            <button type="button" onClick={() => editor.chain().focus().sinkListItem("listItem").run()} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300" title="Indent">→</button>
            <button type="button" onClick={() => editor.chain().focus().liftListItem("listItem").run()} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300" title="Outdent">←</button>
          </>
        )}

        <div className="w-px h-6 bg-gray-300" />
        <button type="button" onClick={() => {
          const url = prompt("Enter URL:");
          if (!url) return;
          if (editor.state.selection.empty) {
            editor.chain().focus().insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`).run();
          } else {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }} className={`px-2 py-1 rounded text-sm ${editor.isActive("link") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}>🔗 Link</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50">{uploadingImage ? "⏳ Uploading..." : "🖼️ Upload Image"}</button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        <button type="button" onClick={() => setShowImageModal(true)} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">🔗 Image URL</button>
        <button type="button" onClick={() => setShowYoutubeModal(true)} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">▶️ YouTube</button>

        <select onChange={(e) => editor.chain().focus().toggleCodeBlock({ language: e.target.value }).run()} defaultValue="" className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300" title="Insert code block">
          <option value="" disabled>&lt;/&gt; Code</option>
          {codeLanguages.map((lang) => (<option key={lang} value={lang}>{lang}</option>))}
        </select>
        <button type="button" onClick={() => editor.chain().focus().toggleTerminalBlock().run()} className={`px-2 py-1 rounded text-sm ${editor.isActive("terminalBlock") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`} title="Terminal output block">💻 Terminal</button>

        <div className="relative">
          <button type="button" onClick={() => setShowCalloutMenu(!showCalloutMenu)} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">📌 Callout</button>
          {showCalloutMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-30 min-w-32">
              <button type="button" onClick={() => { editor.chain().focus().setCallout("warning").run(); setShowCalloutMenu(false); }} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">⚠️ Warning</button>
              <button type="button" onClick={() => { editor.chain().focus().setCallout("note").run(); setShowCalloutMenu(false); }} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">📝 Note</button>
              <button type="button" onClick={() => { editor.chain().focus().setCallout("tip").run(); setShowCalloutMenu(false); }} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">💡 Tip</button>
            </div>
          )}
        </div>

        {!compact && (
          <>
            <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`px-2 py-1 rounded text-sm ${editor.isActive("blockquote") ? "bg-cyan-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}>" Quote</button>
            <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">— HR</button>
            <button type="button" onClick={() => setShowTableModal(true)} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">📊 Table</button>
            {editor.isActive("table") && (
              <>
                <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()} className="px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300">Row ↑</button>
                <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300">Row ↓</button>
                <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()} className="px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300">Col ←</button>
                <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300">Col →</button>
                <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className="px-2 py-1 rounded text-xs bg-red-100 hover:bg-red-200">Delete Row</button>
                <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className="px-2 py-1 rounded text-xs bg-red-100 hover:bg-red-200">Delete Col</button>
              </>
            )}
          </>
        )}

        <div className="w-px h-6 bg-gray-300" />
        {!compact && (
          <>
            <div className="flex items-center gap-1">
              {brandColors.map((color) => (
                <button type="button" key={color.value} onClick={() => editor.chain().focus().setColor(color.value).run()} className="w-7 h-7 rounded-full border-2 border-gray-300 hover:scale-110 transition-transform" style={{ backgroundColor: color.value }} title={color.name} />
              ))}
            </div>
            <div className="flex items-center gap-1">
              {highlightColors.map((color) => (
                <button type="button" key={color.value} onClick={() => editor.chain().focus().toggleHighlight({ color: color.value }).run()} className="w-7 h-7 rounded border-2 border-gray-300 hover:scale-110 transition-transform" style={{ backgroundColor: color.value }} title={`Highlight ${color.name}`} />
              ))}
            </div>
            <input type="color" onInput={(e) => editor.chain().focus().setColor(e.target.value).run()} className="w-7 h-7 border rounded cursor-pointer" title="Custom color" />
            <button type="button" onClick={() => editor.chain().focus().unsetHighlight().run()} className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">Clear Highlight</button>
            <div className="relative">
              <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">😊 Emoji</button>
              {showEmojiPicker && (
                <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg p-2 z-30 w-64">
                  <div className="grid grid-cols-5 gap-1">
                    {emojis.map((emoji) => (<button type="button" key={emoji} onClick={() => addEmoji(emoji)} className="text-2xl p-2 hover:bg-gray-100 rounded">{emoji}</button>))}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} className="px-2 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">📥 Export</button>
              {showExportMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-30 min-w-32">
                  <button type="button" onClick={exportHTML} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Export as HTML</button>
                  <button type="button" onClick={exportJSON} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Export as JSON</button>
                  <button type="button" onClick={copyHTML} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Copy HTML</button>
                </div>
              )}
            </div>
          </>
        )}
        <button type="button" onClick={() => { editor.chain().focus().unsetAllMarks().run(); editor.chain().focus().unsetColor().run(); editor.chain().focus().unsetHighlight().run(); }} className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200" title="Clear all formatting">Clear All</button>
      </div>

      <EditorContent editor={editor} />

      {!compact && (
        <div className="flex justify-between items-center p-3 border-t bg-gray-50 text-xs text-gray-500">
          <div className="flex gap-4">
            <span>📝 Words: {editor.storage.characterCount?.words() || 0}</span>
            <span>🔤 Characters: {characterCount}</span>
            <span>📊 Paragraphs: {editor.state.doc.childCount}</span>
          </div>
          <div className={isNearLimit ? "text-orange-500 font-medium" : ""}>{characterCount} / {characterLimit} characters</div>
        </div>
      )}

      {/* Modals */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-bold mb-4">Add Image from URL</h3>
            <input type="text" placeholder="https://example.com/image.jpg" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="w-full border rounded px-3 py-2 mb-4 text-gray-900" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowImageModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button type="button" onClick={addImage} className="px-4 py-2 bg-cyan-600 text-white rounded">Add Image</button>
            </div>
          </div>
        </div>
      )}

      {showYoutubeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-bold mb-4">Embed YouTube Video</h3>
            <input type="text" placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} className="w-full border rounded px-3 py-2 mb-4 text-gray-900" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowYoutubeModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button type="button" onClick={addYoutube} className="px-4 py-2 bg-cyan-600 text-white rounded">Embed</button>
            </div>
          </div>
        </div>
      )}

      {showTableModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-bold mb-4">Insert Table</h3>
            <div className="mb-4">
              <label className="block text-sm mb-1">Rows</label>
              <input type="number" min="1" max="10" value={tableRows} onChange={(e) => setTableRows(parseInt(e.target.value))} className="w-full border rounded px-3 py-2 text-gray-900" />
            </div>
            <div className="mb-4">
              <label className="block text-sm mb-1">Columns</label>
              <input type="number" min="1" max="10" value={tableCols} onChange={(e) => setTableCols(parseInt(e.target.value))} className="w-full border rounded px-3 py-2 text-gray-900" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowTableModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button type="button" onClick={insertTable} className="px-4 py-2 bg-cyan-600 text-white rounded">Insert Table</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
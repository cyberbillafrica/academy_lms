import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useState } from 'react';
import { FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND, $getSelection, $isRangeSelection } from 'lexical';
import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { INSERT_CALLOUT_COMMAND, INSERT_IMAGE_COMMAND, INSERT_YOUTUBE_COMMAND, INSERT_TERMINAL_COMMAND } from '../commands';

const emojis = ["👉", "➡️", "✅", "⭐", "📌", "🔑", "⚠️", "💡", "🔥", "🚀", "💯", "🛡️", "🔒", "📡", "🔍"];

interface Props {
  onImageUpload: (file: File) => Promise<string | null>;
}

export default function ToolbarPlugin({ onImageUpload }: Props) {
  const [editor] = useLexicalComposerContext();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  const insertEmoji = (emoji: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertText(emoji);
      }
    });
    setShowEmojiPicker(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-gray-50 sticky top-0 z-20 overflow-x-auto">
      <button onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} className="px-3 py-1.5 rounded hover:bg-gray-200">↶ Undo</button>
      <button onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} className="px-3 py-1.5 rounded hover:bg-gray-200">↷ Redo</button>
      <div className="w-px h-8 bg-gray-300 mx-2" />
      <button onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} className="font-bold px-3 py-1 rounded hover:bg-gray-200">B</button>
      <button onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} className="italic px-3 py-1 rounded hover:bg-gray-200">I</button>
      <button onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} className="underline px-3 py-1 rounded hover:bg-gray-200">U</button>
      <div className="w-px h-8 bg-gray-300 mx-2" />
      <button onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} className="px-3 py-1 rounded hover:bg-gray-200">• List</button>
      <button onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} className="px-3 py-1 rounded hover:bg-gray-200">1. List</button>
      <div className="w-px h-8 bg-gray-300 mx-2" />
      <button onClick={() => editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'note')} className="px-3 py-1 rounded hover:bg-gray-200">📝 Note</button>
      <button onClick={() => editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'tip')} className="px-3 py-1 rounded hover:bg-gray-200">💡 Tip</button>
      <button onClick={() => editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'warning')} className="px-3 py-1 rounded hover:bg-gray-200">⚠️ Warning</button>
      <button onClick={() => editor.dispatchCommand(INSERT_TERMINAL_COMMAND, { content: "ps> Enter terminal output here..." })} className="px-3 py-1 rounded hover:bg-gray-200">💻 Terminal</button>
      <button onClick={() => {
        const url = prompt("Enter Image URL:");
        if (url) { editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src: url, alt: "" }); }
      }} className="px-3 py-1 rounded hover:bg-gray-200">🖼️ Image</button>
      <button onClick={() => {
        const url = prompt("Enter YouTube URL:");
        if (!url) return;
        const videoId = url.split("v=")[1] || url.split("/").pop();
        if (videoId) { editor.dispatchCommand(INSERT_YOUTUBE_COMMAND, { videoId }); }
      }} className="px-3 py-1 rounded hover:bg-gray-200">▶️ YouTube</button>
      <button onClick={() => setShowTableModal(true)} className="px-3 py-1 rounded hover:bg-gray-200">📊 Table</button>

      <div className="relative">
        <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="px-3 py-1 rounded hover:bg-gray-200">😊 Emoji</button>
        {showEmojiPicker && (
          <div className="absolute top-full left-0 mt-2 bg-white border rounded-xl shadow-xl p-3 grid grid-cols-6 gap-2 w-72 max-h-64 overflow-y-auto z-50">
            {emojis.map((emoji) => (
              <button key={emoji} onClick={() => insertEmoji(emoji)} className="text-2xl hover:bg-gray-100 p-2 rounded">{emoji}</button>
            ))}
          </div>
        )}
      </div>

      {showTableModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl p-6 w-96">
            <h3 className="font-bold text-lg mb-4">Insert Table</h3>
            <input type="number" value={tableRows} onChange={(e) => setTableRows(Number(e.target.value))} className="w-full border rounded px-3 py-2 mb-3" placeholder="Rows" />
            <input type="number" value={tableCols} onChange={(e) => setTableCols(Number(e.target.value))} className="w-full border rounded px-3 py-2" placeholder="Columns" />
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowTableModal(false)} className="px-5 py-2 text-gray-600">Cancel</button>
              <button onClick={() => {
                editor.dispatchCommand(INSERT_TABLE_COMMAND, { rows: tableRows, columns: tableCols, includeHeaders: true });
                setShowTableModal(false);
              }} className="bg-cyan-600 text-white px-6 py-2 rounded-xl">Insert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
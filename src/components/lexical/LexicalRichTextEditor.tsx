import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import CalloutPlugin from './plugins/CalloutPlugin';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { $getRoot, EditorState } from 'lexical';

// Nodes
import { ImageNode } from './nodes/ImageNode';
import { YouTubeNode } from './nodes/YouTubeNode';
import { CalloutNode } from './nodes/CalloutNode';
import { TerminalNode } from './nodes/TerminalNode';
import { CodeBlockNode } from './nodes/CodeBlockNode';

// Plugins
import ToolbarPlugin from './plugins/ToolbarPlugin';
import LoadContentPlugin from './plugins/LoadContentPlugin';
import ImagePlugin from './plugins/ImagePlugin';
import YouTubePlugin from './plugins/YouTubePlugin';
import TerminalPlugin from './plugins/TerminalPlugin';
import TablePlugin from './plugins/TablePlugin';

interface Props {
  content: string; // Lexical JSON string from database
  onChange: (json: string) => void;
  onImageUpload: (file: File) => Promise<string | null>;
  compact?: boolean;
}

export default function LexicalRichTextEditor({
  content,
  onChange,
  onImageUpload,
  compact = false,
}: Props) {
  const [charCount, setCharCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [autoSaveStatus, setAutoSaveStatus] =
    useState<'saved' | 'typing'>('saved');

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const initialConfig = useMemo(
    () => ({
      namespace: 'CyberLMS-Editor',

      theme: {
        paragraph: 'mb-4',

        heading: {
          h1: 'text-3xl font-bold my-6',
          h2: 'text-2xl font-bold my-5',
          h3: 'text-xl font-semibold my-4',
        },

        list: {
          ul: 'list-disc pl-6 my-3',
          ol: 'list-decimal pl-6 my-3',
        },

        quote:
          'border-l-4 border-gray-300 pl-4 italic my-4 text-gray-700',

        text: {
          bold: 'font-bold',
          italic: 'italic',
          underline: 'underline',
          strikethrough: 'line-through',
          code:
            'bg-gray-100 rounded px-1 py-0.5 font-mono text-sm',
        },

        code:
          'bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm my-4 overflow-x-auto',
      },

      nodes: [
        ImageNode,
        YouTubeNode,
        CalloutNode,
        TerminalNode,
        CodeBlockNode,
      ],

      onError(error: Error) {
        console.error('Lexical Error:', error);
      },
    }),
    []
  );


  const handleChange = useCallback(
    (editorState: EditorState) => {
      setAutoSaveStatus('typing');

      // Save Lexical JSON
      const json = JSON.stringify(editorState.toJSON());

      onChange(json);


      editorState.read(() => {
        const text = $getRoot().getTextContent();

        const trimmed = text.trim();

        setCharCount(text.length);

        setWordCount(
          trimmed.length === 0
            ? 0
            : trimmed.split(/\s+/).length
        );
      });


      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        setAutoSaveStatus('saved');
      }, 800);
    },
    [onChange]
  );


  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);


  return (
    <div className="relative border border-gray-300 rounded-2xl overflow-hidden bg-white shadow-sm">

      {/* Save Status */}
      <div className="absolute top-4 right-4 z-50 bg-white/95 px-3 py-1 text-xs rounded border shadow font-medium">
        {autoSaveStatus === 'saved'
          ? '✓ Saved'
          : '✎ Saving...'}
      </div>


      <LexicalComposer initialConfig={initialConfig}>

        <ToolbarPlugin onImageUpload={onImageUpload} />


        <div
          className={`relative ${
            compact
              ? 'min-h-[280px]'
              : 'min-h-[520px]'
          }`}
        >

          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="
                  p-8
                  focus:outline-none
                  min-h-[400px]
                  prose
                  prose-lg
                  max-w-none
                  text-gray-800
                "
              />
            }

            placeholder={
              <div className="absolute top-8 left-8 text-gray-400 pointer-events-none">
                Write your lesson content here...
              </div>
            }

            ErrorBoundary={LexicalErrorBoundary}
          />


          <HistoryPlugin />

          <AutoFocusPlugin />


          {/* Restore saved JSON */}
          <LoadContentPlugin content={content} />


          {/* Save changes */}
          <OnChangePlugin onChange={handleChange} />


          <ImagePlugin onImageUpload={onImageUpload} />

          <CalloutPlugin />
          <YouTubePlugin />

          <TerminalPlugin />

          <TablePlugin />


        </div>



        {!compact && (
          <div className="border-t bg-gray-50 px-6 py-3 text-xs text-gray-500 flex justify-between">

            <div>
              Words:
              <strong className="ml-1">
                {wordCount}
              </strong>

              <span className="mx-2">
                •
              </span>

              Characters:
              <strong className="ml-1">
                {charCount}
              </strong>
            </div>


            <div className="text-emerald-600">
              Auto-save enabled
            </div>

          </div>
        )}

      </LexicalComposer>

    </div>
  );
}
import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

interface LoadContentPluginProps {
  content?: string | null;
}

export default function LoadContentPlugin({
  content,
}: LoadContentPluginProps) {
  const [editor] = useLexicalComposerContext();

  // Prevent reloading after the first successful initialization
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;

    // New lesson (no content yet)
    if (!content || content.trim() === "") {
      hasLoadedRef.current = true;
      return;
    }

    try {
      const editorState = editor.parseEditorState(content);

      editor.setEditorState(editorState);

      hasLoadedRef.current = true;
    } catch (error) {
      console.error(
        "Failed to restore Lexical editor state:",
        error
      );

      // Don't repeatedly attempt to load invalid JSON
      hasLoadedRef.current = true;
    }
  }, [editor, content]);

  return null;
}
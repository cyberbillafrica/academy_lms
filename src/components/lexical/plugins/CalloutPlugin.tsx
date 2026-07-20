import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';
import { INSERT_CALLOUT_COMMAND } from '../commands';
import { $createCalloutNode } from '../nodes/CalloutNode';

export default function CalloutPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerCommand(
      INSERT_CALLOUT_COMMAND,
      (type) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const node = $createCalloutNode(type, 'Enter your callout message here...');
            selection.insertNodes([node]);
          }
        });
        return true;
      },
      1
    );
  }, [editor]);
  return null;
}
import { DecoratorNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import { ReactNode } from 'react';

export type CalloutType = 'note' | 'tip' | 'warning';

export type SerializedCalloutNode = Spread<{
  type: 'callout';
  version: 1;
  calloutType: CalloutType;
  content: string;
}, SerializedLexicalNode>;

const styles = {
  note: { classes: 'bg-blue-50 border-l-4 border-blue-500 text-blue-900', icon: '📝' },
  tip: { classes: 'bg-emerald-50 border-l-4 border-emerald-500 text-emerald-900', icon: '💡' },
  warning: { classes: 'bg-amber-50 border-l-4 border-amber-500 text-amber-900', icon: '⚠️' },
};

export class CalloutNode extends DecoratorNode<ReactNode> {
  __type: CalloutType;
  __content: string;

  constructor(type: CalloutType, content: string, key?: NodeKey) {
    super(key);
    this.__type = type;
    this.__content = content;
  }

  static getType(): string { return 'callout'; }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__type, node.__content, node.__key);
  }

  static importJSON(serializedNode: SerializedCalloutNode): CalloutNode {
    return new CalloutNode(serializedNode.calloutType, serializedNode.content);
  }

  exportJSON(): SerializedCalloutNode {
    return {
      type: 'callout',
      version: 1,
      calloutType: this.__type,
      content: this.__content,
    };
  }

  createDOM(): HTMLElement { return document.createElement('div'); }
  updateDOM(): false { return false; }

  decorate(): ReactNode {
    const style = styles[this.__type] || styles.note;
    return (
      <div className={`p-5 my-6 rounded-r-xl ${style.classes}`}>
        <div className="flex items-center gap-2 font-bold text-sm mb-2">
          <span>{style.icon}</span>
          <span className="uppercase tracking-wider">{this.__type}</span>
        </div>
        <div dangerouslySetInnerHTML={{ __html: this.__content }} />
      </div>
    );
  }
}

export const $createCalloutNode = (type: CalloutType, content = 'Enter callout text...') =>
  new CalloutNode(type, content);

export const $isCalloutNode = (node: unknown): node is CalloutNode =>
  node instanceof CalloutNode;
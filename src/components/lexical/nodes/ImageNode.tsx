import { DecoratorNode } from 'lexical';
import type { NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import type { ReactNode } from 'react';

export type ImageSource = 'upload' | 'external';

export type SerializedImageNode = Spread<
  {
    type: 'image';
    version: 1;
    src: string;
    alt: string;
    caption?: string;
    source: ImageSource;
    storagePath?: string | null;
    width?: number;
    height?: number;
  },
  SerializedLexicalNode
>;

export class ImageNode extends DecoratorNode<ReactNode> {
  __src: string;
  __alt: string;
  __caption: string;
  __source: ImageSource;
  __storagePath: string | null;
  __width?: number;
  __height?: number;

  constructor(
    src: string,
    alt = '',
    caption = '',
    source: ImageSource = 'external',
    storagePath: string | null = null,
    width?: number,
    height?: number,
    key?: NodeKey
  ) {
    super(key);

    this.__src = src;
    this.__alt = alt;
    this.__caption = caption;
    this.__source = source;
    this.__storagePath = storagePath;
    this.__width = width;
    this.__height = height;
  }

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__alt,
      node.__caption,
      node.__source,
      node.__storagePath,
      node.__width,
      node.__height,
      node.__key
    );
  }

  static importJSON(node: SerializedImageNode): ImageNode {
    return new ImageNode(
      node.src,
      node.alt,
      node.caption ?? '',
      node.source,
      node.storagePath ?? null,
      node.width,
      node.height
    );
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      alt: this.__alt,
      caption: this.__caption,
      source: this.__source,
      storagePath: this.__storagePath,
      width: this.__width,
      height: this.__height,
    };
  }

  createDOM(): HTMLElement {
    return document.createElement('div');
  }

  updateDOM(): false {
    return false;
  }

  decorate(): ReactNode {
    return (
      <figure className="my-6">
        <img
          src={this.__src}
          alt={this.__alt}
          width={this.__width}
          height={this.__height}
          loading="lazy"
          className="max-w-full h-auto rounded-xl shadow-md mx-auto"
        />

        {this.__caption && (
          <figcaption className="mt-2 text-center text-sm text-gray-500 italic">
            {this.__caption}
          </figcaption>
        )}
      </figure>
    );
  }
}

export function $createImageNode(
  src: string,
  alt = '',
  caption = '',
  source: ImageSource = 'external',
  storagePath: string | null = null,
  width?: number,
  height?: number
): ImageNode {
  return new ImageNode(
    src,
    alt,
    caption,
    source,
    storagePath,
    width,
    height
  );
}

export function $isImageNode(node: unknown): node is ImageNode {
  return node instanceof ImageNode;
}


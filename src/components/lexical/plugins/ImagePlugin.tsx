import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef, useState } from 'react';
import { COMMAND_PRIORITY_EDITOR, $getSelection, $isRangeSelection } from 'lexical';
import { INSERT_IMAGE_COMMAND } from '../commands';
import { $createImageNode } from '../nodes/ImageNode';

export interface UploadedImage {
  url: string;
  storagePath: string | null;
}

interface Props {
  onImageUpload: (file: File) => Promise<UploadedImage | null>;
}

export default function ImagePlugin({ onImageUpload }: Props) {
  const [editor] = useLexicalComposerContext();

  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [imageUrl, setImageUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_IMAGE_COMMAND,
      () => {
        setShowModal(true);
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  const resetForm = () => {
    setImageUrl('');
    setAlt('');
    setCaption('');
    setShowModal(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getImageDimensions = (src: string) =>
    new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();

      img.onload = () =>
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });

      img.onerror = () =>
        resolve({
          width: undefined as any,
          height: undefined as any,
        });

      img.src = src;
    });

  const insertImage = async (
    src: string,
    source: 'upload' | 'external',
    storagePath: string | null = null
  ) => {
    const { width, height } = await getImageDimensions(src);

    editor.update(() => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection)) return;

      selection.insertNodes([
        $createImageNode(
          src,
          alt,
          caption,
          source,
          storagePath,
          width,
          height
        ),
      ]);
    });

    resetForm();
  };

  const uploadImage = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image.');
      return;
    }

    setUploading(true);

    try {
      const uploaded = await onImageUpload(file);

      if (!uploaded) {
        alert('Image upload failed.');
        return;
      }

      await insertImage(
        uploaded.url,
        'upload',
        uploaded.storagePath
      );
    } catch (err: any) {
      alert(err.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const insertExternalImage = async () => {
    if (!imageUrl.trim()) return;

    await insertImage(
      imageUrl.trim(),
      'external',
      null
    );
  };

  return (
    <>
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
          <div className="w-[420px] rounded-2xl bg-white p-6 shadow-xl">

            <h3 className="mb-5 text-xl font-semibold">
              Insert Image
            </h3>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mb-5 w-full rounded-xl bg-blue-600 py-2 text-white"
            >
              {uploading ? 'Uploading...' : 'Upload From Device'}
            </button>

            <input
              hidden
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={uploadImage}
            />

            <div className="my-4 text-center text-gray-400">
              OR
            </div>

            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.png"
              className="mb-3 w-full rounded-lg border px-3 py-2"
            />

            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Alt text (recommended)"
              className="mb-3 w-full rounded-lg border px-3 py-2"
            />

            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional)"
              className="w-full rounded-lg border px-3 py-2"
            />

            <div className="mt-6 flex justify-end gap-3">

              <button
                onClick={resetForm}
                className="rounded-lg px-4 py-2 text-gray-600"
              >
                Cancel
              </button>

              <button
                onClick={insertExternalImage}
                disabled={!imageUrl.trim()}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-white"
              >
                Insert
              </button>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
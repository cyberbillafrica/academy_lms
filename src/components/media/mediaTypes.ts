export type MediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'text'
  | 'other';

export type MediaSource = 'upload' | 'external';

export interface UploadedMedia {
  id?: string;

  type: MediaType;

  source: MediaSource;

  url: string;

  storagePath: string | null;

  filename: string;

  mimeType: string;

  size: number;

  width?: number;

  height?: number;

  alt?: string;

  caption?: string;

  uploadedAt?: string;
}

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml'
];

export const ACCEPTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg'
];

export const ACCEPTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg'
];

export const ACCEPTED_DOCUMENT_TYPES = [
  'application/pdf',

  'application/msword',

  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  'application/vnd.ms-excel',

  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  'application/vnd.ms-powerpoint',

  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  'application/zip',

  'application/x-rar-compressed',

  'text/plain',

  'application/json'
];

export const ALL_SUPPORTED_TYPES = [

  ...ACCEPTED_IMAGE_TYPES,

  ...ACCEPTED_VIDEO_TYPES,

  ...ACCEPTED_AUDIO_TYPES,

  ...ACCEPTED_DOCUMENT_TYPES

];

export function getMediaType(mimeType: string): MediaType {

  if (mimeType.startsWith('image/')) return 'image';

  if (mimeType.startsWith('video/')) return 'video';

  if (mimeType.startsWith('audio/')) return 'audio';

  if (mimeType === 'application/pdf') return 'pdf';

  if (
    mimeType.includes('word')
  ) return 'document';

  if (
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheet')
  ) return 'spreadsheet';

  if (
    mimeType.includes('presentation') ||
    mimeType.includes('powerpoint')
  ) return 'presentation';

  if (
    mimeType.includes('zip') ||
    mimeType.includes('rar')
  ) return 'archive';

  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json'
  ) return 'text';

  return 'other';

}

export function formatFileSize(bytes: number) {

  if (bytes < 1024)

    return `${bytes} B`;

  if (bytes < 1024 * 1024)

    return `${(bytes / 1024).toFixed(1)} KB`;

  if (bytes < 1024 * 1024 * 1024)

    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;

}
import { createCommand } from 'lexical';

export type CalloutType = 'note' | 'tip' | 'warning';

export interface ImagePayload { src: string; alt?: string; }
export interface YouTubePayload { videoId: string; }
export interface TerminalPayload { content: string; }

export const INSERT_CALLOUT_COMMAND = createCommand<CalloutType>();
export const INSERT_IMAGE_COMMAND = createCommand<ImagePayload>();
export const INSERT_YOUTUBE_COMMAND = createCommand<YouTubePayload>();
export const INSERT_TERMINAL_COMMAND = createCommand<TerminalPayload>();
export const INSERT_CODE_BLOCK_COMMAND = createCommand<string>();
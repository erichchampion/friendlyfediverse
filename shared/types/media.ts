/**
 * Media attachment type definitions
 * Shared between web and React Native apps
 */

export interface MediaAttachment {
  id: string;
  type: "image" | "video" | "gifv" | "audio" | "unknown";
  url: string;
  previewUrl: string;
  description: string | null;
  blurhash?: string | null;
  meta?: MediaMeta;
}

export interface MediaMeta {
  original?: MediaDimensions;
  small?: MediaDimensions;
  focus?: {
    x: number;
    y: number;
  };
}

export interface MediaDimensions {
  width?: number;
  height?: number;
  size?: string;
  aspect?: number;
  duration?: number; // For video/audio
  bitrate?: number; // For video/audio
}

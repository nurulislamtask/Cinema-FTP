import { registerPlugin } from '@capacitor/core';

export interface NativePlayerSubtitle {
  url: string;
  label: string;
  lang?: string;
}
export interface NativePlayerItem {
  url: string;
  title: string;
  query?: string; // clean title used to find online subtitles
  year?: number;
  season?: number;
  episode?: number;
  subtitles?: NativePlayerSubtitle[];
}
export interface NativePlayerResult {
  index: number;
  position: number; // seconds
  duration: number; // seconds
  error?: string;
}

/** Android only: full-screen ExoPlayer with MX-Player-style gestures (see android-native/java). */
export const NativePlayer = registerPlugin<{
  play(options: { items: NativePlayerItem[]; index: number; position: number; software?: boolean }): Promise<NativePlayerResult>;
  frame(options: { url: string }): Promise<{ data: string }>;
  installUpdate(options: { url: string }): Promise<void>;
}>('NativePlayer');

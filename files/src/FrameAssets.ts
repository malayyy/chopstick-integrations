/**
 * Preloaded compressed frame assets for scroll-controlled animation.
 * The renderer selects the desktop or mobile WebP variant for each frame.
 */

const frameBlobs = new Map<number, Blob>();
const frameObjectUrls = new Map<number, string>();
const predecodedFrames = new Map<number, ImageBitmap>();
const sharedBitmaps = new WeakSet<ImageBitmap>();

export function getPreloadedFrameBlob(index: number): Blob | undefined {
  return frameBlobs.get(index);
}

export function getPreloadedFrameUrl(index: number): string | undefined {
  return frameObjectUrls.get(index);
}

export function getPredecodedFrameBitmap(index: number): ImageBitmap | undefined {
  return predecodedFrames.get(index);
}

export function isSharedPredecodedBitmap(bitmap: ImageBitmap): boolean {
  return sharedBitmaps.has(bitmap);
}

export interface FramePreloadOptions {
  totalFrames: number;
  concurrency: number;
  signal: AbortSignal;
  useMobileFrames?: boolean;
  onProgress: (completed: number, total: number) => void;
}

function getFramePath(index: number, useMobileFrames: boolean): string {
  const filename = `ezgif-frame-${String(index).padStart(3, '0')}.webp`;
  return useMobileFrames
    ? `/frames-mobile/${filename}`
    : `/frames-desktop/${filename}`;
}

export async function preloadFrameSequence({
  totalFrames,
  concurrency,
  signal,
  useMobileFrames = false,
  onProgress,
}: FramePreloadOptions): Promise<number[]> {
  let nextFrame = 1;
  let completed = 0;
  const failures: number[] = [];

  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const frame = nextFrame++;
      if (frame > totalFrames) return;

      let succeeded = frameBlobs.has(frame) || predecodedFrames.has(frame);
      if (!succeeded) {
        for (let attempt = 0; attempt < 3 && !signal.aborted; attempt += 1) {
          try {
            const expectedType = 'image/webp';
            const filename = `ezgif-frame-${String(frame).padStart(3, '0')}.webp`;
            const path = useMobileFrames
              ? `/frames-mobile/${filename}`
              : `/frames-desktop/${filename}`;
            const response = await fetch(path, { cache: 'force-cache', signal });
            if (!response.ok) throw new Error(`Frame ${frame} returned HTTP ${response.status}`);
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.toLowerCase().includes(expectedType)) {
              throw new Error(`Frame ${frame} returned unexpected content type: ${contentType || 'unknown'}`);
            }
            const blob = await response.blob();
            if (signal.aborted) return;
            frameBlobs.set(frame, blob);
            const previousUrl = frameObjectUrls.get(frame);
            if (previousUrl) URL.revokeObjectURL(previousUrl);
            frameObjectUrls.set(frame, URL.createObjectURL(blob));
            succeeded = true;
            break;
          } catch (error) {
            if (signal.aborted) return;
            if (attempt === 2) console.error('Unable to preload cinematic frame', frame, error);
          }
        }
      }
      if (!succeeded) failures.push(frame);
      completed += 1;
      onProgress(completed, totalFrames);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, totalFrames)) }, () => worker()));
  return failures;
}

export interface FrameDecodeOptions {
  totalFrames: number;
  concurrency: number;
  signal: AbortSignal;
  onProgress: (completed: number, total: number) => void;
}

export async function predecodeFrameSequence({
  totalFrames,
  concurrency,
  signal,
  onProgress,
}: FrameDecodeOptions): Promise<number[]> {
  let nextFrame = 1;
  let completed = 0;
  const failures: number[] = [];

  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const frame = nextFrame++;
      if (frame > totalFrames) return;
      if (!predecodedFrames.has(frame)) {
        const blob = frameBlobs.get(frame);
        if (!blob || typeof createImageBitmap !== 'function') {
          failures.push(frame);
        } else {
          try {
            const bitmap = await createImageBitmap(blob);
            if (signal.aborted) {
              bitmap.close();
              return;
            }
            predecodedFrames.set(frame, bitmap);
            sharedBitmaps.add(bitmap);
            frameBlobs.delete(frame);
            const objectUrl = frameObjectUrls.get(frame);
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            frameObjectUrls.delete(frame);
          } catch (error) {
            console.error('Unable to pre-decode animation frame', frame, error);
            failures.push(frame);
          }
        }
      }
      completed += 1;
      onProgress(completed, totalFrames);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, totalFrames)) }, () => worker()));
  return failures;
}

export function releasePreloadedFrameSequence(): void {
  for (const objectUrl of frameObjectUrls.values()) URL.revokeObjectURL(objectUrl);
  frameObjectUrls.clear();
  frameBlobs.clear();
  for (const bitmap of predecodedFrames.values()) bitmap.close();
  predecodedFrames.clear();
}

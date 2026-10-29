/**
 * Download all required frame assets before showing the intro. On phones the
 * compressed 400×225 WebP frames are decoded during the loader and held as
 * ImageBitmaps, so scroll events never have to wait for image decoding.
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
  const filename = `ezgif-frame-${String(index).padStart(3, '0')}`;
  return useMobileFrames
    ? `/frames-mobile/${filename}.webp`
    : `/${filename}.jpg`;
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
      const frame = nextFrame;
      nextFrame += 1;
      if (frame > totalFrames) return;

      let succeeded = frameBlobs.has(frame) || predecodedFrames.has(frame);
      if (!succeeded) {
        for (let attempt = 0; attempt < 3 && !signal.aborted; attempt += 1) {
          try {
            const response = await fetch(getFramePath(frame, useMobileFrames), {
              cache: 'force-cache',
              signal,
            });
            if (!response.ok) {
              throw new Error(`Frame ${frame} returned HTTP ${response.status}`);
            }
            const contentType = response.headers.get('content-type') || '';
            const expectedType = useMobileFrames ? 'image/webp' : 'image/jpeg';
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

  const workerCount = Math.max(1, Math.min(concurrency, totalFrames));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
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
      const frame = nextFrame;
      nextFrame += 1;
      if (frame > totalFrames) return;

      if (!predecodedFrames.has(frame)) {
        const blob = frameBlobs.get(frame);
        if (!blob || typeof createImageBitmap !== 'function') {
          failures.push(frame);
        } else {
          try {
            // Source files are already phone-sized WebP; decode at native size.
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
            console.error('Unable to pre-decode mobile frame', frame, error);
            failures.push(frame);
          }
        }
      }

      completed += 1;
      onProgress(completed, totalFrames);
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, totalFrames));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return failures;
}

export function releasePreloadedFrameSequence(): void {
  for (const objectUrl of frameObjectUrls.values()) URL.revokeObjectURL(objectUrl);
  frameObjectUrls.clear();
  frameBlobs.clear();
  for (const bitmap of predecodedFrames.values()) bitmap.close();
  predecodedFrames.clear();
}

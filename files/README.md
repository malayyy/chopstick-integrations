# Chopstick Integrations — full runnable project

The ZIP is deliberately organized into **two top-level folders only**:

- `frames/` — 300 numbered JPEG frames consumed by the animation.
- `files/` — the complete Vite + React + TypeScript app, config, instructions, and original video backup.

## Run on your Mac

1. Unzip `Chopstick-Integrations.zip` somewhere convenient, such as Downloads.
2. Open Terminal and move into the `files` folder. Example:

   ```bash
   cd ~/Downloads/Chopstick-Integrations/files
   ```

3. Install packages (first run only):

   ```bash
   npm install
   ```

4. Start the local website:

   ```bash
   npm run dev
   ```

5. Open the URL shown in Terminal. It will normally be `http://127.0.0.1:3000`. If port 3000 is already occupied, Vite will print another port (often 3001).

Stop the server with `Control+C` in Terminal.

## Build the production version

From this `files` folder:

```bash
npm run build
```

The Vite config serves `../frames/` as the frame endpoint during development and copies all 300 frames into `files/dist/` during production builds. No manual copying or renaming is required.

## What's included

- `src/App.tsx` — canvas and scroll application lifecycle.
- `src/FrameRenderer.ts` — synchronized sharp foreground + blurred full-viewport background, bounded cache and limited concurrent loads.
- `src/ScrollController.ts` — native scroll progress, supporting forward and reverse scrubbing.
- `src/Timeline.ts` — maps progress to frames 1–300.
- `src/PerformanceController.ts` — device-aware cache and pixel-ratio limits.
- `source/hero-scrub-original.mp4` — the supplied source clip, kept for safekeeping.

## Frame resolution note

The uploaded MP4 is 1920×1080, 30 fps, 300 frames, 10 seconds. The included frame images are 3840×2160 JPGs made with high-quality Lanczos resizing from that video. They are **4K-sized upscaled frames, not AI detail reconstruction**; resizing cannot recover detail missing from the source clip. The original MP4 is included so you can re-extract frames if needed.

## Replacing frames later

Keep the exact filenames `ezgif-frame-001.jpg` through `ezgif-frame-300.jpg`. Make a backup before replacing them. The scroll controller and timeline don't need changes when you replace the image files.

## Optional: regenerate frames

If you have FFmpeg installed, `bash tools/extract-frames.sh` from the `files` folder creates a separate `frames-regenerated/` sibling directory. It intentionally refuses to overwrite the included working `frames/` directory.

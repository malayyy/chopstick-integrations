# Hero frame quality investigation

## Findings

- The scroll hero renders a 300-frame canvas sequence, not the original MP4 at runtime.
- The repository README says the bundled frame sequence is 3840x2160 JPEGs resized from a 1920x1080 H.264 source. That is 4K-sized upscaling, not additional source detail.
- The build script previously resized those frames to 2560x1440 WebP for desktop at quality 88 and 960x540 WebP for mobile at quality 84.
- Desktop now exports the desktop variant at 3840x2160 WebP quality 94 (for the source image's dimensions) and keeps mobile at 960x540 quality 86. This avoids an unnecessary downscale of the 4K-sized frames and raises lossy-compression quality. It cannot recover detail absent from the original 1080p source.
- The client frame paths now consistently request the corresponding desktop/mobile WebP variant.

## Important validation note

These changes are on `fix/hero-frame-quality`; the production `main` branch was not changed. The generated `public/frames-desktop` and `public/frames-mobile` folders are build artifacts and are intentionally ignored by Git. A build must run `npm run build` (which runs the frame generation script) before the revised sequence exists in `dist`.

Visual quality should be reviewed at real browser viewport sizes after the build. Do not describe the resulting frames as native 4K source footage: they are resized frames derived from 1080p video.

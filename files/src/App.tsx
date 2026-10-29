import { useEffect, useRef } from 'react';
import { FrameRenderer } from './FrameRenderer';
import { PerformanceController } from './PerformanceController';
import { ScrollController } from './ScrollController';
import { Timeline } from './Timeline';

export default function App() {
  const atmosphereRef = useRef<HTMLCanvasElement>(null);
  const compositionRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const atmosphere = atmosphereRef.current;
    const composition = compositionRef.current;
    if (!atmosphere || !composition) return;

    const renderer = new FrameRenderer(
      atmosphere,
      composition,
      Timeline.TOTAL_FRAMES,
      PerformanceController.getOptimalCacheSize(),
    );

    let rafId: number | null = null;
    let latestFrame = 1;

    const requestRender = (progress: number) => {
      latestFrame = Timeline.getState(progress).targetFrame;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        renderer.render(latestFrame);
      });
    };

    const scrollController = new ScrollController({ onProgress: requestRender });

    const handleResize = () => {
      renderer.resize();
      requestRender(scrollController.getProgress());
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('pageshow', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true });

    return () => {
      scrollController.destroy();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pageshow', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      renderer.destroy();
    };
  }, []);

  return (
    <main className="experience" aria-label="Chopstick Integrations cinematic reveal">
      <canvas ref={atmosphereRef} className="atmosphere-canvas" aria-hidden="true" />
      <canvas
        ref={compositionRef}
        className="composition-canvas"
        aria-label="Chopstick Integrations cinematic animation. Scroll to move through the sequence."
      />
      <div className="scroll-track" aria-hidden="true" />
    </main>
  );
}

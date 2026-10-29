import { useEffect, useRef } from 'react';
import { FrameRenderer } from './FrameRenderer';
import { PerformanceController } from './PerformanceController';
import { ScrollController } from './ScrollController';
import { Timeline } from './Timeline';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new FrameRenderer(
      canvas,
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

    return () => {
      scrollController.destroy();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pageshow', handleResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      renderer.destroy();
    };
  }, []);

  return (
    <main className="experience" aria-label="Chopstick Integrations cinematic reveal">
      <canvas ref={canvasRef} className="composition-canvas" aria-label="Cinematic Chopstick Integrations animation" />
      <div className="scroll-track" aria-hidden="true" />
    </main>
  );
}

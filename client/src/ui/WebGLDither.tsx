import { useEffect, useRef, useState } from "react";
import Dither, { type DitherProps } from "../reactbits/Dither.js";

export function WebGLDither(props: DitherProps) {
  const [available, setAvailable] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const probe = document.createElement("canvas");
        const context = probe.getContext("webgl2");
        const healthy = Boolean(context && !context.isContextLost());
        context?.getExtension("WEBGL_lose_context")?.loseContext();
        setAvailable(healthy);
      } catch {
        setAvailable(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!available) return;
    const canvas = host.current?.querySelector("canvas");
    if (!canvas) return;
    const context = canvas.getContext("webgl2");
    if (!context || context.isContextLost()) {
      const frame = requestAnimationFrame(() => setAvailable(false));
      return () => cancelAnimationFrame(frame);
    }
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setAvailable(false);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    return () => canvas.removeEventListener("webglcontextlost", onContextLost);
  }, [available]);

  return <div className="webgl-dither" ref={host}>{available ? <Dither {...props} /> : null}</div>;
}

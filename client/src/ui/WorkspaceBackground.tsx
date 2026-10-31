import { WebGLDither } from "./WebGLDither.js";

export function WorkspaceBackground() {
  return (
    <div className="app-shell__background" aria-hidden="true">
      <WebGLDither
        waveColor="#4c8e61"
        backgroundColor="#f5f7f2"
        palette={["#f7fbf4", "#e4f2dd", "#b9dfb4", "#8fc896"]}
        colorNum={4}
        pixelSize={5}
        waveSpeed={0.055}
        waveFrequency={3.1}
        waveAmplitude={0.28}
        ditherMode="bayer4"
        enableMouseInteraction={false}
        clickRipple={false}
        intro={false}
        dpr={1}
      />
    </div>
  );
}

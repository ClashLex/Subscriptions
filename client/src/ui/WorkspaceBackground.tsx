import Dither from "../reactbits/Dither.js";

export function WorkspaceBackground() {
  return (
    <div className="app-shell__background" aria-hidden="true">
      <Dither
        waveColor="#75a97a"
        backgroundColor="#f5f7f2"
        palette={["#f5f7f2", "#eaf3e6", "#d8e9d5", "#bfdac2"]}
        colorNum={4}
        pixelSize={7}
        waveSpeed={0.012}
        waveFrequency={2.3}
        waveAmplitude={0.18}
        ditherMode="bayer4"
        enableMouseInteraction={false}
        clickRipple={false}
        intro={false}
        dpr={1}
      />
    </div>
  );
}

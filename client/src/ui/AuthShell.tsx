import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Dither from "../reactbits/Dither.js";
import { BrandMark } from "./BrandMark.js";

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-shell__form-side">
        <Link className="auth-shell__brand" to="/" aria-label="Brightloop home"><BrandMark size={40} /><span>brightloop<small>subscriptions</small></span></Link>
        <div className="auth-shell__form-wrap">
          <p className="eyebrow"><span className="eyebrow__line" /> Welcome to Brightloop</p>
          <h1 className="auth-shell__title">{title}</h1>
          <p className="auth-shell__description">{description}</p>
          <div className="auth-shell__content">{children}</div>
        </div>
        <p className="auth-shell__foot">A clearer view of every recurring relationship.</p>
      </section>
      <aside className="auth-shell__visual" aria-hidden="true">
        <Dither waveColor="#BDF66F" backgroundColor="#14251D" palette={["#14251D", "#1D392A", "#82B55B", "#D5FF9A"]} colorNum={4} pixelSize={3} waveSpeed={0.025} waveFrequency={2.8} waveAmplitude={0.24} ditherMode="bayer4" mouseEffect="reveal" mouseRadius={0.25} mouseStrength={0.6} trail={0.35} dpr={1.5} />
        <div className="auth-shell__visual-content">
          <span className="visual-kicker"><span /> BRIGHTLOOP / OPERATIONS</span>
          <h2>Every subscription<br />in its right place<span>.</span></h2>
          <p>Plans, billing, and customer relationships working together in one calm workspace.</p>
          <div className="visual-progress"><span>01 / 03</span><div><i /></div><span>BUILT FOR CLARITY</span></div>
        </div>
      </aside>
    </main>
  );
}

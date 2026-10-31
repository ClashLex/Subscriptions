import type { ReactNode } from "react";
import SpotlightCard from "../reactbits/SpotlightCard.js";

export function EmptyState({ icon = "✳", title, description, children }: { icon?: string; title: string; description: string; children?: ReactNode }) {
  return (
    <SpotlightCard className="empty-state" theme="light" spotlightColor="#b9edaa" intensity={.5}>
      <span className="empty-state__icon" aria-hidden="true">{icon}</span>
      <p className="eyebrow"><span className="eyebrow__line" /> Getting started</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {children ? <div className="empty-state__extra">{children}</div> : null}
    </SpotlightCard>
  );
}

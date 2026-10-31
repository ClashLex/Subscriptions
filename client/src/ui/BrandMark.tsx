export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="15" fill="#BEF76D" />
      <path d="M12 29.5 21 17l7.5 8.5L36 15" stroke="#13271E" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="15" r="3.5" fill="#13271E" />
      <path d="M13 35h22" stroke="#13271E" strokeWidth="2" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

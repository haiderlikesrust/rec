/** The brand mark: a plump cushion with pinched corners and a button tuft, glowing ember → gold. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        {/* identical everywhere the mark appears, so sharing one id is harmless */}
        <radialGradient id="cushion-fill" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(13.5 12.5) rotate(50) scale(19)">
          <stop stopColor="#FFD873" />
          <stop offset="0.5" stopColor="#FF9A4A" />
          <stop offset="1" stopColor="#FF6A3D" />
        </radialGradient>
      </defs>
      <path
        d="M7.5 4.4C12 6.3 20 6.3 24.5 4.4C27.1 3.4 28.6 4.9 27.6 7.5C25.7 12 25.7 20 27.6 24.5C28.6 27.1 27.1 28.6 24.5 27.6C20 25.7 12 25.7 7.5 27.6C4.9 28.6 3.4 27.1 4.4 24.5C6.3 20 6.3 12 4.4 7.5C3.4 4.9 4.9 3.4 7.5 4.4Z"
        fill="url(#cushion-fill)"
      />
      {/* the fabric dimpling around the button */}
      <path
        d="M14.1 14.1L12.2 12.2M17.9 14.1L19.8 12.2M17.9 17.9L19.8 19.8M14.1 17.9L12.2 19.8"
        stroke="#7A2E0A"
        strokeOpacity="0.28"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <ellipse cx="10.8" cy="9.6" rx="3.6" ry="1.9" fill="#fff" fillOpacity="0.32" transform="rotate(-24 10.8 9.6)" />
      <circle cx="16" cy="16" r="2.1" fill="#7A2E0A" fillOpacity="0.42" />
      <circle cx="15.6" cy="15.5" r="0.7" fill="#fff" fillOpacity="0.55" />
    </svg>
  );
}

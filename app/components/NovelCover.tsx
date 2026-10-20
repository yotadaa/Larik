// Generated book cover. The palette and scene come from a hash of the novel id,
// so every novel keeps the same cover on every visit.

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

const PALETTE_COUNT = 6;

function Scene({ index }: { index: number }) {
  switch (index) {
    case 0: // hills and a low sun
      return (
        <>
          <circle cx="212" cy="62" r="26" fill="var(--m3)" />
          <path d="M0 118 C60 86 112 96 172 118 S262 112 300 94 V160 H0Z" fill="var(--m1)" opacity=".55" />
          <path d="M0 138 C70 112 130 128 190 138 S270 126 300 120 V160 H0Z" fill="var(--m2)" opacity=".75" />
          <path d="M0 153 C80 138 150 151 300 141 V160 H0Z" fill="var(--m2)" />
        </>
      );
    case 1: // waves
      return (
        <>
          <circle cx="82" cy="58" r="20" fill="var(--m3)" />
          <path d="M0 96 Q37 74 75 96 T150 96 T225 96 T300 96 V160 H0Z" fill="var(--m1)" opacity=".45" />
          <path d="M0 114 Q37 92 75 114 T150 114 T225 114 T300 114 V160 H0Z" fill="var(--m1)" opacity=".7" />
          <path d="M0 133 Q37 111 75 133 T150 133 T225 133 T300 133 V160 H0Z" fill="var(--m2)" />
        </>
      );
    case 2: // peaks and a moon
      return (
        <>
          <circle cx="226" cy="44" r="17" fill="var(--m3)" />
          <path d="M0 160 L66 78 L112 132 L172 56 L236 138 L300 92 V160Z" fill="var(--m1)" opacity=".5" />
          <path d="M0 160 L52 112 L104 148 L168 100 L232 150 L300 118 V160Z" fill="var(--m2)" />
        </>
      );
    case 3: // drifting clouds
      return (
        <>
          <path d="M26 92 a20 20 0 0 1 36 -12 a26 26 0 0 1 48 6 a16 16 0 0 1 2 32 H38 a16 16 0 0 1 -12 -26Z" fill="var(--m3)" opacity=".9" />
          <path d="M150 124 a18 18 0 0 1 32 -10 a24 24 0 0 1 44 6 a15 15 0 0 1 2 30 H160 a15 15 0 0 1 -10 -26Z" fill="var(--m1)" opacity=".6" />
          <path d="M0 150 C60 138 120 152 180 146 S270 140 300 148 V160 H0Z" fill="var(--m2)" />
        </>
      );
    default: // orbit
      return (
        <>
          <circle cx="150" cy="176" r="132" fill="none" stroke="var(--m1)" strokeWidth="1.4" opacity=".45" />
          <circle cx="150" cy="176" r="96" fill="none" stroke="var(--m1)" strokeWidth="1.4" opacity=".6" />
          <circle cx="150" cy="176" r="60" fill="var(--m2)" opacity=".8" />
          <circle cx="238" cy="92" r="9" fill="var(--m3)" />
        </>
      );
  }
}

export function NovelCover({
  title,
  novelId,
  lang,
  size = "md",
}: {
  title: string;
  novelId: string;
  lang?: string | null;
  size?: "md" | "lg";
}) {
  const h = hash(novelId);
  const palette = h % PALETTE_COUNT;
  const scene = Math.floor(h / PALETTE_COUNT) % 5;
  return (
    <span className={`cover cover--p${palette} cover--${size}`} aria-hidden="true">
      <span className="cover__spine" />
      <span className="cover__stars" />
      <svg className="cover__scene" viewBox="0 0 300 160" preserveAspectRatio="xMidYMax slice" focusable="false">
        <Scene index={scene} />
      </svg>
      <span className="cover__title">{title}</span>
      {lang ? <span className="cover__lang">{lang}</span> : null}
    </span>
  );
}

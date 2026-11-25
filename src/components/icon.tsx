const PATHS = {
  download: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14",
  back: "M19 12H5m0 0l6 6m-6-6l6-6",
};

/** Decorative: the text next to it says what the button does. */
export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

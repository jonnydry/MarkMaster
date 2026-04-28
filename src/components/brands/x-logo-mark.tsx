/**
 * Monochrome X logo (black or white via `currentColor`). Aligns with X brand
 * toolkit usage near saved posts; see https://about.x.com/en/who-we-are/brand-toolkit
 */
export function XLogoMark({
  className = "size-[1em] text-foreground",
  title = "X",
}: {
  className?: string;
  /** Pass a string for a visible label; omit for decorative use. */
  title?: string | undefined;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

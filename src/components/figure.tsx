import { cn } from "@/lib/utils";

/**
 * Renders a generated question figure.
 *
 * `dangerouslySetInnerHTML` is used because the figure is an SVG document, and it is safe here
 * for a specific, checkable reason: this markup is produced by our own renderer in
 * `src/core/generation/svg/render.ts` from a closed set of numeric attributes, and is never
 * derived from user input. The seed script is the only writer of the `svg` column.
 *
 * If an admin panel later allows uploading or pasting SVG (Phase 2), that path must sanitise
 * before storing — an uploaded SVG can carry <script> and event handlers.
 */
export function Figure({
  svg,
  className,
}: {
  svg: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex justify-center overflow-x-auto py-2", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

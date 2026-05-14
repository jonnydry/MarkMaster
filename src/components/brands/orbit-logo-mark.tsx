import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type OrbitLogoMarkProps = ComponentPropsWithoutRef<"svg"> & {
  title?: string;
};

export const OrbitLogoMark = forwardRef<SVGSVGElement, OrbitLogoMarkProps>(
  function OrbitLogoMark({ className, title, ...props }, ref) {
    const generatedTitleId = useId();
    const titleId = title ? generatedTitleId : undefined;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 128 128"
        width="1em"
        height="1em"
        role={title ? "img" : undefined}
        aria-hidden={title ? undefined : true}
        aria-labelledby={titleId}
        className={cn("block shrink-0", className)}
        {...props}
      >
        {title ? <title id={titleId}>{title}</title> : null}
        <path
          d="m20.2 94.5c-4.2-6.1-8.9-16.3-8.9-30.1 0.2-27.6 23.6-54.8 53.9-54.8 9.7 0 18.4 1.9 29.1 8l-5.1 4.2c-3.1-1.9-11.2-6.1-22.6-6.1-26.5-0.3-49.2 21.6-49.2 48.3 0 9.7 3.4 19.6 8.2 27.3l-5.4 3.2z"
          fill="color-mix(in srgb, var(--primary) 76%, #0f172a)"
        />
        <path
          d="m116.7 45.8c0-0.2-0.1-0.4-0.1-0.4-0.2-0.5 0.1 0.2 0 0 0-0.1-0.1-0.4-0.3-1.3l-4.5 5.1c1.4 4.8 2.2 9.4 2.2 14.8 0 22.1-16.7 48.4-47.9 48.4-10.4 0.1-19.4-2.9-28-8.5l-5.8 3.3c7.8 5.7 18.6 11.1 33.6 11.2 28.7 0 54-21.1 54.1-54.4 0-7.2-1.5-14.2-3.3-19.1z"
          fill="color-mix(in srgb, var(--primary) 72%, #0f172a)"
        />
        <path
          d="m10.2 76.6c-4.8 6.1-8.4 12.4-8 21.1 0.4 4 2.7 9.6 10.1 10.1 4 0.1 8.8-0.5 15.2-3.4 15.6-7 33.1-22.1 47.7-38.5l2.8 2.5 0.6 14.7s14.6-13.8 15.2-14.4c0.5-0.7 0.7-1 0.5-0.8 0.2-0.3 0.8-7.4 0.8-11.1 5.9-3.9 13-10 18.6-16.8 5.2-6.6 10.9-17 12.5-30.4-11.4 0.9-23 6-32.3 13.9-6.1 5-13.4 13.8-14.3 15.9-2.8-0.1-11.6-0.5-13.3 0.6-1.1 0.8-14.7 15.7-14.7 15.8l14.6 0.6 3.1 2.7c-11.1 11.6-27.6 28.7-45 38-5.7 3-13.3 6.3-17.1 2.6-2.5-2.3-3.7-10.1 3.2-22.7 0.9-1.5 0.4-1.5-0.2-0.4z"
          fill="var(--primary)"
        />
        <path
          d="m126.1 9.7-80 77.7c-7.4 5.7-14.7 10.6-21.4 14-5.8 2.6-13.7 5.8-19.1 2.5l-2.7-2.1c1.2 3 3.7 5.6 9.4 6 4 0.1 8.8-0.5 15.2-3.4 12.3-5.4 27.9-17.4 47.7-38.5l2.7 2.5 0.7 14.7s14.6-13.8 15.2-14.4c0.5-0.7 0.7-1 0.7-0.8 0.1-0.3 0.7-7.3 0.6-11.1 5.9-3.9 12.7-9.5 18.6-16.8 4.9-6 10.9-16 12.4-30.3z"
          fill="color-mix(in srgb, var(--primary) 70%, #0f172a)"
        />
      </svg>
    );
  }
);

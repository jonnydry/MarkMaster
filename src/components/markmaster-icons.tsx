import { forwardRef, type SVGProps } from "react";

type MarkMasterIconProps = SVGProps<SVGSVGElement>;

function iconProps(props: MarkMasterIconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
    "aria-hidden": props["aria-hidden"] ?? true,
    ...props,
  };
}

export const MarkMasterBookmarksIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterBookmarksIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <path d="M7 4h10v16l-5-3-5 3V4Z" />
      <path d="M10 8h4" />
    </svg>
  );
});

export const MarkMasterOrbitIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterOrbitIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="8.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
});

export const MarkMasterCollectionsIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterCollectionsIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <path d="M4 7h6l2 2h8v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      <path d="M7 13h10" />
      <path d="M7 16h6" />
    </svg>
  );
});

export const MarkMasterAnalyticsIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterAnalyticsIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <path d="M4 19h16" />
      <path d="M7 16v-4" />
      <path d="M12 16V8" />
      <path d="M17 16v-6" />
    </svg>
  );
});

export const MarkMasterSettingsIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterSettingsIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <path d="M4 7h5" />
      <path d="M13 7h7" />
      <circle cx="11" cy="7" r="2" />
      <path d="M4 12h10" />
      <path d="M18 12h2" />
      <circle cx="16" cy="12" r="2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
});

export const MarkMasterSearchIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterSearchIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4 4" />
    </svg>
  );
});

export const MarkMasterTagsIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterTagsIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <path d="m20 13-7 7-9-9V4h7l9 9Z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
});

export const MarkMasterNotesIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterNotesIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <path d="M6 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M8 8h6" />
      <path d="M8 11h5" />
      <path d="M8 14h3" />
    </svg>
  );
});

export const MarkMasterSyncIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterSyncIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <path d="M19 8a7 7 0 0 0-12-2L5 8" />
      <path d="M5 4.5V8h3.5" />
      <path d="M5 16a7 7 0 0 0 12 2l2-2" />
      <path d="M19 19.5V16h-3.5" />
    </svg>
  );
});

export const MarkMasterHealthIcon = forwardRef<
  SVGSVGElement,
  MarkMasterIconProps
>(function MarkMasterHealthIcon(props, ref) {
  return (
    <svg ref={ref} {...iconProps(props)}>
      <path d="M12 20s7-3 7-9.5V6l-7-2.5L5 6v4.5C5 17 12 20 12 20Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </svg>
  );
});

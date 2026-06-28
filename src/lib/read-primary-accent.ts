/**
 * Resolve the active `--primary` token to #rrggbb for canvas/worker consumers.
 * Uses a hidden probe so browser-computed rgb/oklch values are handled reliably.
 */
export function cssColorToHex(color: string): string | undefined {
  const trimmed = color.trim();
  if (!trimmed) return undefined;

  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1].toLowerCase();
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    return `#${hex}`;
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)%?(?:[,\s]+)([\d.]+)%?(?:[,\s]+)([\d.]+)%?/i
  );
  if (!rgbMatch) return undefined;

  const toByte = (value: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    if (value.includes("%")) {
      return Math.round((numeric / 100) * 255);
    }
    return Math.round(numeric);
  };

  const r = toByte(rgbMatch[1]);
  const g = toByte(rgbMatch[2]);
  const b = toByte(rgbMatch[3]);
  if (r === undefined || g === undefined || b === undefined) return undefined;
  if ([r, g, b].some((channel) => channel < 0 || channel > 255)) {
    return undefined;
  }

  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

type CssVariableProbeProperty = "color" | "background-color";

function readCssVariableHex(
  variable: `--${string}`,
  property: CssVariableProbeProperty,
  root: HTMLElement = document.documentElement
): string | undefined {
  if (typeof window === "undefined") return undefined;

  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view) return undefined;

  const token = variable.slice(2);
  const declared = view.getComputedStyle(root).getPropertyValue(token).trim();
  if (declared) {
    const normalized = declared.startsWith("#")
      ? declared
      : /^[0-9a-f]{3,6}$/i.test(declared)
        ? `#${declared}`
        : declared;
    const fromDeclared = cssColorToHex(normalized);
    if (fromDeclared) return fromDeclared;
  }

  const probe = doc.createElement("span");
  probe.style.setProperty(property, `var(${variable})`);
  probe.style.setProperty("position", "absolute");
  probe.style.setProperty("visibility", "hidden");
  probe.style.setProperty("pointer-events", "none");
  root.appendChild(probe);

  try {
    const computed =
      property === "color"
        ? view.getComputedStyle(probe).color
        : view.getComputedStyle(probe).backgroundColor;
    return cssColorToHex(computed);
  } finally {
    probe.remove();
  }
}

export function readPrimaryAccentHex(
  root: HTMLElement = document.documentElement
): string | undefined {
  return readCssVariableHex("--primary", "color", root);
}

/** App shell background — used for the Orbit map canvas clear color. */
export function readBackgroundHex(
  root: HTMLElement = document.documentElement
): string | undefined {
  return readCssVariableHex("--background", "background-color", root);
}

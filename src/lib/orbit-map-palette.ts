export type OrbitMapColorMode = "light" | "dark";

export interface OrbitMapPalette {
  background: number;
  labelActive: number;
  labelNeighbor: number;
  labelDefault: number;
  linkFallback: number;
  linkHighlightMix: number;
  hubInnerStroke: number;
}

export function getOrbitMapPalette(mode: OrbitMapColorMode): OrbitMapPalette {
  if (mode === "light") {
    return {
      background: 0xf4f5f7,
      labelActive: 0x0f172a,
      labelNeighbor: 0x334155,
      labelDefault: 0x475569,
      linkFallback: 0x94a3b8,
      linkHighlightMix: 0x1e293b,
      hubInnerStroke: 0xffffff,
    };
  }

  return {
    background: 0x000000,
    labelActive: 0xf8fafc,
    labelNeighbor: 0xcbd5e1,
    labelDefault: 0xe2e8f0,
    linkFallback: 0x334155,
    linkHighlightMix: 0xffffff,
    hubInnerStroke: 0xffffff,
  };
}

export function getOrbitMapLabelFill(
  palette: OrbitMapPalette,
  state: "active" | "neighbor" | "default"
) {
  switch (state) {
    case "active":
      return palette.labelActive;
    case "neighbor":
      return palette.labelNeighbor;
    case "default":
      return palette.labelDefault;
  }
}

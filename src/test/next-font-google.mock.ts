type FontOptions = {
  variable?: string;
  subsets?: string[];
  weight?: string | string[];
  preload?: boolean;
};

function createMockFont(id: string) {
  return (options: FontOptions = {}) => ({
    className: `mock-font-${id}`,
    variable: options.variable ?? `--font-${id}`,
    style: {
      fontFamily: `mock-${id}`,
    },
  });
}

export const IBM_Plex_Sans = createMockFont("ibm-plex-sans");
export const JetBrains_Mono = createMockFont("jetbrains-mono");
export const IBM_Plex_Mono = createMockFont("ibm-plex-mono");
export const Inter = createMockFont("inter");
export const DM_Sans = createMockFont("dm-sans");
export const Instrument_Sans = createMockFont("instrument-sans");

type LocalFontOptions = {
  variable?: string;
  weight?: string;
  src?: string | Array<{ path: string; weight?: string; style?: string }>;
  preload?: boolean;
};

function localFont(options: LocalFontOptions = {}) {
  const id = options.variable?.replace(/^--font-/, "") ?? "local";
  return {
    className: `mock-font-${id}`,
    variable: options.variable ?? `--font-${id}`,
    style: {
      fontFamily: `mock-${id}`,
    },
  };
}

export default localFont;

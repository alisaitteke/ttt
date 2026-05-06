export interface LogoAnsiColors {
  bold: string;
  reset: string;
  cyan: string;
}

const WIDTH = 40;

/**
 * ASCII art matching the three bold "T" shapes in web/public/logo.svg.
 * Top bar is one continuous strip (merged T crossbars); three stems below.
 */
const TOP_BAR = `  ${'█'.repeat(WIDTH)}\n`;
// Stems centered in thirds of WIDTH (≈7, 20, 33): 6+2+11+2+11+2+6 = 40
const STEM_BODY = `${' '.repeat(6)}██${' '.repeat(11)}██${' '.repeat(11)}██${' '.repeat(6)}`;
const STEM_LINE = `  ${STEM_BODY}\n`;

export function printAsciiLogo(c: LogoAnsiColors): string {
  return (
    `${c.cyan}${c.bold}` +
    TOP_BAR +
    STEM_LINE +
    STEM_LINE +
    STEM_LINE +
    `  ${STEM_BODY}` +
    `${c.reset}\n`
  );
}

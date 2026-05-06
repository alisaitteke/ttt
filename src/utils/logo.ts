export interface LogoAnsiColors {
  bold: string;
  reset: string;
  cyan: string;
}

/**
 * ASCII art matching the three bold "T" shapes in web/public/logo.svg.
 */
export function printAsciiLogo(c: LogoAnsiColors): string {
  return (
    `${c.cyan}${c.bold}` +
    `  ████████  ████████  ████████\n` +
    `     ██        ██        ██   \n` +
    `     ██        ██        ██   \n` +
    `     ██        ██        ██   \n` +
    `     ██        ██        ██   \n` +
    `${c.reset}`
  );
}

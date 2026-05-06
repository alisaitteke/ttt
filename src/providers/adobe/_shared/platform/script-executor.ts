/**
 * Generic script executor interface for Adobe Creative Cloud applications
 * that support ExtendScript (Photoshop, Illustrator, After Effects, InDesign, ...).
 *
 * Each implementation talks to one app at a time and is parameterised on the
 * platform-specific app handle (macOS app name or Windows COM ProgID).
 */
export interface ExtendScriptExecutor {
  /**
   * Execute an ExtendScript snippet inside the target Adobe app.
   * @param script - Source code to evaluate
   * @param timeout - Timeout in milliseconds (default: 30000)
   */
  execute(script: string, timeout?: number): Promise<unknown>;

  /**
   * Whether the target application is currently running.
   */
  isAppRunning(): Promise<boolean>;

  /**
   * Launch the application from the given binary path / .app bundle.
   */
  launchApp(appPath: string): Promise<void>;
}

export interface ScriptResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

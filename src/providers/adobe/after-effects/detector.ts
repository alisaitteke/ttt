import { BaseAdobeDetector } from '../_shared/detector/base-adobe-detector.js';

/**
 * Detect a locally-installed Adobe After Effects on macOS or Windows.
 *
 * Honors the `AFTER_EFFECTS_PATH` env var as an explicit override, falls back to
 * Spotlight (macOS) / Registry (Windows), then probes common install paths.
 */
export class AfterEffectsDetector extends BaseAdobeDetector {
  constructor() {
    super({ envOverrideVar: 'AFTER_EFFECTS_PATH' });
  }

  getAppId(): string {
    return 'after-effects';
  }

  getMacOSAppNamePrefix(): string {
    return 'Adobe After Effects';
  }

  getMacOSBundleId(): string {
    return 'com.adobe.AfterEffects';
  }

  getWindowsExeName(): string {
    return 'AfterFX.exe';
  }

  protected getWindowsRegistryRoots(): string[] {
    return [
      'HKLM\\SOFTWARE\\Adobe\\After Effects',
      'HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\After Effects',
    ];
  }
}

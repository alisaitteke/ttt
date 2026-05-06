import { BaseAdobeDetector } from '@ttt/providers/adobe/_shared/detector/base-adobe-detector.js';

/**
 * Detect a locally-installed Adobe Illustrator on macOS or Windows.
 *
 * Honors the `ILLUSTRATOR_PATH` env var as an explicit override.
 */
export class IllustratorDetector extends BaseAdobeDetector {
  constructor() {
    super({ envOverrideVar: 'ILLUSTRATOR_PATH' });
  }

  getAppId(): string {
    return 'illustrator';
  }

  getMacOSAppNamePrefix(): string {
    return 'Adobe Illustrator';
  }

  getMacOSBundleId(): string {
    return 'com.adobe.Illustrator';
  }

  getWindowsExeName(): string {
    return 'Illustrator.exe';
  }

  protected getWindowsRegistryRoots(): string[] {
    return [
      'HKLM\\SOFTWARE\\Adobe\\Illustrator',
      'HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\Illustrator',
    ];
  }
}

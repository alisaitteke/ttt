import { BaseAdobeDetector } from '@ttt/providers/adobe/_shared/detector/base-adobe-detector.js';

/**
 * Detect a locally-installed Adobe Premiere Pro on macOS or Windows.
 *
 * Honors the `PREMIERE_PRO_PATH` env var as an explicit override.
 */
export class PremiereProDetector extends BaseAdobeDetector {
  constructor() {
    super({ envOverrideVar: 'PREMIERE_PRO_PATH' });
  }

  getAppId(): string {
    return 'premiere-pro';
  }

  getMacOSAppNamePrefix(): string {
    return 'Adobe Premiere Pro';
  }

  getMacOSBundleId(): string {
    return 'com.adobe.PremierePro';
  }

  getWindowsExeName(): string {
    return 'Adobe Premiere Pro.exe';
  }

  protected getWindowsRegistryRoots(): string[] {
    return [
      'HKLM\\SOFTWARE\\Adobe\\Premiere Pro',
      'HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\Premiere Pro',
    ];
  }
}

import { BaseAdobeDetector } from '../_shared/detector/base-adobe-detector.js';

/**
 * Detect a locally-installed Adobe Photoshop on macOS or Windows.
 *
 * Honors the `PHOTOSHOP_PATH` env var as an explicit override, falls back to
 * Spotlight (macOS) / Registry (Windows), then probes common install paths.
 */
export class PhotoshopDetector extends BaseAdobeDetector {
  constructor() {
    super({ envOverrideVar: 'PHOTOSHOP_PATH' });
  }

  getAppId(): string {
    return 'photoshop';
  }

  getMacOSAppNamePrefix(): string {
    return 'Adobe Photoshop';
  }

  getMacOSBundleId(): string {
    return 'com.adobe.Photoshop';
  }

  getWindowsExeName(): string {
    return 'Photoshop.exe';
  }

  protected getWindowsRegistryRoots(): string[] {
    return ['HKLM\\SOFTWARE\\Adobe\\Photoshop', 'HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\Photoshop'];
  }

  /**
   * Determine if a Photoshop version supports UXP (23.5+, roughly 2022+).
   * Kept here because some downstream code still asks the question even though
   * the API factory always falls back to ExtendScript for external scripting.
   */
  supportsUXP(version: string): boolean {
    const versionMatch = version.match(/(\d+)\.?(\d*)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1], 10);
      const minor = versionMatch[2] ? parseInt(versionMatch[2], 10) : 0;
      return major > 23 || (major === 23 && minor >= 5);
    }
    const yearMatch = version.match(/20(\d{2})/);
    if (yearMatch) {
      const year = parseInt(`20${yearMatch[1]}`, 10);
      return year >= 2022;
    }
    return false;
  }

  getRecommendedAPI(version: string): 'UXP' | 'ExtendScript' {
    return this.supportsUXP(version) ? 'UXP' : 'ExtendScript';
  }
}

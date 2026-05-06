import { Logger } from '@ttt/utils/logger.js';
import { PhotoshopConnection } from '@ttt/providers/adobe/photoshop/connection.js';

export type APIType = 'UXP' | 'ExtendScript';

export interface PhotoshopAPI {
  executeScript(script: string): Promise<unknown>;
  getAPIType(): APIType;
}

/**
 * Picks the right scripting API for the connected Photoshop instance.
 *
 * In practice we always end up using ExtendScript because UXP is plugin-only;
 * the abstraction is kept so a future native plugin transport can plug in.
 */
export class PhotoshopAPIFactory {
  private logger: Logger;
  private connection: PhotoshopConnection;

  constructor(connection: PhotoshopConnection) {
    this.logger = new Logger('PhotoshopAPIFactory');
    this.connection = connection;
  }

  async createAPI(): Promise<PhotoshopAPI> {
    const info = this.connection.getInfo();
    if (!info) {
      throw new Error('Photoshop info not available. Please detect Photoshop first.');
    }
    this.logger.debug(`Using ExtendScript for version ${info.version}`);
    return new ExtendScriptPhotoshopAPI(this.connection);
  }
}

class ExtendScriptPhotoshopAPI implements PhotoshopAPI {
  private connection: PhotoshopConnection;

  constructor(connection: PhotoshopConnection) {
    this.connection = connection;
  }

  async executeScript(script: string): Promise<unknown> {
    return await this.connection.executeScript(this.wrapInErrorHandling(script));
  }

  /**
   * ExtendScript has no JSON object, so the result is serialized via
   * toSource()/String(). Errors are surfaced with an "ERROR:" prefix that
   * platform executors translate back into thrown Errors.
   *
   * Ruler and type units are temporarily forced to pixels/points so that every
   * DOM API that accepts plain numbers (translate, textItem.size,
   * textItem.position, doc.crop bounds, etc.) behaves consistently regardless
   * of the user's Photoshop preferences. The user's original preferences are
   * restored in the finally block.
   */
  private wrapInErrorHandling(script: string): string {
    return `
(function() {
  var __originalRulerUnits = null;
  var __originalTypeUnits = null;
  try { __originalRulerUnits = app.preferences.rulerUnits; } catch (e) {}
  try { __originalTypeUnits = app.preferences.typeUnits; } catch (e) {}

  try {
    try { app.preferences.rulerUnits = Units.PIXELS; } catch (e) {}
    try { app.preferences.typeUnits = TypeUnits.POINTS; } catch (e) {}

    var result = (function() {
      ${script}
    })();
    if (typeof result === 'object' && result !== null) {
      return result.toSource ? result.toSource() : String(result);
    }
    return String(result);
  } catch (error) {
    return 'ERROR: ' + (error.message || String(error));
  } finally {
    try { if (__originalRulerUnits !== null) app.preferences.rulerUnits = __originalRulerUnits; } catch (e) {}
    try { if (__originalTypeUnits !== null) app.preferences.typeUnits = __originalTypeUnits; } catch (e) {}
  }
})();
    `.trim();
  }

  getAPIType(): APIType {
    return 'ExtendScript';
  }
}

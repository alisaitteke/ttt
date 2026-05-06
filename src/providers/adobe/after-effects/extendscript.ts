/**
 * ExtendScript snippets for Adobe After Effects
 * These are code templates that get executed inside AE via DoScriptFile
 */

export const AfterEffectsExtendScriptSnippets = {
  /**
   * Get After Effects application info
   */
  getAppInfo: () => `
    return {
      name: app.name,
      version: app.version,
      build: app.buildName
    };
  `,

  /**
   * Get project information
   */
  getProjectInfo: () => `
    return {
      name: app.project.file ? app.project.file.name : 'Untitled',
      numItems: app.project.numItems,
      displayStartFrame: app.project.displayStartFrame,
      items: (function() {
        var items = [];
        for (var i = 1; i <= Math.min(app.project.numItems, 10); i++) {
          var item = app.project.item(i);
          items.push({
            name: item.name,
            type: item.typeName
          });
        }
        return items;
      })()
    };
  `,

  /**
   * Save the current project
   */
  saveProject: (path: string) => `
    var file = new File('${path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');
    app.project.save(file);
    return { saved: true, path: file.fsName };
  `,

  /**
   * Open a project file
   */
  openProject: (path: string) => `
    var file = new File('${path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');
    if (!file.exists) {
      throw new Error('Project file not found: ' + file.fsName);
    }
    app.open(file);
    return { opened: true, name: app.project.file.name };
  `,

  /**
   * Create a new composition
   */
  createComposition: (
    name: string,
    width: number,
    height: number,
    duration: number,
    frameRate: number
  ) => `
    var comp = app.project.items.addComp('${name}', ${width}, ${height}, 1.0, ${duration}, ${frameRate});
    return {
      name: comp.name,
      width: comp.width,
      height: comp.height,
      duration: comp.duration,
      frameRate: comp.frameRate
    };
  `,

  /**
   * List all compositions in the project
   */
  listCompositions: () => `
    var comps = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem) {
        comps.push({
          name: item.name,
          width: item.width,
          height: item.height,
          duration: item.duration,
          frameRate: item.frameRate,
          numLayers: item.numLayers
        });
      }
    }
    return comps;
  `,

  /**
   * Get composition info by name
   */
  getCompositionInfo: (name: string) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${name}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${name}');
    }
    return {
      name: comp.name,
      width: comp.width,
      height: comp.height,
      duration: comp.duration,
      frameRate: comp.frameRate,
      numLayers: comp.numLayers,
      bgColor: [comp.bgColor[0], comp.bgColor[1], comp.bgColor[2]]
    };
  `,

  /**
   * Delete a composition by name
   */
  deleteComposition: (name: string) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${name}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${name}');
    }
    comp.remove();
    return { deleted: true };
  `,

  /**
   * Create a text layer in a composition
   */
  createTextLayer: (compName: string, text: string, x: number, y: number) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${compName}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${compName}');
    }
    var textLayer = comp.layers.addText('${text.replace(/'/g, "\\'")}');
    var textProp = textLayer.property("Source Text");
    var textDocument = textProp.value;
    textDocument.text = '${text.replace(/'/g, "\\'")}';
    textProp.setValue(textDocument);
    textLayer.transform.position.setValue([${x}, ${y}]);
    return {
      name: textLayer.name,
      text: '${text}',
      position: [${x}, ${y}]
    };
  `,

  /**
   * Create a solid layer in a composition
   */
  createSolidLayer: (
    compName: string,
    name: string,
    width: number,
    height: number,
    color: [number, number, number]
  ) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${compName}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${compName}');
    }
    var solidLayer = comp.layers.addSolid([${color[0]}, ${color[1]}, ${color[2]}], '${name}', ${width}, ${height}, 1.0);
    return {
      name: solidLayer.name,
      width: ${width},
      height: ${height},
      color: [${color[0]}, ${color[1]}, ${color[2]}]
    };
  `,

  /**
   * Create a shape layer in a composition
   */
  createShapeLayer: (compName: string, name: string) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${compName}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${compName}');
    }
    var shapeLayer = comp.layers.addShape();
    shapeLayer.name = '${name}';
    return {
      name: shapeLayer.name
    };
  `,

  /**
   * Create a null layer in a composition
   */
  createNullLayer: (compName: string, name: string) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${compName}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${compName}');
    }
    var nullLayer = comp.layers.addNull();
    nullLayer.name = '${name}';
    return {
      name: nullLayer.name
    };
  `,

  /**
   * Set layer transform properties
   */
  setLayerTransform: (
    compName: string,
    layerName: string,
    position?: [number, number],
    scale?: [number, number],
    rotation?: number
  ) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${compName}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${compName}');
    }
    var layer = comp.layer('${layerName}');
    if (!layer) {
      throw new Error('Layer not found: ${layerName}');
    }
    ${position ? `layer.transform.position.setValue([${position[0]}, ${position[1]}]);` : ''}
    ${scale ? `layer.transform.scale.setValue([${scale[0]}, ${scale[1]}]);` : ''}
    ${rotation !== undefined ? `layer.transform.rotation.setValue(${rotation});` : ''}
    return {
      name: layer.name,
      position: [layer.transform.position.value[0], layer.transform.position.value[1]],
      scale: [layer.transform.scale.value[0], layer.transform.scale.value[1]],
      rotation: layer.transform.rotation.value
    };
  `,

  /**
   * Set layer opacity
   */
  setLayerOpacity: (compName: string, layerName: string, opacity: number) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${compName}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${compName}');
    }
    var layer = comp.layer('${layerName}');
    if (!layer) {
      throw new Error('Layer not found: ${layerName}');
    }
    layer.transform.opacity.setValue(${opacity});
    return {
      name: layer.name,
      opacity: layer.transform.opacity.value
    };
  `,

  /**
   * Rename a layer
   */
  renameLayer: (compName: string, oldName: string, newName: string) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${compName}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${compName}');
    }
    var layer = comp.layer('${oldName}');
    if (!layer) {
      throw new Error('Layer not found: ${oldName}');
    }
    layer.name = '${newName}';
    return {
      oldName: '${oldName}',
      newName: layer.name
    };
  `,

  /**
   * Delete a layer
   */
  deleteLayer: (compName: string, layerName: string) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${compName}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${compName}');
    }
    var layer = comp.layer('${layerName}');
    if (!layer) {
      throw new Error('Layer not found: ${layerName}');
    }
    layer.remove();
    return { deleted: true };
  `,

  /**
   * Duplicate a layer
   */
  duplicateLayer: (compName: string, layerName: string) => `
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === '${compName}') {
        comp = item;
        break;
      }
    }
    if (!comp) {
      throw new Error('Composition not found: ${compName}');
    }
    var layer = comp.layer('${layerName}');
    if (!layer) {
      throw new Error('Layer not found: ${layerName}');
    }
    var newLayer = layer.duplicate();
    return {
      name: newLayer.name,
      original: '${layerName}'
    };
  `,
};

// Assembly-aware STEP import. Each leaf keeps an independent exact STEP shape,
// so saving/exporting one component never duplicates the entire source assembly.
function readStepAssembly(oc, content, fileName, meshShape, report = () => {}) {
  const owned = [];
  const keep = (value) => { owned.push(value); return value; };
  const input = '/viewer-input.step';
  const output = '/viewer-component.step';
  oc.FS.writeFile(input, content);
  try {
    const format = keep(new oc.TCollection_ExtendedString_2('MDTV-XCAF', true));
    const doc = keep(new oc.TDocStd_Document(format));
    const handle = keep(new oc.Handle_TDocStd_Document_2(doc));
    const reader = keep(new oc.STEPCAFControl_Reader_1());
    reader.SetColorMode(true);
    reader.SetNameMode(true);
    report('Reading STEP assembly');
    if (reader.ReadFile(input) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error('Cannot read this STEP file. It may be damaged or unsupported.');
    }
    if (!reader.Transfer_1(handle, keep(new oc.Message_ProgressRange_1()))) {
      throw new Error('STEP geometry transfer failed.');
    }
    const shapeHandle = keep(oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()));
    const colorHandle = keep(oc.XCAFDoc_DocumentTool.ColorTool(doc.Main()));
    const shapes = shapeHandle.get();
    const colors = colorHandle.get();
    const roots = keep(new oc.TDF_LabelSequence_1());
    shapes.GetFreeShapes(roots);
    let bodyCount = 0;
    const nameOf = (label) => {
      const attr = keep(new oc.Handle_TDF_Attribute_1());
      if (!label.FindAttribute_1(oc.TDataStd_Name.GetID(), attr)) return '';
      const value = keep(attr.get().Get());
      return keep(new oc.TCollection_AsciiString_13(value, 0)).ToCString();
    };
    const colorOf = (label) => {
      const color = keep(new oc.Quantity_Color_1());
      for (const type of [oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf, oc.XCAFDoc_ColorType.XCAFDoc_ColorGen]) {
        if (colors.GetColor_4(label, type, color)) {
          // OpenCascade stores linear RGB; Three.Color numeric hex is sRGB.
          const encode = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
          return '#' + [color.Red(), color.Green(), color.Blue()].map(v => encode(v).toString(16).padStart(2, '0')).join('');
        }
      }
      return null;
    };
    const matrixOf = (label) => {
      const location = keep(oc.XCAFDoc_ShapeTool.GetLocation(label));
      const t = keep(location.Transformation());
      return [t.Value(1,1),t.Value(2,1),t.Value(3,1),0,t.Value(1,2),t.Value(2,2),t.Value(3,2),0,
        t.Value(1,3),t.Value(2,3),t.Value(3,3),0,t.Value(1,4),t.Value(2,4),t.Value(3,4),1];
    };
    const visit = (label, inheritedColor, depth = 0) => {
      if (depth > 100) throw new Error('STEP assembly nesting exceeds the supported depth.');
      let source = label;
      if (oc.XCAFDoc_ShapeTool.IsReference(label)) {
        source = keep(new oc.TDF_Label());
        if (!oc.XCAFDoc_ShapeTool.GetReferredShape(label, source)) throw new Error('Unresolved STEP component reference.');
      }
      const name = nameOf(source) || nameOf(label) || `Component ${bodyCount + 1}`;
      const color = colorOf(label) || colorOf(source) || inheritedColor || '#a8b8ca';
      if (oc.XCAFDoc_ShapeTool.IsAssembly(source)) {
        const children = keep(new oc.TDF_LabelSequence_1());
        oc.XCAFDoc_ShapeTool.GetComponents(source, children, false);
        const nodes = [];
        for (let i = 1; i <= children.Length(); i++) nodes.push(visit(children.Value(i), color, depth + 1));
        return { name, type: 'assembly', matrix: matrixOf(label), children: nodes };
      }
      const shape = keep(oc.XCAFDoc_ShapeTool.GetShape_2(label));
      if (shape.IsNull()) throw new Error(`Component "${name}" has no geometry.`);
      report(`Preparing component ${++bodyCount}: ${name}`);
      const meshData = meshShape(oc, shape, 0.2);
      if (!meshData.index.length) throw new Error(`Component "${name}" has no displayable faces.`);
      const writer = keep(new oc.STEPControl_Writer_1());
      const progress = keep(new oc.Message_ProgressRange_1());
      if (writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone ||
          writer.Write(output) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error(`Cannot preserve component "${name}".`);
      const stepContent = oc.FS.readFile(output, { encoding: 'utf8' });
      oc.FS.unlink(output);
      return { name, type: 'part', color, meshData, stepContent };
    };
    const children = [];
    for (let i = 1; i <= roots.Length(); i++) children.push(visit(roots.Value(i), null));
    if (!bodyCount) throw new Error('No displayable components found in this STEP file.');
    return { tree: { name: fileName.replace(/\.(step|stp)$/i, ''), type: 'assembly', children }, bodyCount, units: 'mm' };
  } finally {
    for (const path of [input, output]) { try { oc.FS.unlink(path); } catch { /* already removed */ } }
    for (const object of owned.reverse()) { try { object.delete(); } catch { /* released with document */ } }
  }
}

module.exports = { readStepAssembly };

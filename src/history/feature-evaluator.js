import * as THREE from 'three';
import { geometryForPrimitive, buildPrimitiveTopology } from '../geometry/primitives.js';
import { buildExtrudeGeometry, buildExtrudeTopology } from '../geometry/extrude.js';
import { buildRevolveGeometry } from '../geometry/revolve.js';

/**
 * Sequential Feature Evaluator for Parametric CAD Modeling.
 * Recomputes a Part's 3D solid and B-Rep topology based on its active FeatureTree history.
 */
export async function recomputePart(part) {
  if (!part || !part.featureTree) return;

  const activeFeatures = part.featureTree.getActiveFeatures();

  // If rolled back prior to base feature
  if (activeFeatures.length === 0) {
    if (part.mesh && part.mesh.geometry) {
      part.mesh.geometry.dispose();
      part.mesh.geometry = new THREE.BufferGeometry();
    }
    if (part.edgeGroup) part.edgeGroup.visible = false;
    part.setTopology({ faces: [], edges: [], faceRanges: [] });
    return;
  }

  const baseFeat = activeFeatures[0];
  const modifiers = activeFeatures.slice(1);

  // If only the base feature is active and it's a basic primitive/extrude, fast-path Three.js
  if (modifiers.length === 0) {
    let geo;
    let topo;

    if (baseFeat.type === 'extrude') {
      geo = buildExtrudeGeometry(baseFeat.params);
      topo = buildExtrudeTopology(baseFeat.params);
    } else if (baseFeat.type === 'revolve') {
      geo = buildRevolveGeometry(baseFeat.params);
      topo = { faces: [], edges: [], faceRanges: [] };
    } else if (['box', 'cylinder', 'sphere', 'cone'].includes(baseFeat.type)) {
      geo = geometryForPrimitive(baseFeat.type, baseFeat.params);
      topo = buildPrimitiveTopology(baseFeat.type, baseFeat.params);
    }

    if (geo) {
      part.mesh.geometry.dispose();
      part.mesh.geometry = geo;
      part.setTopology(topo);
      if (part.edgeGroup) part.edgeGroup.visible = true;
      return;
    }
  }

  // Construct cumulative OpenCascade shape definition tree
  let currentShapeDef = {
    kind: baseFeat.type,
    params: { ...baseFeat.params }
  };

  for (const feat of modifiers) {
    if (feat.type === 'fillet') {
      currentShapeDef = {
        kind: 'fillet',
        params: {
          basePart: currentShapeDef,
          radius: feat.params.radius || 3,
          targetEdgeIds: feat.targetRefs?.targetEdgeIds || feat.params.targetEdgeIds || [],
          filter: feat.params.filter || 'all'
        }
      };
    } else if (feat.type === 'chamfer') {
      currentShapeDef = {
        kind: 'chamfer',
        params: {
          basePart: currentShapeDef,
          distance: feat.params.distance || 5,
          targetEdgeIds: feat.targetRefs?.targetEdgeIds || feat.params.targetEdgeIds || [],
          filter: feat.params.filter || 'all'
        }
      };
    } else if (feat.type === 'shell') {
      currentShapeDef = {
        kind: 'shell',
        params: {
          basePart: currentShapeDef,
          thickness: feat.params.thickness || 2,
          openFace: feat.params.openFace !== false
        }
      };
    } else if (feat.type === 'hole') {
      const dia = feat.params.diameter || 12;
      const depth = feat.params.depth || 200;
      const cutter = {
        kind: 'cylinder',
        params: { radius: dia / 2, height: depth }
      };
      currentShapeDef = {
        kind: 'boolean',
        params: {
          op: 'cut',
          sourceOp: 'cut',
          shapeA: currentShapeDef,
          shapeB: cutter
        }
      };
    } else if (feat.type === 'boolean') {
      currentShapeDef = {
        kind: 'boolean',
        params: {
          op: feat.params.op || 'union',
          sourceOp: feat.params.sourceOp || feat.params.op || 'union',
          shapeA: currentShapeDef,
          shapeB: feat.params.shapeB
        }
      };
    }
  }

  // Execute full B-Rep evaluation via OpenCascade IPC
  if (window.cadlite && window.cadlite.getTopology) {
    const res = await window.cadlite.getTopology(currentShapeDef);
    if (res && res.ok && res.meshData) {
      const { positions, normals, index, faceRanges, edges, faces } = res.meshData;
      const newGeo = new THREE.BufferGeometry();
      newGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      newGeo.setIndex(index);
      if (normals && normals.some((n) => n !== 0)) {
        newGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      } else {
        newGeo.computeVertexNormals();
      }

      part.mesh.geometry.dispose();
      part.mesh.geometry = newGeo;

      const topo = {
        faces: faces || [],
        edges: edges || [],
        faceRanges: faceRanges || []
      };
      part.setTopology(topo);
      if (part.edgeGroup) part.edgeGroup.visible = true;
    }
  }
}

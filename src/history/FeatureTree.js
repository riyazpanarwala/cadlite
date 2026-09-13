let nextFeatureId = 1;

/**
 * A single parametric modeling operation in a Part's history.
 */
export class FeatureNode {
  constructor({
    id = null,
    name = 'Feature',
    type = 'extrude', // 'box' | 'cylinder' | 'sphere' | 'cone' | 'extrude' | 'revolve' | 'fillet' | 'chamfer' | 'hole' | 'shell' | 'boolean'
    params = {},
    targetRefs = {}, // { targetEdgeIds: [], targetFaceId: null }
    suppressed = false
  } = {}) {
    this.id = id || `feat_${nextFeatureId++}`;
    this.name = name;
    this.type = type;
    this.params = params;
    this.targetRefs = targetRefs;
    this.suppressed = suppressed;
    this.status = 'ok'; // 'ok' | 'suppressed' | 'error'
    this.errorMessage = null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      params: this.params,
      targetRefs: this.targetRefs,
      suppressed: this.suppressed,
      status: this.status
    };
  }

  static fromJSON(data) {
    const node = new FeatureNode({
      id: data.id,
      name: data.name,
      type: data.type,
      params: data.params,
      targetRefs: data.targetRefs,
      suppressed: data.suppressed
    });
    node.status = data.status || 'ok';
    return node;
  }
}

/**
 * The chronological Directed Acyclic Graph / History sequence for a Part.
 * Controls the Rollback Bar and sequential execution pipeline.
 */
export class FeatureTree {
  constructor(features = []) {
    this.features = features; // array of FeatureNode
    this.rollbackIndex = features.length > 0 ? features.length - 1 : -1;
  }

  addFeature(featureData) {
    const node = featureData instanceof FeatureNode ? featureData : new FeatureNode(featureData);
    
    // If rollback bar is moved up, insert after the current rollback position
    if (this.rollbackIndex >= -1 && this.rollbackIndex < this.features.length - 1) {
      this.features.splice(this.rollbackIndex + 1, 0, node);
      this.rollbackIndex++;
    } else {
      this.features.push(node);
      this.rollbackIndex = this.features.length - 1;
    }
    return node;
  }

  removeFeature(featureId) {
    const idx = this.features.findIndex((f) => f.id === featureId);
    if (idx === -1) return null;
    const removed = this.features.splice(idx, 1)[0];
    if (this.rollbackIndex >= this.features.length) {
      this.rollbackIndex = this.features.length - 1;
    }
    return removed;
  }

  setSuppressed(featureId, suppressed = true) {
    const feat = this.features.find((f) => f.id === featureId);
    if (feat) {
      feat.suppressed = suppressed;
      feat.status = suppressed ? 'suppressed' : 'ok';
      return true;
    }
    return false;
  }

  toggleSuppression(featureId) {
    const feat = this.features.find((f) => f.id === featureId);
    if (feat) {
      return this.setSuppressed(featureId, !feat.suppressed);
    }
    return false;
  }

  setRollbackIndex(index) {
    const clamped = Math.max(-1, Math.min(this.features.length - 1, index));
    this.rollbackIndex = clamped;
    return this.rollbackIndex;
  }

  rollToFeature(featureId) {
    const idx = this.features.findIndex((f) => f.id === featureId);
    if (idx !== -1) {
      return this.setRollbackIndex(idx);
    }
    return this.rollbackIndex;
  }

  rollToEnd() {
    return this.setRollbackIndex(this.features.length - 1);
  }

  moveFeature(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.features.length) return false;
    if (toIndex < 0 || toIndex >= this.features.length) return false;
    if (fromIndex === toIndex) return false;
    // Do not move base feature (index 0)
    if (fromIndex === 0 || toIndex === 0) return false;

    const [feat] = this.features.splice(fromIndex, 1);
    this.features.splice(toIndex, 0, feat);
    return true;
  }

  getActiveFeatures() {
    if (this.rollbackIndex < 0) return [];
    const activeSlice = this.features.slice(0, this.rollbackIndex + 1);
    return activeSlice.filter((f) => !f.suppressed);
  }

  isFeatureActive(featureId) {
    const idx = this.features.findIndex((f) => f.id === featureId);
    if (idx === -1) return false;
    if (idx > this.rollbackIndex) return false;
    return !this.features[idx].suppressed;
  }

  isRolledBack(featureId) {
    const idx = this.features.findIndex((f) => f.id === featureId);
    return idx > this.rollbackIndex;
  }

  toJSON() {
    return {
      features: this.features.map((f) => f.toJSON()),
      rollbackIndex: this.rollbackIndex
    };
  }

  static fromJSON(data) {
    if (!data || !Array.isArray(data.features)) return new FeatureTree();
    const features = data.features.map((f) => FeatureNode.fromJSON(f));
    const tree = new FeatureTree(features);
    tree.rollbackIndex = data.rollbackIndex !== undefined ? data.rollbackIndex : features.length - 1;
    return tree;
  }
}

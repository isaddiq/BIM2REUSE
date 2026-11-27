(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  class OrbitController {
    constructor(camera, dom, onChange) {
      __publicField(this, "onDown", (e) => {
        this.dragDistance = 0;
        if (!this.enabled) return;
        if (this.beforeStart && this.beforeStart(e) === false) return;
        this._anim = null;
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._pointers.size === 2) {
          this._pinch = this._pinchState();
          this._mode = "pinch";
        } else {
          this._mode = e.button === 2 || e.button === 1 || e.shiftKey ? "pan" : "orbit";
        }
        try {
          this.dom.setPointerCapture(e.pointerId);
        } catch (e2) {
        }
      });
      __publicField(this, "onMove", (e) => {
        const p = this._pointers.get(e.pointerId);
        if (!p || !this.enabled) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        this.dragDistance += Math.abs(dx) + Math.abs(dy);
        if (this._mode === "pinch" && this._pointers.size >= 2) {
          const next = this._pinchState();
          if (this._pinch && next.dist > 0) {
            this.spherical.radius = this._clampRadius(this.spherical.radius * (this._pinch.dist / next.dist));
            this._panPixels(next.cx - this._pinch.cx, next.cy - this._pinch.cy);
          }
          this._pinch = next;
        } else if (this._mode === "orbit") {
          this.spherical.theta -= dx * 6e-3;
          this.spherical.phi = Math.max(0.03, Math.min(Math.PI - 0.03, this.spherical.phi - dy * 6e-3));
        } else if (this._mode === "pan") {
          this._panPixels(dx, dy);
        }
        this.apply();
      });
      __publicField(this, "onUp", (e) => {
        if (!this._pointers.has(e.pointerId)) return;
        this._pointers.delete(e.pointerId);
        try {
          this.dom.releasePointerCapture(e.pointerId);
        } catch (e2) {
        }
        if (this._pointers.size === 1) {
          this._mode = "orbit";
          this._pinch = null;
        } else if (this._pointers.size === 0) {
          this._mode = null;
        }
      });
      __publicField(this, "onWheel", (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this._anim = null;
        const factor = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 16e-4);
        const next = this._clampRadius(this.spherical.radius * factor);
        const applied = next / this.spherical.radius;
        const r = this.dom.getBoundingClientRect();
        const ndc = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, this.camera);
        const normal = new THREE.Vector3().subVectors(this.camera.position, this.target).normalize();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.target);
        const hit = new THREE.Vector3();
        if (ray.ray.intersectPlane(plane, hit)) this.target.lerp(hit, 1 - applied);
        this.spherical.radius = next;
        this.apply();
      });
      this.camera = camera;
      this.dom = dom;
      this.onChange = onChange || (() => {
      });
      this.target = new THREE.Vector3();
      this.spherical = new THREE.Spherical(30, 1, Math.PI / 4);
      this.minRadius = 0.5;
      this.maxRadius = 2e3;
      this.enabled = true;
      this.beforeStart = null;
      this.dragDistance = 0;
      this._mode = null;
      this._pointers = /* @__PURE__ */ new Map();
      this._pinch = null;
      this._anim = null;
      this.dom.addEventListener("pointerdown", this.onDown);
      this.dom.addEventListener("pointermove", this.onMove);
      window.addEventListener("pointerup", this.onUp);
      window.addEventListener("pointercancel", this.onUp);
      this.dom.addEventListener("wheel", this.onWheel, { passive: false });
    }
    dispose() {
      this.dom.removeEventListener("pointerdown", this.onDown);
      this.dom.removeEventListener("pointermove", this.onMove);
      window.removeEventListener("pointerup", this.onUp);
      window.removeEventListener("pointercancel", this.onUp);
      this.dom.removeEventListener("wheel", this.onWheel);
    }
    _pinchState() {
      const pts = [...this._pointers.values()];
      return { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2 };
    }
    _panPixels(dx, dy) {
      const h = this.dom.clientHeight || 1;
      const worldPerPixel = 2 * this.spherical.radius * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / h;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
      this.target.addScaledVector(right, -dx * worldPerPixel);
      this.target.addScaledVector(up, dy * worldPerPixel);
    }
    _clampRadius(r) {
      return Math.max(this.minRadius, Math.min(this.maxRadius, r));
    }
    apply() {
      const offset = new THREE.Vector3().setFromSpherical(this.spherical);
      this.camera.position.copy(this.target).add(offset);
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
      this.onChange();
    }
    /** Smoothly move to { target, radius, theta, phi } (any subset). */
    animateTo(to, duration = 420) {
      const from = { target: this.target.clone(), radius: this.spherical.radius, theta: this.spherical.theta, phi: this.spherical.phi };
      const dest = {
        target: to.target ? to.target.clone() : from.target.clone(),
        radius: to.radius != null ? this._clampRadius(to.radius) : from.radius,
        theta: to.theta != null ? to.theta : from.theta,
        phi: to.phi != null ? to.phi : from.phi
      };
      while (dest.theta - from.theta > Math.PI) dest.theta -= Math.PI * 2;
      while (dest.theta - from.theta < -Math.PI) dest.theta += Math.PI * 2;
      const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this._anim = { from, dest, start: performance.now(), duration: reduce ? 0 : duration };
      this.update(performance.now());
    }
    /** Advance any running animation. Returns true while animating. */
    update(now) {
      if (!this._anim) return false;
      const { from, dest, start, duration } = this._anim;
      const t = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      const k = 1 - Math.pow(1 - t, 3);
      this.target.lerpVectors(from.target, dest.target, k);
      this.spherical.radius = from.radius + (dest.radius - from.radius) * k;
      this.spherical.theta = from.theta + (dest.theta - from.theta) * k;
      this.spherical.phi = from.phi + (dest.phi - from.phi) * k;
      this.apply();
      if (t >= 1) this._anim = null;
      return true;
    }
  }
  const SECTION_FACES = [
    { id: "xMin", axis: "x", edge: "min", normal: new THREE.Vector3(1, 0, 0) },
    { id: "xMax", axis: "x", edge: "max", normal: new THREE.Vector3(-1, 0, 0) },
    { id: "yMin", axis: "y", edge: "min", normal: new THREE.Vector3(0, 1, 0) },
    { id: "yMax", axis: "y", edge: "max", normal: new THREE.Vector3(0, -1, 0) },
    { id: "zMin", axis: "z", edge: "min", normal: new THREE.Vector3(0, 0, 1) },
    { id: "zMax", axis: "z", edge: "max", normal: new THREE.Vector3(0, 0, -1) }
  ];
  const VIEW_PRESETS = {
    iso: { theta: Math.PI / 4, phi: 1 },
    top: { theta: 0, phi: 1e-4 },
    bottom: { theta: 0, phi: Math.PI - 1e-4 },
    front: { theta: 0, phi: Math.PI / 2 },
    back: { theta: Math.PI, phi: Math.PI / 2 },
    right: { theta: Math.PI / 2, phi: Math.PI / 2 },
    left: { theta: -Math.PI / 2, phi: Math.PI / 2 }
  };
  const THEME_COLORS = {
    light: { accent: 1474634, hover: 1280643, ghost: 12895428, edge: 1776411, measure: 14125606, background: null, fog: 15132390, gridMajor: 10132122, gridMinor: 13816530 },
    dark: { accent: 5230730, hover: 6280137, ghost: 5592405, edge: 13684944, measure: 15772236, background: 1315860, fog: 1315860, gridMajor: 4473924, gridMinor: 2500134 }
  };
  class ThreeViewer {
    constructor(host) {
      __publicField(this, "onClick", (e) => {
        if (this.controls.dragDistance > 5 || this._sectionDragJustEnded) {
          this._sectionDragJustEnded = false;
          return;
        }
        if (this._placement) {
          const p = this._planePoint(e);
          if (p) this._emit("place", { point: p, shift: e.shiftKey, x: e.clientX, y: e.clientY });
          return;
        }
        if (this._measureMode) {
          this._handleMeasureClick(e);
          return;
        }
        const hit = this._pickAt(e);
        if (this._annoMode) {
          if (this.lastPickPoint) this._emit("anno", { position: this.lastPickPoint.clone(), elementId: hit.expressId });
          return;
        }
        this._emit("pick", { expressId: hit.expressId, overlay: hit.overlay || null, multi: e.ctrlKey || e.metaKey || e.shiftKey, x: e.clientX, y: e.clientY });
      });
      __publicField(this, "onDblClick", (e) => {
        if (this._measureMode || this._annoMode || this._placement) return;
        const hit = this._pickAt(e);
        if (hit.expressId != null && !hit.overlay) this.frameElements([hit.expressId]);
      });
      __publicField(this, "onContextMenu", (e) => {
        e.preventDefault();
        if (this.controls.dragDistance > 5) return;
        const hit = this._pickAt(e);
        this._emit("context", { expressId: hit.overlay ? null : hit.expressId, x: e.clientX, y: e.clientY });
      });
      __publicField(this, "onPointerDown", (e) => {
        if (!this.sectionEnabled || !this.sectionBox || e.button !== 0) return;
        const face = this._pickSectionHandle(e);
        if (!face) return;
        e.preventDefault();
        this._sectionDrag = { face, pointerId: e.pointerId };
        try {
          this.renderer.domElement.setPointerCapture(e.pointerId);
        } catch (e2) {
        }
        this.renderer.domElement.style.cursor = "grabbing";
      });
      __publicField(this, "onPointerUp", (e) => {
        if (this._sectionDrag && e.pointerId === this._sectionDrag.pointerId) {
          this._sectionDrag = null;
          this._sectionDragJustEnded = true;
          this.renderer.domElement.style.cursor = "";
          setTimeout(() => {
            this._sectionDragJustEnded = false;
          }, 0);
        }
      });
      __publicField(this, "onPointerMove", (e) => {
        if (this._sectionDrag) {
          this._dragSectionFace(e);
          return;
        }
        if (this.controls._mode) return;
        this._hoverEvent = { clientX: e.clientX, clientY: e.clientY };
        if (this._hoverRaf) return;
        this._hoverRaf = requestAnimationFrame(() => {
          this._hoverRaf = 0;
          const ev = this._hoverEvent;
          if (!ev) return;
          if (this._placement) {
            const p = this._planePoint(ev);
            this._setHover(null);
            this._emit("placeHover", { point: p, shift: ev.shiftKey });
            return;
          }
          if (this.sectionEnabled && this.sectionHandleGroup) {
            const over = this._pickSectionHandle(ev);
            this.renderer.domElement.style.cursor = over ? "grab" : this._measureMode || this._annoMode ? "crosshair" : "";
            if (over) {
              this._setHover(null);
              this._emit("hover", { expressId: null });
              return;
            }
          }
          const hit = this._pickAt(ev);
          if (this._measureMode && this._measureStart && this.lastPickPoint) this._updateMeasurePreview(this.lastPickPoint);
          const id = hit.overlay ? null : hit.expressId;
          this._setHover(this._measureMode || this._annoMode ? null : id);
          this._emit("hover", { expressId: hit.expressId, overlay: hit.overlay || null, x: ev.clientX, y: ev.clientY });
        });
      });
      __publicField(this, "onPointerLeave", () => {
        this._hoverEvent = null;
        this._setHover(null);
        this._emit("hover", { expressId: null });
      });
      this.host = host;
      this.scene = new THREE.Scene();
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.localClippingEnabled = true;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.domElement.className = "viewer-canvas";
      this.renderer.domElement.setAttribute("aria-label", "3D model view");
      host.appendChild(this.renderer.domElement);
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 5e3);
      this.camera.position.set(28, 22, 28);
      this.hemiLight = new THREE.HemisphereLight(15922939, 8226966, 1.6);
      this.scene.add(this.hemiLight);
      this.keyLight = new THREE.DirectionalLight(16777215, 1.5);
      this.keyLight.position.set(0.6, 1, 0.35);
      this.scene.add(this.keyLight);
      this.fillLight = new THREE.DirectionalLight(14674431, 0.55);
      this.fillLight.position.set(-0.7, 0.4, -0.5);
      this.scene.add(this.fillLight);
      this.modelRoot = new THREE.Group();
      this.modelRoot.name = "IFCModelRoot";
      this.scene.add(this.modelRoot);
      this.edgesGroup = new THREE.Group();
      this.modelRoot.add(this.edgesGroup);
      this.outlineGroup = new THREE.Group();
      this.modelRoot.add(this.outlineGroup);
      this.overlayGroup = new THREE.Group();
      this.overlayGroup.name = "Overlays";
      this.modelRoot.add(this.overlayGroup);
      this.measureGroup = new THREE.Group();
      this.scene.add(this.measureGroup);
      this.modelSize = 40;
      this.grid = null;
      this.axes = null;
      this.theme = "light";
      this.colors = THEME_COLORS.light;
      this.outlineMat = new THREE.LineBasicMaterial({ color: this.colors.accent });
      this.edgeMat = new THREE.LineBasicMaterial({ color: this.colors.edge, transparent: true, opacity: 0.35 });
      this._tmpColor = new THREE.Color();
      this.controls = new OrbitController(this.camera, this.renderer.domElement, () => {
        this.invalidate();
        this._emit("camera", this.getCameraOrientation());
      });
      this.controls.beforeStart = (e) => !(this.sectionEnabled && e.button === 0 && this._pickSectionHandle(e));
      this.model = null;
      this.meshes = /* @__PURE__ */ new Map();
      this.selectedIds = /* @__PURE__ */ new Set();
      this.hiddenIds = /* @__PURE__ */ new Set();
      this.isolatedIds = /* @__PURE__ */ new Set();
      this.colorOverrides = /* @__PURE__ */ new Map();
      this.opacityOverrides = /* @__PURE__ */ new Map();
      this.hoverId = null;
      this.viewMode = "shaded";
      this.showEdges = false;
      this.spacesVisible = false;
      this.explodeFactor = 0;
      this.sectionEnabled = false;
      this.sectionBox = null;
      this.sectionBounds = null;
      this.sectionHandleGroup = null;
      this.sectionHandleMeshes = /* @__PURE__ */ new Map();
      this.sectionBoxEdges = null;
      this._sectionDrag = null;
      this.planCut = { enabled: false, y: 0 };
      this._clipPlanes = null;
      this._measureMode = false;
      this._annoMode = false;
      this._measureStart = null;
      this._measureMarker = null;
      this.overlays = /* @__PURE__ */ new Map();
      this._frameListeners = /* @__PURE__ */ new Set();
      this._listeners = { pick: [], hover: [], measure: [], anno: [], sectionBox: [], camera: [], context: [], loaded: [], place: [], placeHover: [] };
      this._placement = null;
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.lastPickPoint = null;
      this._hoverEvent = null;
      this._hoverRaf = 0;
      this._applyTheme();
      this._rebuildGrid();
      this._rebuildAxes();
      this.controls.apply();
      this._sizeW = 0;
      this._sizeH = 0;
      this._resizeRaf = 0;
      this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
      this.resizeObserver.observe(host);
      this.handleResize();
      const dom = this.renderer.domElement;
      dom.addEventListener("click", this.onClick);
      dom.addEventListener("dblclick", this.onDblClick);
      dom.addEventListener("pointerdown", this.onPointerDown);
      dom.addEventListener("pointermove", this.onPointerMove);
      dom.addEventListener("pointerleave", this.onPointerLeave);
      dom.addEventListener("contextmenu", this.onContextMenu);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerUp);
      this._stats = { frameMs: 0, calls: 0, triangles: 0 };
      this._needsRender = true;
      this._running = true;
      this._lastFrame = performance.now();
      this._clock = 0;
      this.renderLoop = this.renderLoop.bind(this);
      requestAnimationFrame(this.renderLoop);
    }
    // ----- Loading -------------------------------------------------------------
    async loadModel(model) {
      this.clearModel();
      this.model = model;
      this.modelRoot.position.set(0, 0, 0);
      const geomElements = model.elements.filter((el) => el.geometry);
      const CHUNK = 160;
      let framed = false;
      for (let i = 0; i < geomElements.length; i++) {
        if (this.model !== model) return;
        const el = geomElements[i];
        const mesh = this._createMesh(el);
        if (!mesh) continue;
        this.modelRoot.add(mesh);
        this.meshes.set(el.expressId, mesh);
        if (!framed && this.meshes.size >= 24) {
          this._fitSceneToModel();
          this.frameAll({ resetView: true, animate: false });
          framed = true;
        }
        if (i % CHUNK === CHUNK - 1) {
          this._applyVisibility();
          this.invalidate();
          await new Promise((r) => requestAnimationFrame(r));
        }
      }
      this._fitSceneToModel();
      this._applyVisibility();
      this._applyClipping();
      this.frameAll({ resetView: true, animate: false });
      if (!this.meshes.size && model.extentHint) this._frameEmpty(model.extentHint);
      this._emit("loaded", { meshes: this.meshes.size });
    }
    // An empty survey: frame the area it will cover, at the ground.
    _frameEmpty(bbox) {
      this.modelRoot.position.set(0, 0, 0);
      this.modelRoot.updateMatrixWorld(true);
      const box = new THREE.Box3(new THREE.Vector3(...bbox.min), new THREE.Vector3(...bbox.max));
      const size = box.getSize(new THREE.Vector3());
      this.modelSize = Math.max(size.x, size.y, size.z, 10);
      this.camera.far = this.modelSize * 60;
      this.camera.updateProjectionMatrix();
      this.controls.maxRadius = this.modelSize * 12;
      this._rebuildGrid();
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      this._moveCamera({ target: sphere.center, radius: this._fitRadius(sphere), ...VIEW_PRESETS.iso }, false);
    }
    /**
     * Apply an edited model of the same source (a building survey being recorded) without a
     * reload: the camera stays, and only elements whose geometry object changed are rebuilt.
     */
    async updateModel(model) {
      if (!this.model) return this.loadModel(model);
      const wasEmpty = this.meshes.size === 0;
      this.model = model;
      const keep = /* @__PURE__ */ new Set();
      model.elements.forEach((el) => {
        if (!el.geometry) return;
        keep.add(el.expressId);
        const old = this.meshes.get(el.expressId);
        if (old && old.userData.geometrySource === el.geometry && old.userData.ifcClass === el.ifcClass) {
          old.userData.storeyId = el.storey ? el.storey.expressId : null;
          return;
        }
        if (old) this._disposeMesh(el.expressId);
        const mesh = this._createMesh(el);
        if (!mesh) return;
        this.modelRoot.add(mesh);
        this.meshes.set(el.expressId, mesh);
      });
      [...this.meshes.keys()].forEach((id) => {
        if (!keep.has(id)) this._disposeMesh(id);
      });
      if (wasEmpty && this.meshes.size) this._fitSceneToModel();
      if (this.showEdges) this.setShowEdges(true);
      this._applyVisibility();
      this._applyClipping();
      this.setExplode(this.explodeFactor);
      this._refreshAllMaterials();
    }
    _disposeMesh(id) {
      const m = this.meshes.get(id);
      if (!m) return;
      m.geometry.dispose();
      m.material.dispose();
      if (m.userData.edgeGeo) m.userData.edgeGeo.dispose();
      this.modelRoot.remove(m);
      if (m.userData.edge) this.edgesGroup.remove(m.userData.edge);
      this.meshes.delete(id);
    }
    // ----- Placement on a horizontal plane (building survey) -------------------
    /** `{ y }` in model coordinates turns placement on: clicks emit 'place' with the model point, moves 'placeHover'. */
    setPlacementMode(opts) {
      this._placement = opts && Number.isFinite(opts.y) ? { y: opts.y } : null;
      this.renderer.domElement.style.cursor = this._placement ? "crosshair" : "";
    }
    _planePoint(e) {
      if (!this._placement) return null;
      this._ndc(e);
      this.modelRoot.updateMatrixWorld(true);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this._placement.y + this.modelRoot.position.y));
      const hit = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
      return hit.sub(this.modelRoot.position).toArray();
    }
    _createMesh(el) {
      const g = el.geometry;
      if (!g || g.kind !== "mesh" || !g.indices.length) return null;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(g.positions, 3));
      if (g.normals) geom.setAttribute("normal", new THREE.BufferAttribute(g.normals, 3));
      geom.setIndex(new THREE.BufferAttribute(g.indices, 1));
      if (!g.normals) geom.computeVertexNormals();
      geom.computeBoundingBox();
      geom.computeBoundingSphere();
      const isSpace = el.ifcClass === "IfcSpace";
      const isGlass = /^IfcWindow/.test(el.ifcClass) || g.color && g.color.a < 0.6;
      const isOpening = /^IfcOpening/.test(el.ifcClass);
      const baseColor = new THREE.Color();
      if (g.color) baseColor.setRGB(g.color.r, g.color.g, g.color.b, THREE.SRGBColorSpace);
      else baseColor.set(CLASS_COLOR(el.ifcClass));
      let baseOpacity = 1;
      if (isSpace) baseOpacity = 0.18;
      else if (g.color && g.color.a < 0.99) baseOpacity = Math.max(0.25, g.color.a);
      else if (isGlass) baseOpacity = 0.4;
      const mat = new THREE.MeshLambertMaterial({ color: baseColor });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData = { expressId: el.expressId, ifcClass: el.ifcClass, storeyId: el.storey ? el.storey.expressId : null, baseColor, baseOpacity, isSpace, isGlass, isOpening, geometrySource: g };
      mesh.visible = !isOpening;
      this._refreshMaterial(mesh);
      return mesh;
    }
    clearModel() {
      this.meshes.forEach((m) => {
        m.geometry.dispose();
        m.material.dispose();
        this.modelRoot.remove(m);
        if (m.userData.edge) {
          m.userData.edge.geometry.dispose();
          this.edgesGroup.remove(m.userData.edge);
        }
      });
      this.meshes.clear();
      this.model = null;
      this.selectedIds.clear();
      this.hiddenIds.clear();
      this.isolatedIds.clear();
      this.colorOverrides.clear();
      this.opacityOverrides.clear();
      this.hoverId = null;
      this.explodeFactor = 0;
      this._clearOutlines();
      this.clearMeasurements();
      this.overlays.forEach((_, name) => this.removeOverlay(name));
      this.invalidate();
    }
    // Scale camera clipping, zoom limits, grid, fog and axes to the model.
    _fitSceneToModel() {
      this.modelRoot.position.set(0, 0, 0);
      this.modelRoot.updateMatrixWorld(true);
      const box = this._robustBox(() => true);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      if (this.model && this.model.isSurvey) this.modelRoot.position.set(0, 0, 0);
      else this.modelRoot.position.set(-center.x, -box.min.y, -center.z);
      this.modelRoot.updateMatrixWorld(true);
      const size = box.getSize(new THREE.Vector3());
      this.modelSize = Math.max(size.x, size.y, size.z, 1);
      this.camera.near = Math.max(0.01, this.modelSize / 4e3);
      this.camera.far = this.modelSize * 60;
      this.camera.updateProjectionMatrix();
      this.controls.minRadius = Math.max(0.2, this.modelSize / 400);
      this.controls.maxRadius = this.modelSize * 12;
      this._rebuildGrid();
      this._rebuildAxes();
      this._applyFog();
      this.invalidate();
    }
    // ----- Materials ------------------------------------------------------------
    _refreshMaterial(mesh) {
      const ud = mesh.userData;
      const id = ud.expressId;
      const mat = mesh.material;
      const selected = this.selectedIds.has(id);
      const hovered = this.hoverId === id;
      const override = this.colorOverrides.get(id);
      const opOverride = this.opacityOverrides.get(id);
      if (override) mat.color.set(override);
      else mat.color.copy(ud.baseColor);
      if (selected) mat.color.lerp(this._tmpColor.setHex(this.colors.accent), 0.6);
      let opacity = opOverride != null ? opOverride : ud.baseOpacity;
      let depthWrite = opacity >= 0.99;
      if (this.viewMode === "xray" && !selected) {
        mat.color.lerp(this._tmpColor.setHex(this.colors.ghost), 0.55);
        opacity = Math.min(opacity, ud.isSpace ? 0.05 : 0.14);
        depthWrite = false;
      }
      mat.wireframe = this.viewMode === "wireframe";
      mat.opacity = opacity;
      mat.transparent = opacity < 0.99;
      mat.depthWrite = depthWrite;
      const side = mat.transparent || ud.isSpace ? THREE.DoubleSide : THREE.FrontSide;
      if (mat.side !== side) {
        mat.side = side;
        mat.needsUpdate = true;
      }
      if (selected) mat.emissive.setHex(this.colors.accent).multiplyScalar(0.25);
      else if (hovered) mat.emissive.setHex(this.colors.hover).multiplyScalar(0.22);
      else mat.emissive.setHex(0);
      mat.clippingPlanes = this._clipPlanes;
      mesh.renderOrder = mat.transparent ? 2 : 0;
    }
    _refreshAllMaterials() {
      this.meshes.forEach((m) => this._refreshMaterial(m));
      this.invalidate();
    }
    // ----- Selection, hover, visibility ------------------------------------------
    setSelection(ids) {
      const prev = this.selectedIds;
      this.selectedIds = new Set(ids);
      if (this.viewMode === "xray") this._refreshAllMaterials();
      else {
        prev.forEach((id) => {
          if (!this.selectedIds.has(id)) this._refreshById(id);
        });
        this.selectedIds.forEach((id) => {
          if (!prev.has(id)) this._refreshById(id);
        });
      }
      this._applyVisibility();
      this._updateOutlines();
      this.invalidate();
    }
    _refreshById(id) {
      const m = this.meshes.get(id);
      if (m) this._refreshMaterial(m);
    }
    _setHover(id) {
      if (this.hoverId === id) return;
      const prev = this.hoverId;
      this.hoverId = id;
      if (prev != null) this._refreshById(prev);
      if (id != null) this._refreshById(id);
      this.invalidate();
    }
    setHidden(ids) {
      this.hiddenIds = new Set(ids);
      this._applyVisibility();
    }
    setIsolated(ids) {
      this.isolatedIds = new Set(ids);
      this._applyVisibility();
    }
    setSpacesVisible(v) {
      this.spacesVisible = !!v;
      this._applyVisibility();
    }
    setColorOverrides(map) {
      this.colorOverrides = new Map(map);
      this._refreshAllMaterials();
    }
    setOpacityOverrides(map) {
      this.opacityOverrides = new Map(map);
      this._refreshAllMaterials();
    }
    isElementVisible(id) {
      const m = this.meshes.get(id);
      return !!(m && m.visible);
    }
    _applyVisibility() {
      const iso = this.isolatedIds.size > 0;
      this.meshes.forEach((m, id) => {
        const ud = m.userData;
        let visible = !ud.isOpening;
        if (iso && !this.isolatedIds.has(id)) visible = false;
        if (this.hiddenIds.has(id)) visible = false;
        if (ud.isSpace && !this.spacesVisible && !this.isolatedIds.has(id) && !this.selectedIds.has(id)) visible = false;
        m.visible = visible;
        if (ud.edge) ud.edge.visible = visible && this.showEdges;
      });
      this._updateOutlines();
      this.invalidate();
    }
    _clearOutlines() {
      while (this.outlineGroup.children.length) this.outlineGroup.remove(this.outlineGroup.children[0]);
    }
    _edgeGeometry(mesh) {
      if (mesh.userData.edgeGeo === void 0) {
        const tri = mesh.geometry.index ? mesh.geometry.index.count / 3 : 0;
        mesh.userData.edgeGeo = tri > 0 && tri <= 2e4 ? new THREE.EdgesGeometry(mesh.geometry, 30) : null;
      }
      return mesh.userData.edgeGeo;
    }
    _updateOutlines() {
      this._clearOutlines();
      let n = 0;
      for (const id of this.selectedIds) {
        if (n++ > 400) break;
        const m = this.meshes.get(id);
        if (!m || !m.visible) continue;
        const geo = this._edgeGeometry(m);
        if (!geo) continue;
        const line = new THREE.LineSegments(geo, this.outlineMat);
        line.position.copy(m.position);
        line.renderOrder = 3;
        this.outlineGroup.add(line);
      }
    }
    setShowEdges(v) {
      this.showEdges = v;
      if (v) {
        this.meshes.forEach((mesh) => {
          if (mesh.userData.edge || mesh.userData.isSpace || mesh.userData.isOpening) return;
          const geo = this._edgeGeometry(mesh);
          if (!geo) return;
          const edge = new THREE.LineSegments(geo, this.edgeMat);
          edge.position.copy(mesh.position);
          edge.userData.expressId = mesh.userData.expressId;
          this.edgesGroup.add(edge);
          mesh.userData.edge = edge;
        });
      }
      this.meshes.forEach((m) => {
        if (m.userData.edge) m.userData.edge.visible = v && m.visible;
      });
      this.invalidate();
    }
    setViewMode(mode) {
      this.viewMode = mode;
      this._refreshAllMaterials();
    }
    // ----- Pointer handling -------------------------------------------------------
    _ndc(e) {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.mouse, this.camera);
    }
    _pickAt(e) {
      this._ndc(e);
      const overlayTargets = [];
      this.overlays.forEach((o) => {
        if (o.pickable && o.object.visible) overlayTargets.push(o.object);
      });
      if (overlayTargets.length) {
        const hits2 = this.raycaster.intersectObjects(overlayTargets, true).filter((h) => h.object.userData.pick != null).filter((h) => !this._clipPlanes || this._clipPlanes.every((p) => p.distanceToPoint(h.point) >= -1e-4));
        if (hits2.length) {
          const ud = hits2[0].object.userData;
          this.lastPickPoint = hits2[0].point.clone();
          return { expressId: ud.pick, overlay: ud.overlayKey || true };
        }
      }
      const candidates = [];
      this.meshes.forEach((m) => {
        if (m.visible) candidates.push(m);
      });
      const hits = this.raycaster.intersectObjects(candidates, false);
      const hit = hits.find((h) => !this._clipPlanes || this._clipPlanes.every((p) => p.distanceToPoint(h.point) >= -1e-4));
      if (!hit) {
        this.lastPickPoint = null;
        return { expressId: null };
      }
      this.lastPickPoint = hit.point.clone();
      return { expressId: hit.object.userData.expressId };
    }
    /** Element under a client point, ignoring overlays. */
    pickAtClient(x, y) {
      return this._pickAt({ clientX: x, clientY: y }).expressId;
    }
    // ----- Camera ---------------------------------------------------------------
    _boxOf(ids) {
      const box = new THREE.Box3();
      this.modelRoot.updateMatrixWorld(true);
      if (ids && ids.length > 24) {
        const set = new Set(ids);
        return this._robustBox((m) => set.has(m.userData.expressId));
      }
      if (ids) ids.forEach((id) => {
        const m = this.meshes.get(id);
        if (m) box.expandByObject(m);
      });
      else return this._robustBox((m) => m.visible);
      return box;
    }
    // Bounding box that ignores far-away items (survey markers, stray proxies): the
    // elements nearest the size-weighted centre that make up 85% of the total extent
    // form a core, and other elements count only if they sit near that core.
    _robustBox(filter) {
      const items = [];
      this.meshes.forEach((m) => {
        if (m.userData.isOpening || !filter(m)) return;
        const b = new THREE.Box3().setFromObject(m);
        if (b.isEmpty()) return;
        items.push({ b, c: b.getCenter(new THREE.Vector3()), w: b.getSize(new THREE.Vector3()).length() });
      });
      const box = new THREE.Box3();
      if (items.length < 3) {
        items.forEach((i) => box.union(i.b));
        return box;
      }
      const total = items.reduce((a, i) => a + i.w, 0);
      const centre = items.reduce((a, i) => a.addScaledVector(i.c, i.w / total), new THREE.Vector3());
      items.forEach((i) => {
        i.d = i.c.distanceTo(centre);
      });
      items.sort((a, b) => a.d - b.d);
      const core = new THREE.Box3();
      let acc = 0;
      items.forEach((i) => {
        if (acc < total * 0.85 || core.isEmpty()) core.union(i.b);
        acc += i.w;
      });
      const reach = core.clone().expandByScalar(core.getSize(new THREE.Vector3()).length() * 0.5);
      box.copy(core);
      items.forEach((i) => {
        if (reach.containsPoint(i.c)) box.union(i.b);
      });
      return box;
    }
    _fitRadius(sphere) {
      const fov = THREE.MathUtils.degToRad(this.camera.fov);
      const fit = sphere.radius / Math.sin(Math.min(fov, fov * this.camera.aspect) / 2);
      return Math.max(fit * 1.05, this.controls.minRadius * 4);
    }
    frameAll({ resetView = false, animate = true } = {}) {
      let box = this._boxOf(null);
      if (box.isEmpty()) box = this._boxOf([...this.meshes.keys()]);
      if (box.isEmpty()) return;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const to = { target: sphere.center, radius: this._fitRadius(sphere) };
      if (resetView) Object.assign(to, VIEW_PRESETS.iso);
      this._moveCamera(to, animate);
    }
    frameElements(ids, { animate = true } = {}) {
      const box = this._boxOf(ids);
      if (box.isEmpty()) return;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      sphere.radius = Math.max(sphere.radius, this.modelSize / 60);
      this._moveCamera({ target: sphere.center, radius: this._fitRadius(sphere) * 1.15 }, animate);
    }
    /** Frame a box given in model coordinates ({ min:[x,y,z], max:[x,y,z] }). */
    frameModelBox(bbox, { preset } = {}) {
      const box = new THREE.Box3(new THREE.Vector3(...bbox.min), new THREE.Vector3(...bbox.max)).translate(this.modelRoot.position);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      this._moveCamera({ target: sphere.center, radius: this._fitRadius(sphere), ...preset ? VIEW_PRESETS[preset] : {} }, true);
    }
    _moveCamera(to, animate) {
      if (animate) this.controls.animateTo(to);
      else {
        if (to.target) this.controls.target.copy(to.target);
        if (to.radius != null) this.controls.spherical.radius = this.controls._clampRadius(to.radius);
        if (to.theta != null) this.controls.spherical.theta = to.theta;
        if (to.phi != null) this.controls.spherical.phi = to.phi;
        this.controls.apply();
      }
    }
    setCameraPreset(name) {
      const p = VIEW_PRESETS[name] || VIEW_PRESETS.iso;
      this.controls.animateTo({ theta: p.theta, phi: p.phi });
    }
    /** Look at the target from a direction such as [1, 1, 0] (navigation cube edges and corners). */
    setViewDirection(dir) {
      const v = new THREE.Vector3(...dir);
      if (!v.lengthSq()) return;
      v.normalize();
      const theta = Math.atan2(v.x, v.z);
      const phi = Math.min(Math.PI - 1e-4, Math.max(1e-4, Math.acos(v.y)));
      this.controls.animateTo({ theta, phi });
    }
    orbitBy(dTheta, dPhi) {
      const s = this.controls.spherical;
      s.theta += dTheta;
      s.phi = Math.max(0.03, Math.min(Math.PI - 0.03, s.phi + dPhi));
      this.controls.apply();
    }
    zoomIn(factor = 0.75) {
      this.controls.animateTo({ radius: this.controls.spherical.radius * factor }, 220);
    }
    zoomOut(factor = 1.33) {
      this.controls.animateTo({ radius: this.controls.spherical.radius * factor }, 220);
    }
    getCameraOrientation() {
      return { theta: this.controls.spherical.theta, phi: this.controls.spherical.phi };
    }
    getCameraState() {
      const s = this.controls.spherical;
      return { target: this.controls.target.toArray(), radius: s.radius, theta: s.theta, phi: s.phi };
    }
    setCameraState(state, animate = true) {
      if (!state) return;
      this._moveCamera({ target: new THREE.Vector3().fromArray(state.target), radius: state.radius, theta: state.theta, phi: state.phi }, animate);
    }
    // ----- Explode ----------------------------------------------------------------
    setExplode(factor) {
      this.explodeFactor = factor;
      const model = this.model;
      if (!model) return;
      const order = new Map(model.storeys.map((s, i) => [s.expressId, i]));
      const step = factor * Math.max(2, this.modelSize / Math.max(2, model.storeys.length)) * 0.6;
      this.meshes.forEach((m) => {
        const idx = m.userData.storeyId != null ? order.get(m.userData.storeyId) || 0 : 0;
        m.position.set(0, idx * step, 0);
        if (m.userData.edge) m.userData.edge.position.copy(m.position);
      });
      this._updateOutlines();
      this.invalidate();
    }
    // ----- Scene dressing -----------------------------------------------------------
    _rebuildGrid() {
      if (this.grid) {
        this.scene.remove(this.grid);
        this.grid.geometry.dispose();
        [].concat(this.grid.material).forEach((m) => m.dispose());
      }
      const size = Math.max(20, Math.ceil(this.modelSize * 2.5 / 10) * 10);
      const divisions = Math.min(200, Math.max(10, Math.round(size)));
      this.grid = new THREE.GridHelper(size, divisions, this.colors.gridMajor, this.colors.gridMinor);
      [].concat(this.grid.material).forEach((m) => {
        m.transparent = true;
        m.opacity = 0.75;
        m.depthWrite = false;
      });
      this.grid.position.y = -5e-3;
      this.scene.add(this.grid);
      this.invalidate();
    }
    _rebuildAxes() {
      if (this.axes) {
        this.scene.remove(this.axes);
        this.axes.traverse((o) => {
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
          if (o.geometry) o.geometry.dispose();
        });
      }
      const len = Math.max(1, this.modelSize * 0.08);
      const group = new THREE.Group();
      group.name = "Axes";
      const helper = new THREE.AxesHelper(len);
      helper.position.y = 0.01;
      group.add(helper);
      const label = (text, color, pos) => {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const ctx = c.getContext("2d");
        ctx.fillStyle = color;
        ctx.font = '600 40px "IBM Plex Sans", system-ui, sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 32, 34);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
        s.position.copy(pos);
        s.scale.setScalar(len * 0.22);
        s.renderOrder = 20;
        group.add(s);
      };
      const pad = len * 1.14;
      label("X", "#e5484d", new THREE.Vector3(pad, 0.01, 0));
      label("Y", "#30a46c", new THREE.Vector3(0, pad, 0));
      label("Z", "#3e7bfa", new THREE.Vector3(0, 0.01, pad));
      group.visible = this.axes ? this.axes.visible : true;
      this.axes = group;
      this.scene.add(group);
      this.invalidate();
    }
    setShowAxes(v) {
      if (this.axes) this.axes.visible = v;
      this.invalidate();
    }
    setShowGrid(v) {
      if (this.grid) this.grid.visible = v;
      this.invalidate();
    }
    setTheme(theme) {
      this.theme = theme === "dark" ? "dark" : "light";
      this._applyTheme();
      this._rebuildGrid();
      this._refreshAllMaterials();
    }
    _applyTheme() {
      this.colors = THEME_COLORS[this.theme];
      if (this.theme === "dark") {
        this.scene.background = new THREE.Color(this.colors.background);
        this.hemiLight.color.set(14869218);
        this.hemiLight.groundColor.set(3487029);
        this.hemiLight.intensity = 1.35;
        this.keyLight.intensity = 1.25;
        this.fillLight.intensity = 0.45;
      } else {
        this.scene.background = this._skyTexture();
        this.hemiLight.color.set(15922939);
        this.hemiLight.groundColor.set(8226966);
        this.hemiLight.intensity = 1.6;
        this.keyLight.intensity = 1.5;
        this.fillLight.intensity = 0.55;
      }
      this.outlineMat.color.setHex(this.colors.accent);
      this.edgeMat.color.setHex(this.colors.edge);
      this._applyFog();
      if (this.sectionBoxEdges) this.sectionBoxEdges.material.color.setHex(this.colors.accent);
      this.invalidate();
    }
    _applyFog() {
      const s = this.modelSize;
      this.scene.fog = new THREE.Fog(this.colors.fog, s * 4, s * 14);
    }
    _skyTexture() {
      if (this._sky) return this._sky;
      const c = document.createElement("canvas");
      c.width = 4;
      c.height = 256;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#d9dde2");
      g.addColorStop(0.55, "#f4f5f6");
      g.addColorStop(1, "#e6e8ea");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 256);
      this._sky = new THREE.CanvasTexture(c);
      this._sky.colorSpace = THREE.SRGBColorSpace;
      return this._sky;
    }
    // ----- Clipping: section box + plan cut ------------------------------------------
    _applyClipping() {
      const planes = [];
      if (this.sectionEnabled && this.sectionBox) planes.push(...this._sectionPlanes(this.sectionBox));
      if (this.planCut.enabled) {
        if (!this._planPlane) this._planPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
        this._planPlane.constant = this.planCut.y + this.modelRoot.position.y;
        planes.push(this._planPlane);
      }
      this._clipPlanes = planes.length ? planes : null;
      this.meshes.forEach((m) => {
        m.material.clippingPlanes = this._clipPlanes;
      });
      this.outlineMat.clippingPlanes = this._clipPlanes;
      this.edgeMat.clippingPlanes = this._clipPlanes;
      this.overlays.forEach((o) => {
        if (o.object.userData.noClip) return;
        o.object.traverse((c) => {
          if (c.material) c.material.clippingPlanes = this._clipPlanes;
        });
      });
      this.invalidate();
    }
    /** Keep geometry below `y` (model coordinates). */
    setPlanCut({ enabled, y }) {
      this.planCut = { enabled: !!enabled, y: y != null ? y : this.planCut.y };
      this._applyClipping();
    }
    _sectionPlanes(box) {
      if (!this._sectionClipPlanes) {
        this._sectionClipPlanes = SECTION_FACES.map((f) => new THREE.Plane(f.normal.clone(), 0));
      }
      const p = this._sectionClipPlanes;
      p[0].constant = -box.xMin;
      p[1].constant = box.xMax;
      p[2].constant = -box.yMin;
      p[3].constant = box.yMax;
      p[4].constant = -box.zMin;
      p[5].constant = box.zMax;
      return p;
    }
    _ensureSectionVisuals() {
      if (this.sectionHandleGroup) return;
      this.sectionHandleGroup = new THREE.Group();
      this.sectionHandleGroup.name = "SectionHandles";
      this.scene.add(this.sectionHandleGroup);
      SECTION_FACES.forEach((face) => {
        const mat = new THREE.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        mesh.userData.sectionFace = face.id;
        this.sectionHandleGroup.add(mesh);
        this.sectionHandleMeshes.set(face.id, mesh);
      });
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(72), 3));
      this.sectionBoxEdges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: this.colors.accent, transparent: true, opacity: 0.9, depthTest: false }));
      this.sectionBoxEdges.renderOrder = 11;
      this.scene.add(this.sectionBoxEdges);
    }
    _syncSectionVisuals(box) {
      this._ensureSectionVisuals();
      const cx = (box.xMin + box.xMax) / 2, cy = (box.yMin + box.yMax) / 2, cz = (box.zMin + box.zMax) / 2;
      const sx = Math.max(box.xMax - box.xMin, 0.02), sy = Math.max(box.yMax - box.yMin, 0.02), sz = Math.max(box.zMax - box.zMin, 0.02);
      const place = (id, center, normal, u, v, su, sv) => {
        const mesh = this.sectionHandleMeshes.get(id);
        mesh.position.copy(center);
        mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, normal));
        mesh.scale.set(Math.max(su, 0.5), Math.max(sv, 0.5), 1);
      };
      const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
      place("xMin", new THREE.Vector3(box.xMin, cy, cz), X.clone().negate(), Y, Z, sy, sz);
      place("xMax", new THREE.Vector3(box.xMax, cy, cz), X, Y, Z, sy, sz);
      place("yMin", new THREE.Vector3(cx, box.yMin, cz), Y.clone().negate(), X, Z, sx, sz);
      place("yMax", new THREE.Vector3(cx, box.yMax, cz), Y, X, Z, sx, sz);
      place("zMin", new THREE.Vector3(cx, cy, box.zMin), Z.clone().negate(), X, Y, sx, sy);
      place("zMax", new THREE.Vector3(cx, cy, box.zMax), Z, X, Y, sx, sy);
      const { xMin, xMax, yMin, yMax, zMin, zMax } = box;
      const c = [[xMin, yMin, zMin], [xMax, yMin, zMin], [xMax, yMax, zMin], [xMin, yMax, zMin], [xMin, yMin, zMax], [xMax, yMin, zMax], [xMax, yMax, zMax], [xMin, yMax, zMax]];
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      const pos = this.sectionBoxEdges.geometry.attributes.position.array;
      let i = 0;
      edges.forEach(([a, b]) => {
        pos.set(c[a], i);
        pos.set(c[b], i + 3);
        i += 6;
      });
      this.sectionBoxEdges.geometry.attributes.position.needsUpdate = true;
      this.sectionBoxEdges.geometry.computeBoundingSphere();
      this.sectionBoxEdges.visible = true;
      this.sectionHandleGroup.visible = true;
    }
    _pickSectionHandle(e) {
      if (!this.sectionHandleGroup || !this.sectionHandleGroup.visible) return null;
      this._ndc(e);
      const hits = this.raycaster.intersectObjects(this.sectionHandleGroup.children, false);
      return hits.length ? hits[0].object.userData.sectionFace : null;
    }
    _dragSectionFace(e) {
      if (!this.sectionBox || !this.sectionBounds) return;
      const face = SECTION_FACES.find((f) => f.id === this._sectionDrag.face);
      this._ndc(e);
      const coord = this.sectionBox[`${face.axis}${face.edge === "min" ? "Min" : "Max"}`];
      const point = new THREE.Vector3();
      point[face.axis] = coord;
      const camDir = new THREE.Vector3().subVectors(this.camera.position, point);
      const n = face.normal.clone();
      const planeNormal = camDir.sub(n.multiplyScalar(camDir.dot(face.normal))).normalize();
      if (planeNormal.lengthSq() < 1e-6) return;
      const hit = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, point), hit)) return;
      const b = this.sectionBounds;
      const minKey = `${face.axis}Min`, maxKey = `${face.axis}Max`;
      const gap = Math.max(0.05, (b[maxKey] - b[minKey]) * 0.01);
      const next = { ...this.sectionBox };
      if (face.edge === "min") next[minKey] = Math.min(Math.max(hit[face.axis], b[minKey]), next[maxKey] - gap);
      else next[maxKey] = Math.max(Math.min(hit[face.axis], b[maxKey]), next[minKey] + gap);
      this.sectionBox = next;
      this._applyClipping();
      this._syncSectionVisuals(next);
      this._emit("sectionBox", { box: next });
    }
    setSectionBox(enabled, box, bounds) {
      this.sectionEnabled = !!enabled;
      if (bounds) this.sectionBounds = bounds;
      if (enabled && !this.sectionBounds) this.sectionBounds = this.getModelBounds();
      if (enabled && box) {
        this.sectionBox = { ...box };
        this._syncSectionVisuals(box);
      } else {
        this.sectionBox = null;
        this._sectionDrag = null;
        if (this.sectionBoxEdges) this.sectionBoxEdges.visible = false;
        if (this.sectionHandleGroup) this.sectionHandleGroup.visible = false;
        this.renderer.domElement.style.cursor = "";
      }
      this._applyClipping();
    }
    getModelBounds() {
      const box = this._boxOf(null);
      if (box.isEmpty()) return null;
      return { xMin: box.min.x, xMax: box.max.x, yMin: box.min.y, yMax: box.max.y, zMin: box.min.z, zMax: box.max.z };
    }
    // ----- Measurement ----------------------------------------------------------------
    setMeasureMode(on) {
      this._measureMode = !!on;
      this._measureStart = null;
      this._removeMeasurePreview();
      this.renderer.domElement.style.cursor = on ? "crosshair" : "";
      this.invalidate();
    }
    _marker(point) {
      const r = Math.max(0.03, this.modelSize / 400);
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: this.colors.measure, depthTest: false }));
      m.position.copy(point);
      m.renderOrder = 15;
      return m;
    }
    _removeMeasurePreview() {
      if (this._measurePreview) {
        this.measureGroup.remove(this._measurePreview);
        this._measurePreview.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
        });
        this._measurePreview = null;
      }
    }
    _updateMeasurePreview(point) {
      if (!this._measurePreview) {
        const g = new THREE.Group();
        g.add(this._marker(this._measureStart));
        const lineGeo = new THREE.BufferGeometry().setFromPoints([this._measureStart, point]);
        g.add(new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: this.colors.measure, dashSize: this.modelSize / 150, gapSize: this.modelSize / 250, depthTest: false })));
        g.children[1].renderOrder = 15;
        this._measurePreview = g;
        this.measureGroup.add(g);
      }
      const line = this._measurePreview.children[1];
      line.geometry.setFromPoints([this._measureStart, point]);
      line.computeLineDistances();
      this.invalidate();
    }
    _handleMeasureClick(e) {
      this._pickAt(e);
      const pt = this.lastPickPoint;
      if (!pt) return;
      if (!this._measureStart) {
        this._measureStart = pt.clone();
        this._updateMeasurePreview(pt);
        return;
      }
      const a = this._measureStart;
      const b = pt.clone();
      this._measureStart = null;
      this._removeMeasurePreview();
      const id = Math.random().toString(36).slice(2, 9);
      this.drawMeasurement({ id, a: a.toArray(), b: b.toArray() });
      this._emit("measure", { id, a, b, distance: a.distanceTo(b), dx: Math.abs(b.x - a.x), dy: Math.abs(b.y - a.y), dz: Math.abs(b.z - a.z) });
    }
    /** Draw a measurement given in world coordinates ({ id, a: [x,y,z], b: [x,y,z] }), e.g. one restored from a project. */
    drawMeasurement({ id, a, b }) {
      if (this.measureGroup.getObjectByName(`measure:${id}`)) return;
      const pa = new THREE.Vector3().fromArray(a), pb = new THREE.Vector3().fromArray(b);
      const g = new THREE.Group();
      g.name = `measure:${id}`;
      g.add(this._marker(pa), this._marker(pb));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pa, pb]), new THREE.LineBasicMaterial({ color: this.colors.measure, depthTest: false }));
      line.renderOrder = 15;
      g.add(line);
      this.measureGroup.add(g);
      this.invalidate();
    }
    removeMeasurement(id) {
      const g = this.measureGroup.getObjectByName(`measure:${id}`);
      if (!g) return;
      this.measureGroup.remove(g);
      g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      this.invalidate();
    }
    clearMeasurements() {
      [...this.measureGroup.children].forEach((g) => {
        this.measureGroup.remove(g);
        g.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
        });
      });
      this._measurePreview = null;
      this._measureStart = null;
      this.invalidate();
    }
    // ----- Annotations ----------------------------------------------------------------
    setAnnotationMode(on) {
      this._annoMode = !!on;
      this.renderer.domElement.style.cursor = on ? "crosshair" : "";
    }
    worldToScreen(world) {
      const v = world.clone().project(this.camera);
      const r = this.renderer.domElement.getBoundingClientRect();
      return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, behind: v.z > 1 || v.z < -1 };
    }
    /** Model coordinates ([x,y,z]) → world Vector3. */
    modelToWorld(p) {
      return new THREE.Vector3(p[0], p[1], p[2]).add(this.modelRoot.position);
    }
    // ----- Overlays (module extension point) ------------------------------------------
    setOverlay(name, object, { pickable = false } = {}) {
      this.removeOverlay(name);
      if (!object) return;
      object.name = `overlay:${name}`;
      this.overlayGroup.add(object);
      this.overlays.set(name, { object, pickable });
      if (this._clipPlanes && !object.userData.noClip) object.traverse((o) => {
        if (o.material) o.material.clippingPlanes = this._clipPlanes;
      });
      this.invalidate();
    }
    getOverlay(name) {
      const o = this.overlays.get(name);
      return o ? o.object : null;
    }
    removeOverlay(name) {
      const o = this.overlays.get(name);
      if (!o) return;
      this.overlayGroup.remove(o.object);
      o.object.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) [].concat(c.material).forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      });
      this.overlays.delete(name);
      this.invalidate();
    }
    /** Register a per-frame callback (dtSeconds, elapsedSeconds). Returns an unsubscribe function. */
    onFrame(fn) {
      this._frameListeners.add(fn);
      this.invalidate();
      return () => this._frameListeners.delete(fn);
    }
    // ----- Screenshot -----------------------------------------------------------------
    screenshot() {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL("image/png");
    }
    // ----- Events ---------------------------------------------------------------------
    on(name, fn) {
      if (!this._listeners[name]) this._listeners[name] = [];
      this._listeners[name].push(fn);
      return () => {
        const arr = this._listeners[name];
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      };
    }
    _emit(name, payload) {
      (this._listeners[name] || []).forEach((fn) => fn(payload));
    }
    // ----- Resize / render loop ----------------------------------------------------------
    scheduleResize() {
      if (this._resizeRaf) return;
      this._resizeRaf = requestAnimationFrame(() => {
        this._resizeRaf = 0;
        this.handleResize();
      });
    }
    handleResize() {
      const r = this.host.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      if (w === this._sizeW && h === this._sizeH) return;
      this._sizeW = w;
      this._sizeH = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.invalidate();
      if (this._running) this._render();
    }
    invalidate() {
      this._needsRender = true;
    }
    _render() {
      const t0 = performance.now();
      this.renderer.render(this.scene, this.camera);
      this._stats.frameMs = this._stats.frameMs * 0.8 + (performance.now() - t0) * 0.2;
      this._stats.calls = this.renderer.info.render.calls;
      this._stats.triangles = this.renderer.info.render.triangles;
      this._needsRender = false;
    }
    renderLoop(now) {
      if (!this._running) return;
      const dt = Math.min(0.1, (now - this._lastFrame) / 1e3);
      this._lastFrame = now;
      this._clock += dt;
      if (this.controls.update(now)) this._needsRender = true;
      if (this._frameListeners.size) {
        this._frameListeners.forEach((fn) => fn(dt, this._clock));
        this._needsRender = true;
      }
      if (this._needsRender) this._render();
      requestAnimationFrame(this.renderLoop);
    }
    getStats() {
      const info = this.renderer.info;
      return { ...this._stats, geometries: info.memory.geometries, textures: info.memory.textures, meshes: this.meshes.size };
    }
    dispose() {
      this._running = false;
      this.controls.dispose();
      this.resizeObserver.disconnect();
      const dom = this.renderer.domElement;
      dom.removeEventListener("click", this.onClick);
      dom.removeEventListener("dblclick", this.onDblClick);
      dom.removeEventListener("pointerdown", this.onPointerDown);
      dom.removeEventListener("pointermove", this.onPointerMove);
      dom.removeEventListener("pointerleave", this.onPointerLeave);
      dom.removeEventListener("contextmenu", this.onContextMenu);
      window.removeEventListener("pointerup", this.onPointerUp);
      window.removeEventListener("pointercancel", this.onPointerUp);
      this.clearModel();
      this.renderer.dispose();
      dom.remove();
    }
  }
  Object.assign(window, { ThreeViewer, OrbitController, VIEW_PRESETS });
})();

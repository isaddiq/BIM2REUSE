(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  const CUBE_FACES = [
    { label: "Right", dir: [1, 0, 0] },
    { label: "Left", dir: [-1, 0, 0] },
    { label: "Top", dir: [0, 1, 0] },
    { label: "Bottom", dir: [0, -1, 0] },
    { label: "Front", dir: [0, 0, 1] },
    { label: "Back", dir: [0, 0, -1] }
  ];
  const CUBE_THEME = {
    light: { face: "#f7f7f7", faceHi: "#ffffff", ink: "#2b2b2b", edge: 10132122, hi: 1474634, shadow: "rgba(0,0,0,0.14)" },
    dark: { face: "#222222", faceHi: "#2d2d2d", ink: "#e0e0e0", edge: 6974058, hi: 5230730, shadow: "rgba(0,0,0,0.4)" }
  };
  class NavCube {
    constructor(host, viewer, { size = 104, theme = "light" } = {}) {
      __publicField(this, "onMove", (e) => {
        if (this._drag) {
          const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
          this._drag.x = e.clientX;
          this._drag.y = e.clientY;
          this._drag.moved += Math.abs(dx) + Math.abs(dy);
          if (this._drag.moved > 3) this.viewer.orbitBy(-dx * 0.012, -dy * 0.012);
          return;
        }
        const dir = this._dirAt(e);
        const key = dir ? dir.join(",") : null;
        if (key !== (this.hoverDir ? this.hoverDir.join(",") : null)) {
          this.hoverDir = dir;
          this.canvas.style.cursor = dir ? "pointer" : "";
          this._showHighlight(dir);
        }
      });
      __publicField(this, "onLeave", () => {
        if (!this._drag) {
          this.hoverDir = null;
          this._showHighlight(null);
        }
      });
      __publicField(this, "onDown", (e) => {
        e.preventDefault();
        this._drag = { x: e.clientX, y: e.clientY, moved: 0 };
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch (e2) {
        }
      });
      __publicField(this, "onUp", (e) => {
        if (!this._drag) return;
        const moved = this._drag.moved;
        this._drag = null;
        if (moved > 3) return;
        const dir = this._dirAt(e);
        if (dir) this.viewer.setViewDirection(dir);
      });
      this.host = host;
      this.viewer = viewer;
      this.size = size;
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(size, size, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.canvas = this.renderer.domElement;
      this.canvas.className = "navcube-canvas";
      this.canvas.style.width = `${size}px`;
      this.canvas.style.height = `${size}px`;
      this.canvas.setAttribute("role", "img");
      this.canvas.setAttribute("aria-label", "Navigation cube. Click a face, edge or corner to change the view; drag to orbit.");
      host.appendChild(this.canvas);
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-1.75, 1.75, 1.75, -1.75, 0.1, 20);
      this.scene.add(new THREE.AmbientLight(16777215, 2.2));
      const key = new THREE.DirectionalLight(16777215, 0.9);
      key.position.set(2, 3, 4);
      this.scene.add(key);
      this.cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), []);
      this.scene.add(this.cube);
      this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.cube.geometry), new THREE.LineBasicMaterial({ color: 9083304 }));
      this.scene.add(this.edges);
      this.highlight = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 1474634, transparent: true, opacity: 0.55, depthTest: false }));
      this.highlight.visible = false;
      this.highlight.renderOrder = 5;
      this.scene.add(this.highlight);
      this.ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.68, 64), new THREE.MeshBasicMaterial({ color: 9083304, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = -1.05;
      this.scene.add(this.ring);
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.hoverDir = null;
      this._drag = null;
      this.setTheme(theme);
      this.canvas.addEventListener("pointermove", this.onMove);
      this.canvas.addEventListener("pointerleave", this.onLeave);
      this.canvas.addEventListener("pointerdown", this.onDown);
      window.addEventListener("pointerup", this.onUp);
      this.off = viewer.on("camera", () => this.sync());
      this.sync();
    }
    setTheme(theme) {
      this.colors = CUBE_THEME[theme === "dark" ? "dark" : "light"];
      (this.cube.material || []).forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
      this.cube.material = CUBE_FACES.map((f) => new THREE.MeshLambertMaterial({ map: this._faceTexture(f.label) }));
      this.edges.material.color.setHex(this.colors.edge);
      this.ring.material.color.setHex(this.colors.edge);
      this.highlight.material.color.setHex(this.colors.hi);
      this.render();
    }
    _faceTexture(label) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, this.colors.faceHi);
      g.addColorStop(1, this.colors.face);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = this.colors.ink;
      ctx.font = '600 25px "IBM Plex Sans", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label.toUpperCase(), 64, 66);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    }
    sync() {
      const v = this.viewer;
      const dir = new THREE.Vector3().subVectors(v.camera.position, v.controls.target).normalize();
      this.camera.position.copy(dir).multiplyScalar(6);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, 0, 0);
      this.render();
    }
    render() {
      this.renderer.render(this.scene, this.camera);
    }
    // Map a hit point on the cube to one of the 26 view directions.
    _dirAt(e) {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObject(this.cube, false)[0];
      if (!hit) return null;
      const p = hit.point;
      return [p.x, p.y, p.z].map((c) => Math.abs(c) > 0.56 ? Math.sign(c) : 0);
    }
    _showHighlight(dir) {
      if (!dir) {
        this.highlight.visible = false;
        this.render();
        return;
      }
      const center = dir.map((d) => d * (d ? 0.78 : 0));
      const scale = dir.map((d) => d ? 0.46 : 1.12);
      this.highlight.position.set(...center);
      this.highlight.scale.set(...scale);
      this.highlight.visible = true;
      this.render();
    }
    dispose() {
      this.off && this.off();
      this.canvas.removeEventListener("pointermove", this.onMove);
      this.canvas.removeEventListener("pointerleave", this.onLeave);
      this.canvas.removeEventListener("pointerdown", this.onDown);
      window.removeEventListener("pointerup", this.onUp);
      this.renderer.dispose();
      this.canvas.remove();
    }
  }
  Object.assign(window, { NavCube });
})();

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Blockly from "blockly";
import "blockly/javascript";
import { javascriptGenerator } from "blockly/javascript";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-javascript";
import { io } from "socket.io-client";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { gsap } from "gsap";
// Removed unused Dapi logo import (was previously used in header, now commented out)
import logo from "../assets/Dapi4.svg";
import { useLocation, useNavigate } from "react-router-dom";
import LlmChatWidget from "../components/LlmChatWidget.jsx";
import { ensureDroneBlocksRegistered, sanitizeBlocklyXmlDom } from "../utils/droneBlocks";
import { parseBlocklyXmlString, domToWorkspaceSafe } from "../utils/blocklyXml";


const DRONE_GTLF_URL = new URL("../Drone/drone.gltf", import.meta.url).href;

const delay = (seconds) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(seconds, 0) * 1000));

const parseNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const glassPaneStyles = {
  container: {
    background: "rgba(255,255,255,0.8)",
    borderRadius: "0px",
    border: "1px solid rgba(148,163,184,0.25)",
    boxShadow: "0 30px 80px rgba(15,23,42,0.18)",
    backdropFilter: "blur(16px)",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "3px 10px",
    borderBottom: "1px solid rgba(148,163,184,0.2)",
  },
  titleGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  badge: {
    fontSize: "12px",
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: "999px",
  },
};

const dividerStyles = {
  vertical: {
    width: "8px",
    cursor: "col-resize",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s ease, opacity 0.2s ease",
  },
  horizontal: {
    height: "8px",
    cursor: "row-resize",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s ease, opacity 0.2s ease",
  },
  handle: {
    width: "2px",
    height: "48px",
    borderRadius: "999px",
    background: "rgba(148,163,184,0.5)",
    transition: "background 0.2s ease, height 0.2s ease, width 0.2s ease",
  },
};

const panelBadges = {
  blockly: { label: "Primary", color: "#2563EB" },
  simulation: { label: "Live", color: "#10B981" },
  code: { label: "Auto", color: "#F97316" },
};

// Drone block definitions are shared via utils/droneBlocks

const TOOLBOX_XML = `
  <xml xmlns="https://developers.google.com/blockly/xml">
    <category name="Takeoff" colour="160">
      <block type="takeoff" />
      <block type="takeoff_height" />
      <block type="takeoff_after" />
    </category>
    <category name="Navigation" colour="20">
      <block type="wait" />
      <block type="fly" />
      <block type="circle" />
      <block type="yaw" />
    </category>
    <category name="Land" colour="160">
      <block type="land" />
      <block type="land_after" />
    </category>
    <category name="Logic" colour="210">
      <block type="controls_if" />
      <block type="logic_compare" />
      <block type="logic_operation" />
      <block type="logic_boolean" />
    </category>
  </xml>
`;

function highlightCode(code) {
  return Prism.highlight(code, Prism.languages.javascript, "javascript");
}

function animateProperty(target, vars) {
  return new Promise((resolve) => {
    const originalOnComplete = vars.onComplete;
    gsap.to(target, {
      ...vars,
      onComplete() {
        if (typeof originalOnComplete === "function") {
          originalOnComplete.call(this);
        }
        resolve();
      },
    });
  });
}

function DroneWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const injectedBlocklyXml = location.state?.injectedBlocklyXml || null;
  // ...existing state/hooks...
  const [horizontalRatio, setHorizontalRatio] = useState(0.46);
  const [verticalRatio, setVerticalRatio] = useState(0.56);
  const [generatedCodeHtml, setGeneratedCodeHtml] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeDivider, setActiveDivider] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [layout, setLayout] = useState({
    left: "blockly",
    rightTop: "simulation",
    rightBottom: "code",
  });
  const [draggingPanel, setDraggingPanel] = useState(null);
  const [dropTargetLocation, setDropTargetLocation] = useState(null);

  const blocklyContainerRef = useRef(null);
  const toolboxRef = useRef(null);
  const workspaceRef = useRef(null);
  const simulationMountRef = useRef(null);
  const codeOutputRef = useRef(null);
  const executeCommandRef = useRef(() => Promise.resolve());
  const simulationStateRef = useRef(null);
  const socketRef = useRef(null);
  const dragStateRef = useRef(null);
  const rightPaneRef = useRef(null);
  const layoutRef = useRef(layout);
  const previousPanelLocationsRef = useRef({
    blockly: "left",
    simulation: "rightTop",
  });

  // ---- Persistence helpers ----
  const PERSIST_KEY = "droneWorkspaceLayout.v1";
  const DEFAULT_LAYOUT = { left: "blockly", rightTop: "simulation", rightBottom: "code" };
  function validateLayout(candidate) {
    if (!candidate || typeof candidate !== "object") return DEFAULT_LAYOUT;
    const values = Object.values(candidate);
    const required = ["blockly", "simulation", "code"];
    const allPresent = required.every((r) => values.includes(r));
    if (!allPresent) return DEFAULT_LAYOUT;
    // ensure uniqueness
    const unique = new Set(values);
    if (unique.size !== values.length) return DEFAULT_LAYOUT;
    return {
      left: candidate.left,
      rightTop: candidate.rightTop,
      rightBottom: candidate.rightBottom,
    };
  }
  function clampRatio(r, min, max, fallback) {
    return Number.isFinite(r) ? Math.min(Math.max(r, min), max) : fallback;
  }

  // Load persisted layout on first mount
  // Restore persisted layout ratios and panel ordering on first mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) {
          if (parsed.layout) {
            setLayout(validateLayout(parsed.layout));
          }
          if (parsed.horizontalRatio !== undefined) {
            setHorizontalRatio(clampRatio(parsed.horizontalRatio, 0.16, 0.88, 0.46));
          }
          if (parsed.verticalRatio !== undefined) {
            setVerticalRatio(clampRatio(parsed.verticalRatio, 0.2, 0.86, 0.56));
          }
        }
      }
    } catch (e) {
      console.warn("Failed to restore layout state", e);
    }
  }, []);

  // Persist whenever layout or ratios change (debounced via requestAnimationFrame)
  const persistPendingRef = useRef(false);
  useEffect(() => {
    if (persistPendingRef.current) return;
    persistPendingRef.current = true;
    requestAnimationFrame(() => {
      try {
        const payload = JSON.stringify({
          layout,
          horizontalRatio,
          verticalRatio,
        });
        localStorage.setItem(PERSIST_KEY, payload);
      } catch (e) {
        console.warn("Failed to persist layout state", e);
      } finally {
        persistPendingRef.current = false;
      }
    });
  }, [layout, horizontalRatio, verticalRatio]);

  const clearDividerHover = useCallback(() => {
    if (!dragStateRef.current) {
      setActiveDivider(null);
    }
  }, [setActiveDivider]);

  useEffect(() => {
    if (!injectedBlocklyXml || !workspaceRef.current) return;

    try {
      let xmlDom = parseBlocklyXmlString(injectedBlocklyXml);
      xmlDom = sanitizeBlocklyXmlDom(xmlDom);
      const xmlEl = xmlDom.documentElement ? xmlDom.documentElement : xmlDom;
      domToWorkspaceSafe(xmlEl, workspaceRef.current);
      // Fit and center after layout
      setTimeout(() => {
        try { Blockly.svgResize(workspaceRef.current); } catch {}
        try { workspaceRef.current.zoomToFit && workspaceRef.current.zoomToFit(); } catch {}
      }, 50);
      console.log("Injected Blockly XML from chat.");
    } catch (err) {
      console.error("Failed to inject Blockly XML:", err);
    }
  }, [injectedBlocklyXml]);

  const handleInjectFromChat = useCallback((xmlText) => {
    if (!workspaceRef.current) return;
    try {
      let xmlDom = parseBlocklyXmlString(xmlText);
      xmlDom = sanitizeBlocklyXmlDom(xmlDom);
      const xmlEl = xmlDom.documentElement ? xmlDom.documentElement : xmlDom;
      domToWorkspaceSafe(xmlEl, workspaceRef.current);
      setTimeout(() => {
        try { Blockly.svgResize(workspaceRef.current); } catch {}
        try { workspaceRef.current.zoomToFit && workspaceRef.current.zoomToFit(); } catch {}
      }, 50);
      setIsChatOpen(false);
    } catch (err) {
      console.error("Failed to inject Blockly XML from chat:", err);
    }
  }, []);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const reattachBlocklyWorkspace = useCallback(() => {
    const workspace = workspaceRef.current;
    const container = blocklyContainerRef.current;
    if (!workspace || !container) {
      return;
    }
    const svg = workspace.getParentSvg();
    if (!svg) {
      return;
    }
    const injectionDiv = svg.parentElement;
    if (!injectionDiv || injectionDiv.parentElement === container) {
      Blockly.svgResize(workspace);
      return;
    }
    container.appendChild(injectionDiv);
    Blockly.svgResize(workspace);
  }, []);

  const attachSimulationRenderer = useCallback(() => {
    const state = simulationStateRef.current;
    const container = simulationMountRef.current;
    if (!state || !container) {
      return;
    }

    const { renderer, camera } = state;
    if (!renderer || !camera) {
      return;
    }

    if (renderer.domElement.parentElement !== container) {
      container.appendChild(renderer.domElement);
    }

    if (state.resizeObserver) {
      state.resizeObserver.disconnect();
      state.resizeObserver = null;
    }

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          renderer.setSize(width || 1, height || 1);
          camera.aspect = (width || 1) / (height || 1);
          camera.updateProjectionMatrix();
        }
      });
      resizeObserver.observe(container);
      state.resizeObserver = resizeObserver;
    }

    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    state.mountNode = container;
    state.controls?.update();
  }, []);

  useEffect(() => {
    const findLocation = (panelId) =>
      Object.keys(layout).find((locationKey) => layout[locationKey] === panelId) ?? null;

    const blocklyLocation = findLocation("blockly");
    if (
      blocklyLocation &&
      blocklyLocation !== previousPanelLocationsRef.current.blockly
    ) {
      previousPanelLocationsRef.current.blockly = blocklyLocation;
      reattachBlocklyWorkspace();
    }

    const simulationLocation = findLocation("simulation");
    if (
      simulationLocation &&
      simulationLocation !== previousPanelLocationsRef.current.simulation
    ) {
      previousPanelLocationsRef.current.simulation = simulationLocation;
      attachSimulationRenderer();
    }
  }, [layout, attachSimulationRenderer, reattachBlocklyWorkspace]);

  const swapPanels = useCallback((panelId, targetLocation) => {
    if (!panelId || !targetLocation) return;
    setLayout((prev) => {
      const sourceLocation = Object.keys(prev).find((location) => prev[location] === panelId);
      if (!sourceLocation || sourceLocation === targetLocation) {
        return prev;
      }
      const nextLayout = { ...prev };
      const targetPanelId = prev[targetLocation];
      nextLayout[sourceLocation] = targetPanelId;
      nextLayout[targetLocation] = panelId;
      return nextLayout;
    });
  }, []);

  const handlePanelPointerDown = useCallback((panelId, location, event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button")) return;
    event.preventDefault();
    setDraggingPanel(panelId);
    setDropTargetLocation(location);
  }, []);

  const handlePanelPointerEnter = useCallback(
    (location, panelId) => {
      if (!draggingPanel || panelId === draggingPanel) return;
      setDropTargetLocation(location);
    },
    [draggingPanel]
  );

  const handlePanelPointerLeave = useCallback(
    (location) => {
      if (!draggingPanel) return;
      setDropTargetLocation((current) => (current === location ? null : current));
    },
    [draggingPanel]
  );

  useEffect(() => {
    if (!draggingPanel) return;

    const handlePointerEnd = () => {
      const layoutSnapshot = layoutRef.current;
      const sourceLocation = layoutSnapshot
        ? Object.keys(layoutSnapshot).find((location) => layoutSnapshot[location] === draggingPanel)
        : null;

      if (
        dropTargetLocation &&
        sourceLocation &&
        dropTargetLocation !== sourceLocation
      ) {
        swapPanels(draggingPanel, dropTargetLocation);
      }
      setDraggingPanel(null);
      setDropTargetLocation(null);
    };

    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [draggingPanel, dropTargetLocation, swapPanels]);

  useEffect(() => {
    if (!draggingPanel) return undefined;
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, [draggingPanel]);

  const buildMissionSequence = useCallback(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return [];

    const sequence = [];

    const visit = (block) => {
      if (!block) return;
      const next = block.getNextBlock();

      switch (block.type) {
        case "takeoff":
          sequence.push({ type: "command", value: "takeoff" });
          break;
        case "takeoff_after":
          sequence.push({ type: "wait", value: parseNumber(block.getFieldValue("TIME")) });
          sequence.push({ type: "command", value: "takeoff" });
          break;
        case "land":
          sequence.push({ type: "command", value: "land" });
          break;
        case "land_after":
          sequence.push({ type: "wait", value: parseNumber(block.getFieldValue("TIME")) });
          sequence.push({ type: "command", value: "land" });
          break;
        case "wait":
          sequence.push({ type: "wait", value: parseNumber(block.getFieldValue("TIME")) });
          break;
        case "fly": {
          const direction = block.getFieldValue("DIRECTION");
          const value = parseNumber(block.getFieldValue("VALUE"), 1);
          sequence.push({ type: "command", value: `fly ${direction} ${value}` });
          break;
        }
        case "circle": {
          const direction = block.getFieldValue("DIRECTION");
          const value = parseNumber(block.getFieldValue("VALUE"), 1.5);
          sequence.push({ type: "command", value: `circle ${direction} ${value}` });
          break;
        }
        case "yaw": {
          const direction = block.getFieldValue("DIRECTION");
          const value = parseNumber(block.getFieldValue("VALUE"), 30);
          sequence.push({ type: "command", value: `yaw ${direction} ${value}` });
          break;
        }
        default:
          break;
      }

      visit(next);
    };

    workspace.getTopBlocks(true).forEach((block) => visit(block));
    return sequence;
  }, []);

  const updateCodePreview = useCallback(() => {
    if (!workspaceRef.current) {
      setGeneratedCodeHtml("");
      return;
    }
    const rawCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
    const decorated = [
      "// Auto-generated mission script",
      "function delayCommand(seconds) { /* handled inside simulator */ }",
      rawCode,
    ].join("\n");
  setGeneratedCodeHtml(highlightCode(decorated));
  }, [buildMissionSequence]);

  const handlePointerMove = useCallback((event) => {
    const state = dragStateRef.current;
    if (!state) return;

    if (state.type === "horizontal") {
      const delta = event.clientX - state.startX;
      const ratio = clamp(state.startRatio + delta / window.innerWidth, 0.16, 0.88);
      setHorizontalRatio(ratio);
    } else if (state.type === "vertical") {
      if (!state.rightHeight) return;
      const delta = event.clientY - state.startY;
      const ratio = clamp(state.startRatio + delta / state.rightHeight, 0.2, 0.86);
      setVerticalRatio(ratio);
    }
  }, []);

  const stopDragging = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopDragging);
    setActiveDivider(null);
  }, [handlePointerMove, setActiveDivider]);

  const startHorizontalDrag = useCallback(
    (event) => {
      event.preventDefault();
      dragStateRef.current = {
        type: "horizontal",
        startX: event.clientX,
        startRatio: horizontalRatio,
      };
      setActiveDivider("vertical");
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
    },
    [handlePointerMove, horizontalRatio, setActiveDivider, stopDragging]
  );

  const startVerticalDrag = useCallback(
    (event) => {
      event.preventDefault();
      const rect = rightPaneRef.current?.getBoundingClientRect();
      dragStateRef.current = {
        type: "vertical",
        startY: event.clientY,
        startRatio: verticalRatio,
        rightHeight: rect?.height ?? window.innerHeight,
      };
      setActiveDivider("horizontal");
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
    },
    [handlePointerMove, setActiveDivider, stopDragging, verticalRatio]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, [handlePointerMove, stopDragging]);

  useEffect(() => {
    if (!blocklyContainerRef.current) return;

    // Ensure shared drone blocks are registered once
    ensureDroneBlocksRegistered();

    // Build toolbox XML via robust parser (avoids DOM timing issues)
    let toolboxElement = null;
    try {
      const parsed = parseBlocklyXmlString(TOOLBOX_XML);
      toolboxElement = parsed.documentElement ? parsed.documentElement : parsed;
    } catch (e) {
      console.error("Failed to parse toolbox XML:", e);
      return;
    }

    const workspace = Blockly.inject(blocklyContainerRef.current, {
  toolbox: toolboxElement,
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1,
        maxScale: 3,
        minScale: 0.35,
        scaleSpeed: 1.2,
      },
      grid: {
        spacing: 20,
        length: 3,
        colour: "#d1d5db",
        snap: true,
      },
      trashcan: true,
    });

    workspaceRef.current = workspace;

    javascriptGenerator.forBlock.takeoff = () => 'executeCommand("takeoff");\n';
    javascriptGenerator.forBlock.takeoff_height = (block) => {
      const height = block.getFieldValue("HEIGHT");
      return `executeCommand("takeoff_height ${height}");\n`;
    };
    javascriptGenerator.forBlock.takeoff_after = (block) => {
      const time = block.getFieldValue("TIME");
      return `delayCommand(${time});\nexecuteCommand("takeoff");\n`;
    };
    javascriptGenerator.forBlock.land = () => 'executeCommand("land");\n';
    javascriptGenerator.forBlock.land_after = (block) => {
      const time = block.getFieldValue("TIME");
      return `delayCommand(${time});\nexecuteCommand("land");\n`;
    };
    javascriptGenerator.forBlock.wait = (block) => {
      const time = block.getFieldValue("TIME");
      return `delayCommand(${time});\n`;
    };
    javascriptGenerator.forBlock.fly = (block) => {
      const direction = block.getFieldValue("DIRECTION");
      const value = block.getFieldValue("VALUE");
      return `executeCommand("fly ${direction} ${value}");\n`;
    };
    javascriptGenerator.forBlock.circle = (block) => {
      const direction = block.getFieldValue("DIRECTION");
      const value = block.getFieldValue("VALUE");
      return `executeCommand("circle ${direction} ${value}");\n`;
    };
    javascriptGenerator.forBlock.yaw = (block) => {
      const direction = block.getFieldValue("DIRECTION");
      const value = block.getFieldValue("VALUE");
      return `executeCommand("yaw ${direction} ${value}");\n`;
    };

    const onWorkspaceChange = () => {
      updateCodePreview();
    };
    workspace.addChangeListener(onWorkspaceChange);

    updateCodePreview();

    const handleResize = () => {
      Blockly.svgResize(workspace);
    };
    window.addEventListener("resize", handleResize);

    try {
  socketRef.current = io({ autoConnect: false, path: "/socket.io" });
      socketRef.current.connect();
    } catch (error) {
      console.warn("Socket connection skipped:", error);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      workspace.removeChangeListener(onWorkspaceChange);
      workspace.dispose();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [updateCodePreview]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (workspaceRef.current) {
        Blockly.svgResize(workspaceRef.current);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [horizontalRatio]);

  useEffect(() => {
    if (!workspaceRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      Blockly.svgResize(workspaceRef.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [layout]);

  useEffect(() => {
    const container = simulationMountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 2.5, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio || 1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.04;
  controls.enablePan = false;
  controls.minDistance = 2.6;
  controls.maxDistance = 16;
  controls.minPolarAngle = Math.PI / 3.1;
  controls.maxPolarAngle = Math.PI / 1.9;
  controls.zoomSpeed = 0.65;
  controls.rotateSpeed = 0.85;

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x0f172a, 0.6);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(5, 8, 6);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8, metalness: 0.2 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(80, 80, 0x94a3b8, 0x475569);
    grid.position.y = 0.01;
    scene.add(grid);

    const simulationState = {
      scene,
      camera,
      renderer,
      controls,
      drone: null,
      propellers: [],
      propellerSpin: { active: false, speed: 0 },
      smoothedTarget: new THREE.Vector3().copy(controls.target),
      followActive: true,
      initialCameraOffset: camera.position.clone().sub(controls.target.clone()),
      mountNode: null,
      resizeObserver: null,
    };
    simulationStateRef.current = simulationState;

    attachSimulationRenderer();

    const loader = new GLTFLoader();
    loader.load(
      DRONE_GTLF_URL,
      (gltf) => {
        const drone = gltf.scene;
        drone.castShadow = true;
        drone.position.set(0, 0.8, 0);
        drone.scale.set(1.2, 1.2, 1.2);
        scene.add(drone);

        const propellers = ["prop", "prop_1", "prop_2", "prop_3"]
          .map((name) => drone.getObjectByName(name))
          .filter(Boolean);

        simulationState.drone = drone;
        simulationState.propellers = propellers;
        simulationState.smoothedTarget.copy(drone.position);
        controls.target.copy(drone.position);
        simulationState.initialCameraOffset = camera.position.clone().sub(drone.position);
        controls.update();
      },
      undefined,
      (error) => {
        console.error("Failed to load drone model:", error);
        const fallback = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.4, 1),
          new THREE.MeshStandardMaterial({ color: 0xf97316 })
        );
        fallback.castShadow = true;
        fallback.position.set(0, 0.8, 0);
        scene.add(fallback);
        simulationState.drone = fallback;
        simulationState.smoothedTarget.copy(fallback.position);
        controls.target.copy(fallback.position);
        simulationState.initialCameraOffset = camera.position.clone().sub(fallback.position);
        controls.update();
      }
    );

    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const state = simulationStateRef.current;

      if (state && state.followActive && state.drone) {
        const previousTarget = state.controls.target.clone();
        state.smoothedTarget.lerp(state.drone.position, 0.12);
        const newTarget = state.smoothedTarget;
        state.controls.target.copy(newTarget);
        const delta = newTarget.clone().sub(previousTarget);
        state.camera.position.add(delta);
      }

      controls.update();

      if (state && state.drone && state.propellers.length) {
        const spinState = state.propellerSpin;
        const targetSpeed = spinState.active ? 0.32 : 0;
        spinState.speed += (targetSpeed - spinState.speed) * 0.08;
        state.propellers.forEach((prop) => {
          prop.rotation.z += spinState.speed;
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      if (simulationState.resizeObserver) {
        simulationState.resizeObserver.disconnect();
      }
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      simulationStateRef.current = null;
    };
  }, [attachSimulationRenderer]);

  const togglePropellerSpin = (active) => {
    if (!simulationStateRef.current) return;
    simulationStateRef.current.propellerSpin.active = active;
  };

  const recenterCameraToDrone = useCallback(() => {
    const state = simulationStateRef.current;
    if (!state || !state.drone) return;

    const { camera, controls, drone, smoothedTarget } = state;
    const baselineOffset = state.initialCameraOffset
      ? state.initialCameraOffset.clone()
      : camera.position.clone().sub(drone.position);

    const targetPosition = drone.position.clone();
    if (smoothedTarget) {
      smoothedTarget.copy(targetPosition);
    }

    state.initialCameraOffset = baselineOffset.clone();
    controls.target.copy(targetPosition);
    camera.position.copy(targetPosition.clone().add(baselineOffset));
    state.followActive = true;
    controls.update();
  }, []);

  executeCommandRef.current = async (rawCommand) => {
    const state = simulationStateRef.current;
    if (!state || !state.drone) return;
    const command = rawCommand.trim();
    if (!command) return;

    const [action, ...args] = command.split(" ");
    const { drone } = state;

    const moveDelta = async (axis, value) => {
      const start = { value: drone.position[axis] };
      const destination = drone.position[axis] + value;
      await animateProperty(start, {
        value: destination,
        duration: Math.min(Math.abs(value) * 0.35 + 0.4, 2.4),
        ease: "power2.inOut",
        onUpdate: () => {
          drone.position[axis] = start.value;
        },
      });
    };

    const tiltDrone = async (directionCode) => {
      const tiltAmount = 0.18;
      const tiltMap = {
        F: { x: -tiltAmount, z: 0 },
        B: { x: tiltAmount, z: 0 },
        L: { x: 0, z: tiltAmount },
        R: { x: 0, z: -tiltAmount },
      };
  const tilt = tiltMap[directionCode] || { x: 0, z: 0 };
      await animateProperty(drone.rotation, {
        x: tilt.x,
        z: tilt.z,
        duration: 0.28,
        ease: "sine.out",
      });
      await animateProperty(drone.rotation, {
        x: 0,
        z: 0,
        duration: 0.4,
        ease: "sine.inOut",
      });
    };

    switch (action) {
      case "takeoff":
        togglePropellerSpin(true);
        await moveDelta("y", 2.2 - drone.position.y);
        break;
      case "takeoff_height": {
        const [targetRaw] = args;
        const target = Number(targetRaw);
        const targetY = Number.isFinite(target) ? Math.max(0.2, target) : 2.2;
        togglePropellerSpin(true);
        await moveDelta("y", targetY - drone.position.y);
        break;
      }
      case "land":
        await moveDelta("y", 0.2 - drone.position.y);
        togglePropellerSpin(false);
        break;
      case "fly": {
        const [direction, distanceRaw] = args;
        const distance = Number(distanceRaw) || 0;
        if (!Number.isFinite(distance)) break;
        await tiltDrone(direction);
        const axisMap = { F: "z", B: "z", L: "x", R: "x", U: "y", D: "y" };
        const axis = axisMap[direction];
        const signed = { F: -distance, B: distance, L: -distance, R: distance, U: distance, D: -distance };
        if (axis) {
          await moveDelta(axis, signed[direction] ?? 0);
        }
        break;
      }
      case "yaw": {
        const [direction, degreesRaw] = args;
        const degrees = Number(degreesRaw) || 0;
        const radians = THREE.MathUtils.degToRad(degrees);
        const start = { value: drone.rotation.y };
        const target = direction === "YL" ? start.value + radians : start.value - radians;
        await animateProperty(start, {
          value: target,
          duration: Math.min(Math.abs(degrees) / 90 + 0.4, 2),
          ease: "power2.inOut",
          onUpdate: () => {
            drone.rotation.y = start.value;
          },
        });
        break;
      }
      case "circle": {
        const [direction, radiusRaw] = args;
        const radius = Number(radiusRaw) || 1.5;
        const clockwise = direction === "CR";
        const revolution = 2 * Math.PI;
        const duration = 4 + radius * 0.4;
        const startAngle = drone.rotation.y;
        const center = drone.position.clone();
        center.x += clockwise ? radius : -radius;
        await animateProperty({ angle: 0 }, {
          angle: revolution,
          duration,
          ease: "none",
          onUpdate: function () {
            const theta = this.targets()[0].angle;
            const x = center.x + (clockwise ? Math.cos(theta) : -Math.cos(theta)) * radius;
            const z = center.z + Math.sin(theta) * radius;
            drone.position.set(x, drone.position.y, z);
            drone.rotation.y = startAngle + theta * (clockwise ? -1 : 1);
          },
        });
        break;
      }
      case "wait":
        break;
      default:
        console.warn("Unsupported command", command);
    }

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("drone-command", command);
    }
  };

  const handleRunProgram = async () => {
    if (isExecuting) return;

    updateCodePreview();
  const mission = buildMissionSequence();
  if (!mission.length) return;

    setIsExecuting(true);

    for (const step of mission) {
      try {
        if (step.type === "command") {
          // eslint-disable-next-line no-await-in-loop
          await executeCommandRef.current(step.value);
        } else if (step.type === "wait") {
          // eslint-disable-next-line no-await-in-loop
          await delay(step.value);
        }
      } catch (error) {
        console.error("Mission step failed", step, error);
        break;
      }
    }

    setIsExecuting(false);
  };

  const renderPanel = (panelId, location) => {
    if (!panelId) return null;

    const isDropHighlight =
      Boolean(draggingPanel) && dropTargetLocation === location && draggingPanel !== panelId;
    const isDraggingSelf = draggingPanel === panelId;

    let panelMinHeight = "220px";
    if (panelId === "blockly") {
      panelMinHeight = location === "left" ? "280px" : "220px";
    } else if (panelId === "simulation") {
      panelMinHeight = location === "left" ? "260px" : "200px";
    } else if (panelId === "code") {
      panelMinHeight = location === "left" ? "260px" : "200px";
    }

    const containerStyle = {
      ...glassPaneStyles.container,
      flex: 1,
      minHeight: panelMinHeight,
      border: isDropHighlight
        ? "1px solid rgba(99,102,241,0.45)"
        : glassPaneStyles.container.border,
      boxShadow: isDropHighlight
        ? "0 34px 90px rgba(99,102,241,0.25)"
        : glassPaneStyles.container.boxShadow,
      transform: isDropHighlight ? "scale(1.01)" : "scale(1)",
      transition: "box-shadow 0.2s ease, border 0.2s ease, transform 0.2s ease, opacity 0.18s ease",
      opacity: isDraggingSelf ? 0.84 : 1,
    };

    const headerStyle = {
      ...glassPaneStyles.header,
      cursor: isDraggingSelf ? "grabbing" : "grab",
      userSelect: "none",
      background: isDropHighlight ? "rgba(99,102,241,0.12)" : "transparent",
      boxShadow: isDropHighlight ? "inset 0 0 0 1px rgba(99,102,241,0.35)" : "none",
      transition: "background 0.2s ease, box-shadow 0.2s ease",
    };

    const headerHandlers = {
      onPointerDown: (event) => handlePanelPointerDown(panelId, location, event),
    };

    const containerHandlers = {
      onPointerEnter: () => handlePanelPointerEnter(location, panelId),
      onPointerLeave: () => handlePanelPointerLeave(location),
    };

    switch (panelId) {
      case "blockly":
        return (
          <div
            key="blockly"
            data-panel-id="blockly"
            style={containerStyle}
            {...containerHandlers}
          >
            <div style={headerStyle} {...headerHandlers}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  aria-label="Go to home"
                  title="Go to home"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <img src={logo} alt="DAPI" style={{ height: 32, width: "auto", display: "block" }} />
                </button>
                <div style={glassPaneStyles.titleGroup}>
                  <span style={{ fontWeight: 700, letterSpacing: "0.02em" }}>Blockly Program</span>
                  <span style={{ fontSize: "13px", color: "#475569" }}>
                    Compose autonomous flight stacks.
                  </span>
                </div>
              </div>
              <div
                style={{
                  ...glassPaneStyles.badge,
                  background: `${panelBadges.blockly.color}1A`,
                  color: panelBadges.blockly.color,
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                {panelBadges.blockly.label}
                <button
                  type="button"
                  onClick={handleRunProgram}
                  disabled={isExecuting}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "999px",
                    border: "none",
                    background: isExecuting
                      ? "rgba(148,163,184,0.5)"
                      : "linear-gradient(135deg, #2563EB, #7C3AED)",
                    color: "white",
                    fontWeight: 600,
                    
                    cursor: isExecuting ? "not-allowed" : "pointer",
                    boxShadow: isExecuting ? "none" : "0 10px 24px rgba(79,70,229,0.28)",
                    transition: "transform 0.18s ease",
                  }}
                >
                  {isExecuting ? "Executing..." : "Run Mission"}
                </button>
              </div>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <div
                ref={blocklyContainerRef}
                style={{ position: "absolute", inset: 0, minHeight: panelMinHeight }}
              />
              <div ref={toolboxRef} style={{ display: "none" }} />
            </div>
          </div>
        );
      case "simulation":
        return (
          <div
            key="simulation"
            data-panel-id="simulation"
            style={containerStyle}
            {...containerHandlers}
          >
            <div style={headerStyle} {...headerHandlers}>
              <div style={glassPaneStyles.titleGroup}>
                <span style={{ fontWeight: 700, letterSpacing: "0.02em" }}>Drone Simulation</span>
                <span style={{ fontSize: "13px", color: "#475569" }}>
                  Orbit and follow telemetry in real time.
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  onClick={recenterCameraToDrone}
                  style={{
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: "999px",
                    padding: "6px 12px",
                    background: "rgba(99,102,241,0.12)",
                    color: "#1d4ed8",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "background 0.2s ease, border 0.2s ease",
                  }}
                >
                  Center
                </button>
                <div
                  style={{
                    ...glassPaneStyles.badge,
                    background: `${panelBadges.simulation.color}1A`,
                    color: panelBadges.simulation.color,
                  }}
                >
                  {panelBadges.simulation.label}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <div
                ref={simulationMountRef}
                style={{ position: "absolute", inset: 0, minHeight: panelMinHeight }}
              />
            </div>
          </div>
        );
      case "code":
        return (
          <div
            key="code"
            data-panel-id="code"
            style={containerStyle}
            {...containerHandlers}
          >
            <div style={headerStyle} {...headerHandlers}>
              <div style={glassPaneStyles.titleGroup}>
                <span style={{ fontWeight: 700, letterSpacing: "0.02em" }}>Generated Code</span>
                <span style={{ fontSize: "13px", color: "#475569" }}>
                  Syntax-highlighted mission output.
                </span>
              </div>
              <div
                style={{
                  ...glassPaneStyles.badge,
                  background: `${panelBadges.code.color}1A`,
                  color: panelBadges.code.color,
                }}
              >
                {panelBadges.code.label}
              </div>
            </div>
            <div
              ref={codeOutputRef}
              style={{
                flex: 1,
                padding: "22px 26px",
                overflow: "auto",
                background: "rgba(15,23,42,0.08)",
                minHeight: panelMinHeight,
                height: "100%",
              }}
            >
              <pre style={{ margin: 0 }}>
                <code
                  className="language-javascript"
                  dangerouslySetInnerHTML={{ __html: generatedCodeHtml }}
                />
              </pre>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const isVerticalActive = activeDivider === "vertical";
  const isHorizontalActive = activeDivider === "horizontal";

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        background: "linear-gradient(135deg, #E2E8F0 0%, #F8FAFC 45%, #E0F2FE 100%)",
        color: "#0f172a",
      }}
    >
      <div style={{ display: "flex", flex: 1, position: "relative" }}>
        <div
          style={{
            width: `${horizontalRatio * 100}%`,
            minWidth: "320px",
            maxWidth: "75vw",
            display: "flex",
            flexDirection: "column",
            padding: 0,
          }}
        >
          {renderPanel(layout.left, "left")}
        </div>

        <div
          style={{
            ...dividerStyles.vertical,
            opacity: isVerticalActive ? 1 : 0.25,
            background: isVerticalActive ? "rgba(99,102,241,0.16)" : "transparent",
          }}
          onPointerDown={startHorizontalDrag}
          onPointerEnter={() => setActiveDivider("vertical")}
          onPointerLeave={clearDividerHover}
        >
          <div
            style={{
              ...dividerStyles.handle,
              width: isVerticalActive ? "4px" : "2px",
              height: isVerticalActive ? "70%" : "40%",
              background: isVerticalActive ? "rgba(99,102,241,0.9)" : "rgba(148,163,184,0.45)",
            }}
          />
        </div>

        <div
          ref={rightPaneRef}
          style={{
            flex: 1,
            minWidth: "360px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            padding: 0,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                flex: verticalRatio,
                minHeight: "220px",
              }}
            >
              {renderPanel(layout.rightTop, "rightTop")}
            </div>

            <div
              style={{
                ...dividerStyles.horizontal,
                opacity: isHorizontalActive ? 1 : 0.25,
                background: isHorizontalActive ? "rgba(99,102,241,0.16)" : "transparent",
              }}
              onPointerDown={startVerticalDrag}
              onPointerEnter={() => setActiveDivider("horizontal")}
              onPointerLeave={clearDividerHover}
            >
              <div
                style={{
                  ...dividerStyles.handle,
                  height: isHorizontalActive ? "4px" : "2px",
                  width: isHorizontalActive ? "80px" : "48px",
                  background: isHorizontalActive ? "rgba(99,102,241,0.9)" : "rgba(148,163,184,0.45)",
                }}
              />
            </div>

            <div
              style={{
                flex: 1 - verticalRatio,
                minHeight: "220px",
                display: "flex",
              }}
            >
              {renderPanel(layout.rightBottom, "rightBottom")}
            </div>
          </div>
        </div>
      </div>
      {/* LLM chat popup overlay */}
      <LlmChatWidget
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onInject={handleInjectFromChat}
      />

      {/* Floating chat button for AI copilot */}
      <button
        onClick={() => setIsChatOpen(true)}
        style={{
          position: "fixed",
          left: "50%",
          bottom: "24px",
          transform: "translateX(-50%)",
          width: "42px",
          height: "42px",
          borderRadius: "50%",
          border: "none",
          background: "linear-gradient(135deg, #6366f1, #22c55e)",
          boxShadow: "0 18px 45px rgba(15,23,42,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          fontWeight: 700,
          fontSize: "13px",
          cursor: "pointer",
          zIndex: 50,
        }}
        aria-label="Open Blockly copilot chat"
      >
        AI
      </button>
    </div>
  );
}

export default DroneWorkspace;

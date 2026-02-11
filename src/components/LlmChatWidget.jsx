import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Blockly from "blockly";

// LM Studio default local endpoint. Change if you're using a different port/path.
const API_URL = "http://localhost:1234/v1/chat/completions";

const INITIAL_MESSAGE = {
	id: "system",
	role: "system",
	text: "Ask for a mission. I'll craft Blockly XML you can drop into the workspace.",
};

// Register custom drone blocks once (module-level)
const DRONE_BLOCK_DEFINITIONS = [
  {
    type: "takeoff",
    message0: "Takeoff",
    previousStatement: null, // Can't have blocks before it
    nextStatement: "Statement", // Can have blocks after it
    colour: 160,
  },
  {
    type: "land",
    message0: "Land",
    previousStatement: "Statement", // Must connect to a block
    nextStatement: null, // Nothing can come after land
    colour: 160,
  },
  {
    type: "wait",
    message0: "Wait %1 seconds",
    args0: [{ type: "field_input", name: "TIME", text: "1" }],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 50,
  },
  {
    type: "takeoff_after",
    message0: "Takeoff after %1 seconds",
    args0: [{ type: "field_input", name: "TIME", text: "5" }],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 160,
  },
  {
    type: "land_after",
    message0: "Land for %1 seconds",
    args0: [{ type: "field_input", name: "TIME", text: "5" }],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 160,
  },
  {
    type: "fly",
    message0: "Fly %1 %2 meters",
    args0: [
      {
        type: "field_dropdown",
        name: "DIRECTION",
        options: [
          ["Forward", "F"], ["Backward", "B"], ["Left", "L"], ["Right", "R"], ["Up", "U"], ["Down", "D"]
        ],
      },
      { type: "field_input", name: "VALUE", text: "1" },
    ],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 230,
  },
  {
    type: "circle",
    message0: "Circle %1 with %2 m radius",
    args0: [
      {
        type: "field_dropdown",
        name: "DIRECTION",
        options: [["Clockwise", "CR"], ["Counter-Clockwise", "CL"]],
      },
      { type: "field_input", name: "VALUE", text: "1" },
    ],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 230,
  },
  {
    type: "yaw",
    message0: "Yaw %1 %2 degrees",
    args0: [
      {
        type: "field_dropdown",
        name: "DIRECTION",
        options: [["Right", "YR"], ["Left", "YL"]],
      },
      { type: "field_input", name: "VALUE", text: "90" },
    ],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 230,
  },
];

// Ensure blocks are registered once
let blocksRegistered = false;

function ensureDroneBlocksRegistered() {
	if (blocksRegistered) return;
	const newDefs = DRONE_BLOCK_DEFINITIONS.filter((def) => !Blockly.Blocks?.[def.type]);
	if (newDefs.length) {
		Blockly.defineBlocksWithJsonArray(newDefs);
	}
	blocksRegistered = true;
}

// Sanitize incoming XML fields so invalid fields (e.g., VALUE on takeoff) are removed
const ALLOWED_FIELDS_BY_TYPE = {
	takeoff: [],
	land: [],
	wait: ["TIME"],
	takeoff_after: ["TIME"],
	land_after: ["TIME"],
	fly: ["DIRECTION", "VALUE"],
	circle: ["DIRECTION", "VALUE"],
	yaw: ["DIRECTION", "VALUE"],
};

function sanitizeBlocklyXmlDom(xmlDom) {
	try {
		const blocks = Array.from(xmlDom.getElementsByTagName("block"));
		blocks.forEach((blockEl) => {
			const type = blockEl.getAttribute("type") || "";
			const allowed = ALLOWED_FIELDS_BY_TYPE[type];
			if (!allowed) return; // unknown types left as-is
			// only direct children fields
			Array.from(blockEl.children).forEach((child) => {
				if (child.nodeName.toLowerCase() === "field") {
					const name = child.getAttribute("name");
					if (!allowed.includes(name)) {
						try { blockEl.removeChild(child); } catch {}
					}
				}
			});
		});
	} catch {}
	return xmlDom;
}

const getXmlHelpers = () => Blockly.Xml || Blockly.utils?.xml || null;

// Robust normalization helpers for possibly HTML-escaped or wrapped XML
function decodeHtmlEntities(s) {
	return String(s ?? "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}
function extractXmlRoot(s) {
	const lower = s.toLowerCase();
	const start = lower.indexOf("<xml");
	const end = lower.lastIndexOf("</xml>");
	if (start !== -1 && end !== -1) return s.slice(start, end + "</xml>".length);
	return s;
}
function normalizeXmlString(s) {
	let t = String(s ?? "");
	t = t.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
	if (t.includes("&lt;xml")) t = decodeHtmlEntities(t);
	t = extractXmlRoot(t);
	return t;
}

// Cross-version safe XML parser for Blockly
function parseBlocklyXmlString(xmlText) {
	const normalized = normalizeXmlString(xmlText);
	const helpers = getXmlHelpers();
	if (helpers && typeof helpers.textToDom === "function") {
		try {
			return helpers.textToDom(normalized);
		} catch {}
	}
	let parser = new DOMParser();
	let doc = parser.parseFromString(normalized, "application/xml");
	if (!doc.querySelector("parsererror")) return doc.documentElement || doc;
	try {
		parser = new DOMParser();
		const html = parser.parseFromString(normalized, "text/html");
		const xmlEl = html.querySelector("xml");
		if (xmlEl) {
			const asString = xmlEl.outerHTML;
			const xmlDoc = new DOMParser().parseFromString(asString, "application/xml");
			if (!xmlDoc.querySelector("parsererror")) return xmlDoc.documentElement || xmlDoc;
		}
	} catch {}
	throw new Error("Invalid XML in chat response");
}

function domToWorkspaceSafe(xmlEl, workspace) {
	const helpers = getXmlHelpers();
	if (helpers && typeof helpers.domToWorkspace === "function") {
		helpers.domToWorkspace(xmlEl, workspace);
		return;
	}
	if (Blockly.Xml && typeof Blockly.Xml.domToWorkspace === "function") {
		Blockly.Xml.domToWorkspace(xmlEl, workspace);
		return;
	}
	throw new Error("Blockly XML helpers missing domToWorkspace");
}

function centerPreviewWorkspace(workspace) {
	try {
		const topBlocks = workspace.getTopBlocks(false);
		if (topBlocks.length) {
			workspace.centerOnBlock(topBlocks[0].id);
		} else {
			workspace.scrollCenter && workspace.scrollCenter();
		}
	} catch {}
}

function fitAndCenterPreview(workspace, container) {
	try {
		// Ensure the SVG matches container size
		Blockly.svgResize(workspace);
	} catch {}
	try {
		// Fit to contents, then center on the first block for consistent framing
		workspace.zoomToFit && workspace.zoomToFit();
	} catch {}
	try {
		centerPreviewWorkspace(workspace);
	} catch {}
	try {
		// Recompute scrollbars/metrics if available
		typeof workspace.resizeContents === "function" && workspace.resizeContents();
	} catch {}
}

export default function LlmChatWidget({ isOpen, onClose, onInject }) {
	const [messages, setMessages] = useState([INITIAL_MESSAGE]);
	const [input, setInput] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [pendingXml, setPendingXml] = useState(null);
	const listRef = useRef(null);
	const previewRefs = useRef({});

    // Keep conversation state across open/close; only clear on full page refresh.

	useEffect(() => {
		if (!listRef.current) return;
		listRef.current.scrollTop = listRef.current.scrollHeight;
	}, [messages, pendingXml]);

	const appendMessage = (newMsg) => setMessages((prev) => [...prev, newMsg]);

	const handleSend = async (event) => {
		event.preventDefault();
		const trimmed = input.trim();
		if (!trimmed || isSending) return;

		appendMessage({ id: Date.now(), role: "user", text: trimmed });
		setInput("");
		setIsSending(true);

		try {
			const res = await fetch(API_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages: [
						{
							role: "system",
							content:
								'System rules: 1) Return ONLY a JSON object of the form {"type":"blocks","xml":"<xml ...></xml>","text":"..."}. 2) No code fences, no commentary, no markdown. 3) xml MUST be valid Blockly <xml> with block types matching the drone toolbox. 4) Keep text short. If you cannot produce blocks, return {"type":"error","text":"..."}.\n\nAvailable Blockly block types:\n- takeoff: Makes the drone take off\n- takeoff_after: Takes off after N seconds (has TIME field)\n- wait: Wait for N seconds (has TIME field)\n- fly: Move in a direction for N meters (has DIRECTION dropdown: F/B/L/R/U/D and VALUE field)\n- circle: Fly in a circle with radius (has DIRECTION dropdown: CL/CR and VALUE field for radius)\n- yaw: Rotate left or right by degrees (has DIRECTION dropdown: YL/YR and VALUE field for degrees)\n- land: Land the drone\n- land_after: Land for N seconds then takeoff again (has TIME field)\n\nExample 1 - "takeoff 2m, fly forward 5m, land":\n{"type":"blocks","xml":"<xml xmlns=\\"https://developers.google.com/blockly/xml\\"><block type=\\"takeoff\\"><next><block type=\\"wait\\"><field name=\\"TIME\\">1</field><next><block type=\\"fly\\"><field name=\\"DIRECTION\\">F</field><field name=\\"VALUE\\">5</field><next><block type=\\"land\\"></block></next></block></next></block></next></block></xml>","text":"Takeoff, fly forward 5m, and land."}\n\nExample 2 - "circle left with 3m radius":\n{"type":"blocks","xml":"<xml xmlns=\\"https://developers.google.com/blockly/xml\\"><block type=\\"takeoff\\"><next><block type=\\"circle\\"><field name=\\"DIRECTION\\">CL</field><field name=\\"VALUE\\">3</field><next><block type=\\"land\\"></block></next></block></next></block></xml>","text":"Takeoff, circle left 3m radius, land."}\n\nExample 3 - "yaw right 90 degrees then fly backward 4m":\n{"type":"blocks","xml":"<xml xmlns=\\"https://developers.google.com/blockly/xml\\"><block type=\\"takeoff\\"><next><block type=\\"yaw\\"><field name=\\"DIRECTION\\">YR</field><field name=\\"VALUE\\">90</field><next><block type=\\"fly\\"><field name=\\"DIRECTION\\">B</field><field name=\\"VALUE\\">4</field><next><block type=\\"land\\"></block></next></block></next></block></next></block></xml>","text":"Takeoff, yaw right 90°, fly backward 4m, land."}',
						},
						{ role: "user", content: trimmed },
					],
					temperature: 0.2,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const data = await res.json();

			let rawContent = "";
			if (data?.choices?.[0]?.message?.content) {
				rawContent = data.choices[0].message.content;
			} else if (typeof data?.reply === "string") {
				rawContent = data.reply;
			} else {
				rawContent = JSON.stringify(data, null, 2);
			}

			let parsed = null;
			try {
				const start = rawContent.indexOf("{");
				const end = rawContent.lastIndexOf("}");
				if (start !== -1 && end !== -1) {
					const snippet = rawContent.slice(start, end + 1);
					const candidate = JSON.parse(snippet);
					if (candidate?.type === "blocks" && typeof candidate?.xml === "string") {
						parsed = candidate;
					}
				}
			} catch {
				parsed = null;
			}

			// Fallback: extract XML from fenced code blocks or raw XML
			const extractXmlFromText = (text) => {
				if (!text) return null;
				const fence = text.match(/```(?:xml)?\s*([\s\S]*?)```/i);
				if (fence && fence[1]) return fence[1].trim();
				const trimmed = text.trim();
				if (trimmed.startsWith("<xml")) return trimmed;
				return null;
			};
			if (!parsed) {
				const xmlOnly = extractXmlFromText(rawContent);
				if (xmlOnly) {
					parsed = { type: "blocks", xml: xmlOnly, text: "Generated Blockly program." };
				}
			}

			if (parsed) {
				setPendingXml(parsed.xml);
				appendMessage({
					id: Date.now() + 1,
					role: "assistant",
					text: parsed.text || "Generated Blockly program.",
					codeXml: parsed.xml,
				});
			} else {
				appendMessage({ id: Date.now() + 1, role: "assistant", text: rawContent });
			}
		} catch (error) {
			appendMessage({ id: Date.now() + 2, role: "assistant", text: `Error: ${String(error)}` });
		} finally {
			setIsSending(false);
		}
	};

	const handleInject = () => {
		if (!pendingXml) return;
		onInject?.(pendingXml);
		setPendingXml(null);
		onClose?.();
	};

	const bubbles = useMemo(
		() =>
			messages
				.filter((msg) => msg.role !== "system")
				.map((msg) => ({ ...msg, variant: msg.role === "user" ? "user" : "assistant" })),
		[messages]
	);

	// Initialize a read-only Blockly workspace for each message that has XML
	useEffect(() => {
		ensureDroneBlocksRegistered();

		bubbles.forEach((msg) => {
			if (!msg.codeXml || previewRefs.current[msg.id]) return;
			const container = document.getElementById(`blockly-preview-${msg.id}`);
			if (!container) return;
			try {
				const workspace = Blockly.inject(container, {
					readOnly: true,
					zoom: { controls: false, wheel: false, startScale: 0.8 },
					move: { scrollbars: true, drag: false, wheel: false },
					trashcan: false,
				});

				// Ensure the injection div has a concrete height so blocks are visible
				try {
					const targetH = container.clientHeight || 180;
					const inj = container.querySelector('.injectionDiv');
					if (inj) {
						inj.style.height = `${targetH}px`;
						inj.style.width = '100%';
					}
				} catch {}

						let xmlDom = parseBlocklyXmlString(msg.codeXml);
				xmlDom = sanitizeBlocklyXmlDom(xmlDom);
						const xmlEl = xmlDom.documentElement ? xmlDom.documentElement : xmlDom;
						domToWorkspaceSafe(xmlEl, workspace);

				// Transparent background
				try {
					const theme = new Blockly.Theme("chatPreview", {}, {}, {
						workspaceBackgroundColour: "transparent",
						toolboxBackgroundColour: "transparent",
						flyoutBackgroundColour: "transparent",
					});
					workspace.setTheme(theme);
				} catch {}
				const bg = container.querySelector(".blocklyMainBackground");
				if (bg) bg.style.fill = "transparent";
				const scrollbars = container.querySelectorAll(
					".blocklyScrollbarHorizontal, .blocklyScrollbarVertical"
				);
				scrollbars.forEach((el) => {
					el.style.display = "none";
					el.style.pointerEvents = "none";
				});

				// Fit and center after layout paints (double rAF for safety)
				requestAnimationFrame(() => {
					fitAndCenterPreview(workspace, container);
					requestAnimationFrame(() => {
						fitAndCenterPreview(workspace, container);
					});
				});

				previewRefs.current[msg.id] = workspace;
			} catch (err) {
				console.warn("Failed to render Blockly preview:", err);
			}
		});
	}, [bubbles]);


	// Dispose previews only on unmount to avoid flicker during message updates
	useEffect(() => {
		return () => {
			Object.keys(previewRefs.current).forEach((id) => {
				const ws = previewRefs.current[id];
				if (ws && typeof ws.dispose === "function") {
					ws.dispose();
				}
			});
			previewRefs.current = {};
		};
	}, []);

	const handleOverlayClick = (e) => {
		if (e.target.classList.contains("llm-chat-overlay")) {
			onClose?.();
		}
	};

	return (
		<div
			className={`llm-chat-overlay ${isOpen ? "open" : ""}`}
			aria-hidden={!isOpen}
			onMouseDown={handleOverlayClick}
		>
			<div
				className="llm-chat-widget"
				role="dialog"
				aria-modal="false"
				style={{ position: "fixed", left: "50%", bottom: 70, transform: "translateX(-50%)" }}
			>
				<div className="llm-chat-liquid" aria-hidden="true" />
				<button type="button" className="llm-chat-close" onClick={onClose} aria-label="Close chat">
					×
				</button>
				<div className="llm-chat-messages" ref={listRef}>
					{bubbles.length === 0 ? (
						<p className="llm-chat-placeholder">
							Ask me for a mission. I’ll return Blockly XML you can drop straight into the
							workspace.
						</p>
					) : (
						bubbles.map((msg) => (
							msg.codeXml ? (
								<div key={msg.id} className="llm-chat-blocks-only">
									{msg.text && (
										<div className="llm-chat-caption">{msg.text}</div>
									)}
									<div
										id={`blockly-preview-${msg.id}`}
										className="llm-chat-blockly-preview"
										style={{
											marginTop: 6,
											minHeight: 140,
											maxHeight: 260,
											height: 180,
											borderRadius: 12,
											overflow: "hidden",
											width: "100%",
										}}
									/>
									<details className="llm-chat-xml-details">
										<summary>Show raw XML</summary>
										<pre className="llm-chat-code" style={{ marginTop: 6 }}>
											<code>{msg.codeXml}</code>
										</pre>
									</details>
								</div>
							) : (
								<div key={msg.id} className={`llm-chat-bubble ${msg.variant}`}>
									{msg.text}
								</div>
							)
						))
					)}
				</div>
				{pendingXml && (
					<div className="llm-chat-xml-preview">
						<header>Blockly XML detected</header>
						<pre>{pendingXml}</pre>
						<button type="button" className="llm-chat-inject" onClick={handleInject}>
							Inject into workspace
						</button>
					</div>
				)}
				<form className="llm-chat-input" onSubmit={handleSend}>
					<input
						type="text"
						value={input}
						onChange={(event) => setInput(event.target.value)}
						placeholder="Describe a mission..."
						disabled={!isOpen}
					/>
					<button type="submit" disabled={isSending || !input.trim()}>
						{isSending ? "..." : "Send"}
					</button>
				</form>
			</div>
		</div>
	);
}

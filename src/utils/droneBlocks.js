import * as Blockly from "blockly";

// Shared drone block definitions with consistent chaining
// Convention:
// - takeoff: can start a sequence (no previous), has next
// - land: ends a sequence (has previous), no next
// - others: can be in the middle (has previous and next)
const DRONE_BLOCK_DEFINITIONS = [
  {
    type: "takeoff",
    message0: "Takeoff",
    previousStatement: null,
    nextStatement: "Statement",
    colour: 160,
  },
  {
    type: "takeoff_height",
    message0: "Takeoff to %1 m",
    args0: [{ type: "field_number", name: "HEIGHT", value: 2 }],
    previousStatement: null,
    nextStatement: "Statement",
    colour: 170,
  },
  {
    type: "takeoff_after",
    message0: "Takeoff after %1 seconds",
    args0: [{ type: "field_number", name: "TIME", value: 1 }],
    previousStatement: null,
    nextStatement: "Statement",
    colour: 210,
  },
  {
    type: "wait",
    message0: "Wait %1 seconds",
    args0: [{ type: "field_number", name: "TIME", value: 1 }],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 65,
  },
  {
    type: "fly",
    message0: "Fly %1 %2 meters",
    args0: [
      {
        type: "field_dropdown",
        name: "DIRECTION",
        options: [
          ["forward", "F"],
          ["backward", "B"],
          ["left", "L"],
          ["right", "R"],
          ["up", "U"],
          ["down", "D"],
        ],
      },
      { type: "field_number", name: "VALUE", value: 1 },
    ],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 20,
  },
  {
    type: "circle",
    message0: "Circle %1 with %2 radius",
    args0: [
      {
        type: "field_dropdown",
        name: "DIRECTION",
        options: [
          ["left", "CL"],
          ["right", "CR"],
        ],
      },
      { type: "field_number", name: "VALUE", value: 1 },
    ],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 290,
  },
  {
    type: "yaw",
    message0: "Yaw %1 %2 degrees",
    args0: [
      {
        type: "field_dropdown",
        name: "DIRECTION",
        options: [
          ["left", "YL"],
          ["right", "YR"],
        ],
      },
      { type: "field_number", name: "VALUE", value: 30 },
    ],
    previousStatement: "Statement",
    nextStatement: "Statement",
    colour: 200,
  },
  {
    type: "land",
    message0: "Land",
    previousStatement: "Statement",
    nextStatement: null,
    colour: 160,
  },
  {
    type: "land_after",
    message0: "Land for %1 seconds then takeoff",
    args0: [{ type: "field_number", name: "TIME", value: 2 }],
    previousStatement: "Statement",
    nextStatement: null,
    colour: 160,
  },
];

let blocksRegistered = false;
export function ensureDroneBlocksRegistered() {
  if (blocksRegistered) return;
  const newDefs = DRONE_BLOCK_DEFINITIONS.filter((def) => !Blockly.Blocks?.[def.type]);
  if (newDefs.length) {
    Blockly.defineBlocksWithJsonArray(newDefs);
  }
  blocksRegistered = true;
}

export const ALLOWED_FIELDS_BY_TYPE = {
  takeoff: [],
  takeoff_height: ["HEIGHT"],
  land: [],
  wait: ["TIME"],
  takeoff_after: ["TIME"],
  land_after: ["TIME"],
  fly: ["DIRECTION", "VALUE"],
  circle: ["DIRECTION", "VALUE"],
  yaw: ["DIRECTION", "VALUE"],
};

export function sanitizeBlocklyXmlDom(xmlDom) {
  try {
    const blocks = Array.from(xmlDom.getElementsByTagName("block"));
    blocks.forEach((blockEl) => {
      const type = blockEl.getAttribute("type") || "";
      const allowed = ALLOWED_FIELDS_BY_TYPE[type];
      if (!allowed) return; // unknown types left as-is
      Array.from(blockEl.children).forEach((child) => {
        if (child.nodeName.toLowerCase() === "field") {
          const name = child.getAttribute("name");
          if (!allowed.includes(name)) {
            try {
              blockEl.removeChild(child);
            } catch {}
          }
        }
      });
    });
  } catch {}
  return xmlDom;
}

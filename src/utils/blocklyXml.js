import * as Blockly from "blockly";

const getXmlHelpers = () => Blockly.Xml || Blockly.utils?.xml || null;

function decodeHtmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractXmlRoot(s) {
  const start = s.toLowerCase().indexOf("<xml");
  const end = s.toLowerCase().lastIndexOf("</xml>");
  if (start !== -1 && end !== -1) {
    return s.slice(start, end + "</xml>".length);
  }
  return s;
}

function normalizeBlocklyXmlString(xmlText) {
  let s = String(xmlText ?? "");
  // Trim BOM and zero-width chars
  s = s.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  // If it looks HTML-escaped, decode entities
  if (s.includes("&lt;xml")) {
    s = decodeHtmlEntities(s);
  }
  // Extract just the <xml>...</xml> root if extra text surrounds it
  s = extractXmlRoot(s);
  return s;
}

export function parseBlocklyXmlString(xmlText) {
  if (typeof xmlText !== "string") {
    throw new Error("Expected Blockly XML string");
  }

  const normalized = normalizeBlocklyXmlString(xmlText);

  const helpers = getXmlHelpers();
  if (helpers && typeof helpers.textToDom === "function") {
    try {
      return helpers.textToDom(normalized);
    } catch (error) {
      console.warn("Blockly textToDom failed, falling back to DOMParser.", error);
    }
  }

  // Try strict XML parsing first
  let parser = new DOMParser();
  let doc = parser.parseFromString(normalized, "application/xml");
  let errorNode = doc.querySelector("parsererror");
  if (!errorNode) {
    return doc.documentElement || doc;
  }

  // Fallback: parse as HTML and extract <xml> element when XML parser is picky
  try {
    parser = new DOMParser();
    const html = parser.parseFromString(normalized, "text/html");
    const xmlEl = html.querySelector("xml");
    if (xmlEl) {
      const asString = xmlEl.outerHTML;
      const xmlDoc = new DOMParser().parseFromString(asString, "application/xml");
      const err = xmlDoc.querySelector("parsererror");
      if (!err) {
        return xmlDoc.documentElement || xmlDoc;
      }
    }
  } catch {}

  throw new Error("Invalid Blockly XML provided");
}

export function domToWorkspaceSafe(xmlEl, workspace) {
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

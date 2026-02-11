import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Very simple chat UI that talks to an LM Studio-style HTTP endpoint.
 * Assumes the endpoint returns JSON like:
 *   { reply: "...", blockly_xml: "<xml ...>...</xml>" }
 * Adjust `API_URL` and parsing to match your actual server.
 */
const API_URL = "http://localhost:1234/v1/chat/completions"; // TODO: set to your LM Studio endpoint

export default function LlmChatPage() {
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: "system",
      text: "Ask me to generate drone Blockly programs. Example: 'Takeoff 5m, move east 10m, then land.'",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastBlocklyXml, setLastBlocklyXml] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMsg = {
      id: Date.now(),
      role: "user",
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      // Minimal LM Studio-like API example.
      // Adjust payload/response shape to your own endpoint.
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are a drone Blockly assistant. You MUST respond with JSON {\"type\":\"blocks\",\"xml\":\"<xml ...></xml>\",\"text\":\"...\"}.",
            },
            {
              role: "user",
              content: trimmed,
            },
          ],
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      // You’ll need to adjust this depending on LM Studio’s actual schema.
      // Here we expect data.reply to be a string containing the JSON we want.
      let replyText = "";
      let parsedBlocks = null;

      // Example: LM Studio returns { choices: [ { message: { content: "..." } } ] }
      if (data?.choices?.[0]?.message?.content) {
        replyText = data.choices[0].message.content;
      } else if (data?.reply) {
        replyText = data.reply;
      } else {
        replyText = JSON.stringify(data, null, 2);
      }

      // Try to parse block JSON if present.
      // We expect something like: {"type":"blocks","xml":"<xml ...>","text":"..."}
      try {
        const maybeJsonStart = replyText.indexOf("{");
        const maybeJsonEnd = replyText.lastIndexOf("}");
        if (maybeJsonStart !== -1 && maybeJsonEnd !== -1) {
          const jsonSnippet = replyText.slice(maybeJsonStart, maybeJsonEnd + 1);
          const parsed = JSON.parse(jsonSnippet);
          if (parsed && parsed.type === "blocks" && parsed.xml) {
            parsedBlocks = parsed;
          }
        }
      } catch {
        // ignore parse errors, just show text
      }

      if (parsedBlocks) {
        setLastBlocklyXml(parsedBlocks.xml);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "assistant",
            text: parsedBlocks.text || "Generated Blockly program.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "assistant",
            text: replyText,
          },
        ]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: `Error: ${String(err)}`,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleInject = () => {
    if (!lastBlocklyXml) return;
    navigate("/drone", {
      state: {
        injectedBlocklyXml: lastBlocklyXml,
        from: location.pathname,
      },
    });
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#020617",
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      }}
    >
      <header
        style={{
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(148,163,184,0.3)",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Blockly Copilot</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Chat with your finetuned model to generate drone Blockly code.
          </div>
        </div>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,0.6)",
            background: "transparent",

            color: "#e5e7eb",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Back
        </button>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "16px 24px",
          gap: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,0.4)",
            padding: 16,
            overflowY: "auto",
            background: "linear-gradient(to bottom right, #020617, #020617,#020617)",
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                marginBottom: 12,
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  padding: "8px 12px",
                  borderRadius: 12,
                  fontSize: 14,
                  background:
                    m.role === "user"
                      ? "linear-gradient(to bottom right, #0ea5e9, #3b82f6)"
                      : "rgba(15,23,42,0.9)",
                  color: m.role === "user" ? "#0f172a" : "#e5e7eb",
                  whiteSpace: "pre-wrap",
                  
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {lastBlocklyXml && (
          <div
            style={{
              borderRadius: 16,
              border: "1px solid rgba(52,211,153,0.4)",
              padding: 12,
              background: "rgba(15,118,110,0.12)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#6ee7b7" }}>
              Blockly XML detected
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: 11,
                maxHeight: 150,
                overflow: "auto",
                background: "rgba(15,23,42,0.9)",
                padding: 8,
                borderRadius: 8,
                border: "1px solid rgba(15,118,110,0.5)",
              }}
            >
              {lastBlocklyXml}
            </pre>
            <button
              onClick={handleInject}
              style={{
                alignSelf: "flex-start",
                marginTop: 4,
                padding: "6px 14px",
                borderRadius: 999,
                border: "none",
                background: "linear-gradient(to right, #22c55e, #16a34a)",
                color: "#022c22",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                backdropFilter: "blur(100px)",
              }}
            >
              Inject into workspace
            </button>
          </div>
        )}

        <form
          onSubmit={handleSend}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingTop: 4,
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the mission you want in natural language…"
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid rgba(148,163,184,0.6)",
              outline: "none",
              fontSize: 14,
              background: "rgba(15,23,42,0.9)",
              color: "#e5e7eb",
            }}
          />
          <button
            type="submit"
            disabled={isSending}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "none",
              background: isSending
                ? "rgba(148,163,184,0.4)"
                : "linear-gradient(to right, #6366f1, #a855f7)",
              color: "#f9fafb",
              fontSize: 14,
              fontWeight: 600,
              cursor: isSending ? "default" : "pointer",
              minWidth: 80,
            }}
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </form>
      </main>
    </div>
  );
}

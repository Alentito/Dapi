<p align="center">
  <img src="src/assets/Dapi6.svg" alt="Dapi Logo" width="120" />
</p>

<h1 align="center">Dapi</h1>

<p align="center">
  <b>AI-powered drone mission planner</b><br />
  Describe a flight mission in plain English → get executable Blockly code → simulate it in 3D.
</p>

<p align="center">
  <a href="https://huggingface.co/Alentito/qwen2.5-3b-dapi-finetuned">🤗 Model on HuggingFace</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#run-the-model-locally-with-lm-studio">Run Locally with LM Studio</a>
</p>

---

## What is Dapi?

Dapi is an open-source **visual drone programming environment** that lets you build drone flight plans using drag-and-drop Blockly blocks, then preview them in a real-time 3D simulator — no code required.

The killer feature is the **Blockly Copilot**: a chat interface powered by a finetuned [Qwen 2.5 3B](https://huggingface.co/Alentito/qwen2.5-3b-dapi-finetuned) model that converts natural-language mission descriptions into Blockly XML you can inject straight into the workspace.

### Pages

| Route | Description |
|-------|-------------|
| `/` | **Landing page** — interactive physics-based Blockly block animation |
| `/drone` | **Drone Workspace** — Blockly editor + 3D drone simulator + auto-generated code panel |
| `/copilot` | **Blockly Copilot** — chat with the finetuned model to generate missions from text |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** (comes with Node.js)

### 1 · Clone & install

```bash
git clone https://github.com/Alentito/Dapi.git
cd Dapi
npm install
```

### 2 · Start the dev server

```bash
npm run dev
```

The app opens at **http://localhost:5173** (default Vite port).

### 3 · Open the Drone Workspace

Navigate to **http://localhost:5173/drone** to start building flight plans with Blockly blocks.

> **Tip:** You can use the workspace standalone — drag blocks, preview generated code, and run the 3D simulation — without any AI model running.

---

## Run the Model Locally with LM Studio

The Copilot feature requires a local LLM server. The easiest way to run one is with [**LM Studio**](https://lmstudio.ai) — a free desktop app that lets you download and serve models with zero config.

### Step 1 — Install LM Studio

1. Go to [**lmstudio.ai**](https://lmstudio.ai) and download the installer for your OS (macOS / Windows / Linux).
2. Open the app once installed.

### Step 2 — Download the Dapi model

1. In LM Studio, click the **Search** bar (or the 🔍 icon) at the top.
2. Search for:
   ```
   Alentito/qwen2.5-3b-dapi-finetuned
   ```
3. Select the model from the results and click **Download**.
4. Wait for the download to finish (the model is ~1.8 GB in GGUF format).

> **Alternative:** you can also paste the HuggingFace URL directly:  
> `https://huggingface.co/Alentito/qwen2.5-3b-dapi-finetuned`

### Step 3 — Load the model

1. Go to the **Chat** tab (💬) or **Local Server** tab in LM Studio.
2. Click the model selector dropdown at the top and choose **qwen2.5-3b-dapi-finetuned**.
3. The model will load into memory (needs ~3–4 GB RAM).

### Step 4 — Start the local API server

1. Switch to the **Local Server** tab (the `<->` icon in the sidebar).
2. Make sure the model is loaded.
3. Click **Start Server**.
4. You should see:
   ```
   Server started on http://localhost:1234
   ```
5. The server exposes an **OpenAI-compatible API** at:
   ```
   http://localhost:1234/v1/chat/completions
   ```

> **That's it!** Dapi's Copilot is already configured to talk to `http://localhost:1234/v1/chat/completions` — no configuration needed.

### Step 5 — Use the Copilot

1. Make sure the Dapi dev server is running (`npm run dev`).
2. Navigate to **http://localhost:5173/copilot**.
3. Type a mission in plain English, for example:

   ```
   Takeoff to 5 meters, fly north 10 meters, then fly east 5 meters, and land.
   ```

4. The model will respond with Blockly XML.
5. Click **"Inject into workspace"** to load the generated program into the Drone Workspace.
6. Press **Run ▶** in the workspace to see the 3D drone execute the mission.

---

## Using the Drone Workspace

The workspace at `/drone` has three resizable panels:

| Panel | What it does |
|-------|-------------|
| **Blockly Editor** | Drag-and-drop visual block editor. Build missions from drone command blocks (Takeoff, Fly, Yaw, Circle, Wait, Land). |
| **3D Simulator** | Live 3D preview of the drone executing your block program. Orbit with mouse. |
| **Code Panel** | Auto-generated JavaScript from your Blockly blocks (read-only). |

### Available Drone Blocks

| Block | Parameters | Description |
|-------|-----------|-------------|
| `Takeoff` | — | Start the drone |
| `Takeoff (height)` | height (m) | Takeoff to a specific altitude |
| `Takeoff (seconds)` | time (s) | Takeoff with a specific duration |
| `Fly` | direction, distance (m) | Move in a direction (North / South / East / West / Up / Down) |
| `Yaw` | direction, degrees | Rotate the drone (Left / Right) |
| `Circle` | direction, degrees | Fly in a circular arc |
| `Wait` | time (s) | Hover in place |
| `Land` | — | End the flight |
| `Land (seconds)` | time (s) | Land with a specific duration |

### Copilot Widget (in-workspace)

Inside the Drone Workspace there is also a built-in Copilot chat widget you can open to generate blocks without leaving the editor.

---

## API Configuration

By default, the app connects to:

```
http://localhost:1234/v1/chat/completions
```

This is the default LM Studio local server endpoint. If you're running the model on a different port or machine, update the `API_URL` constant in:

- `src/LlmChatPage.jsx` (line 10) — the standalone Copilot page
- `src/components/LlmChatWidget.jsx` (line 5) — the in-workspace Copilot widget

```js
const API_URL = "http://<your-host>:<your-port>/v1/chat/completions";
```

### Using any OpenAI-compatible server

The Copilot works with **any server** that implements the OpenAI `/v1/chat/completions` endpoint. This includes:

- [LM Studio](https://lmstudio.ai) (recommended, easiest setup)
- [Ollama](https://ollama.com) — run `ollama serve` then load the model
- [vLLM](https://github.com/vllm-project/vllm)
- [text-generation-webui](https://github.com/oobabooga/text-generation-webui) with openai extension

---

## Project Structure

```
Dapi/
├── index.html                  # Entry point
├── src/
│   ├── main.jsx                # React root — BrowserRouter setup
│   ├── App.jsx                 # Route definitions (/, /drone, /copilot)
│   ├── App.css                 # Global styles
│   ├── PhysicsBlocksSection.jsx # Landing page (PixiJS + Matter.js physics)
│   ├── LlmChatPage.jsx         # Standalone Copilot chat page
│   ├── pages/
│   │   └── DroneWorkspace.jsx   # Main workspace (Blockly + Three.js + code)
│   ├── components/
│   │   └── LlmChatWidget.jsx   # In-workspace Copilot chat widget
│   ├── utils/
│   │   ├── droneBlocks.js       # Custom Blockly block definitions
│   │   └── blocklyXml.js        # XML parsing utilities
│   ├── Drone/                   # 3D drone model (GLTF) + simulator
│   └── assets/                  # SVG logos and images
├── package.json
└── vite.config.js               # Vite config with socket.io proxy
```

---

## Tech Stack

- **React 19** + **Vite** — fast dev server and build
- **Blockly** — visual block-based programming
- **Three.js** — 3D drone simulation
- **PixiJS** + **Matter.js** — physics-based landing page animation
- **GSAP** — smooth animations
- **Socket.io** — real-time communication (drone connectivity)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Copilot says "Error: Failed to fetch" | Make sure LM Studio server is running on port 1234 |
| Model not found in LM Studio search | Search for `Alentito/qwen2.5-3b-dapi-finetuned` or paste the HuggingFace URL directly |
| 3D simulator is blank | Check browser supports WebGL. Try Chrome or Edge. |
| Blocks don't inject into workspace | Make sure you clicked "Inject into workspace" after the model generates XML |
| CORS errors in console | The Vite dev server proxies requests automatically. Make sure you're accessing the app through `localhost:5173`, not opening the HTML file directly. |

---

## License

Open source — contributions welcome!

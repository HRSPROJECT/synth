# ⚗️ SYNTH

> **Universal Digital Experimentation Platform**  
> Transform real-world questions into evidence-driven discoveries powered by AI, live web research, and computational simulation.

---

## 🌟 Overview

**SYNTH** is an interactive, browser-based digital experimentation workspace that bridges real-world inquiry with autonomous AI agents, web intelligence, and multi-modal evidence synthesis. 

Whether investigating complex agricultural models, renewable energy transitions, macroeconomic forecasts, or engineering dilemmas, SYNTH formulates hypotheses, executes live web queries, runs computational simulations, and produces comprehensive visual reports—all on a dynamic, living canvas.

---

## ✨ Key Features

- **🧠 Autonomous Agentic Workflow**: Formulates testable hypotheses, breaks down queries into structured execution plans, and iteratively tests assumptions.
- **🔍 Live Web Intelligence**: Integrated with [Tavily](https://tavily.com/) for real-time web research, fact extraction, and grounding.
- **🤖 Multi-Provider LLM Support**:
  - **Google Gemini**: Built-in support for Gemini models (e.g., `gemini-2.5-flash`).
  - **OpenRouter**: Access a vast catalog of open and proprietary frontier models.
- **📎 Multimodal File Ingestion**: Drop in files (PDF, DOCX, TXT, CSV, Markdown) to inject domain data directly into the agent's context window (powered by `pdf.js` & `mammoth`).
- **🗺️ Interactive Geospatial Map Analysis**: Annotate points of interest, geographic zones, and custom coordinates with Leaflet and heatmaps.
- **📊 Rich Dynamic Visualizations**:
  - Interactive charts powered by [Chart.js](https://www.chartjs.org/)
  - Flowcharts and system architecture diagrams with [Mermaid.js](https://mermaid.js.org/)
  - Geographic distributions via [Leaflet](https://leafletjs.com/) and [Leaflet Heat](https://github.com/Leaflet/Leaflet.heat)
- **📄 One-Click Report Export**: Export complete research and experiment findings to PDF, DOCX, or plain text with embedded charts and tables.

---

## 🛠️ Tech Stack

- **Frontend & Build Tool**: [Vite](https://vitejs.dev/) + Modern Vanilla JavaScript (ES modules)
- **Styling**: Responsive custom CSS with dark/light visual depth and glassmorphism styling
- **Mapping**: Leaflet, Leaflet Heatmap
- **Data & Charts**: Chart.js, Mermaid.js, Marked (Markdown rendering)
- **Document Parsers**: PDF.js, Mammoth.js, jsPDF, html2canvas
- **Deployment**: Ready for Vercel, Netlify, or standard static web hosts

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or later recommended)
- `npm`, `pnpm`, or `yarn`
- API Keys:
  - **Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/)) OR **OpenRouter API Key**
  - *(Optional)* **Tavily API Key** for real-time web search capabilities

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/HRSPROJECT/synth.git
   cd synth
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:5173`.

4. **Build for production:**
   ```bash
   npm run build
   ```

5. **Preview production build:**
   ```bash
   npm run preview
   ```

---

## ⚙️ Configuration & Usage

1. Launch SYNTH in your browser.
2. Enter your **Gemini** or **OpenRouter** API key in the initial modal prompt.
3. *(Optional)* Add your **Tavily API Key** to enable live web retrieval.
4. Select or type your research question, attach relevant domain files or drop pins on the map, and click **⚗ Run Experiment**.
5. Inspect generated hypotheses, agent reasoning, data simulations, and export your report!

---

## 📂 Project Structure

```text
synth/
├── index.html         # Main application shell and UI layout
├── js/
│   ├── agent.js       # Core agent workflow, planning, and task execution
│   ├── api.js         # Gemini, OpenRouter, and Tavily API integrations
│   ├── app.js         # Main application initialization and event handlers
│   ├── charts.js      # Dynamic Chart.js and data visualizer wrappers
│   ├── export.js      # PDF, DOCX, and TXT report generation
│   ├── files.js       # Multi-format document parser (PDF, DOCX, etc.)
│   ├── map.js         # Leaflet map annotations, markers, and zone tooling
│   └── ui.js          # Notifications, modal management, and UI state
├── src/
│   ├── main.js        # Vite entry point
│   └── style.css      # Design system, themes, and responsive layout
├── package.json       # Project scripts and dependencies
└── vite.config.js     # Vite configuration
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
Feel free to open an issue or submit a pull request.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) (or repository default).

-- Seed: initial repositories and developer lens

INSERT OR IGNORE INTO repositories (id, name, url, description, indexed_context) VALUES (
  1,
  'Peekachu',
  'https://github.com/Viswesh934/Peekachu',
  'Full-stack observability and root-cause analysis platform. Ingests OpenTelemetry traces into ClickHouse, uses an LLM layer (LlamaIndex) for RCA, exposes a Fastify/TypeScript API, and a React frontend. Langfuse is used for LLM observability.',
  '{
    "name": "Peekachu",
    "url": "https://github.com/Viswesh934/Peekachu",
    "description": "Full-stack observability and root-cause analysis (RCA) platform. Collects OpenTelemetry traces, stores them in ClickHouse, and uses an LLM layer for automated root-cause analysis.",
    "primary_languages": ["Go", "TypeScript", "Python"],
    "frameworks": ["Fastify", "React", "LlamaIndex", "OpenTelemetry"],
    "infrastructure": ["ClickHouse", "Langfuse", "Docker", "Docker Compose"],
    "architecture": {
      "style": "Multi-service, event-driven observability platform",
      "layers": [
        {
          "name": "Ingest / Collector",
          "description": "OpenTelemetry collector receives traces and metrics from instrumented services and forwards them to ClickHouse.",
          "technologies": ["OpenTelemetry Collector", "OTLP"]
        },
        {
          "name": "Storage",
          "description": "ClickHouse acts as the primary analytical store for trace data, spans, and metrics. Optimised for aggregation queries.",
          "technologies": ["ClickHouse"]
        },
        {
          "name": "RCA Engine (Go)",
          "description": "Go service responsible for querying ClickHouse, aggregating span data, detecting anomalies, and constructing context payloads for the LLM analysis layer.",
          "technologies": ["Go"]
        },
        {
          "name": "LLM Analysis Layer",
          "description": "Python-based LlamaIndex service that receives structured trace context from the RCA engine and produces natural-language root-cause explanations. Langfuse tracks LLM calls.",
          "technologies": ["Python", "LlamaIndex", "Langfuse"]
        },
        {
          "name": "Backend API",
          "description": "Fastify/TypeScript API server that orchestrates requests from the frontend, calls the RCA engine, and returns structured analysis results.",
          "technologies": ["Fastify", "TypeScript", "Node.js"]
        },
        {
          "name": "Frontend",
          "description": "React SPA providing dashboards for trace exploration, RCA results, and service-map visualisation.",
          "technologies": ["React", "TypeScript"]
        }
      ]
    },
    "important_directories": [
      { "path": "backend/", "description": "Fastify TypeScript API server" },
      { "path": "frontend/", "description": "React SPA" },
      { "path": "rca-engine/", "description": "Go root-cause analysis engine" },
      { "path": "llm-service/", "description": "Python LlamaIndex analysis layer" },
      { "path": "collector/", "description": "OpenTelemetry collector configuration" },
      { "path": "docker-compose.yml", "description": "Multi-service orchestration" }
    ],
    "entry_points": [
      { "path": "rca-engine/main.go", "description": "Go RCA engine entry point" },
      { "path": "backend/src/index.ts", "description": "Fastify API server entry point" },
      { "path": "frontend/src/main.tsx", "description": "React app entry point" },
      { "path": "llm-service/main.py", "description": "LlamaIndex analysis service entry point" }
    ],
    "apis": [
      { "description": "Fastify REST API serving frontend requests for trace data and RCA results" },
      { "description": "Internal Go RCA engine HTTP API consumed by the Fastify backend" },
      { "description": "LLM service HTTP endpoint for analysis requests" }
    ],
    "dependencies": {
      "go": ["ClickHouse Go driver", "OpenTelemetry Go SDK"],
      "node": ["Fastify", "TypeScript", "@clickhouse/client"],
      "python": ["llama-index", "langfuse", "openai"]
    },
    "configuration_files": [
      "docker-compose.yml",
      "collector/otel-collector-config.yaml",
      "backend/package.json",
      "rca-engine/go.mod",
      "llm-service/requirements.txt"
    ],
    "tests": {
      "description": "Test coverage present across Go and TypeScript layers",
      "locations": ["rca-engine/**/*_test.go", "backend/src/**/*.test.ts"]
    },
    "observability": {
      "tracing": "OpenTelemetry",
      "llm_tracing": "Langfuse",
      "storage": "ClickHouse"
    },
    "indexing_status": "pre-indexed",
    "indexing_note": "Context built from repository description and structure. Use POST /api/repositories/1/index to re-index from source."
  }'
);

INSERT OR IGNORE INTO repositories (id, name, url, description, indexed_context) VALUES (
  2,
  'Gotei',
  'https://github.com/Viswesh934/Gotei',
  'Go HTML-to-PDF rendering engine. Parses HTML into a DOM, applies a layout engine, renders to a PDF via a pipeline architecture. Exposes an HTTP API for conversion requests.',
  '{
    "name": "Gotei",
    "url": "https://github.com/Viswesh934/Gotei",
    "description": "Lightweight Go HTML-to-PDF rendering engine. Takes HTML input, parses it into an internal DOM representation, runs it through a layout engine, and renders the result as a PDF. Exposes an HTTP API for programmatic use.",
    "primary_languages": ["Go"],
    "frameworks": ["net/http (Go standard library)"],
    "infrastructure": ["Docker (optional)"],
    "architecture": {
      "style": "Pipeline / staged-transformation engine",
      "pipeline": [
        {
          "stage": "1. HTTP API",
          "description": "Receives HTML content via HTTP POST. Validates input and dispatches to the rendering pipeline.",
          "technologies": ["Go net/http"]
        },
        {
          "stage": "2. HTML Parsing / DOM Construction",
          "description": "Parses the raw HTML string into an internal tree structure (DOM). Handles element hierarchy, text nodes, and attributes.",
          "technologies": ["Go", "golang.org/x/net/html"]
        },
        {
          "stage": "3. Layout Engine",
          "description": "Traverses the DOM tree and computes the visual layout: box model dimensions, positioning, flow, and inline/block element handling.",
          "technologies": ["Go"]
        },
        {
          "stage": "4. Rendering",
          "description": "Takes the computed layout and renders each element to a PDF page. Handles text, borders, colours, and page breaks.",
          "technologies": ["Go", "PDF generation library (e.g. gofpdf or similar)"]
        },
        {
          "stage": "5. Output",
          "description": "Returns the rendered PDF bytes in the HTTP response or writes to a file.",
          "technologies": ["Go"]
        }
      ]
    },
    "important_directories": [
      { "path": "main.go", "description": "Application entry point and HTTP server setup" },
      { "path": "parser/", "description": "HTML parsing and DOM construction" },
      { "path": "layout/", "description": "Layout engine — box model and positioning" },
      { "path": "renderer/", "description": "PDF rendering layer" },
      { "path": "api/", "description": "HTTP handler and request routing" }
    ],
    "entry_points": [
      { "path": "main.go", "description": "Go HTTP server entry point" }
    ],
    "apis": [
      {
        "method": "POST",
        "path": "/render",
        "description": "Accepts HTML body, returns PDF bytes"
      },
      {
        "method": "GET",
        "path": "/health",
        "description": "Health check endpoint"
      }
    ],
    "dependencies": {
      "go": ["golang.org/x/net/html", "PDF generation library", "Go standard library"]
    },
    "configuration_files": [
      "go.mod",
      "go.sum",
      "Dockerfile"
    ],
    "tests": {
      "description": "Unit tests for parsing, layout, and rendering stages",
      "locations": ["**/*_test.go"]
    },
    "key_design_decisions": [
      "Pure Go implementation — no headless browser dependency",
      "Pipeline architecture makes each stage independently testable",
      "Stateless HTTP API — each request is fully self-contained",
      "No external state or database"
    ],
    "indexing_status": "pre-indexed",
    "indexing_note": "Context built from repository description and structure. Use POST /api/repositories/2/index to re-index from source."
  }'
);

-- Seed default developer lens
INSERT OR IGNORE INTO developer_lens (id, investigation_style, explanation_style) VALUES (
  1,
  'When investigating a request, start from the relevant API or entry point. Trace the request through the controller/service/business logic and data layer. Look for existing patterns before proposing new ones. Inspect related tests and configuration. Check infrastructure and dependencies when they are relevant. Use git history when understanding why an implementation exists.',
  'Explain the user impact first. Avoid unnecessary technical jargon for PMs and clients. Explain technical dependencies when they materially affect scope, risk, or effort. Be explicit about uncertainty. Never invent repository facts.'
);

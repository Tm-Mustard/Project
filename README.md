# OpenLens

OpenLens turns photos and scans of documents into clean, structured, searchable data. Upload an image, choose a vision model, and get back extracted fields as JSON — then ask questions about the result with the built-in Lens.ai assistant.

Live: [openlens.space](https://openlens.space)

## Overview

OpenLens was built to solve a simple but common problem: turning messy real-world document photos (IDs, forms, marksheets, receipts, screenshots) into usable structured data, without relying on a single paid AI provider. It uses a privacy-first, stateless image processing architecture where images are never saved to a database, ensuring maximum security for sensitive user documents.

Key ideas:
- Images are held in browser memory and sent via multipart to the backend for on-the-fly processing.
- The backend does not persist raw images — only user-confirmed structured JSON is stored.
- Multiple vision model backends are supported so you can route requests to Gemini, Qwen, or Nemotron.

## Features

- Image-to-text extraction from photos, screenshots, and scanned documents.
- Choice of vision models / VLMs: Gemini, Qwen, Nemotron.
- Automatic API-key rotation per provider to improve effective rate limits.
- Image preprocessing: blur detection, lighting/contrast enhancement (OpenCV).
- Multilingual extraction support.
- Lens.ai — a chat assistant that answers questions about the extracted data, grounded in the extracted fields.
- Interactive dashboard to view and edit extracted JSON data side-by-side with a local image preview.
- CSV / Excel export of confirmed extraction results.

## Tech Stack

**Frontend**
- React + TypeScript (Vite)
- Tailwind CSS
- Deployed on Vercel

**Backend**
- FastAPI (Python)
- OpenCV for image preprocessing
- Deployed on Render (or your preferred container host)

**Database**
- Supabase (Postgres + Auth + RLS)

**AI / VLM Providers**
- Google Gemini (gemini_model.py)
- Qwen (qwen_model.py)
- Nemotron (nemotron_model.py)

**Notable libraries**
- google.genai (Gemini client)
- OpenCV (image preprocessing)
- supabase-py or HTTP supabase client (backend -> Supabase)
- FastAPI / uvicorn

## Architecture

Text overview:

- The React frontend holds an uploaded image in memory and shows a preview.
- When the user requests processing, the image is uploaded (multipart) to the FastAPI backend.
- Backend runs OpenCV preprocessing and forwards the image to the configured VLM (Gemini / Qwen / Nemotron) via the model-specific integration.
- Backend returns extracted JSON to the frontend for review and edit.
- Only confirmed JSON is saved to Supabase; raw images are never persisted.

Simple flow:

1. Select image (client-side only).
2. POST image to backend (/imgpip).
3. Backend preprocesses and extracts structured JSON using the selected model.
4. Frontend displays editable JSON and preview.
5. User confirms → frontend POSTs finalized JSON to Supabase.
6. Image is discarded from memory.

## Project structure

```text
openlens/
├── .gitignore
├── README.md
├── dockerfile                 # docker build for backend (root)
├── backend/
│   ├── main.py                # FastAPI app and routes
│   ├── extraction.py          # Extraction pipeline orchestration
│   ├── auth.py                # Supabase auth verification helpers
│   ├── clients.py             # API key clients and rotation logic
│   ├── cvfile.py              # Image preprocessing (OpenCV)
│   ├── lensai.py              # Lens.ai assistant logic
│   ├── .env.example           # Backend env example
│   ├── requirements.txt       # Python dependencies
│   └── models/
│       ├── __init__.py
│       ├── gemini_model.py    # Gemini vision model integration
│       ├── qwen_model.py      # Qwen vision model integration
│       └── nemotron_model.py  # Nemotron vision model integration
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vercel.json
│   ├── .env.example           # Frontend env example
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types.ts
│       ├── lib/supabase.ts
│       ├── components/
│       └── pages/
│
└── supabase/
    └── schema.sql             # Database schema and RLS policies
```

## Environment variables

Backend: create `backend/.env` from `backend/.env.example`. Variables used by the codebase (add keys you need for your providers):

### Supabase
```env
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=
```

### Vision model API keys (comma-separated lists supported; code rotates keys)
```env
GEMINI_API_KEYS=
GROQ_API_KEYS=
OPENROUTER_API_KEYS=
```

Frontend: create frontend/.env from frontend/.env.example:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=         # e.g. http://localhost:8000
```

## Notes

- The backend expects Supabase service role key for server-side operations; never expose the service key to the browser.
- GEMINI_API_KEYS, QWEN_API_KEYS, and NEMOTRON_API_KEYS are read by the backend clients/rotation logic (see backend/clients.py). Provide comma-separated keys or one per provider; the clients will rotate them to reduce single-key throttling.

## Getting started (local)

### Prerequisites

- Python 3.10+
- Node.js (LTS)
- A Supabase project and the environment variables above
- API keys for the VLM providers you plan to use

### Backend

```bash
cd backend
python -m venv venv
# macOS / Linux
source venv/bin/activate
# Windows (PowerShell)
# .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Docker (build backend using root dockerfile)

```bash
docker build -t openlens-backend -f dockerfile .
docker run -p 8000:8000 --env-file backend/.env openlens-backend
```

## API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | / | Health check |
| POST | /imgpip | Accepts multipart image upload, processes via selected VLM, returns extracted JSON |
| POST | /ask | Ask Lens.ai a question grounded in extracted document data |

Endpoints that interact with user-owned data require a Supabase-issued bearer token. See `backend/auth.py` for token verification helpers.

## Files of interest

- `backend/main.py` — FastAPI app and routing
- `backend/extraction.py` — orchestrates preprocessing → model → postprocess
- `backend/clients.py` — API-key rotation and provider client factory
- `backend/models/*.py` — per-provider model integrations:
  - `gemini_model.py`
  - `qwen_model.py`
  - `nemotron_model.py`
- `frontend/src/lib/supabase.ts` — client initialization and helpers
- `supabase/schema.sql` — creates profiles and storage/rls policies used by the app

## Security & Privacy

- Stateless image processing: images are passed to the backend in-memory and not written to disk or database.
- Only user-confirmed structured JSON is stored in Supabase.
- Row-level security (RLS) policies scope each user to their own rows in Postgres.
- Rotate provider API keys and keep service/secret keys out of client-side code.

## Team

Built by Team Mustard:

- Aman Dwivedi
- Joel Dsouza
- Sahil Paul
- Falguni Yadav

This project was built during a hackathon and placed runner-up.

## License

MIT

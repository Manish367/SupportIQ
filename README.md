# SupportIQ

Support-ticket triage with machine learning. SupportIQ predicts a ticket's category and priority, shows how confident the model is, sends uncertain tickets to a human review queue, learns from agent corrections, and runs **Incident Radar**, which flags groups of similar recent tickets that may share one cause. An agent decides whether they do; the system never claims a root cause.

> **Status:** deployed. Live demo: https://support-iq-beta.vercel.app. Hosted on free tiers, so the first load after a quiet period can take about a minute while the services wake up. API health check: https://supportiq-1.onrender.com/api/health. Screenshots in `docs/` (TODO).

## Contents
1. [Features](#features)
2. [How it works](#how-it-works)
3. [Tech stack](#tech-stack)
4. [Repository structure](#repository-structure)
5. [Data and models](#data-and-models)
6. [Results](#results)
7. [Incident Radar](#incident-radar)
8. [Getting started](#getting-started)
9. [Configuration](#configuration)
10. [API reference](#api-reference)
11. [Data model](#data-model)
12. [Security and reliability](#security-and-reliability)
13. [Evaluation scripts](#evaluation-scripts)
14. [Deployment](#deployment)
15. [Troubleshooting](#troubleshooting)
16. [Limitations](#limitations)
17. [Future work](#future-work)
18. [Credits and license](#credits-and-license)

## Features

**Ticket management**
- Create tickets (subject + description) and get an immediate category prediction with confidence and the next two most likely categories
- List, search by subject, and filter by category, status, priority, and "needs review"
- Ticket detail panel with the model's prediction, an activity timeline, and controls to change status (open / in progress / resolved), priority, and category, or to confirm a prediction
- Dashboard: total and unresolved tickets, review-queue size, tickets by predicted category, priority breakdown, recent tickets

**Machine learning**
- Category prediction over 10 support queues (TF-IDF + logistic regression)
- Priority prediction (low / medium / high), used when the person creating the ticket chooses "Let the model decide"; the source ("model" or "set by a person") is recorded and shown, and agents can override it
- Uncertainty handling: a prediction is flagged for review when its confidence is below a validation-tuned threshold **or** the ticket is unlike anything in the training data
- Human-feedback loop: agent corrections are stored with before/after values and can be exported to retrain the model (retraining is manual)

**Incident Radar**
- Groups similar open tickets from a recent time window and shows candidate incidents: ticket count, time span, approximate rate, keywords, and the affected tickets
- Candidate only: an agent decides whether the tickets share a cause

**Interface:** glassmorphism / spatial UI: frosted glass panes in a three-pane workspace (filters, ticket list, detail), floating elements with depth, and a pointer-reactive background. Layout inspired by the "Aivia" support-dashboard concept on Dribbble. Respects reduced-motion settings and collapses to a single column on small screens.

## How it works

```
React + Vite + Bootstrap  -->  Node/Express API  -->  FastAPI + scikit-learn
        (browser)                   |
                               MongoDB Atlas
```

**Creating a ticket**
1. The browser sends subject, description and an optional priority to `POST /api/tickets`.
2. Express validates the input (lengths, types) and calls the ML service's `/predict` with the combined text.
3. The ML service returns the category, confidence, alternatives, a review flag, and (if the person chose "Let the model decide") a priority.
4. Express saves the ticket and prediction to MongoDB and returns it. If the ML service is down or slow (8 s timeout), the ticket is still saved and placed in the review queue, and the UI says so.

**Incident Radar:** `GET /api/incidents` loads open tickets from the last N hours (default 24), sends them to the ML service's `/incidents`, and keeps groups of at least 3 tickets.

**Feedback loop:** an agent changes a category, and the ticket stores `correction: { from, to, at }`. `GET /api/feedback` exports corrections as `[{text, category}]`, and `python train.py --feedback feedback.json` retrains with them added to the training data and reports test metrics under `with_feedback` next to the baseline on the same held-out set.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Bootstrap 5, Recharts, React Router |
| Backend | Node.js, Express, Mongoose, express-rate-limit, cors |
| ML service | Python, FastAPI, scikit-learn, pandas, SciPy, joblib |
| Models | TF-IDF + logistic regression (category and priority); TF-IDF cosine distance + agglomerative clustering (incidents) |
| Database | MongoDB Atlas |
| Deployment (planned) | Vercel (frontend), Render (API and ML service), Atlas free tier |

Developed on Node 24 and Python 3.14.

## Repository structure

```
supportiq/
├── ml-service/
│   ├── app.py                    FastAPI service: /predict, /incidents, /health
│   ├── train.py                  train + evaluate; writes model.joblib, metrics.json
│   ├── prepare_data.py           converts the raw Hugging Face CSV to data/tickets.csv
│   ├── make_dataset.py           synthetic starter data (smoke tests only)
│   ├── threshold_report.py       accuracy vs review-rate table
│   ├── eval_*.py, experiment_*.py   evaluation and experiment scripts (see below)
│   ├── data/incident_eval.json   hand-written incident benchmark
│   └── requirements.txt
├── backend/
│   ├── src/server.js             routes, validation, rate limiting
│   ├── src/models.js             Mongoose ticket schema
│   ├── src/ml.js                 ML service client (timeout, shared key)
│   ├── scripts/seed.js           demo tickets (posted through the API)
│   ├── scripts/reset.js          deletes ALL tickets
│   └── .env.example
├── frontend/
│   ├── src/App.jsx, api.js, styles.css
│   ├── src/pages/                Dashboard, Tickets, CreateTicket
│   ├── src/components/           Radar, Tilt
│   └── vercel.json
└── render.yaml
```

## Data and models

**Dataset:** [Tobi-Bueck/customer-support-tickets](https://huggingface.co/datasets/Tobi-Bueck/customer-support-tickets) on Hugging Face (DOI 10.57967/hf/6184; license CC BY-NC 4.0, non-commercial). File used: `aa_dataset-tickets-multi-lang-5-2-50-version.csv`: 28,587 rows (16,338 English, 12,249 German) with fields subject, body, answer, type, queue, priority, language, version and tags. **Origin of the tickets: TODO (copy what the dataset card says about how they were created).**

**Preparation (`prepare_data.py`):**
- English rows only; text = subject + body; category = queue (10 queues)
- Texts that appear with conflicting queues are removed, then exact duplicates are removed, **before** splitting, so copies of training tickets cannot leak into the test set
- 16,337 tickets remain (11,435 train / 2,451 validation / 2,451 test, stratified by category, fixed seed)
- The `tags` columns are not used: they are assigned after a ticket is handled and would not exist when a new ticket arrives

**The 10 categories:** Technical Support, Product Support, Customer Service, IT Support, Billing and Payments, Returns and Exchanges, Service Outages and Maintenance, Sales and Pre-Sales, Human Resources, General Inquiry.

**Category model:** TF-IDF on word unigrams and bigrams (sublinear TF, English stop words, min_df 2, 60,000 features) feeding logistic regression (C = 40, balanced class weights). Regularization was chosen on the validation split (see [Model experiments](#model-experiments)).

**Review threshold:** chosen on validation only: the lowest confidence cutoff (floor 0.50) that reaches 95%, then 90%, 85% or 80% accuracy on accepted tickets while auto-accepting at least 30% of tickets. The first target reached was 90%, giving **0.69**. Override at runtime with `CONFIDENCE_THRESHOLD`.

**Unfamiliar-ticket check:** each ticket's TF-IDF similarity to its closest training ticket is compared with the 2nd percentile of the same measure on validation. Anything below it is flagged for review even if the classifier is confident.

**Priority model:** same pipeline, trained on the priority column. It is only an experiment-backed feature: see the caveat below.

## Results

All numbers are on the held-out **test split** (2,451 English tickets) and come from `metrics.json` and the scripts in `ml-service/`. Settings were chosen on the validation split.

### Category model
| Metric | Value |
|---|---|
| Accuracy | 69.5% |
| Macro F1 | 0.695 |
| Always predict the largest class | 29.0% |
| Random guessing (10 classes) | 10% |

Most errors come from four overlapping queues: Technical Support, IT Support, Product Support and Customer Service make up about 74% of the test set. The most common confusions (from an earlier run of the model) were technical to IT (76 tickets), technical to product (73), product to technical (72), IT to technical (71) and technical to customer service (56). Example misclassified tickets suggest the labels between these queues are partly arbitrary. Per-class scores are in `ml-service/metrics.json`.

### Uncertainty handling
A higher threshold sends more tickets to review but makes the auto-accepted ones more accurate. Default: **0.69**, which auto-accepts 46.0% of tickets at 90.1% accuracy (about 4.6 wrong auto-accepts per 100 tickets); 54.0% go to review, where the model's own error rate is 48.0%.

| Threshold | Auto-accepted | Sent to review | Accuracy of accepted | Error rate in review | Wrong auto-accepts per 100 tickets |
|---|---|---|---|---|---|
| 0.30 | 96.3% | 3.7% | 71.2% | 74.4% | 27.8 |
| 0.40 | 85.8% | 14.2% | 75.2% | 64.9% | 21.3 |
| 0.50 | 69.8% | 30.2% | 81.6% | 58.6% | 12.8 |
| 0.60 | 56.8% | 43.2% | 86.1% | 52.4% | 7.9 |
| **0.69 (default)** | 46.0% | 54.0% | 90.1% | 48.0% | about 4.6 |
| 0.70 | 44.6% | 55.4% | 90.3% | 47.3% | 4.3 |
| 0.80 | 31.5% | 68.5% | 93.1% | 41.4% | 2.2 |
| 0.90 | 16.8% | 83.2% | 94.9% | 35.7% | 0.9 |

These figures use the confidence rule only. The unfamiliar-ticket check sends a small additional share to review. Full table: `python threshold_report.py`.

### Priority model
Accuracy 71.8% (macro F1 0.711) versus 41.1% (macro F1 0.194) for always predicting the most common priority. **How the dataset's priority labels were assigned: TODO (check the dataset card).** If they came from rules or generation, the model may be learning that pattern rather than real urgency, so treat predicted priority as a suggestion; agents can override it.

### Model experiments
Variants were compared on validation macro-F1; only the winner and the baseline were scored on the test set (`experiment_models.py`, `experiment_next.py`).

| Variant | Validation macro-F1 |
|---|---|
| Original (C = 4) | 0.670 |
| C = 15 | 0.712 |
| C = 40 (shipped) | 0.725 |
| C = 70 (best) | 0.726 |
| LinearSVC | 0.682 |
| Word + character n-grams | 0.655 |
| C = 1 | 0.578 |
| Complement Naive Bayes | 0.565 |
| Unigrams only | 0.496 |
| SVD (300) + scaling | 0.319 |

- Less regularization helped most; the curve plateaus between C = 40 and 120. Test accuracy went from 63.2% (C = 4) to 69.5% (C = 40).
- Dimensionality reduction and scaling hurt badly (one configuration tested); character n-grams did not help; bigrams matter.
- **Merging overlapping queues:** merging Technical, IT and Product Support (8 classes) raised test accuracy to 81.8% and merging Customer Service too (7 classes) to 90.1%. These are not comparable to the 10-class score: the largest class then holds 60% and 74% of the tickets, and macro F1 rose only from 0.693 to 0.728 and 0.758. The 10 original queues are kept because merging makes the task coarser, not because the model gets better.
- Reaching 80% on the original 10 labels does not look realistic: the errors are concentrated in queues whose labels overlap.

## Incident Radar

**Method:** open tickets from the recent window are converted to TF-IDF vectors; greeting and politeness words (hi, hello, dear, team, please, thanks, regards, help, support, ...) are ignored, because shared filler can pair unrelated tickets; tickets are clustered by cosine distance with average-linkage agglomerative clustering, cut at distance **0.90** (no fixed number of clusters is needed). Groups of at least 3 tickets are shown with size, time span, approximate rate per hour (extrapolated, so it overstates short bursts), a similarity score and keywords.

**Evaluation:** a small hand-written benchmark (`ml-service/data/incident_eval.json`): 36 tickets = 6 incidents with 4 differently worded reports each, plus 12 unrelated tickets (36 true related pairs). A second "noisy" version adds email-style greetings and sign-offs to every ticket to imitate real tickets. Scores are pairwise.

| Method (best threshold, plain benchmark) | Precision | Recall | F1 | ARI |
|---|---|---|---|---|
| TF-IDF + category probabilities blended in (first version, 0.55) | 0.41 | 0.31 | 0.35 | 0.32 |
| LSA features (0.75) | 0.33 | 0.25 | 0.29 | 0.25 |
| LSA + TF-IDF (0.80) | 0.29 | 0.25 | 0.27 | 0.23 |
| Plain TF-IDF (0.85) | 0.67 | 0.33 | 0.44 | 0.42 |

On the noisy benchmark, plain TF-IDF collapses (F1 0.10, ARI 0.00). Ignoring filler words fixes most of that:

| Shipped method (filler words ignored, threshold 0.90) | Precision | Recall | F1 |
|---|---|---|---|
| Benchmark as written | 0.50 | 0.36 | 0.42 |
| With greetings and sign-offs added | 0.36 | 0.28 | 0.31 |

F1 is identical at 0.90 and 0.92 on both versions, so the setting is on a plateau. Filtering words by how common they are in the training data did not help. Showing only groups of 3 or more did not improve precision (it lowered recall). The benchmark is small, I wrote it, the greeting version is synthetic, and the threshold was chosen on it, so treat the numbers as indicative.

**What this means:** the radar finds reports that share vocabulary (for example several "orders not syncing" tickets) and misses paraphrases; on email-style tickets about 2 in 3 proposed ticket pairs are wrong. It is a candidate generator for an agent, not a reliable detector. Group membership can change as new tickets arrive.

## Getting started

**Prerequisites:** Node 18+, Python 3.10+, a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (allow your IP under Network Access), and the dataset CSV downloaded from Hugging Face (Files tab) into `ml-service/data/`.

### 1. ML service
```
cd ml-service
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python prepare_data.py            # or: python prepare_data.py data/<your-file>.csv
python train.py                   # writes model.joblib and metrics.json (a few minutes)
uvicorn app:app --port 8000
```
Check `http://localhost:8000/health`: it should list the 10 categories.

### 2. Backend
```
cd backend
copy .env.example .env            # macOS/Linux: cp .env.example .env
npm install
npm run dev
```
Edit `.env` first (at least `MONGODB_URI`). Check `http://localhost:4000/api/health`: it should return `{"api":"ok","db":"ok","ml":"ok"}`.

### 3. Frontend
```
cd frontend
copy .env.example .env
npm install
npm run dev                       # http://localhost:5173
```

### 4. Optional
```
cd backend && npm run seed        # 7 demo tickets, posted through the API (needs backend and ML running)
cd backend && node scripts/reset.js   # DELETES ALL tickets (use after retraining with different categories)
```

## Configuration

**Backend (`backend/.env`)**
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 4000 | API port |
| `MONGODB_URI` | | Atlas connection string (keep private) |
| `ML_SERVICE_URL` | `http://localhost:8000` | ML service address |
| `ML_API_KEY` | empty | shared secret sent to the ML service; must equal the ML service's value (empty = check off, fine locally) |
| `CORS_ORIGIN` | | allowed frontend origin(s), comma-separated |
| `INCIDENT_WINDOW_HOURS` | 24 | how far back Incident Radar looks (2 gives a burst-oriented view) |
| `INCIDENT_MIN_TICKETS` | 3 | minimum group size to show |

**ML service (environment variables)**
| Variable | Default | Purpose |
|---|---|---|
| `ML_API_KEY` | empty | required `x-api-key` on `/predict` and `/incidents` if set |
| `CONFIDENCE_THRESHOLD` | value stored by `train.py` | review threshold override |
| `CLUSTER_DISTANCE` | 0.90 | incident grouping cut-off (cosine distance) |

**Frontend (`frontend/.env`):** `VITE_API_URL`, the backend address.

Environment variables on Windows Command Prompt: `set NAME=value` (and `set NAME=` to clear one) before starting `uvicorn`.

## API reference

**Express (`/api`)**
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/tickets` | Create a ticket and get a prediction. Body: `{subject, description, priority?}`; `priority` is `low`, `medium`, `high`, or omitted/`auto` to let the model decide |
| GET | `/tickets` | List (newest first, up to 200). Query: `q` (subject search), `category`, `status`, `priority`, `review=true` |
| GET | `/tickets/:id` | One ticket |
| PATCH | `/tickets/:id` | Update `status`, `priority`, `category` (records a correction if it changed), or `confirm: true` |
| GET | `/analytics` | Counts and breakdowns for the dashboard |
| GET | `/incidents` | Candidate incidents (window and minimum size from config) |
| GET | `/categories` | Category list, taken from the trained model |
| GET | `/feedback` | Corrections as `[{text, category}]` for retraining |
| GET | `/health` | `{api, db, ml}` |

**FastAPI**
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/predict` | `{text}` returns category, confidence, `needsReview`, `outOfDistribution`, nearest-training similarity, top-3 alternatives, and priority with `priorityConfidence` |
| POST | `/incidents` | `{tickets:[{id,text,createdAt}]}` (max 500) returns candidate groups |
| GET | `/health` | status, classes, current threshold |

Errors return `{ "error": "message" }` with a suitable status (400 validation, 404 not found, 503 incident detection unavailable).

## Data model

Ticket (MongoDB `tickets`): `subject`, `description`, `status` (`open`/`in_progress`/`resolved`), `priority` (`low`/`medium`/`high`), `prioritySource` (`user`/`model`), `category` (the final category: the prediction unless corrected), `prediction` (`category`, `confidence`, `needsReview`, `outOfDistribution`, `alternatives`, `priority`, `priorityConfidence`, `modelAvailable`), `correction` (`from`, `to`, `at`), `reviewed`, and timestamps.

## Security and reliability
- Input validation and size limits: subject 3 to 200 characters, description 10 to 3000, JSON body under 20 KB, ML text under 4000 characters, at most 500 tickets per incident request
- Rate limit of 120 requests per minute on `/api`; CORS restricted to the configured frontend origin
- The ML service requires a shared secret (`x-api-key`) when `ML_API_KEY` is set. Its `/health` endpoint is open by design. Secrets live in `.env` files that are git-ignored
- Search input is escaped before it reaches a regular expression
- If the ML service fails, tickets are still saved and routed to review; the UI shows clear loading and error states
- No automated test suite yet. Verification was manual (create, predict, persist across refresh, search, filter, update, correct, feedback export, service-down behavior) plus the evaluation scripts below

## Evaluation scripts

Run from `ml-service/` with the virtual environment active.

| Script | What it does |
|---|---|
| `prepare_data.py` | raw CSV to `data/tickets.csv` (English, deduplicated); backs up an existing `tickets.csv` to `tickets_synthetic.csv` |
| `train.py` | trains, tunes the threshold on validation, scores the test set; writes `model.joblib`, `metrics.json`; `--feedback feedback.json` adds corrections |
| `threshold_report.py` | accuracy vs review-rate table on the test set (`threshold_report.csv`) |
| `experiment_models.py` | compares model variants (incl. dimensionality reduction and scaling), prints top confusions and example errors |
| `experiment_next.py` | regularization sweep and merged-queue experiment |
| `eval_incidents.py` | pairwise precision, recall, F1 and ARI of the current incident grouping across thresholds |
| `eval_incident_variants.py` | compares ways of representing tickets for grouping (blend, TF-IDF only, LSA) |
| `eval_incident_filter.py` | filler-word and common-word filters on the plain and "noisy" benchmark |
| `eval_incident_final.py` | runs the real `/incidents` code, scoring all groups and groups of 3 or more |

`make_dataset.py` creates synthetic data for smoke tests only; metrics on it are meaningless.

## Deployment

**Live:** frontend on Vercel, API and ML service on Render (free instances), database on MongoDB Atlas (free tier).

- **ML service** (Render web service, root `ml-service`, Python 3.14.3): build `pip install -r requirements.txt`, start `uvicorn app:app --host 0.0.0.0 --port $PORT`. The trained model (`ml-service/model.joblib`) is committed to the repository so the host does not need the dataset, and `requirements.txt` pins the exact versions it was trained with. `/predict` and `/incidents` require the `ML_API_KEY` secret.
- **API** (Render web service, root `backend`): build `npm install`, start `npm start`. Environment: `MONGODB_URI`, `ML_SERVICE_URL`, `ML_API_KEY` (same value as the ML service), `CORS_ORIGIN` (the Vercel URL). It trusts Render's proxy so the rate limiter sees real client addresses, and waits up to 60 seconds for the ML service to wake.
- **Frontend** (Vercel, root `frontend`): environment `VITE_API_URL` = the API URL (set before building, since Vite embeds it).
- **Atlas:** network access is open to all addresses because free Render instances have no fixed IP, so the database password is the protection.
- **Free-tier behavior:** services sleep after 15 minutes without traffic and take about a minute to wake. To retrain, rerun `prepare_data.py` and `train.py` locally and commit the new `model.joblib`.

## Troubleshooting
- **`pip install` fails building scikit-learn on a very new Python:** `pip install --only-binary=:all: fastapi "uvicorn[standard]" scikit-learn pandas joblib numpy`.
- **`ml: down` in `/api/health`:** the ML service is not running, or `ML_SERVICE_URL` is wrong. A wrong `ML_API_KEY` still shows `ok` there but fails when creating a ticket (the ML `/health` is not key-protected).
- **Seed fails with `ECONNRESET`:** the backend was restarting (it reloads on file changes). Wait for `API on 4000` and run it again.
- **A ticket shows an unexpected category list after retraining with different classes:** old tickets keep their old categories; clear them with `node scripts/reset.js` (deletes everything).
- **Incident Radar is empty:** it needs at least 3 similar open tickets inside the window, and paraphrased reports often do not group.
- **Environment variable seems ignored (Windows):** it only applies to the terminal where you set it; clear stale values with `set NAME=`.
- **Page clicks or scrolling stop working in the UI:** avoid `transform-style: preserve-3d` on large ancestors; it broke mouse hit-testing in Chrome for the angled panes and was removed.

## Limitations
- Category accuracy is about 70%. At the default threshold roughly 54% of tickets go to review, and about half of those would have been correct anyway. The labels between the four overlapping queues look partly arbitrary.
- Dataset origin and the origin of its priority labels are unverified (TODO). Results come from one dataset (English only) and may not transfer to another support desk.
- Predicted priority reflects wording patterns, not verified urgency.
- Incident grouping is word-based: it misses paraphrases and is weak on email-style tickets (precision about 0.36). It has no trend or burst detection: it only checks for 3 or more similar open tickets in the window. Its benchmark is small, self-written, and used to choose the threshold.
- The feedback loop is built and exports correctly, but a meaningful before/after measurement with many corrections has not been done yet; retraining is manual.
- No authentication or roles; no Salesforce integration, LLM-written replies or email notifications; no automated tests.
- Because of the dataset license (CC BY-NC 4.0), this project and its trained model are for non-commercial use.

## Future work
- Measure the feedback loop (macro F1 before and after retraining on 20 or more verified corrections)
- Try sentence embeddings for incident grouping and classification, and compare against the baselines above on the same benchmarks
- Add rate-based burst detection and a larger, independently written incident benchmark
- Authentication, roles, and automated API tests
- Deploy and add a live demo, screenshots and a short walkthrough

## Credits and license
- Dataset: Tobi-Bueck/customer-support-tickets (CC BY-NC 4.0). Please cite it as described on the dataset page.
- UI layout inspired by the "Aivia" AI customer-support dashboard concept on Dribbble.
- Code license: The dataset's non-commercial license still applies to the data and to models trained on it.
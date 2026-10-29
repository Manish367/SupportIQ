import os, joblib, numpy as np
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from scipy.sparse import diags
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_distances

SECRET = os.getenv("ML_API_KEY", "")
CLUSTER_DIST = float(
    os.getenv("CLUSTER_DISTANCE", "0.90")
)  # cosine distance; tune on labeled related-ticket pairs
bundle = joblib.load("model.joblib")
model, OOD = bundle["model"], bundle["ood_threshold"]
THR = float(os.getenv("CONFIDENCE_THRESHOLD", bundle["threshold"]))
pmodel = bundle.get("priority_model")
tfidf, Xtrain = model.named_steps["tfidf"], bundle["train_matrix"]
# greeting / politeness words carry no information about WHAT broke; ignoring them in incident grouping (measured: eval_incident_filter.py)
FILLER = {
    "hi",
    "hello",
    "hey",
    "dear",
    "team",
    "please",
    "thanks",
    "thank",
    "regards",
    "kindly",
    "help",
    "appreciate",
    "morning",
    "good",
    "best",
    "sincerely",
    "support",
    "assistance",
}
KEEP = diags(
    np.array(
        [
            0.0 if set(nm.split()) & FILLER else 1.0
            for nm in tfidf.get_feature_names_out()
        ]
    )
)
app = FastAPI(title="SupportIQ ML")


def guard(key):
    if SECRET and key != SECRET:
        raise HTTPException(401, "Invalid service key")


class Ticket(BaseModel):
    text: str = Field(min_length=3, max_length=4000)


class Item(BaseModel):
    id: str
    text: str = Field(max_length=4000)
    createdAt: str


class ClusterReq(BaseModel):
    tickets: list[Item] = Field(max_length=500)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "classes": [str(c) for c in model.classes_],
        "threshold": THR,
    }


@app.post("/predict")
def predict(t: Ticket, x_api_key: str = Header(default="")):
    guard(x_api_key)
    p = model.predict_proba([t.text])[0]
    i = int(p.argmax())
    sim = float((tfidf.transform([t.text]) @ Xtrain.T).max())
    top = sorted(zip(model.classes_, p), key=lambda z: -z[1])[:3]
    pri = {}
    if pmodel is not None:
        pp = pmodel.predict_proba([t.text])[0]
        j = int(pp.argmax())
        pri = {
            "priority": str(pmodel.classes_[j]),
            "priorityConfidence": round(float(pp[j]), 4),
        }
    return {
        **pri,
        "category": str(model.classes_[i]),
        "confidence": round(float(p[i]), 4),
        "needsReview": bool(p[i] < THR or sim < OOD),
        "outOfDistribution": bool(sim < OOD),
        "nearestTrainingSimilarity": round(sim, 3),
        "alternatives": [
            {"category": str(c), "confidence": round(float(v), 4)} for c, v in top
        ],
    }


@app.post("/incidents")
def incidents(req: ClusterReq, x_api_key: str = Header(default="")):
    """Candidate groups of similar tickets for an agent to validate. Not root-cause claims."""
    guard(x_api_key)
    if len(req.tickets) < 2:
        return {"clusters": []}
    texts = [t.text for t in req.tickets]
    # blend lexical overlap with the classifier's topic distribution; sparse so large vocabularies stay cheap
    Z = (tfidf.transform(texts) @ KEEP).tocsr()
    labels = AgglomerativeClustering(
        n_clusters=None,
        metric="precomputed",
        linkage="average",
        distance_threshold=CLUSTER_DIST,
    ).fit_predict(cosine_distances(Z))
    groups = {}
    for i, l in enumerate(labels):
        groups.setdefault(int(l), []).append(i)
    names = tfidf.get_feature_names_out()
    n_t = len(names)
    res = []
    for idx in groups.values():
        if len(idx) < 2:
            continue
        sub = Z[idx]
        c = np.asarray(sub.mean(axis=0)).ravel()
        norms = (
            np.sqrt(np.asarray(sub.multiply(sub).sum(axis=1)).ravel())
            * (np.linalg.norm(c) + 1e-9)
            + 1e-9
        )
        coh = float(np.mean(np.asarray(sub @ c).ravel() / norms))
        ts = [req.tickets[i] for i in idx]
        res.append(
            {
                "ticketIds": [t.id for t in ts],
                "size": len(ts),
                "cohesion": round(coh, 3),
                "firstReport": min(t.createdAt for t in ts),
                "lastReport": max(t.createdAt for t in ts),
                "keywords": [str(names[j]) for j in c[:n_t].argsort()[::-1][:4]],
            }
        )
    return {"clusters": sorted(res, key=lambda r: -r["size"])}

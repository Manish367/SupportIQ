"""Pairwise precision / recall / F1 and Adjusted Rand Index for incident grouping, at several CLUSTER_DISTANCE settings.
Ground truth: data/incident_eval.json (hand-written groups + unrelated tickets). Usage: python eval_incidents.py
"""

import json, os, itertools, numpy as np, pandas as pd
from sklearn.metrics import adjusted_rand_score
import app as A  # same model + same grouping code the service uses

d = json.load(open("data/incident_eval.json"))
texts, truth = [], []
for g, items in enumerate(d["groups"]):
    for t in items:
        texts.append(t)
        truth.append(g)
for k, t in enumerate(d["unrelated"]):
    texts.append(t)
    truth.append(1000 + k)  # each unrelated ticket is its own group
truth = np.array(truth)
n = len(texts)
items = [
    A.Item(id=str(i), text=t, createdAt="2026-01-01T00:00:00Z")
    for i, t in enumerate(texts)
]
true_pairs = {
    (i, j) for i, j in itertools.combinations(range(n), 2) if truth[i] == truth[j]
}

rows = []
for dist in np.arange(0.30, 0.86, 0.05):
    A.CLUSTER_DIST = float(dist)
    out = A.incidents(A.ClusterReq(tickets=items), os.getenv("ML_API_KEY", ""))[
        "clusters"
    ]
    pred = np.arange(n) + 5000  # unclustered tickets are singletons
    pred_pairs = set()
    for ci, c in enumerate(out):
        ids = [int(x) for x in c["ticketIds"]]
        for i in ids:
            pred[i] = ci
        pred_pairs |= {tuple(sorted(p)) for p in itertools.combinations(ids, 2)}
    tp = len(true_pairs & pred_pairs)
    prec = tp / len(pred_pairs) if pred_pairs else float("nan")
    rec = tp / len(true_pairs)
    f1 = 2 * prec * rec / (prec + rec) if pred_pairs and (prec + rec) else 0.0
    rows.append(
        {
            "cluster_distance": round(float(dist), 2),
            "groups_found": len(out),
            "pair_precision": round(prec, 3),
            "pair_recall": round(rec, 3),
            "pair_f1": round(f1, 3),
            "adjusted_rand_index": round(adjusted_rand_score(truth, pred), 3),
        }
    )
t = pd.DataFrame(rows)
print(
    f"{n} tickets, {len(d['groups'])} true incident groups, {len(true_pairs)} true related pairs\n"
)
print(t.to_string(index=False))
t.to_csv("incident_eval_results.csv", index=False)
best = t.loc[t["pair_f1"].idxmax()]
print(
    "\nBest pair F1 at cluster_distance =",
    best["cluster_distance"],
    "(F1",
    best["pair_f1"],
    ")",
)
print(
    "Note: this is a small hand-written benchmark; use it to compare settings, and state its size when you report it."
)

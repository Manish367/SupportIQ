"""Compares ways of representing tickets for incident grouping, using the same hand-written benchmark as eval_incidents.py.
Variants: current (tfidf + category probabilities), tfidf only, LSA only, LSA + tfidf. LSA = TruncatedSVD on TF-IDF, fitted on data/tickets.csv.
Usage: python eval_incident_variants.py"""

import json, itertools, numpy as np, pandas as pd
from scipy.sparse import hstack, csr_matrix
from sklearn.cluster import AgglomerativeClustering
from sklearn.decomposition import TruncatedSVD
from sklearn.metrics import adjusted_rand_score
from sklearn.metrics.pairwise import cosine_distances
from sklearn.preprocessing import normalize
import app as A

d = json.load(open("data/incident_eval.json"))
texts, truth = [], []
for g, items in enumerate(d["groups"]):
    for t in items:
        texts.append(t)
        truth.append(g)
for k, t in enumerate(d["unrelated"]):
    texts.append(t)
    truth.append(1000 + k)
truth = np.array(truth)
n = len(texts)
true_pairs = {
    (i, j) for i, j in itertools.combinations(range(n), 2) if truth[i] == truth[j]
}

X = A.tfidf.transform(texts)
P = A.model.predict_proba(texts)
corpus = pd.read_csv("data/tickets.csv")["text"].dropna().tolist()
svd = TruncatedSVD(n_components=min(150, X.shape[1] - 1), random_state=0).fit(
    A.tfidf.transform(corpus)
)
L = csr_matrix(normalize(svd.transform(X)))
variants = {
    "current: tfidf + category probs": hstack([X * 0.5, csr_matrix(P)]).tocsr(),
    "tfidf only": X,
    "LSA only": L,
    "LSA + tfidf": hstack([X * 0.5, L]).tocsr(),
}


def score(D, dist):
    labels = AgglomerativeClustering(
        n_clusters=None,
        metric="precomputed",
        linkage="average",
        distance_threshold=dist,
    ).fit_predict(D)
    groups = {}
    for i, l in enumerate(labels):
        groups.setdefault(int(l), []).append(i)
    pred_pairs = {
        p
        for ids in groups.values()
        if len(ids) > 1
        for p in itertools.combinations(sorted(ids), 2)
    }
    tp = len(true_pairs & pred_pairs)
    prec = tp / len(pred_pairs) if pred_pairs else 0.0
    rec = tp / len(true_pairs)
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return prec, rec, f1, adjusted_rand_score(truth, labels)


rows = []
for name, M in variants.items():
    D = cosine_distances(M)
    for dist in np.arange(0.30, 0.96, 0.05):
        p, r, f, ari = score(D, float(dist))
        rows.append(
            {
                "variant": name,
                "cluster_distance": round(float(dist), 2),
                "precision": round(p, 3),
                "recall": round(r, 3),
                "f1": round(f, 3),
                "ari": round(ari, 3),
            }
        )
full = pd.DataFrame(rows)
full.to_csv("incident_variants_full.csv", index=False)
best = full.loc[full.groupby("variant")["f1"].idxmax()].sort_values(
    "f1", ascending=False
)
print(
    f"{n} tickets, {len(d['groups'])} true groups. Best setting per variant (chosen on this same benchmark, so slightly optimistic):\n"
)
print(best.to_string(index=False))

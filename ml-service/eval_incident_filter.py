"""Does ignoring greeting/filler words and very common words reduce false incident groups?
Runs the benchmark twice: as written ("plain") and with email-style greetings/sign-offs added to every ticket ("noisy"),
which imitates real tickets. Usage: python eval_incident_filter.py"""

import json, random, itertools, numpy as np, pandas as pd
from scipy.sparse import diags
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import adjusted_rand_score
from sklearn.metrics.pairwise import cosine_distances
import app as A

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
d = json.load(open("data/incident_eval.json"))
base_texts, truth = [], []
for g, items in enumerate(d["groups"]):
    for t in items:
        base_texts.append(t)
        truth.append(g)
for k, t in enumerate(d["unrelated"]):
    base_texts.append(t)
    truth.append(1000 + k)
truth = np.array(truth)
n = len(base_texts)
true_pairs = {
    (i, j) for i, j in itertools.combinations(range(n), 2) if truth[i] == truth[j]
}

rnd = random.Random(5)
PRE = ["Hi team,", "Hello,", "Dear Support Team,", "Hi,", "Good morning,", "Hey there,"]
SUF = [
    "Thanks in advance.",
    "Please help.",
    "Thank you for your support.",
    "Best regards.",
    "Kindly look into this.",
    "",
]
noisy_texts = [f"{rnd.choice(PRE)} {t} {rnd.choice(SUF)}".strip() for t in base_texts]

names = A.tfidf.get_feature_names_out()
dfrac = np.asarray(
    (A.Xtrain > 0).mean(axis=0)
).ravel()  # share of training tickets containing each term
filler_keep = np.array([0.0 if set(nm.split()) & FILLER else 1.0 for nm in names])


def cap_keep(c):
    return (dfrac <= c).astype(float)


variants = {
    "current: plain tfidf": np.ones(len(names)),
    "drop filler words": filler_keep,
    "drop terms in >10% of tickets": cap_keep(0.10),
    "drop terms in >5% of tickets": cap_keep(0.05),
    "drop terms in >2% of tickets": cap_keep(0.02),
    "drop filler + >5%": filler_keep * cap_keep(0.05),
}


def best(texts, keep):
    Z = (A.tfidf.transform(texts) @ diags(keep)).tocsr()
    D = cosine_distances(Z)
    out = None
    for dist in np.arange(0.50, 0.96, 0.05):
        labels = AgglomerativeClustering(
            n_clusters=None,
            metric="precomputed",
            linkage="average",
            distance_threshold=float(dist),
        ).fit_predict(D)
        groups = {}
        for i, l in enumerate(labels):
            groups.setdefault(int(l), []).append(i)
        pp = {
            p
            for ids in groups.values()
            if len(ids) > 1
            for p in itertools.combinations(sorted(ids), 2)
        }
        tp = len(true_pairs & pp)
        pr = tp / len(pp) if pp else 0.0
        rc = tp / len(true_pairs)
        f = 2 * pr * rc / (pr + rc) if pr + rc else 0.0
        if out is None or f > out["f1"]:
            out = {
                "dist": round(float(dist), 2),
                "precision": round(pr, 3),
                "recall": round(rc, 3),
                "f1": round(f, 3),
                "ari": round(adjusted_rand_score(truth, labels), 3),
            }
    return out


rows = []
for name, keep in variants.items():
    for label, texts in (("plain", base_texts), ("noisy", noisy_texts)):
        rows.append({"variant": name, "set": label, **best(texts, keep)})
res = pd.DataFrame(rows)
res.to_csv("incident_filter_results.csv", index=False)
print(
    f"{n} tickets. Best setting per variant and set (chosen on the same benchmark, so slightly optimistic):\n"
)
print(res.to_string(index=False))

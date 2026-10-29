"""Runs the REAL /incidents code from app.py on the benchmark (plain and email-style 'noisy' versions) across thresholds,
scoring all groups and only groups of 3+ (what the dashboard shows). Usage: python eval_incident_final.py
"""

import json, os, random, itertools, numpy as np, pandas as pd
import app as A

d = json.load(open("data/incident_eval.json"))
base, truth = [], []
for g, items in enumerate(d["groups"]):
    for t in items:
        base.append(t)
        truth.append(g)
for k, t in enumerate(d["unrelated"]):
    base.append(t)
    truth.append(1000 + k)
truth = np.array(truth)
n = len(base)
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
noisy = [f"{rnd.choice(PRE)} {t} {rnd.choice(SUF)}".strip() for t in base]


def run(texts, dist, min_size):
    A.CLUSTER_DIST = dist
    items = [
        A.Item(id=str(i), text=t, createdAt="2026-01-01T00:00:00Z")
        for i, t in enumerate(texts)
    ]
    out = A.incidents(A.ClusterReq(tickets=items), os.getenv("ML_API_KEY", ""))[
        "clusters"
    ]
    pp = set()
    for c in out:
        if c["size"] >= min_size:
            pp |= set(itertools.combinations(sorted(int(x) for x in c["ticketIds"]), 2))
    tp = len(true_pairs & pp)
    pr = tp / len(pp) if pp else 0.0
    rc = tp / len(true_pairs)
    f = 2 * pr * rc / (pr + rc) if pr + rc else 0.0
    return round(pr, 2), round(rc, 2), round(f, 2)


rows = []
for label, texts in (("plain", base), ("noisy", noisy)):
    for dist in (0.80, 0.85, 0.88, 0.90, 0.92, 0.95, 0.98):
        a, b = run(texts, dist, 2), run(texts, dist, 3)
        rows.append(
            {
                "set": label,
                "dist": dist,
                "all_P": a[0],
                "all_R": a[1],
                "all_F1": a[2],
                "3plus_P": b[0],
                "3plus_R": b[1],
                "3plus_F1": b[2],
            }
        )
t = pd.DataFrame(rows)
print(
    f"{n} tickets. P=precision R=recall. '3plus' = only groups of 3 or more (what the dashboard shows).\n"
)
print(t.to_string(index=False))
t.to_csv("incident_final_results.csv", index=False)

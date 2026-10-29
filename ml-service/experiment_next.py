"""1) Sweeps LogisticRegression C on VALIDATION (vectorizer unchanged), scores the best on TEST.
2) Retrains with overlapping queues merged to show how much of the error comes from label overlap.
Merged scores are NOT comparable to the 10-class score (fewer classes is an easier task). Usage: python experiment_next.py
"""

import numpy as np, pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split

df = (
    pd.read_csv("data/tickets.csv")
    .dropna(subset=["text", "category"])
    .reset_index(drop=True)
)
i_tr, i_tmp = train_test_split(
    df.index, test_size=0.30, stratify=df.category, random_state=42
)
i_val, i_te = train_test_split(
    i_tmp, test_size=0.50, stratify=df.category[i_tmp], random_state=42
)
vec = TfidfVectorizer(
    ngram_range=(1, 2),
    sublinear_tf=True,
    stop_words="english",
    min_df=2,
    max_features=60000,
)
Xtr = vec.fit_transform(df.text[i_tr])
Xv = vec.transform(df.text[i_val])
Xte = vec.transform(df.text[i_te])
ytr, yv, yte = (
    df.category[i_tr].values,
    df.category[i_val].values,
    df.category[i_te].values,
)
fit = lambda C, y: LogisticRegression(max_iter=2000, C=C, class_weight="balanced").fit(
    Xtr, y
)

rows = []
for C in (4, 10, 15, 25, 40, 70, 120):
    p = fit(C, ytr).predict(Xv)
    rows.append(
        {
            "C": C,
            "val_macro_f1": round(f1_score(yv, p, average="macro"), 4),
            "val_accuracy": round(accuracy_score(yv, p), 4),
        }
    )
r = pd.DataFrame(rows)
print("VALIDATION sweep:\n")
print(r.to_string(index=False))
bestC = int(r.sort_values("val_macro_f1", ascending=False).iloc[0]["C"])
p = fit(bestC, ytr).predict(Xte)
print(
    f"\nBest C on validation: {bestC}. TEST: macro_f1={f1_score(yte, p, average='macro'):.4f} accuracy={accuracy_score(yte, p):.4f}"
)

TECH = {"technical_support", "it_support", "product_support"}
schemes = {
    "original (10 classes)": lambda c: c,
    "merge technical + IT + product support": lambda c: (
        "technical_it_product" if c in TECH else c
    ),
    "merge those + customer service": lambda c: (
        "general_support" if (c in TECH or c == "customer_service") else c
    ),
}
print(
    "\nMerged-queue experiment (same data, retrained, test set; fewer classes = easier task):"
)
for name, f in schemes.items():
    m = np.vectorize(f)
    a, b = m(ytr), m(yte)
    pr = fit(bestC, a).predict(Xte)
    print(
        f"  {name} [{len(set(a))} classes]: macro_f1={f1_score(b, pr, average='macro'):.4f} accuracy={accuracy_score(b, pr):.4f}"
    )

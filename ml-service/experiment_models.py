"""Compares cheap model variants (incl. dimensionality reduction + scaling) on the same split as train.py.
Variants are ranked on VALIDATION macro-F1; only the winner and the current model are scored on TEST.
Also prints the top confusions and example misclassified tickets so label quality can be judged by eye.
Usage: python experiment_models.py"""

import time, numpy as np, pandas as pd
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC

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
Xtr, ytr, Xv, yv, Xte, yte = (
    list(df.text[i_tr]),
    df.category[i_tr].values,
    list(df.text[i_val]),
    df.category[i_val].values,
    list(df.text[i_te]),
    df.category[i_te].values,
)


def word():
    return TfidfVectorizer(
        ngram_range=(1, 2),
        sublinear_tf=True,
        stop_words="english",
        min_df=2,
        max_features=60000,
    )


def chars():
    return TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        sublinear_tf=True,
        min_df=3,
        max_features=150000,
    )


LR = lambda C: LogisticRegression(max_iter=1000, C=C, class_weight="balanced")
variants = {
    "current: word tfidf + LR C=4": lambda: Pipeline([("t", word()), ("m", LR(4))]),
    "LR C=1": lambda: Pipeline([("t", word()), ("m", LR(1))]),
    "LR C=15": lambda: Pipeline([("t", word()), ("m", LR(15))]),
    "unigrams only + LR C=4": lambda: Pipeline(
        [
            ("t", TfidfVectorizer(sublinear_tf=True, stop_words="english", min_df=2)),
            ("m", LR(4)),
        ]
    ),
    "LinearSVC C=0.5": lambda: Pipeline(
        [("t", word()), ("m", LinearSVC(C=0.5, class_weight="balanced"))]
    ),
    "ComplementNB": lambda: Pipeline([("t", word()), ("m", ComplementNB(alpha=0.3))]),
    "word + char n-grams + LR C=4": lambda: Pipeline(
        [("t", FeatureUnion([("w", word()), ("c", chars())])), ("m", LR(4))]
    ),
    "SVD(300) + scaling + LR": lambda: Pipeline(
        [
            ("t", word()),
            ("svd", TruncatedSVD(300, random_state=0)),
            ("s", StandardScaler()),
            ("m", LogisticRegression(max_iter=2000, C=0.1, class_weight="balanced")),
        ]
    ),
}
res, fitted = [], {}
for name, make in variants.items():
    t0 = time.time()
    m = make().fit(Xtr, ytr)
    p = m.predict(Xv)
    fitted[name] = m
    res.append(
        {
            "variant": name,
            "val_macro_f1": round(f1_score(yv, p, average="macro"), 4),
            "val_accuracy": round(accuracy_score(yv, p), 4),
            "seconds": round(time.time() - t0),
        }
    )
r = pd.DataFrame(res).sort_values("val_macro_f1", ascending=False)
print("VALIDATION results (used to choose):\n")
print(r.to_string(index=False))
cur, win = "current: word tfidf + LR C=4", r.iloc[0]["variant"]
print("\nTEST results (only the current model and the validation winner):")
for name in dict.fromkeys([cur, win]):
    p = fitted[name].predict(Xte)
    print(
        f"  {name}: macro_f1={f1_score(yte, p, average='macro'):.4f} accuracy={accuracy_score(yte, p):.4f}"
    )
p = fitted[cur].predict(Xte)
wrong = pd.DataFrame({"true": yte, "pred": p, "text": Xte})
wrong = wrong[wrong.true != wrong.pred]
print("\nMost common confusions of the current model (test):")
print(
    wrong.groupby(["true", "pred"])
    .size()
    .sort_values(ascending=False)
    .head(8)
    .to_string()
)
print("\nExample misclassified tickets (do they look like their TRUE queue?):")
for _, row in wrong.sample(min(6, len(wrong)), random_state=1).iterrows():
    print(f"\n  true={row.true} | predicted={row.pred}\n  {row.text[:200]}")

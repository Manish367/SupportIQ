"""TF-IDF + Logistic Regression. 70/15/15 stratified train/val/test split.
Confidence threshold is tuned on VALIDATION only; reported numbers come from the untouched TEST split.
Also trains a priority model; its test results are reported in metrics.json so you can judge it against a baseline.
Usage: python train.py [--feedback feedback.json]   (feedback = [{text, category}] from GET /api/feedback)
"""

import json, argparse, joblib, numpy as np, pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

ap = argparse.ArgumentParser()
ap.add_argument("--feedback")
args = ap.parse_args()
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
X_tr, y_tr, X_val, y_val, X_te, y_te = (
    df.text[i_tr],
    df.category[i_tr],
    df.text[i_val],
    df.category[i_val],
    df.text[i_te],
    df.category[i_te],
)


def fit(X, y):
    return Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 2),
                    sublinear_tf=True,
                    stop_words="english",
                    min_df=2,
                    max_features=60000,
                ),
            ),
            ("clf", LogisticRegression(max_iter=2000, C=40.0, class_weight="balanced")),
        ]
    ).fit(list(X), list(y))


def evaluate(m, X, y, thr):
    P = m.predict_proba(list(X))
    pred = m.classes_[P.argmax(1)]
    conf = P.max(1)
    acc = conf >= thr
    y = np.asarray(y)
    return {
        "macro_f1": round(f1_score(y, pred, average="macro"), 4),
        "accuracy": round(accuracy_score(y, pred), 4),
        "coverage_at_threshold": round(float(acc.mean()), 4),
        "accepted_accuracy": round(
            float(accuracy_score(y[acc], pred[acc])) if acc.any() else 0, 4
        ),
        "review_queue_error_rate": round(
            float(1 - accuracy_score(y[~acc], pred[~acc])) if (~acc).any() else 0, 4
        ),
    }


base = fit(X_tr, y_tr)
P = base.predict_proba(list(X_val))
pv = base.classes_[P.argmax(1)]
cv = P.max(1)
yv = np.asarray(y_val)
# threshold: highest accuracy target (95/90/85/80%) reachable on validation while still auto-accepting >=30% of tickets; floor 0.50
thr, target_used = 0.70, None
for target in (0.95, 0.90, 0.85, 0.80):
    for t in np.arange(0.50, 0.96, 0.01):
        m = cv >= t
        if m.mean() >= 0.30 and accuracy_score(yv[m], pv[m]) >= target:
            thr, target_used = float(round(t, 2)), target
            break
    if target_used:
        break


def nearest_sim(
    model, M_train, X
):  # similarity of each ticket to its closest training ticket (chunked to save memory)
    A = model.named_steps["tfidf"].transform(list(X))
    out = []
    for i in range(0, A.shape[0], 500):
        out.append(
            np.asarray((A[i : i + 500] @ M_train.T).max(axis=1).todense()).ravel()
        )
    return np.concatenate(out)


Xt = base.named_steps["tfidf"].transform(list(X_tr))
ood_thr = float(np.percentile(nearest_sim(base, Xt, X_val), 2))

metrics = {
    "note": "Check data/tickets.csv is the converted real dataset, not the synthetic starter set.",
    "n_train": len(X_tr),
    "n_val": len(X_val),
    "n_test": len(X_te),
    "classes": list(base.classes_),
    "confidence_threshold": thr,
    "threshold_accuracy_target": target_used,
    "ood_similarity_threshold": round(ood_thr, 3),
    "test": evaluate(base, X_te, y_te, thr),
    "majority_class_baseline_accuracy": round(
        float((y_te == y_tr.mode()[0]).mean()), 4
    ),
    "per_class_report": classification_report(
        y_te, base.predict(list(X_te)), output_dict=True
    ),
}

pm = None
if "priority" in df.columns and df.priority.nunique() > 1:
    pm = fit(df.text[i_tr], df.priority[i_tr])
    pp = pm.predict(list(df.text[i_te]))
    yp = df.priority[i_te]
    maj = df.priority[i_tr].mode()[0]
    metrics["priority_experiment"] = {
        "macro_f1": round(f1_score(yp, pp, average="macro"), 4),
        "accuracy": round(accuracy_score(yp, pp), 4),
        "majority_baseline_macro_f1": round(
            f1_score(yp, [maj] * len(yp), average="macro"), 4
        ),
        "majority_baseline_accuracy": round(float((yp == maj).mean()), 4),
        "note": "Priority is used by the app only if this clearly beats the majority baseline.",
    }

final = base
if args.feedback:
    fb = pd.DataFrame(json.load(open(args.feedback)))
    Xa, ya = list(X_tr) + list(fb.text), list(y_tr) + list(fb.category)
    final = fit(Xa, ya)
    Xt = final.named_steps["tfidf"].transform(Xa)
    metrics["with_feedback"] = {
        "n_corrections": len(fb),
        "test": evaluate(final, X_te, y_te, thr),
    }
json.dump(metrics, open("metrics.json", "w"), indent=2)
joblib.dump(
    {
        "model": final,
        "threshold": thr,
        "ood_threshold": ood_thr,
        "train_matrix": Xt,
        "priority_model": pm,
    },
    "model.joblib",
)
print(
    json.dumps(
        {
            k: metrics[k]
            for k in (
                "n_train",
                "confidence_threshold",
                "threshold_accuracy_target",
                "test",
                "majority_class_baseline_accuracy",
                "priority_experiment",
            )
            if k in metrics
        },
        indent=2,
    )
)

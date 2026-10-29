"""Accuracy vs review-rate table on the held-out TEST split (same split as train.py). Usage: python threshold_report.py"""

import joblib, numpy as np, pandas as pd
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
b = joblib.load("model.joblib")
m = b["model"]
X, y = list(df.text[i_te]), np.asarray(df.category[i_te])
P = m.predict_proba(X)
pred = m.classes_[P.argmax(1)]
conf = P.max(1)
ok = pred == y
rows = []
for t in np.arange(0.30, 0.91, 0.05):
    acc = conf >= t
    rows.append(
        {
            "threshold": round(float(t), 2),
            "auto_accepted_%": round(100 * acc.mean(), 1),
            "sent_to_review_%": round(100 * (1 - acc.mean()), 1),
            "accuracy_of_accepted_%": (
                round(100 * ok[acc].mean(), 1) if acc.any() else None
            ),
            "error_rate_in_review_%": (
                round(100 * (1 - ok[~acc].mean()), 1) if (~acc).any() else None
            ),
            "wrong_auto_accepted_per_100_tickets": round(
                100 * (~ok[acc]).sum() / len(y), 1
            ),
        }
    )
t = pd.DataFrame(rows)
print(t.to_string(index=False))
t.to_csv("threshold_report.csv", index=False)
print(
    "\nThreshold currently used by the app:",
    b["threshold"],
    "(override with the CONFIDENCE_THRESHOLD environment variable)",
)

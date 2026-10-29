"""Converts the Hugging Face CSV (Tobi-Bueck/customer-support-tickets) into data/tickets.csv.
Keeps English rows only, uses the ticket queue as the category, and removes duplicate / conflicting texts
BEFORE the train/val/test split so the test set is not contaminated by copies of training tickets.
Usage: python prepare_data.py [path_to_raw_csv]"""

import re, sys, os, shutil, pandas as pd

RAW = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "data/aa_dataset-tickets-multi-lang-5-2-50-version.csv"
)
df = pd.read_csv(RAW)
print("raw rows:", len(df))
df = df[df["language"].astype(str).str.lower() == "en"].dropna(subset=["queue"]).copy()
print("english rows:", len(df))

subject = df["subject"].fillna("").astype(str).str.strip()
body = df["body"].fillna("").astype(str).str.strip()
df["text"] = (
    (subject + ". " + body).str.replace(r"\s+", " ", regex=True).str.strip(". ")
)
df = df[df["text"].str.len() >= 10]
df["category"] = (
    df["queue"]
    .astype(str)
    .str.lower()
    .str.replace(r"[^a-z0-9]+", "_", regex=True)
    .str.strip("_")
)
df["priority"] = df["priority"].astype(str).str.lower().str.strip()

# identical text with different queues is label noise: drop those texts entirely, then drop exact duplicates
n = df.groupby("text")["category"].nunique()
conflicts = n[n > 1].index
df = df[~df["text"].isin(conflicts)]
before = len(df)
df = df.drop_duplicates(subset="text")
print(
    f"removed {len(conflicts)} conflicting texts and {before - len(df)} exact duplicates"
)

counts = df["category"].value_counts()
small = counts[counts < 100].index
if len(small):
    print("dropping classes with fewer than 100 tickets:", list(small))
    df = df[~df["category"].isin(small)]

if df.empty or df["category"].nunique() < 2:
    sys.exit(
        "ERROR: fewer than 2 usable categories after cleaning. Check the CSV path, and that it has English rows with subject, body and queue columns."
    )
out = df[["text", "category", "priority"]].sample(frac=1, random_state=1)
if os.path.exists("data/tickets.csv") and not os.path.exists(
    "data/tickets_synthetic.csv"
):
    shutil.copy(
        "data/tickets.csv", "data/tickets_synthetic.csv"
    )  # keep the old synthetic set as a backup
out.to_csv("data/tickets.csv", index=False)
print("\nwrote data/tickets.csv:", len(out), "rows")
print(out["category"].value_counts())

"""Generates a SYNTHETIC starter dataset so the pipeline runs end to end.
Replace data/tickets.csv with real labeled tickets before drawing conclusions:
metrics on synthetic text are optimistic and must not be reported as real-world accuracy.
"""

import random, csv

random.seed(7)
T = {
    "billing": [
        "I was charged twice for my subscription",
        "invoice shows the wrong amount",
        "need a refund for last month payment",
        "credit card was declined but money left my account",
        "how do I update my billing address on the invoice",
        "tax details missing from receipt",
    ],
    "account_access": [
        "cannot log in to my account",
        "password reset email never arrives",
        "two factor code is not working",
        "my account got locked after failed attempts",
        "unable to sign in with single sign on",
        "how do I change the email on my login",
    ],
    "integration_sync": [
        "orders are not syncing to the scheduling system",
        "route planner is missing new jobs",
        "work orders not reaching the dispatcher",
        "salesforce connection keeps timing out",
        "webhook events are delayed or dropped",
        "api sync stopped updating records overnight",
    ],
    "bug_report": [
        "the page crashes when I click export",
        "dashboard shows a blank screen after update",
        "button does nothing on mobile",
        "error 500 when saving a form",
        "report totals are calculated incorrectly",
        "app freezes while uploading a file",
    ],
    "feature_request": [
        "would love dark mode support",
        "please add bulk edit for records",
        "can you support exporting to excel",
        "need role based permissions for the team",
        "suggest adding a calendar view",
        "add an option to schedule reports weekly",
    ],
}
OPEN = [
    "",
    "Hi, ",
    "Hello team, ",
    "Urgent: ",
    "Quick question - ",
    "Since this morning ",
]
TAIL = [
    "",
    " Please help.",
    " This is blocking my work.",
    " Thanks.",
    " Happened again today.",
    " Not sure what changed.",
]
NOISE = ["the", "my", "our", "again", "still", "really"]
rows = []
for cat, phrases in T.items():
    for _ in range(160):
        p = random.choice(phrases).split()
        p = [w for w in p if random.random() > 0.12]
        if random.random() < 0.3:
            p.insert(random.randrange(len(p) + 1), random.choice(NOISE))
        if random.random() < 0.15:
            p += random.choice(T[random.choice(list(T))]).split()[:3]
        text = random.choice(OPEN) + " ".join(p) + random.choice(TAIL)
        rows.append((text.strip(), cat))
random.shuffle(rows)
with open("data/tickets.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["text", "category"])
    w.writerows(rows)
print(len(rows), "rows written")

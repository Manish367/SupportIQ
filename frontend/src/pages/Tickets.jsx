import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, CATS, pct, useCategories } from "../api.js";

const ST = {
  open: ["Open", "s-open"],
  in_progress: ["In progress", "s-prog"],
  resolved: ["Resolved", "s-done"],
};
const PRI = { high: "#ff5d73", medium: "#ffa940", low: "#34c796" };
const code = (t) => `SQ-${t._id.slice(-4).toUpperCase()}`;
const when = (d) =>
  new Date(d).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const Flag = ({ p }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-label={`${p} priority`}>
    <path
      d="M5 3v18M5 4h12l-2 4 2 4H5"
      fill={PRI[p]}
      stroke={PRI[p]}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);
const PER = 10;

export default function Tickets() {
  const cats = useCategories();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(""),
    [rows, setRows] = useState(null),
    [err, setErr] = useState(""),
    [sel, setSel] = useState(null),
    [page, setPage] = useState(1),
    [incs, setIncs] = useState([]);
  const qs = sp.toString();
  const load = useCallback(() => {
    const p = new URLSearchParams(qs);
    if (q) p.set("q", q);
    api
      .tickets("?" + p)
      .then((r) => {
        setRows(r);
        setErr("");
      })
      .catch((e) => setErr(e.message));
  }, [qs, q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [qs, q]);
  useEffect(() => {
    api
      .incidents()
      .then((r) => setIncs(r.incidents))
      .catch(() => {});
  }, []);
  const cur = useMemo(
    () => rows?.find((t) => t._id === sel) || rows?.[0] || null,
    [rows, sel],
  );
  const patch = (id, b) =>
    api
      .update(id, b)
      .then(load)
      .catch((e) => setErr(e.message));
  const pages = Math.max(1, Math.ceil((rows?.length || 0) / PER)),
    slice = rows?.slice((page - 1) * PER, page * PER) || [];
  const incOf = cur && incs.find((i) => i.ticketIds.includes(cur._id));
  const title = sp.get("review")
    ? "Needs review"
    : sp.get("status")
      ? ST[sp.get("status")]?.[0]
      : sp.get("category")
        ? CATS[sp.get("category")]
        : sp.get("priority")
          ? `${sp.get("priority")[0].toUpperCase()}${sp.get("priority").slice(1)} priority`
          : "All tickets";

  return (
    <>
      <section className="glass main list-pane">
        <header className="bar">
          <h1>{title}</h1>
          <input
            className="search"
            placeholder="Search by subject"
            aria-label="Search by subject"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </header>
        <div className="thead" role="row">
          <span>#</span>
          <span>Issue</span>
          <span>Category</span>
          <span>Status</span>
        </div>
        <div className="tbody">
          {err && (
            <p className="err" role="alert">
              {err}
            </p>
          )}
          {!rows && !err && <p className="muted pad">Loading tickets…</p>}
          {rows?.length === 0 && (
            <p className="muted pad">
              No tickets match. Clear a filter in the sidebar or create a
              ticket.
            </p>
          )}
          {slice.map((t) => (
            <button
              key={t._id}
              className={`trow ${cur?._id === t._id ? "sel" : ""}`}
              onClick={() => setSel(t._id)}
            >
              <span className="id">{code(t)}</span>
              <span className="title">
                <Flag p={t.priority} />
                {t.subject}
                {t.prediction?.needsReview && !t.reviewed && (
                  <em className="review-dot" title="Needs review" />
                )}
              </span>
              <span className="cat">{CATS[t.category] || "Unscored"}</span>
              <span className={`pill ${ST[t.status][1]}`}>
                {ST[t.status][0]}
              </span>
            </button>
          ))}
        </div>
        <footer className="pager">
          <span className="muted small">{rows?.length || 0} tickets</span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <b>
              {page} / {pages}
            </b>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </footer>
      </section>

      <aside className="glass detail" aria-label="Ticket details">
        {!cur ? (
          <p className="muted pad">Select a ticket to see its details.</p>
        ) : (
          <div className="detail-in" key={cur._id}>
            <div className="d-top">
              <b>{code(cur)}</b>
              <span className={`pill ${ST[cur.status][1]}`}>
                {ST[cur.status][0]}
              </span>
              <span className="muted small right">{when(cur.createdAt)}</span>
            </div>
            <div className="d-scroll">
              <h2 className="d-title">{cur.subject}</h2>
              <p className="d-desc">{cur.description}</p>
              <div className="inset float1">
                <p className="label">Model prediction</p>
                {cur.prediction?.modelAvailable === false ||
                cur.prediction?.confidence == null ? (
                  <p className="warn">
                    The prediction service didn’t respond for this ticket.
                    Choose a category below.
                  </p>
                ) : (
                  <>
                    <div className="conf-row">
                      <span>Confidence</span>
                      <b>{pct(cur.prediction.confidence)}</b>
                    </div>
                    <div className="meter">
                      <div style={{ width: pct(cur.prediction.confidence) }} />
                    </div>
                    <p className="small muted mb-1">
                      Predicted: <b>{CATS[cur.prediction.category]}</b>
                      {cur.prediction.alternatives?.length > 1 &&
                        ` · then ${cur.prediction.alternatives
                          .slice(1, 3)
                          .map(
                            (a) => `${CATS[a.category]} ${pct(a.confidence)}`,
                          )
                          .join(", ")}`}
                    </p>
                    {cur.prediction.needsReview && !cur.reviewed && (
                      <p className="warn small">
                        {cur.prediction.outOfDistribution
                          ? "This ticket looks unlike the training data. Please check the category."
                          : "Confidence is below the review threshold. Please check the category."}
                      </p>
                    )}
                  </>
                )}
                <label className="label mt-2" htmlFor="pp">
                  Priority{" "}
                  {cur.prioritySource === "model" &&
                  cur.prediction?.priorityConfidence != null
                    ? `(model, ${pct(cur.prediction.priorityConfidence)} confident)`
                    : "(set by a person)"}
                </label>
                <select
                  id="pp"
                  className="form-select form-select-sm"
                  value={cur.priority}
                  onChange={(e) => patch(cur._id, { priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <label className="label mt-2" htmlFor="cc">
                  Category
                </label>
                <div className="two">
                  <select
                    id="cc"
                    className="form-select form-select-sm"
                    value={cur.category || ""}
                    onChange={(e) =>
                      patch(cur._id, { category: e.target.value })
                    }
                  >
                    {!cur.category && <option value="">Choose category</option>}
                    {cats.map((k) => (
                      <option key={k} value={k}>
                        {CATS[k]}
                      </option>
                    ))}
                  </select>
                  {cur.prediction?.needsReview && !cur.reviewed && (
                    <button
                      className="btn-soft"
                      onClick={() => patch(cur._id, { confirm: true })}
                    >
                      Confirm
                    </button>
                  )}
                </div>
              </div>
              {incOf && (
                <div className="inset float2 inc">
                  <p className="label">Possible shared incident</p>
                  <p className="small mb-1">
                    <b>{incOf.size} similar tickets</b> in {incOf.minutesSpan}{" "}
                    min. An agent should check whether they share a cause.
                  </p>
                  <ul>
                    {incOf.tickets
                      .filter((t) => t.id !== cur._id)
                      .map((t) => (
                        <li key={t.id}>
                          <button className="link" onClick={() => setSel(t.id)}>
                            {t.subject}
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <p className="label mt-3">Activity</p>
              <ol className="timeline">
                {cur.status !== "open" && (
                  <li>
                    <b>Status: {ST[cur.status][0]}</b>
                    <span>{when(cur.updatedAt)}</span>
                  </li>
                )}
                {cur.correction && (
                  <li>
                    <b>Category corrected</b>
                    <span>
                      {CATS[cur.correction.from] || "Unscored"} to{" "}
                      {CATS[cur.correction.to]} · {when(cur.correction.at)}
                    </span>
                  </li>
                )}
                {cur.prediction?.confidence != null && (
                  <li>
                    <b>Model predicted {CATS[cur.prediction.category]}</b>
                    <span>
                      {pct(cur.prediction.confidence)} confidence ·{" "}
                      {when(cur.createdAt)}
                    </span>
                  </li>
                )}
                <li>
                  <b>Ticket created</b>
                  <span>{when(cur.createdAt)}</span>
                </li>
              </ol>
            </div>
            <div className="ornament" role="group" aria-label="Update status">
              {Object.entries(ST).map(([k, [label]]) => (
                <button
                  key={k}
                  className={cur.status === k ? "on" : ""}
                  onClick={() => patch(cur._id, { status: k })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

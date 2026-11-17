import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, CATS, pct } from "../api.js";
import Tilt from "../components/Tilt.jsx";
import Radar from "../components/Radar.jsx";
import { DashboardSkeleton } from "../components/Loading.jsx";
const COLORS = [
  "#7c5cff",
  "#3de0ff",
  "#5df2b5",
  "#ff7a90",
  "#ffc36b",
  "#b0b8d4",
];
const PRI = { low: "#5df2b5", medium: "#ffc36b", high: "#ff7a90" };
const TIP = {
  background: "#fff",
  border: "1px solid #dfe3f5",
  borderRadius: 12,
};

function useNarrow(q = "(max-width: 1100px)") {
  // phones and tablets: simple CSS bars instead of the wide chart
  const [n, setN] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q),
      f = () => setN(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return n;
}

export default function Dashboard() {
  const narrow = useNarrow();
  const [a, setA] = useState(null),
    [inc, setInc] = useState(null),
    [err, setErr] = useState(""),
    [incErr, setIncErr] = useState("");
  useEffect(() => {
    api
      .analytics()
      .then(setA)
      .catch((e) => setErr(e.message));
    api
      .incidents()
      .then(setInc)
      .catch((e) => setIncErr(e.message));
  }, []);
  if (err)
    return (
      <div className="glass main wide pane err" role="alert">
        {err} 
        <button className="btn-soft" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!a) return <DashboardSkeleton />;
  const cats = a.byCategory
    .map((c) => ({ ...c, label: CATS[c.name] || c.name }))
    .sort((x, y) => y.count - x.count);
  const max = Math.max(1, ...cats.map((c) => c.count));
  return (
    <div className="main wide scroll">
      <div className="grid-world">
        <Tilt className="radar-pane" max={4}>
          <div className="lift">
            <h1>Incident Radar</h1>
            <p className="muted">
              Groups of similar tickets reported in the last{" "}
              {inc?.windowHours ?? 24} hours. An agent decides whether they
              share a cause.
            </p>
          </div>
          <div className="radar-row">
            <div className="lift2">
              <Radar incidents={inc?.incidents || []} />
            </div>
            <div className="inc-list">
              {incErr && <p className="err">{incErr}</p>}
              {inc && !inc.incidents.length && (
                <p className="muted">
                  No candidate incidents. One appears when {inc.minTickets}+
                  similar open tickets arrive within {inc.windowHours} hours.
                </p>
              )}
              {inc?.incidents.map((i, k) => (
                <div key={k} className="incident">
                  <strong>
                    {i.size} similar tickets in {i.minutesSpan} min
                  </strong>
                  <span className="muted">
                    {" "}
                    · about {i.ratePerHour}/hour · similarity {pct(i.cohesion)}
                  </span>
                  <div className="chips">
                    {i.keywords.slice(0, 3).map((w) => (
                      <span key={w} className="chip">
                        {w}
                      </span>
                    ))}
                  </div>
                  <ul>
                    {i.tickets.map((t) => (
                      <li key={t.id}>{t.subject}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Tilt>

        <Tilt className="stat">
          <div className="lift">
            <span className="num">{a.total}</span>
            <span className="muted">Total tickets</span>
          </div>
        </Tilt>
        <Tilt className="stat">
          <div className="lift">
            <span className="num">{a.open}</span>
            <span className="muted">Not resolved</span>
          </div>
        </Tilt>
        <Tilt className="stat">
          <div className="lift">
            <span className="num">{a.reviewQueue}</span>
            <span className="muted">Waiting for review</span>
          </div>
          <Link to="/tickets?review=true">Review queue</Link>
        </Tilt>

        <Tilt className="chart">
          <h2 className="lift">Tickets by predicted category</h2>
          {!cats.length ? (
            <p className="muted">
              No tickets yet.{" "}
              <Link to="/tickets/new">Create the first one</Link>.
            </p>
          ) : narrow ? (
            <div className="hbars">
              {cats.map((c, i) => (
                <div className="hbar" key={c.name}>
                  <div className="hbar-top">
                    <span>{c.label}</span>
                    <b>{c.count}</b>
                  </div>
                  <div className="hbar-track">
                    <div
                      style={{
                        width: `${(c.count / max) * 100}%`,
                        background: COLORS[i % 6],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={cats} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" allowDecimals={false} stroke="#5d6485" />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={210}
                  stroke="#5d6485"
                />
                <Tooltip contentStyle={TIP} />
                <Bar dataKey="count" radius={8}>
                  {cats.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % 6]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Tilt>

        <Tilt className="chart">
          <h2 className="lift">Priority breakdown</h2>
          {a.byPriority.length ? (
            <>
              <ResponsiveContainer width="100%" height={narrow ? 190 : 230}>
                <PieChart>
                  <Pie
                    data={a.byPriority}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={narrow ? 48 : 55}
                    outerRadius={narrow ? 72 : 85}
                    paddingAngle={4}
                  >
                    {a.byPriority.map((p) => (
                      <Cell key={p.name} fill={PRI[p.name] || "#b0b8d4"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TIP} />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend">
                {a.byPriority.map((p) => (
                  <span key={p.name}>
                    <i style={{ background: PRI[p.name] || "#b0b8d4" }} />
                    {p.name} {p.count}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">No data yet.</p>
          )}
          <p className="muted small">
            Priority is predicted by the model unless a person sets it.
          </p>
        </Tilt>

        <Tilt className="recent">
          <h2 className="lift">Recent tickets</h2>
          {a.recent.map((t) => (
            <div key={t._id} className="row-item">
              <span>{t.subject}</span>
              <span className="chip">{CATS[t.category] || "Unscored"}</span>
            </div>
          ))}
          {!a.recent.length && <p className="muted">Nothing here yet.</p>}
        </Tilt>
      </div>
    </div>
  );
}

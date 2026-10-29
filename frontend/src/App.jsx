import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import CreateTicket from "./pages/CreateTicket.jsx";
import Tickets from "./pages/Tickets.jsx";
import { api, CATS, useCategories } from "./api.js";

const Dot = ({ c }) => <i className="dot" style={{ background: c }} />;
function Sidebar() {
  const cats = useCategories();
  const [a, setA] = useState(null);
  const [sp] = useSearchParams();
  const loc = useLocation();
  useEffect(() => {
    api
      .analytics()
      .then(setA)
      .catch(() => setA(null));
  }, [loc.key]);
  const n = (list, k) => list?.find((x) => x.name === k)?.count ?? 0;
  const on = (k, v) => loc.pathname === "/tickets" && sp.get(k) === v;
  const item = (k, v, label, count, dot) => (
    <Link
      key={v}
      to={`/tickets?${k}=${v}`}
      className={`side-link ${on(k, v) ? "on" : ""}`}
    >
      {dot}
      <span>{label}</span>
      {count != null && <b>{count}</b>}
    </Link>
  );
  return (
    <aside className="side glass">
      <div className="logo">
        <span className="logo-mark" />
        SupportIQ
      </div>
      <nav className="side-nav" aria-label="Main">
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink
          to="/tickets"
          end
          className={() =>
            loc.pathname === "/tickets" && !sp.toString() ? "active" : ""
          }
        >
          All tickets{a && <b>{a.total}</b>}
        </NavLink>
        <NavLink to="/tickets/new">New ticket</NavLink>
      </nav>
      <p className="side-h">Views</p>
      {item("status", "open", "Open", n(a?.byStatus, "open"))}
      {item(
        "status",
        "in_progress",
        "In progress",
        n(a?.byStatus, "in_progress"),
      )}
      {item("status", "resolved", "Resolved", n(a?.byStatus, "resolved"))}
      {item("review", "true", "Needs review", a?.reviewQueue)}
      <p className="side-h">Categories</p>
      {cats.map((k) => item("category", k, CATS[k], n(a?.byCategory, k)))}
      <p className="side-h">Priority</p>
      {item(
        "priority",
        "high",
        "High",
        n(a?.byPriority, "high"),
        <Dot c="#ff5d73" />,
      )}
      {item(
        "priority",
        "medium",
        "Medium",
        n(a?.byPriority, "medium"),
        <Dot c="#ffa940" />,
      )}
      {item(
        "priority",
        "low",
        "Low",
        n(a?.byPriority, "low"),
        <Dot c="#34c796" />,
      )}
    </aside>
  );
}

export default function App() {
  const stage = useRef(null);
  const move = (e) => {
    // background layers shift with the pointer to give the scene depth
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    stage.current.style.setProperty(
      "--px",
      (e.clientX / innerWidth - 0.5).toFixed(3),
    );
    stage.current.style.setProperty(
      "--py",
      (e.clientY / innerHeight - 0.5).toFixed(3),
    );
  };
  return (
    <div className="stage" ref={stage} onPointerMove={move}>
      <div className="orbs" aria-hidden="true">
        <div className="orb o1" />
        <div className="orb o2" />
        <div className="orb o3" />
      </div>
      <div className="shell">
        <Sidebar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route
            path="*"
            element={
              <section className="glass main wide pane">
                This page doesn’t exist. <Link to="/">Back to dashboard</Link>
              </section>
            }
          />
        </Routes>
      </div>
    </div>
  );
}

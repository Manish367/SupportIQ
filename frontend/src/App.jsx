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
const Icon = ({ d }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

function Sidebar({ open, onClose }) {
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
    <aside
      className={`side glass ${open ? "open" : ""}`}
      aria-label="Navigation and filters"
    >
      <div className="logo">
        <span className="logo-mark" />
        SupportIQ
        <button
          className="side-close"
          onClick={onClose}
          aria-label="Close menu"
        >
          ×
        </button>
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
      <Link
        to="/tickets"
        className={`side-link side-all ${loc.pathname === "/tickets" && !sp.toString() ? "on" : ""}`}
      >
        <span>All tickets</span>
        {a && <b>{a.total}</b>}
      </Link>
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
  const stage = useRef(null),
    loc = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const move = (e) => {
    // background layers shift with the mouse pointer to give the scene depth (not on touch)
    if (
      e.pointerType !== "mouse" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    stage.current.style.setProperty(
      "--px",
      (e.clientX / innerWidth - 0.5).toFixed(3),
    );
    stage.current.style.setProperty(
      "--py",
      (e.clientY / innerHeight - 0.5).toFixed(3),
    );
  };
  useEffect(() => {
    setNavOpen(false);
  }, [loc.pathname, loc.search]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  useEffect(() => {
    document.body.classList.toggle("no-scroll", navOpen);
    const k = (e) => e.key === "Escape" && setNavOpen(false);
    addEventListener("keydown", k);
    return () => {
      removeEventListener("keydown", k);
      document.body.classList.remove("no-scroll");
    };
  }, [navOpen]);
  return (
    <div className="stage" ref={stage} onPointerMove={move}>
      <div className="orbs" aria-hidden="true">
        <div className="orb o1" />
        <div className="orb o2" />
        <div className="orb o3" />
      </div>
      <header className="topbar glass">
        <button
          className="icon-btn"
          onClick={() => setNavOpen(true)}
          aria-label="Open menu and filters"
        >
          <Icon d="M4 6h16M4 12h16M4 18h16" />
        </button>
        <span className="logo">
          <span className="logo-mark" />
          SupportIQ
        </span>
        <Link to="/tickets/new" className="top-new" aria-label="New ticket">
          <Icon d="M12 5v14M5 12h14" />
        </Link>
      </header>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <div className="shell">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
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
      <nav className="tabbar glass" aria-label="Main">
        <NavLink to="/" end>
          <Icon d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/tickets" end>
          <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          <span>Tickets</span>
        </NavLink>
        <NavLink to="/tickets/new">
          <Icon d="M12 5v14M5 12h14" />
          <span>New</span>
        </NavLink>
      </nav>
    </div>
  );
}

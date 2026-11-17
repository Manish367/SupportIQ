import { useEffect, useState } from "react";
import Radar from "./Radar.jsx";

export function useSlow(ms = 6000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return slow;
}
const Sk = ({ w = "100%", h = 14, r = 10 }) => (
  <span className="sk" style={{ width: w, height: h, borderRadius: r }} />
);
const Wake = ({ show }) => (
  <p className={`wake ${show ? "show" : ""}`} aria-hidden={!show}>
    <i />
    The free demo server sleeps when idle and is waking up now. The first load
    can take up to a minute.
  </p>
);

export function DashboardSkeleton() {
  const slow = useSlow();
  return (
    <div
      className="main wide scroll"
      role="status"
      aria-label="Loading dashboard"
    >
      <div className="grid-world">
        <section className="glass pane radar-pane">
          <h1>Incident Radar</h1>
          <p className="muted">Getting your dashboard ready…</p>
          <div className="radar-row">
            <Radar incidents={[]} />
            <div className="inc-list">
              <div className="incident sk-stack">
                <Sk w="70%" h={16} />
                <div className="sk-row-flex">
                  <Sk w={70} h={22} r={99} />
                  <Sk w={80} h={22} r={99} />
                  <Sk w={60} h={22} r={99} />
                </div>
                <Sk w="90%" h={12} />
                <Sk w="75%" h={12} />
              </div>
            </div>
          </div>
          <Wake show={slow} />
        </section>
        {[0, 1, 2].map((i) => (
          <section key={i} className="glass pane stat sk-stack">
            <Sk w="38%" h={38} />
            <Sk w="70%" h={12} />
          </section>
        ))}
        <section className="glass pane chart">
          <Sk w="55%" h={18} />
          {[85, 62, 48, 30, 18].map((w) => (
            <div className="hbar" key={w}>
              <Sk w="35%" h={12} />
              <div style={{ height: 6 }} />
              <Sk w={`${w}%`} h={10} r={99} />
            </div>
          ))}
        </section>
        <section className="glass pane chart">
          <Sk w="45%" h={18} />
          <div className="sk-ring" />
        </section>
        <section className="glass pane recent sk-stack">
          <Sk w="40%" h={18} />
          {[0, 1, 2].map((i) => (
            <div className="row-item" key={i}>
              <Sk w="55%" h={14} />
              <Sk w={90} h={22} r={99} />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

export function ListSkeleton() {
  const slow = useSlow();
  return (
    <div role="status" aria-label="Loading tickets">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div className="trow" key={i} aria-hidden="true">
          <span className="id">
            <Sk w={46} h={10} />
          </span>
          <span className="title">
            <Sk w={`${72 - i * 6}%`} h={14} />
          </span>
          <span className="cat">
            <Sk w="70%" h={10} />
          </span>
          <span>
            <Sk w={72} h={22} r={99} />
          </span>
        </div>
      ))}
      <div style={{ padding: "0 .9rem" }}>
        <Wake show={slow} />
      </div>
    </div>
  );
}

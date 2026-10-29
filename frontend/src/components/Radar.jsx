import { CATS } from "../api.js";
// Each candidate incident is a node; distance from center = recency of last report, size = ticket count.
export default function Radar({ incidents }) {
  const now = Date.now();
  const nodes = incidents.map((inc, i) => {
    const age = Math.min((now - new Date(inc.lastReport)) / 36e5 / 24, 1),
      ang = (i / Math.max(incidents.length, 1)) * Math.PI * 2 + 0.6,
      r = 28 + age * 100;
    return {
      inc,
      x: 160 + Math.cos(ang) * r,
      y: 160 + Math.sin(ang) * r,
      s: 7 + inc.size * 2,
    };
  });
  return (
    <svg
      viewBox="0 0 320 320"
      className="radar"
      role="img"
      aria-label={`${incidents.length} candidate incidents`}
    >
      <defs>
        <radialGradient id="g">
          <stop offset="0" stopColor="#3de0ff" stopOpacity=".5" />
          <stop offset="1" stopColor="#3de0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sw" x1="0" x2="1">
          <stop offset="0" stopColor="#3de0ff" stopOpacity="0" />
          <stop offset="1" stopColor="#3de0ff" stopOpacity=".45" />
        </linearGradient>
      </defs>
      {[40, 80, 120, 150].map((r) => (
        <circle
          key={r}
          cx="160"
          cy="160"
          r={r}
          fill="none"
          stroke="rgba(40,50,110,.16)"
        />
      ))}
      <g className="sweep">
        <path d="M160 160 L160 10 A150 150 0 0 1 266 54 Z" fill="url(#sw)" />
      </g>
      <circle cx="160" cy="160" r="4" fill="#2f6bff" />
      {nodes.map(({ inc, x, y, s }, i) => (
        <g key={i} className="node">
          <circle cx={x} cy={y} r={s * 2.2} fill="url(#g)" />
          <circle cx={x} cy={y} r={s} fill="#ff7a90" />
          <text
            x={x}
            y={y + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#0b1020"
          >
            {inc.size}
          </text>
        </g>
      ))}
    </svg>
  );
}

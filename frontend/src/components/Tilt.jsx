import { useRef } from "react";
// Spatial pane: tilts toward the pointer; children with .lift float above the surface via translateZ.
export default function Tilt({ className = "", max = 6, children, ...p }) {
  const ref = useRef(null);
  const move = (e) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = ref.current.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width - 0.5,
      y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)`;
    ref.current.style.setProperty("--gx", `${(x + 0.5) * 100}%`);
    ref.current.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
  };
  return (
    <section
      ref={ref}
      className={`glass pane tilt ${className}`}
      onPointerMove={move}
      onPointerLeave={() => (ref.current.style.transform = "")}
      {...p}
    >
      {children}
    </section>
  );
}

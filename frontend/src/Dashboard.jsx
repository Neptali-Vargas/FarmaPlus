import React from "react";
import { boticaDate } from "./calendar.js";
import {
  Pill,
  ShoppingCart,
  Package,
  TriangleAlert,
  ChartNoAxesCombined,
  ClipboardList,
  Bell,
  CalendarDays,
} from "lucide-react";
const money = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    (n || 0) / 100,
  );
const colors = [
  "#1264F4",
  "#60A5FA",
  "#F59E0B",
  "#8B5CF6",
  "#16A34A",
  "#EC4899",
  "#64748B",
];
export function LineChart({ data = [] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(boticaDate() + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 6 + i);
    const key = d.toISOString().slice(0, 10);
    return { day: key, total: data.find((x) => x.day === key)?.total || 0 };
  });
  const max = Math.max(
    100,
    Math.ceil(Math.max(...days.map((x) => x.total)) / 500) * 500,
  );
  const points = days.map((d, i) => [55 + i * 91, 210 - (d.total / max) * 180]);
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  return (
    <div className="chart line-chart">
      <svg
        viewBox="0 0 640 255"
        role="img"
        aria-label="Ventas de los últimos siete días en soles"
      >
        <title>
          {days.map((d) => `${d.day}: ${money(d.total)}`).join("; ")}
        </title>
        {Array.from({ length: 5 }, (_, i) => (
          <g key={i}>
            <line
              x1="43"
              x2="620"
              y1={30 + i * 45}
              y2={30 + i * 45}
              stroke="#E4EBF5"
            />
            <text x="31" y={35 + i * 45} textAnchor="end">
              {new Intl.NumberFormat("es-PE", {
                maximumFractionDigits: 2,
              }).format((max * (4 - i)) / 400)}
            </text>
          </g>
        ))}
        <path
          d={`${path} L601,210 L55,210 Z`}
          fill="#1264F4"
          fillOpacity=".09"
        />
        <path
          d={path}
          fill="none"
          stroke="#1264F4"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {points.map(([x, y], i) => (
          <g key={days[i].day}>
            <circle
              cx={x}
              cy={y}
              r="3.8"
              fill="white"
              stroke="#1264F4"
              strokeWidth="2.6"
            >
              <title>{money(days[i].total)}</title>
            </circle>
            <text x={x} y="237" textAnchor="middle">
              {new Date(days[i].day + "T12:00:00").toLocaleDateString("es-PE", {
                weekday: "short",
                day: "numeric",
              })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
function Donut({ categories, total }) {
  let offset = 0;
  return (
    <div className="category-chart">
      <div className="donut">
        <svg
          viewBox="0 0 220 220"
          role="img"
          aria-label="Distribución del importe de ventas del mes por categoría"
        >
          <circle
            cx="110"
            cy="110"
            r="85"
            fill="none"
            stroke="#EDF1F8"
            strokeWidth="28"
          />
          {categories.map((c, i) => {
            const share = (c.total / total) * 100;
            const start = offset;
            offset += share;
            return (
              <circle
                key={c.name}
                cx="110"
                cy="110"
                r="85"
                pathLength="100"
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="28"
                strokeDasharray={`${Math.max(0, share - 0.5)} ${100 - Math.max(0, share - 0.5)}`}
                strokeDashoffset={-start}
                transform="rotate(-90 110 110)"
              >
                <title>
                  {c.name}: {money(c.total)}
                </title>
              </circle>
            );
          })}
        </svg>
        <div className="donut-label">
          <strong>{money(total)}</strong>
          <span>Ventas del mes</span>
        </div>
      </div>
      <div className="category-legend">
        {categories.length ? (
          categories.map((c, i) => (
            <div key={c.name}>
              <span
                className="legend-dot"
                style={{ background: colors[i % colors.length] }}
              />
              <span>{c.name}</span>
              <strong>{((c.total / total) * 100).toFixed(1)}%</strong>
            </div>
          ))
        ) : (
          <p>Aún no hay ventas este mes.</p>
        )}
      </div>
    </div>
  );
}
export default function Dashboard({ data, move }) {
  const stats = [
    [
      Pill,
      "Medicamentos registrados",
      data.products,
      "Registrados en el sistema",
      "blue",
    ],
    [
      ShoppingCart,
      "Ventas del día",
      money(data.todayTotal),
      `${data.todayCount} ${data.todayCount === 1 ? "venta registrada" : "ventas registradas"}`,
      "green",
    ],
    [
      Package,
      "Productos con stock bajo",
      data.low.length,
      "Productos por reponer",
      "purple",
    ],
    [
      TriangleAlert,
      "Próximos a vencer",
      data.expiring.length,
      "Lotes en 90 días o vencidos",
      "red",
    ],
  ];
  return (
    <>
      <div className="stats">
        {stats.map(([Icon, label, value, sub, tone]) => (
          <section className={`stat ${tone}`} key={label}>
            <span className="stat-icon">
              <Icon size={29} />
            </span>
            <div>
              <div className="stat-label">{label}</div>
              <strong>{value}</strong>
              <small>{sub}</small>
            </div>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <div className="section-head">
            <div className="card-title">
              <ChartNoAxesCombined />
              <div>
                <h2>Actividad comercial</h2>
                <p>Ventas de los últimos 7 días · S/</p>
              </div>
            </div>
          </div>
          <LineChart data={data.daily} />
        </section>
        <section className="card">
          <div className="section-head">
            <div className="card-title">
              <ClipboardList />
              <h2>Ventas por categoría</h2>
            </div>
          </div>
          <Donut categories={data.categories} total={data.monthTotal} />
        </section>
      </div>
      <div className="dashboard-grid dashboard-bottom">
        <section className="card">
          <div className="section-head">
            <div className="card-title">
              <ClipboardList />
              <h2>Últimas ventas</h2>
            </div>
            <button className="text-btn" onClick={() => move("sales")}>
              Ver todas
            </button>
          </div>
          {data.latest.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>N.° Venta</th>
                    <th>Fecha</th>
                    <th>Trabajador</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latest.map((s) => (
                    <tr key={s.id}>
                      <td>V-{String(s.id).padStart(6, "0")}</td>
                      <td>
                        {new Date(s.created_at).toLocaleString("es-PE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>{s.user_name}</td>
                      <td>
                        <strong>{money(s.total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">Aún no hay ventas registradas.</div>
          )}
        </section>
        <section className="card system-alerts">
          <div className="section-head">
            <div className="card-title">
              <Bell />
              <h2>Alertas del sistema</h2>
            </div>
            <button className="text-btn" onClick={() => move("alerts")}>
              Ver alertas
            </button>
          </div>
          <div
            className={
              "system-alert " + (data.low.length ? "critical" : "healthy")
            }
          >
            <span>
              <TriangleAlert />
            </span>
            <div>
              <strong>
                {data.low.length
                  ? `${data.low.length} productos con stock bajo`
                  : "Stock dentro de los mínimos"}
              </strong>
              <p>
                {data.low.length
                  ? data.low
                      .slice(0, 2)
                      .map((p) => p.name)
                      .join(" y ") + (data.low.length > 2 ? " y otros." : ".")
                  : "No hay productos pendientes de reposición."}
              </p>
            </div>
          </div>
          <div
            className={
              "system-alert " + (data.expiring.length ? "warning" : "healthy")
            }
          >
            <span>
              <CalendarDays />
            </span>
            <div>
              <strong>
                {data.expiring.length
                  ? `${data.expiring.length} lotes por vencer o vencidos`
                  : "Sin alertas de vencimiento"}
              </strong>
              <p>
                {data.expiring.length
                  ? `${data.expiring[0].name} · Vence el ${new Date(data.expiring[0].expiry + "T12:00:00").toLocaleDateString("es-PE")}.`
                  : "No hay lotes con vencimiento en los próximos 90 días."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Pill,
  Warehouse,
  ShoppingCart,
  Bell,
  ChartNoAxesCombined,
  Users,
  LogOut,
  Plus,
  Search,
  ArrowDownToLine,
  Package,
  Menu,
  X,
  Check,
  Activity,
  ShieldCheck,
  CalendarDays,
  ArrowRightLeft,
} from "lucide-react";
import "./style.css";
import "./redesign.css";
import Dashboard from "./Dashboard.jsx";
import { boticaDate, boticaHour } from "./calendar.js";
const money = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    (n || 0) / 100,
  );
const day = (s) =>
  s
    ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString(
        "es-PE",
      )
    : "—";
async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Error de conexión");
  return data;
}
const nav = [
  ["dashboard", "Panel principal", LayoutDashboard],
  ["products", "Medicamentos", Pill],
  ["stock", "Almacén", Warehouse],
  ["sales", "Ventas", ShoppingCart],
  ["movements", "Movimientos", ArrowRightLeft],
  ["alerts", "Alertas", Bell],
  ["reports", "Reportes", ChartNoAxesCombined],
  ["users", "Usuarios", Users],
];
function Empty({ text = "No hay registros para mostrar." }) {
  return (
    <div className="empty">
      <Package size={28} />
      <p>{text}</p>
    </div>
  );
}
function Table({ heads, children }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Field({ label, children }) {
  const id = React.useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) &&
        ["input", "select", "textarea"].includes(child.type)
          ? React.cloneElement(child, { id })
          : child,
      )}
    </label>
  );
}
function Modal({ title, close, children }) {
  return (
    <div
      className="overlay"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label="Cerrar">
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("dashboard"),
    [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [data, setData] = useState(null),
    [products, setProducts] = useState([]),
    [batches, setBatches] = useState([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [modal, setModal] = useState(null),
    [cart, setCart] = useState([]),
    [customer, setCustomer] = useState(""),
    [filters, setFilters] = useState({ from: "", to: "" }),
    [mobile, setMobile] = useState(false);
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    let current = true;
    setData(null);
    setError("");
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v),
    ).toString();
    const path = {
      dashboard: "/dashboard",
      products: "/products",
      stock: "/movements?" + qs,
      sales: "/sales?" + qs,
      movements: "/movements?" + qs,
      alerts: "/dashboard",
      reports: "/reports?" + qs,
      users: "/users",
    }[page];
    Promise.all([api(path), api("/products"), api("/batches")])
      .then(async ([d, p, b]) => {
        if (page === "dashboard") {
          const sales = await api("/sales");
          const today = boticaDate();
          const month = today.slice(0, 7);
          const monthly = sales.filter(
            (s) => boticaDate(s.created_at).slice(0, 7) === month,
          );
          const details = await Promise.all(
            monthly.map((s) => api("/sales/" + s.id)),
          );
          const categories = new Map();
          for (const sale of details)
            for (const item of sale.items) {
              const category =
                p.find((product) => product.id === item.product_id)?.category ||
                "Sin categoría";
              categories.set(
                category,
                (categories.get(category) || 0) + item.price * item.quantity,
              );
            }
          d = {
            ...d,
            daily: Object.entries(
              sales.reduce((totals, sale) => {
                const date = boticaDate(sale.created_at);
                totals[date] = (totals[date] || 0) + sale.total;
                return totals;
              }, {}),
            ).map(([day, total]) => ({ day, total })),
            latest: sales.slice(0, 3),
            todayTotal: sales
              .filter((s) => boticaDate(s.created_at) === today)
              .reduce((a, s) => a + s.total, 0),
            todayCount: sales.filter((s) => boticaDate(s.created_at) === today)
              .length,
            monthTotal: monthly.reduce((a, s) => a + s.total, 0),
            categories: [...categories]
              .map(([name, total]) => ({ name, total }))
              .sort((a, b) => b.total - a.total),
          };
        }
        if (current) {
          setData(d);
          setProducts(p);
          setBatches(b);
        }
      })
      .catch((e) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [user, page, version, filters]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  async function action(fn, message, close = true) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      setNotice(message);
      if (close) setModal(null);
      setVersion((x) => x + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function move(p) {
    if (p !== page) setData(null);
    setPage(p);
    setQuery("");
    setCategory("");
    setModal(null);
    setError("");
    setNotice("");
    setMobile(false);
  }
  const visible = products.filter(
    (p) =>
      (p.name + " " + p.category).toLowerCase().includes(query.toLowerCase()) &&
      (!category || p.category === category),
  );
  const isAdmin = user?.role === "admin";
  const dates = (
    <div className="dates">
      <Field label="Desde">
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
      </Field>
      <Field label="Hasta">
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
        />
      </Field>
      <button
        className="secondary"
        onClick={() => setFilters({ from: "", to: "" })}
      >
        Limpiar fechas
      </button>
    </div>
  );
  const search = (
    <div className="tools">
      <div className="search">
        <Search size={18} />
        <input
          placeholder="Buscar medicamento o categoría…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <select
        aria-label="Categoría"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">Todas las categorías</option>
        {[...new Set(products.map((p) => p.category))].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </div>
  );
  function movementTable(rows) {
    return rows.length ? (
      <Table
        heads={[
          "Fecha",
          "Medicamento / lote",
          "Movimiento",
          "Cantidad",
          "Responsable",
          "Motivo",
        ]}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{day(r.created_at)}</td>
            <td>
              <strong>{r.name}</strong>
              <small>{r.code}</small>
            </td>
            <td>
              <span className={"badge " + (r.quantity > 0 ? "green" : "gray")}>
                {r.type}
              </span>
            </td>
            <td className={r.quantity > 0 ? "positive" : ""}>
              {r.quantity > 0 ? "+" : ""}
              {r.quantity}
            </td>
            <td>{r.user_name}</td>
            <td>{r.reason}</td>
          </tr>
        ))}
      </Table>
    ) : (
      <Empty />
    );
  }
  function exportCsv() {
    const rows = page === "reports" ? data.daily : data;
    const keys =
      page === "reports"
        ? ["day", "count", "total"]
        : ["id", "created_at", "customer", "total", "user_name"];
    const csv =
      "\uFEFF" +
      [
        keys.join(";"),
        ...rows.map((r) =>
          keys
            .map(
              (k) =>
                '"' +
                String(
                  k === "total" ? (r[k] / 100).toFixed(2) : (r[k] ?? ""),
                ).replaceAll('"', '""') +
                '"',
            )
            .join(";"),
        ),
      ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "farmaplus-" + page + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (loading) return <div className="loading">Cargando FarmaPlus…</div>;
  if (!user)
    return (
      <div className="login-page">
        <div className="login-intro">
          <div className="brand">
            <span className="brand-icon">✚</span>
            <div>
              FarmaPlus<small>Gestión de Botica</small>
            </div>
          </div>
          <div>
            <span className="eyebrow">GESTIÓN DE BOTICA</span>
            <h1>
              El cuidado empieza
              <br />
              con una buena gestión.
            </h1>
            <p>
              Tu inventario, tus ventas y tu equipo.
              <br />
              Todo en un solo lugar.
            </p>
            <div className="login-note">
              <ShieldCheck /> Control seguro de tu operación diaria
            </div>
          </div>
          <small aria-hidden="true">&nbsp;</small>
        </div>
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            action(
              async () =>
                setUser(
                  await api("/auth/login", "POST", Object.fromEntries(f)),
                ),
              "Sesión iniciada",
            );
          }}
        >
          <span className="eyebrow">BIENVENIDO A FARMAPLUS</span>
          <h2>Iniciar sesión</h2>
          <p>Ingresa tus credenciales para continuar.</p>
          {error && (
            <div role="alert" className="message error">
              {error}
            </div>
          )}
          <Field label="Usuario">
            <input
              type="text"
              name="username"
              required
              autoComplete="username"
              autoCapitalize="none"
              placeholder="Tu usuario"
            />
          </Field>
          <Field label="Contraseña">
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Tu contraseña"
            />
          </Field>
          <button disabled={busy}>
            {busy ? "Ingresando…" : "Ingresar al sistema"}
          </button>
          <div className="demo">
            <strong>Acceso de demostración</strong>
            <span>Usuario: admin</span>
            <span>Contraseña: admin123</span>
          </div>
        </form>
      </div>
    );
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="brand-icon">✚</span>
          <div>
            FarmaPlus<small>Gestión de Botica</small>
          </div>
        </div>
        <span className="sidebar-caption">ADMINISTRACIÓN</span>
        <nav>
          {nav
            .filter(([id]) => id !== "users" || isAdmin)
            .map(([id, label, Icon]) => (
              <button
                key={id}
                aria-label={label}
                className={page === id ? "active" : ""}
                onClick={() => move(id)}
              >
                <Icon size={20} />
                {label}
                {id === "alerts" && data?.low?.length > 0 && (
                  <span className="nav-count">{data.low.length}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{user.name[0]}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{isAdmin ? "Administrador" : "Trabajador"}</small>
          </div>
          <button
            className="icon-btn"
            aria-label="Cerrar sesión"
            onClick={() =>
              action(async () => {
                await api("/auth/logout", "POST");
                setUser(null);
                setCart([]);
                setMobile(false);
                setPage("dashboard");
                setData(null);
              }, "Sesión cerrada")
            }
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Abrir menú"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="header-heading">
            {page === "dashboard" ? (
              <>
                <h1 aria-label="Panel principal">
                  {boticaHour() < 12
                    ? "Buenos días"
                    : boticaHour() < 19
                      ? "Buenas tardes"
                      : "Buenas noches"}
                  , {user.name.split(" ")[0]}
                </h1>
                <p>Aquí tienes el resumen de la botica FarmaPlus.</p>
              </>
            ) : (
              <>
                <strong>{nav.find((n) => n[0] === page)?.[1]}</strong>
                <span>Gestión de Botica</span>
              </>
            )}
          </div>
          <div>
            <span className="today">
              <CalendarDays size={22} />
              {new Date().toLocaleDateString("es-PE", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "America/Lima",
              })}
            </span>
            <button
              className="icon-btn"
              aria-label="Ver alertas"
              onClick={() => move("alerts")}
            >
              <Bell size={24} />
              {(data?.low?.length > 0 || data?.expiring?.length > 0) && (
                <span className="notification-dot" />
              )}
            </button>
            <span className="avatar small-avatar">{user.name[0]}</span>
          </div>
        </header>
        <main>
          <div
            className={
              "page-head" + (page === "dashboard" ? " dashboard-heading" : "")
            }
          >
            <div>
              <span className="eyebrow">FARMAPLUS / GESTIÓN</span>
              <h1>{nav.find((n) => n[0] === page)?.[1]}</h1>
              <p>
                {
                  {
                    dashboard:
                      "Una vista general de la operación de tu botica.",
                    products: "Administra tu catálogo, precios y existencias.",
                    stock:
                      "Controla cada entrada y salida de tus medicamentos.",
                    movements:
                      "Consulta las entradas, salidas y ajustes de inventario.",
                    sales:
                      "Registra ventas y consulta las operaciones realizadas.",
                    alerts: "Anticípate a las necesidades de tu inventario.",
                    reports: "Información para tomar mejores decisiones.",
                    users: "Gestiona los accesos de tu equipo.",
                  }[page]
                }
              </p>
            </div>
            <div>
              {page === "dashboard" && (
                <button
                  onClick={() => {
                    move("sales");
                    setModal({ type: "sale" });
                  }}
                >
                  <Plus size={18} /> Nueva venta
                </button>
              )}
              {page === "products" && isAdmin && (
                <button onClick={() => setModal({ type: "product" })}>
                  <Plus size={18} /> Nuevo medicamento
                </button>
              )}
              {page === "stock" && isAdmin && (
                <button onClick={() => setModal({ type: "stock" })}>
                  <Plus size={18} /> Registrar movimiento
                </button>
              )}
              {page === "sales" && (
                <button onClick={() => setModal({ type: "sale" })}>
                  <Plus size={18} /> Nueva venta
                </button>
              )}
              {page === "users" && (
                <button onClick={() => setModal({ type: "user" })}>
                  <Plus size={18} /> Nuevo usuario
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="message error" role="alert">
              {error}
              <button
                className="icon-btn"
                onClick={() => setError("")}
                aria-label="Cerrar error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Check size={18} />
              {notice}
            </div>
          )}
          {!data ? (
            <div className="loading">
              {error
                ? "No se pudo cargar la información."
                : "Cargando información…"}
              {error && (
                <button onClick={() => setVersion((v) => v + 1)}>
                  Reintentar
                </button>
              )}
            </div>
          ) : (
            <>
              {page === "dashboard" && <Dashboard data={data} move={move} />}
              {page === "products" && (
                <section className="card">
                  {search}
                  <Table
                    heads={[
                      "Medicamento",
                      "Categoría",
                      "Precio unitario",
                      "Stock / disponible",
                      "Estado",
                      ...(isAdmin ? ["Acciones"] : []),
                    ]}
                  >
                    {visible.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>{p.presentation}</small>
                        </td>
                        <td>{p.category}</td>
                        <td>{money(p.price)}</td>
                        <td>
                          <strong>{p.stock}</strong> / {p.available}
                          <small>Mínimo: {p.minimum}</small>
                        </td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (p.available < p.minimum ? "amber" : "green")
                            }
                          >
                            {p.available < p.minimum
                              ? "Stock bajo"
                              : "Disponible"}
                          </span>
                        </td>
                        {isAdmin && (
                          <td>
                            <button
                              className="text-btn"
                              onClick={() =>
                                setModal({ type: "product", product: p })
                              }
                            >
                              Editar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </Table>
                  {!visible.length && (
                    <Empty text="No se encontraron medicamentos." />
                  )}
                  <div className="table-footer">
                    {visible.length} medicamentos · Disponible excluye lotes
                    vencidos.
                  </div>
                </section>
              )}
              {page === "stock" && (
                <>
                  <section className="card">
                    <div className="section-head">
                      <div>
                        <h2>Existencias por lote</h2>
                        <p>Ordenadas por fecha de vencimiento</p>
                      </div>
                    </div>
                    <div className="search">
                      <Search size={18} />
                      <input
                        placeholder="Buscar medicamento o lote…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <Table
                      heads={[
                        "Medicamento",
                        "Lote",
                        "Vencimiento",
                        "Cantidad",
                        "Estado",
                      ]}
                    >
                      {batches
                        .filter((b) =>
                          (b.name + " " + b.code)
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((b) => (
                          <tr key={b.id}>
                            <td>
                              <strong>{b.name}</strong>
                            </td>
                            <td>{b.code}</td>
                            <td>{day(b.expiry)}</td>
                            <td>{b.quantity}</td>
                            <td>
                              <span
                                className={
                                  "badge " +
                                  (b.expiry <
                                  new Date().toISOString().slice(0, 10)
                                    ? "red"
                                    : "green")
                                }
                              >
                                {b.expiry <
                                new Date().toISOString().slice(0, 10)
                                  ? "Vencido"
                                  : "Vigente"}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </Table>
                  </section>
                  <section className="card">
                    <div className="section-head">
                      <h2>Historial de movimientos</h2>
                    </div>
                    {dates}
                    {movementTable(data)}
                  </section>
                </>
              )}
              {page === "movements" && (
                <section className="card">
                  <div className="section-head">
                    <h2>Historial de movimientos</h2>
                  </div>
                  {dates}
                  {movementTable(data)}
                </section>
              )}
              {page === "sales" && (
                <section className="card">
                  <div className="section-head">
                    <h2>Historial de ventas</h2>
                    <button className="secondary" onClick={exportCsv}>
                      <ArrowDownToLine size={17} /> Exportar CSV
                    </button>
                  </div>
                  {dates}
                  {data.length ? (
                    <Table
                      heads={[
                        "Comprobante",
                        "Fecha",
                        "Cliente",
                        "Responsable",
                        "Total",
                        "Detalle",
                      ]}
                    >
                      {data.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>V-{String(s.id).padStart(6, "0")}</strong>
                          </td>
                          <td>{day(s.created_at)}</td>
                          <td>{s.customer}</td>
                          <td>{s.user_name}</td>
                          <td>
                            <strong>{money(s.total)}</strong>
                          </td>
                          <td>
                            <button
                              className="text-btn"
                              onClick={() =>
                                action(
                                  async () =>
                                    setModal({
                                      type: "detail",
                                      sale: await api("/sales/" + s.id),
                                    }),
                                  "",
                                  false,
                                )
                              }
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Table>
                  ) : (
                    <Empty text="Aún no hay ventas en este período." />
                  )}
                </section>
              )}
              {page === "alerts" && (
                <div className="alerts-grid">
                  <section className="card">
                    <h2>Reposición de medicamentos</h2>
                    <p>Disponibilidad inferior al mínimo establecido.</p>
                    {data.low.length ? (
                      <Table heads={["Medicamento", "Disponible", "Mínimo"]}>
                        {data.low.map((p) => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td>
                              <span className="badge amber">{p.available}</span>
                            </td>
                            <td>{p.minimum}</td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty text="No hay alertas de stock." />
                    )}
                  </section>
                  <section className="card">
                    <h2>Control de vencimiento</h2>
                    <p>
                      Lotes vencidos o con vencimiento en los próximos 90 días.
                    </p>
                    {data.expiring.length ? (
                      <Table
                        heads={["Medicamento / lote", "Vence", "Unidades"]}
                      >
                        {data.expiring.map((b) => (
                          <tr key={b.id}>
                            <td>
                              {b.name}
                              <small>{b.code}</small>
                            </td>
                            <td>
                              <span
                                className={
                                  "badge " +
                                  (b.expiry <
                                  new Date().toISOString().slice(0, 10)
                                    ? "red"
                                    : "amber")
                                }
                              >
                                {day(b.expiry)}
                              </span>
                            </td>
                            <td>{b.quantity}</td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty text="No hay alertas de vencimiento." />
                    )}
                  </section>
                </div>
              )}
              {page === "reports" && (
                <>
                  <section className="card">
                    <div className="section-head">
                      <h2>Resumen del período</h2>
                      <button className="secondary" onClick={exportCsv}>
                        <ArrowDownToLine size={17} /> Exportar CSV
                      </button>
                    </div>
                    {dates}
                    <div className="report-stats">
                      <div>
                        <small>Ingresos por ventas</small>
                        <strong>
                          {money(data.daily.reduce((s, x) => s + x.total, 0))}
                        </strong>
                      </div>
                      <div>
                        <small>Ventas registradas</small>
                        <strong>
                          {data.daily.reduce((s, x) => s + x.count, 0)}
                        </strong>
                      </div>
                      <div>
                        <small>Unidades vendidas</small>
                        <strong>
                          {data.movements
                            .filter((x) => x.type === "venta")
                            .reduce((s, x) => s - x.quantity, 0)}
                        </strong>
                      </div>
                    </div>
                  </section>
                  <div className="dashboard-grid">
                    <section className="card">
                      <h2>Medicamentos con mayor rotación</h2>
                      {data.top.length ? (
                        data.top.map((p) => (
                          <div className="ranking" key={p.name}>
                            <div>
                              <strong>{p.name}</strong>
                              <span>
                                {p.quantity} unidades · {money(p.total)}
                              </span>
                            </div>
                            <div className="rank-track">
                              <div
                                style={{
                                  width:
                                    (p.quantity / data.top[0].quantity) * 100 +
                                    "%",
                                }}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <Empty text="Registra ventas para ver la rotación." />
                      )}
                    </section>
                    <section className="card">
                      <h2>Resumen de movimientos</h2>
                      <Table heads={["Tipo", "Operaciones", "Unidades netas"]}>
                        {data.movements.map((m) => (
                          <tr key={m.type}>
                            <td>{m.type}</td>
                            <td>{m.count}</td>
                            <td>{m.quantity}</td>
                          </tr>
                        ))}
                      </Table>
                    </section>
                  </div>
                  <section className="card">
                    <h2>Ventas por día</h2>
                    {data.daily.length ? (
                      <Table heads={["Fecha", "Ventas", "Importe"]}>
                        {data.daily.map((d) => (
                          <tr key={d.day}>
                            <td>{day(d.day)}</td>
                            <td>{d.count}</td>
                            <td>{money(d.total)}</td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty />
                    )}
                  </section>
                </>
              )}
              {page === "users" && (
                <section className="card">
                  <Table heads={["Nombre", "Correo", "Rol"]}>
                    {data.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                        </td>
                        <td>{u.email}</td>
                        <td>
                          <span className="badge green">
                            {u.role === "admin"
                              ? "Administrador"
                              : "Trabajador"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <p className="table-footer">
                    El trabajador puede consultar inventario, registrar ventas y
                    ver reportes. El administrador también modifica el catálogo,
                    almacén y usuarios.
                  </p>
                </section>
              )}
            </>
          )}
          <footer>
            FarmaPlus · Sistema de gestión de botica{" "}
            <span>SENATI · Fullstack Developer Software</span>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            {
              product: modal.product
                ? "Editar medicamento"
                : "Nuevo medicamento",
              stock: "Registrar movimiento",
              sale: "Nueva venta",
              user: "Nuevo usuario",
              detail: "Detalle de venta",
            }[modal.type]
          }
          close={() => !busy && setModal(null)}
        >
          {error && <div className="message error">{error}</div>}
          {modal.type === "product" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const b = Object.fromEntries(new FormData(e.currentTarget));
                action(
                  () =>
                    api(
                      "/products" +
                        (modal.product ? "/" + modal.product.id : ""),
                      modal.product ? "PUT" : "POST",
                      b,
                    ),
                  "Medicamento guardado correctamente.",
                );
              }}
            >
              <Field label="Nombre del medicamento">
                <input
                  name="name"
                  required
                  maxLength={150}
                  defaultValue={modal.product?.name}
                />
              </Field>
              <div className="form-grid">
                <Field label="Categoría">
                  <input
                    name="category"
                    required
                    defaultValue={modal.product?.category}
                    list="categories"
                  />
                  <datalist id="categories">
                    {[...new Set(products.map((p) => p.category))].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </datalist>
                </Field>
                <Field label="Presentación">
                  <input
                    name="presentation"
                    required
                    defaultValue={modal.product?.presentation}
                  />
                </Field>
                <Field label="Precio unitario (S/) ">
                  <input
                    name="price"
                    type="number"
                    required
                    min="0.01"
                    max="100000"
                    step="0.01"
                    defaultValue={
                      modal.product ? modal.product.price / 100 : ""
                    }
                  />
                </Field>
                <Field label="Stock mínimo">
                  <input
                    name="minimum"
                    type="number"
                    required
                    min="0"
                    step="1"
                    defaultValue={modal.product?.minimum ?? 10}
                  />
                </Field>
              </div>
              <p className="hint">
                Registra las existencias y sus lotes desde el módulo Almacén.
              </p>
              <button disabled={busy}>
                {busy ? "Guardando…" : "Guardar medicamento"}
              </button>
            </form>
          )}
          {modal.type === "stock" && (
            <StockForm
              products={products}
              batches={batches}
              busy={busy}
              submit={(b) =>
                action(
                  () => api("/stock", "POST", b),
                  "Movimiento registrado. Existencias actualizadas.",
                )
              }
            />
          )}
          {modal.type === "user" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action(
                  () =>
                    api(
                      "/users",
                      "POST",
                      Object.fromEntries(new FormData(e.currentTarget)),
                    ),
                  "Usuario creado.",
                );
              }}
            >
              <Field label="Nombre completo">
                <input name="name" required />
              </Field>
              <Field label="Correo">
                <input name="email" type="email" required />
              </Field>
              <Field label="Contraseña (mínimo 10 caracteres)">
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Rol">
                <select name="role">
                  <option value="worker">Trabajador</option>
                  <option value="admin">Administrador</option>
                </select>
              </Field>
              <button disabled={busy}>Crear usuario</button>
            </form>
          )}
          {modal.type === "sale" && (
            <>
              <Field label="Cliente">
                <input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Cliente general"
                  maxLength={150}
                />
              </Field>
              <Field label="Agregar medicamento">
                <select
                  value=""
                  onChange={(e) => {
                    const p = products.find(
                      (x) => x.id === Number(e.target.value),
                    );
                    if (p)
                      setCart((c) =>
                        c.some((x) => x.product_id === p.id)
                          ? c.map((x) =>
                              x.product_id === p.id
                                ? {
                                    ...x,
                                    quantity: Math.min(
                                      x.quantity + 1,
                                      p.available,
                                    ),
                                  }
                                : x,
                            )
                          : [...c, { product_id: p.id, quantity: 1 }],
                      );
                  }}
                >
                  <option value="">Selecciona un medicamento…</option>
                  {products
                    .filter((p) => p.available > 0)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {money(p.price)} · {p.available} disponibles
                      </option>
                    ))}
                </select>
              </Field>
              {cart.length ? (
                <Table heads={["Producto", "Cantidad", "Subtotal", ""]}>
                  {cart.map((item) => {
                    const p = products.find((x) => x.id === item.product_id);
                    if (!p) return null;
                    return (
                      <tr key={p.id}>
                        <td>
                          {p.name}
                          <small>{money(p.price)} / unidad</small>
                        </td>
                        <td>
                          <input
                            className="qty"
                            aria-label={"Cantidad de " + p.name}
                            type="number"
                            min="1"
                            max={p.available}
                            value={item.quantity}
                            onChange={(e) =>
                              setCart((c) =>
                                c.map((x) =>
                                  x.product_id === p.id
                                    ? { ...x, quantity: Number(e.target.value) }
                                    : x,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>{money(item.quantity * p.price)}</td>
                        <td>
                          <button
                            className="icon-btn"
                            aria-label={"Quitar " + p.name}
                            onClick={() =>
                              setCart((c) =>
                                c.filter((x) => x.product_id !== p.id),
                              )
                            }
                          >
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              ) : (
                <Empty text="Agrega medicamentos a la venta." />
              )}
              <div className="sale-total">
                <span>Total a pagar</span>
                <strong>
                  {money(
                    cart.reduce(
                      (s, x) =>
                        s +
                        x.quantity *
                          (products.find((p) => p.id === x.product_id)?.price ||
                            0),
                      0,
                    ),
                  )}
                </strong>
              </div>
              <p className="hint">
                Se usarán primero los lotes que vencen antes. Los lotes vencidos
                no se venden.
              </p>
              <button
                className="full"
                disabled={
                  busy ||
                  !cart.length ||
                  cart.some(
                    (x) => !Number.isInteger(x.quantity) || x.quantity < 1,
                  )
                }
                onClick={() =>
                  action(async () => {
                    const sale = await api("/sales", "POST", {
                      customer,
                      items: cart,
                    });
                    setCart([]);
                    setCustomer("");
                    setNotice(
                      "Venta V-" +
                        String(sale.id).padStart(6, "0") +
                        " registrada. Total: " +
                        money(sale.total),
                    );
                  }, "Venta registrada. Existencias actualizadas.")
                }
              >
                {busy ? "Registrando…" : "Confirmar venta"}
              </button>
            </>
          )}
          {modal.type === "detail" && (
            <>
              <p>
                <strong>V-{String(modal.sale.id).padStart(6, "0")}</strong> ·{" "}
                {day(modal.sale.created_at)}
              </p>
              <p>Cliente: {modal.sale.customer}</p>
              <Table heads={["Medicamento", "Cantidad", "Precio", "Subtotal"]}>
                {modal.sale.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{i.quantity}</td>
                    <td>{money(i.price)}</td>
                    <td>{money(i.price * i.quantity)}</td>
                  </tr>
                ))}
              </Table>
              <div className="sale-total">
                <span>Total</span>
                <strong>{money(modal.sale.total)}</strong>
              </div>
              <p className="hint">
                Registro interno de venta. No sustituye un comprobante
                tributario.
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function StockForm({ products, batches, busy, submit }) {
  const [type, setType] = useState("entrada");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <Field label="Tipo de movimiento">
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="entrada">Entrada de mercadería</option>
          <option value="salida">Salida de mercadería</option>
          <option value="ajuste">Ajuste de inventario</option>
        </select>
      </Field>
      {type === "entrada" ? (
        <>
          <Field label="Medicamento">
            <select name="product_id" required>
              <option value="">Seleccionar…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Código del lote">
              <input name="code" required maxLength={150} />
            </Field>
            <Field label="Vencimiento">
              <input
                name="expiry"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>
          </div>
        </>
      ) : (
        <Field label="Lote">
          <select name="batch_id" required>
            <option value="">Seleccionar…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.code} · {b.quantity} unidades
              </option>
            ))}
          </select>
        </Field>
      )}
      {type === "ajuste" && (
        <Field label="Dirección del ajuste">
          <select name="direction">
            <option value="decrease">Disminuir existencias</option>
            <option value="increase">Aumentar existencias</option>
          </select>
        </Field>
      )}
      <Field label="Cantidad de unidades">
        <input name="quantity" type="number" min="1" step="1" required />
      </Field>
      <Field label="Motivo o referencia">
        <textarea
          name="reason"
          rows="2"
          required
          maxLength={150}
          placeholder="Ej. Compra a proveedor, retiro por vencimiento…"
        />
      </Field>
      <button disabled={busy}>
        {busy ? "Registrando…" : "Registrar movimiento"}
      </button>
    </form>
  );
}
createRoot(document.getElementById("root")).render(<App />);

import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { adminEmail, verify, hash, transaction } from "./db.js";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const integer = (v, min = 0) => {
  if (!Number.isSafeInteger(Number(v)) || Number(v) < min)
    fail("Cantidad inválida.");
  return Number(v);
};
const text = (v, label, max = 150) => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    fail(`${label}: valor obligatorio o demasiado largo.`);
  return v.trim();
};
const date = (v) => {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail("Fecha inválida.");
  return v;
};
const today = () => new Date().toISOString().slice(0, 10);
export function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "100kb" }));
  app.post(
    "/api/auth/login",
    rateLimit({ windowMs: 900000, limit: 30 }),
    (req, res) => {
      const { username, password } = req.body ?? {};
      if (
        username !== "admin" ||
        typeof password !== "string" ||
        password.length > 200
      )
        fail("Usuario o contraseña incorrectos.", 401);
      const u = db
        .prepare("SELECT * FROM users WHERE email=? AND role='admin'")
        .get(adminEmail);
      if (!u || !verify(password, u.password))
        fail("Usuario o contraseña incorrectos.", 401);
      const token = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        token,
        u.id,
        Date.now() + 8 * 3600000,
      );
      res.cookie("fp_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 3600000,
      });
      res.json({ id: u.id, name: u.name, role: u.role, email: u.email });
    },
  );
  app.use("/api", (req, res, next) => {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("fp_session="))
      ?.slice(11);
    const u = db
      .prepare(
        "SELECT u.id,u.name,u.role,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=? AND expires>?",
      )
      .get(token || "", Date.now());
    if (!u)
      return res.status(401).json({ error: "Inicia sesión para continuar." });
    req.user = u;
    req.token = token;
    if (!["GET", "HEAD"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== `${req.protocol}://${req.headers.host}`)
        return res.status(403).json({ error: "Origen no permitido." });
    }
    next();
  });
  const admin = (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : res
          .status(403)
          .json({ error: "Esta función requiere un administrador." });
  app.get("/api/auth/me", (req, res) => res.json(req.user));
  app.post("/api/auth/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(req.token);
    res.clearCookie("fp_session");
    res.json({ ok: true });
  });
  const products = () =>
    db
      .prepare(
        `SELECT p.*,COALESCE(SUM(b.quantity),0) stock,COALESCE(SUM(CASE WHEN b.expiry>=date('now') THEN b.quantity ELSE 0 END),0) available,MIN(CASE WHEN b.quantity>0 THEN b.expiry END) expiry FROM products p LEFT JOIN batches b ON b.product_id=p.id GROUP BY p.id ORDER BY p.name`,
      )
      .all();
  app.get("/api/products", (req, res) => res.json(products()));
  app.get("/api/batches", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT b.*,p.name FROM batches b JOIN products p ON p.id=b.product_id ORDER BY b.expiry",
        )
        .all(),
    ),
  );
  function productInput(b) {
    const price = Number(b.price);
    if (!Number.isFinite(price) || price <= 0 || price > 100000)
      fail("Precio inválido.");
    return [
      text(b.name, "Nombre"),
      text(b.category, "Categoría"),
      text(b.presentation, "Presentación"),
      Math.round(price * 100),
      integer(b.minimum),
    ];
  }
  app.post("/api/products", admin, (req, res) => {
    const id = db
      .prepare(
        "INSERT INTO products(name,category,presentation,price,minimum) VALUES(?,?,?,?,?)",
      )
      .run(...productInput(req.body)).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });
  app.put("/api/products/:id", admin, (req, res) => {
    const r = db
      .prepare(
        "UPDATE products SET name=?,category=?,presentation=?,price=?,minimum=? WHERE id=?",
      )
      .run(...productInput(req.body), integer(req.params.id, 1));
    if (!r.changes) fail("Medicamento no encontrado.", 404);
    res.json({ ok: true });
  });
  app.post("/api/stock", admin, (req, res) => {
    const b = req.body;
    const qty = integer(b.quantity, 1);
    const reason = text(b.reason, "Motivo");
    if (!["entrada", "salida", "ajuste"].includes(b.type))
      fail("Tipo inválido.");
    if (b.type === "ajuste" && !["increase", "decrease"].includes(b.direction))
      fail("Selecciona la dirección del ajuste.");
    transaction(db, () => {
      let batch;
      if (b.type === "entrada") {
        const pid = integer(b.product_id, 1);
        if (!db.prepare("SELECT id FROM products WHERE id=?").get(pid))
          fail("Medicamento no encontrado.");
        const code = text(b.code, "Lote");
        const expiry = date(b.expiry);
        if (expiry < today()) fail("No se permite ingresar un lote vencido.");
        batch = db
          .prepare("SELECT * FROM batches WHERE product_id=? AND code=?")
          .get(pid, code);
        if (batch && batch.expiry !== expiry)
          fail("El lote ya existe con otra fecha.");
        if (!batch) {
          const id = db
            .prepare(
              "INSERT INTO batches(product_id,code,expiry,quantity) VALUES(?,?,?,0)",
            )
            .run(pid, code, expiry).lastInsertRowid;
          batch = db.prepare("SELECT * FROM batches WHERE id=?").get(id);
        }
      } else
        batch = db
          .prepare("SELECT * FROM batches WHERE id=?")
          .get(integer(b.batch_id, 1));
      if (!batch) fail("Lote no encontrado.");
      const delta =
        b.type === "entrada"
          ? qty
          : b.type === "salida"
            ? -qty
            : b.direction === "increase"
              ? qty
              : -qty;
      if (batch.quantity + delta < 0)
        fail("El lote no tiene existencias suficientes.");
      db.prepare("UPDATE batches SET quantity=quantity+? WHERE id=?").run(
        delta,
        batch.id,
      );
      db.prepare(
        "INSERT INTO movements(batch_id,user_id,type,quantity,reason) VALUES(?,?,?,?,?)",
      ).run(batch.id, req.user.id, b.type, delta, reason);
    });
    res.status(201).json({ ok: true });
  });
  app.post("/api/sales", (req, res) => {
    const items = req.body.items;
    if (!Array.isArray(items) || !items.length || items.length > 100)
      fail("Agrega entre 1 y 100 productos.");
    const customer = text(req.body.customer || "Cliente general", "Cliente");
    const result = transaction(db, () => {
      const combined = new Map();
      for (const x of items) {
        const id = integer(x.product_id, 1);
        combined.set(id, (combined.get(id) || 0) + integer(x.quantity, 1));
      }
      let total = 0;
      const lines = [];
      for (const [id, quantity] of combined) {
        const p = db.prepare("SELECT * FROM products WHERE id=?").get(id);
        if (!p) fail("Medicamento no encontrado.");
        const batches = db
          .prepare(
            "SELECT * FROM batches WHERE product_id=? AND expiry>=? AND quantity>0 ORDER BY expiry,id",
          )
          .all(id, today());
        if (batches.reduce((s, x) => s + x.quantity, 0) < quantity)
          fail(`Stock insuficiente para ${p.name}.`);
        total += p.price * quantity;
        lines.push({ p, quantity, batches });
      }
      const id = Number(
        db
          .prepare("INSERT INTO sales(user_id,customer,total) VALUES(?,?,?)")
          .run(req.user.id, customer, total).lastInsertRowid,
      );
      for (const { p, quantity, batches } of lines) {
        db.prepare(
          "INSERT INTO sale_items(sale_id,product_id,quantity,price) VALUES(?,?,?,?)",
        ).run(id, p.id, quantity, p.price);
        let remaining = quantity;
        for (const b of batches) {
          const n = Math.min(b.quantity, remaining);
          if (!n) break;
          db.prepare("UPDATE batches SET quantity=quantity-? WHERE id=?").run(
            n,
            b.id,
          );
          db.prepare(
            "INSERT INTO movements(batch_id,user_id,type,quantity,reason,sale_id) VALUES(?,?,'venta',?,'Venta de medicamentos',?)",
          ).run(b.id, req.user.id, -n, id);
          remaining -= n;
        }
      }
      return { id, total };
    });
    res.status(201).json(result);
  });
  function range(req) {
    const from = req.query.from ? date(req.query.from) : "1900-01-01";
    const to = req.query.to ? date(req.query.to) : "2999-12-31";
    if (from > to) fail("La fecha inicial supera la final.");
    return [from, to];
  }
  app.get("/api/sales", (req, res) => {
    const r = range(req);
    res.json(
      db
        .prepare(
          "SELECT s.*,u.name user_name FROM sales s JOIN users u ON u.id=s.user_id WHERE substr(created_at,1,10) BETWEEN ? AND ? ORDER BY s.id DESC",
        )
        .all(...r),
    );
  });
  app.get("/api/sales/:id", (req, res) => {
    const sale = db
      .prepare("SELECT * FROM sales WHERE id=?")
      .get(integer(req.params.id, 1));
    if (!sale) fail("Venta no encontrada.", 404);
    res.json({
      ...sale,
      items: db
        .prepare(
          "SELECT i.*,p.name FROM sale_items i JOIN products p ON p.id=i.product_id WHERE sale_id=?",
        )
        .all(sale.id),
    });
  });
  const movements = (r) =>
    db
      .prepare(
        "SELECT m.*,b.code,p.name,u.name user_name FROM movements m JOIN batches b ON b.id=m.batch_id JOIN products p ON p.id=b.product_id JOIN users u ON u.id=m.user_id WHERE substr(m.created_at,1,10) BETWEEN ? AND ? ORDER BY m.id DESC",
      )
      .all(...r);
  app.get("/api/movements", (req, res) => res.json(movements(range(req))));
  app.get("/api/reports", (req, res) => {
    const r = range(req);
    res.json({
      daily: db
        .prepare(
          "SELECT substr(created_at,1,10) day,SUM(total) total,COUNT(*) count FROM sales WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY day ORDER BY day",
        )
        .all(...r),
      top: db
        .prepare(
          "SELECT p.name,SUM(i.quantity) quantity,SUM(i.quantity*i.price) total FROM sale_items i JOIN products p ON p.id=i.product_id JOIN sales s ON s.id=i.sale_id WHERE substr(s.created_at,1,10) BETWEEN ? AND ? GROUP BY p.id ORDER BY quantity DESC LIMIT 10",
        )
        .all(...r),
      movements: db
        .prepare(
          "SELECT type,SUM(quantity) quantity,COUNT(*) count FROM movements WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY type",
        )
        .all(...r),
    });
  });
  app.get("/api/dashboard", (req, res) => {
    const ps = products();
    res.json({
      products: ps.length,
      low: ps.filter((p) => p.available < p.minimum),
      expiring: db
        .prepare(
          "SELECT b.*,p.name FROM batches b JOIN products p ON p.id=b.product_id WHERE quantity>0 AND expiry<=date('now','+90 days') ORDER BY expiry",
        )
        .all(),
      sales: db
        .prepare(
          "SELECT COUNT(*) count,COALESCE(SUM(total),0) total FROM sales",
        )
        .get(),
      recent: movements(["1900-01-01", "2999-12-31"]).slice(0, 6),
      daily: db
        .prepare(
          "SELECT substr(created_at,1,10) day,SUM(total) total FROM sales WHERE created_at>=date('now','-6 days') GROUP BY day ORDER BY day",
        )
        .all(),
    });
  });
  app.get("/api/users", admin, (req, res) =>
    res.json(db.prepare("SELECT id,name,email,role FROM users").all()),
  );
  app.post("/api/users", admin, (req, res) => {
    const b = req.body;
    const email = text(b.email, "Correo").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Correo inválido.");
    const password = text(b.password, "Contraseña", 200);
    if (password.length < 10)
      fail("La contraseña requiere al menos 10 caracteres.");
    if (!["admin", "worker"].includes(b.role)) fail("Rol inválido.");
    if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
      fail("El correo ya existe.");
    const id = db
      .prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)")
      .run(
        text(b.name, "Nombre"),
        email,
        hash(password),
        b.role,
      ).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Ruta no encontrada." }),
  );
  const dist = resolve(import.meta.dirname, "../../frontend/dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (req, res) =>
      res.sendFile(resolve(dist, "index.html")),
    );
  }
  app.use((err, req, res, next) => {
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({
      error: err.status
        ? err.message
        : "No se pudo procesar la operación. Revisa los datos e inténtalo de nuevo.",
    });
  });
  return app;
}

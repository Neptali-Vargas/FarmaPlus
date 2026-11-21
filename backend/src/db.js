import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
export const adminEmail = "admin@farmaplus.pe";
const adminPassword = "admin123";
export function hash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verify(password, stored) {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    scryptSync(password, salt, 64),
  );
}
export function openDatabase(
  file = process.env.DB_PATH || resolve("data/farmaplus.sqlite"),
) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','worker')));
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,presentation TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),minimum INTEGER NOT NULL CHECK(minimum>=0),active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS batches(id INTEGER PRIMARY KEY,product_id INTEGER NOT NULL REFERENCES products(id),code TEXT NOT NULL,expiry TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>=0),UNIQUE(product_id,code));
 CREATE TABLE IF NOT EXISTS sales(id INTEGER PRIMARY KEY,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),user_id INTEGER NOT NULL REFERENCES users(id),customer TEXT NOT NULL,total INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sale_items(id INTEGER PRIMARY KEY,sale_id INTEGER REFERENCES sales(id),product_id INTEGER REFERENCES products(id),quantity INTEGER NOT NULL,price INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),batch_id INTEGER NOT NULL REFERENCES batches(id),user_id INTEGER NOT NULL REFERENCES users(id),type TEXT NOT NULL,quantity INTEGER NOT NULL,reason TEXT NOT NULL,sale_id INTEGER REFERENCES sales(id));`);
  if (!db.prepare("SELECT id FROM users LIMIT 1").get())
    transaction(db, () => {
      db.prepare(
        "INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)",
      ).run("Administrador", adminEmail, hash(adminPassword), "admin");
      db.prepare(
        "INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)",
      ).run(
        "María Torres",
        "trabajador@farmaplus.pe",
        hash(randomBytes(32).toString("hex")),
        "worker",
      );
      const rows = [
        ["Paracetamol 500 mg", "Analgésicos", "Tableta", 150, 30, 120],
        ["Ibuprofeno 400 mg", "Antiinflamatorios", "Cápsula", 200, 20, 65],
        ["Loratadina 10 mg", "Antialérgicos", "Tableta", 180, 20, 12],
        ["Amoxicilina 500 mg", "Antibióticos", "Cápsula", 250, 25, 80],
        ["Omeprazol 20 mg", "Digestivos", "Cápsula", 160, 20, 18],
        [
          "Alcohol medicinal 70°",
          "Cuidado personal",
          "Frasco 120 ml",
          650,
          10,
          40,
        ],
        ["Vitamina C 1 g", "Vitaminas", "Tableta efervescente", 300, 15, 52],
        ["Suero oral", "Rehidratación", "Frasco 500 ml", 850, 12, 30],
      ];
      rows.forEach((r, i) => {
        const q = r.pop();
        const id = db
          .prepare(
            "INSERT INTO products(name,category,presentation,price,minimum) VALUES(?,?,?,?,?)",
          )
          .run(...r).lastInsertRowid;
        const expiry = new Date(
          Date.now() + (i === 2 ? 25 : 365 + i * 30) * 86400000,
        )
          .toISOString()
          .slice(0, 10);
        const b = db
          .prepare(
            "INSERT INTO batches(product_id,code,expiry,quantity) VALUES(?,?,?,?)",
          )
          .run(id, "FP-2026-" + (i + 1), expiry, q).lastInsertRowid;
        db.prepare(
          "INSERT INTO movements(created_at,batch_id,user_id,type,quantity,reason) VALUES(strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days'),?,1,?,?,?)",
        ).run(b, "entrada", q, "Inventario inicial");
      });
      // Example sales are persisted through the same stock and movement records.
      for (let days = 6; days >= 0; days--) {
        const created = new Date(Date.now() - days * 86400000).toISOString();
        const lines = [
          { id: 1, quantity: 2 + (days % 3) },
          { id: 2, quantity: 1 + (days % 2) },
          { id: 6, quantity: 1 },
        ];
        const total = lines.reduce(
          (sum, x) =>
            sum +
            db.prepare("SELECT price FROM products WHERE id=?").get(x.id)
              .price *
              x.quantity,
          0,
        );
        const sale = db
          .prepare(
            "INSERT INTO sales(created_at,user_id,customer,total) VALUES(?,2,?,?)",
          )
          .run(created, "Cliente general", total).lastInsertRowid;
        for (const line of lines) {
          const p = db
            .prepare("SELECT price FROM products WHERE id=?")
            .get(line.id);
          const b = db
            .prepare("SELECT id FROM batches WHERE product_id=?")
            .get(line.id);
          db.prepare(
            "INSERT INTO sale_items(sale_id,product_id,quantity,price) VALUES(?,?,?,?)",
          ).run(sale, line.id, line.quantity, p.price);
          db.prepare("UPDATE batches SET quantity=quantity-? WHERE id=?").run(
            line.quantity,
            b.id,
          );
          db.prepare(
            "INSERT INTO movements(created_at,batch_id,user_id,type,quantity,reason,sale_id) VALUES(?,?,2,'venta',?,'Venta de ejemplo',?)",
          ).run(created, b.id, -line.quantity, sale);
        }
      }
    });
  else {
    // Actualiza la cuenta original sin perder sus sesiones ni su historial.
    const admin = db
      .prepare("SELECT id,password FROM users WHERE email=? AND role='admin'")
      .get(adminEmail);
    if (admin && !verify(adminPassword, admin.password))
      db.prepare("UPDATE users SET password=? WHERE id=?").run(
        hash(adminPassword),
        admin.id,
      );
  }
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

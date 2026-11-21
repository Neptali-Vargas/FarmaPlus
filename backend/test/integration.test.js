import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash, openDatabase, verify } from "../src/db.js";
import { createApp } from "../src/app.js";
test("Operaciones reales, seguridad, transacciones y persistencia", async () => {
  const dir = mkdtempSync(join(tmpdir(), "farmaplus-test-"));
  const file = join(dir, "test.sqlite");
  const db = openDatabase(file);
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  async function request(path, method = "GET", body, override) {
    const response = await fetch(url + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: override ?? cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  try {
    assert.equal((await request("/products")).status, 401);
    for (const credentials of [
      { username: "admin", password: "incorrecta" },
      { username: "admin", password: "FarmaPlus2026!" },
      { username: "admin", password: "admin123 " },
      { username: "trabajador", password: "admin123" },
      { email: "admin@farmaplus.pe", password: "FarmaPlus2026!" },
      { email: "trabajador@farmaplus.pe", password: "FarmaPlus2026!" },
    ]) {
      const denied = await request("/auth/login", "POST", credentials);
      assert.equal(denied.status, 401);
      assert.equal(denied.cookie, undefined);
    }
    const login = await request("/auth/login", "POST", {
      username: "admin",
      password: "admin123",
    });
    assert.equal(login.status, 200);
    cookie = login.cookie;
    assert.equal((await request("/auth/me")).body.role, "admin");
    // Simula una sesión de trabajador abierta antes del cambio de acceso.
    db.prepare(
      "INSERT INTO sessions SELECT ?,id,? FROM users WHERE email=?",
    ).run("test-worker", Date.now() + 60000, "trabajador@farmaplus.pe");
    const workerCookie = "fp_session=test-worker";
    assert.equal(
      (await request("/products", "POST", { name: "Prohibido" }, workerCookie))
        .status,
      403,
    );
    assert.equal(
      (
        await request("/products", "POST", {
          name: "Test",
          category: "Test",
          presentation: "Caja",
          price: -1,
          minimum: 1,
        })
      ).status,
      400,
    );
    const p = await request("/products", "POST", {
      name: "Medicamento de prueba",
      category: "Pruebas",
      presentation: "Tableta",
      price: 1.25,
      minimum: 5,
    });
    assert.equal(p.status, 201);
    const id = p.body.id;
    const expiry = new Date(Date.now() + 40 * 86400000)
      .toISOString()
      .slice(0, 10);
    assert.equal(
      (
        await request("/stock", "POST", {
          type: "entrada",
          product_id: id,
          code: "TEST-A",
          expiry,
          quantity: 10,
          reason: "Prueba de ingreso",
        })
      ).status,
      201,
    );
    let products = (await request("/products")).body;
    assert.equal(products.find((p) => p.id === id).available, 10);
    const sale = await request(
      "/sales",
      "POST",
      { customer: "Prueba", items: [{ product_id: id, quantity: 3 }] },
      workerCookie,
    );
    assert.equal(sale.status, 201);
    assert.equal(sale.body.total, 375);
    assert.equal(
      (await request("/sales/" + sale.body.id)).body.items[0].quantity,
      3,
    );
    products = (await request("/products")).body;
    assert.equal(products.find((p) => p.id === id).stock, 7);
    const before = db.prepare("SELECT COUNT(*) n FROM sales").get().n;
    const other = products.find((p) => p.id !== id && p.available > 0);
    assert.equal(
      (
        await request("/sales", "POST", {
          items: [
            { product_id: other.id, quantity: 1 },
            { product_id: id, quantity: 999 },
          ],
        })
      ).status,
      400,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sales").get().n, before);
    assert.equal(
      (await request("/products")).body.find((p) => p.id === other.id).stock,
      other.stock,
    );
    assert.equal(
      (
        await request("/sales", "POST", {
          items: [
            { product_id: id, quantity: 4 },
            { product_id: id, quantity: 4 },
          ],
        })
      ).status,
      400,
    );
    db.prepare(
      "INSERT INTO batches(product_id,code,expiry,quantity) VALUES(?,'EXPIRED','2020-01-01',100)",
    ).run(id);
    assert.equal(
      (
        await request("/sales", "POST", {
          items: [{ product_id: id, quantity: 8 }],
        })
      ).status,
      400,
    );
    const b = (await request("/batches")).body.find((b) => b.code === "TEST-A");
    assert.equal(
      (
        await request("/stock", "POST", {
          type: "salida",
          batch_id: b.id,
          quantity: 2,
          reason: "Retiro",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await request("/stock", "POST", {
          type: "ajuste",
          batch_id: b.id,
          quantity: 1,
          direction: "increase",
          reason: "Conteo físico",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await request("/stock", "POST", {
          type: "salida",
          batch_id: b.id,
          quantity: 999,
          reason: "Retiro excesivo",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/stock", "POST", {
          type: "entrada",
          product_id: id,
          code: "INVALID",
          expiry: "2026-02-31",
          quantity: 1,
          reason: "Fecha inválida",
        })
      ).status,
      400,
    );
    assert.equal(
      (await request("/sales?from=2026-12-31&to=2026-01-01")).status,
      400,
    );
    assert.ok(
      (await request("/dashboard")).body.expiring.some(
        (x) => x.code === "EXPIRED",
      ),
    );
    assert.ok(
      (await request("/reports")).body.top.some(
        (x) => x.name === "Medicamento de prueba" && x.quantity === 3,
      ),
    );
    assert.ok(
      (await request("/movements")).body.some(
        (x) => x.sale_id === sale.body.id && x.quantity === -3,
      ),
    );
    // Two requests compete for six available units; only one can sell four.
    const concurrent = await Promise.all([
      request("/sales", "POST", { items: [{ product_id: id, quantity: 4 }] }),
      request("/sales", "POST", { items: [{ product_id: id, quantity: 4 }] }),
    ]);
    assert.deepEqual(concurrent.map((x) => x.status).sort(), [201, 400]);
    assert.equal(
      (
        await request("/users", "POST", {
          name: "Nuevo trabajador",
          email: "nuevo@farmaplus.pe",
          password: "ContraseñaSegura123",
          role: "worker",
        })
      ).status,
      201,
    );
    assert.equal(
      (await request("/users", "GET", undefined, workerCookie)).status,
      403,
    );
    assert.equal((await request("/auth/logout", "POST")).status, 200);
    assert.equal((await request("/products")).status, 401);
    await new Promise((r) => server.close(r));
    db.prepare("UPDATE users SET password=? WHERE id=?").run(
      hash("FarmaPlus2026!"),
      login.body.id,
    );
    db.close();
    const reopened = openDatabase(file);
    assert.ok(
      verify(
        "admin123",
        reopened
          .prepare("SELECT password FROM users WHERE id=?")
          .get(login.body.id).password,
      ),
    );
    assert.equal(
      reopened.prepare("SELECT quantity FROM batches WHERE id=?").get(b.id)
        .quantity,
      2,
    );
    assert.equal(
      reopened.prepare("SELECT total FROM sales WHERE id=?").get(sale.body.id)
        .total,
      375,
    );
    reopened.close();
  } finally {
    if (server.listening) await new Promise((r) => server.close(r));
    try {
      db.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

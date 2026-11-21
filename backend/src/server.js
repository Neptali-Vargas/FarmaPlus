import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
const port = Number(process.env.PORT) || 3001;
createApp(openDatabase()).listen(port, "127.0.0.1", () =>
  console.log(`FarmaPlus: http://127.0.0.1:${port}`),
);

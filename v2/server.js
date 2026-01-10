import express from "express";
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());

// ===== CONFIG =====
const MONGO_URL = "mongodb://tracker:9833@127.0.0.1:27017/?authSource=tracker";
const DB_NAME = "tracker";
const COL_NAME = "locations";
const PORT = 9001;

// ===== DB INIT =====
const client = new MongoClient(MONGO_URL);
await client.connect();

const db = client.db(DB_NAME);
const col = db.collection(COL_NAME);

// ===== INDEXES =====

// TTL index — auto-delete after 6 hours
await col.createIndex(
  { ts: 1 },
  { expireAfterSeconds: 6 * 60 * 60 } // ⏱️ 6 hours
);

// Query performance index
await col.createIndex({ deviceId: 1, ts: -1 });

console.log("MongoDB indexes ready");

// ===== ROUTES =====

// Insert a location
app.post("/api/location", async (req, res) => {
  try {
    const { deviceId, lat, lon } = req.body;

    if (!deviceId || lat === undefined || lon === undefined) {
      return res.status(400).json({ error: "deviceId, lat, lon required" });
    }

    const doc = {
      deviceId: String(deviceId),
      lat: Number(lat),
      lon: Number(lon),
      ts: new Date() // IMPORTANT: Date object for TTL
    };

    await col.insertOne(doc);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "insert failed" });
  }
});

// Latest location only
app.get("/api/latest", async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) {
      return res.status(400).json({ error: "deviceId required" });
    }

    const doc = await col.find({ deviceId })
      .sort({ ts: -1 })
      .limit(1)
      .next();

    if (!doc) {
      return res.status(404).json({ error: "no data" });
    }

    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "query failed" });
  }
});

// Trace (all remaining points — TTL keeps it clean)
app.get("/api/track", async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) {
      return res.status(400).json({ error: "deviceId required" });
    }

    const docs = await col.find({ deviceId })
      .sort({ ts: 1 })
      .toArray();

    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "query failed" });
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Tracker server running on http://localhost:${PORT}`);
});

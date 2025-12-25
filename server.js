import express from "express";
import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://tracker:9833@127.0.0.1:27017/?authSource=tracker";
const PORT = process.env.PORT || 9001;

const app = express();
app.use(express.json({ limit: "100kb" }));

const client = new MongoClient(MONGO_URI);
await client.connect();
const col = client.db("tracker").collection("locations");

// POST /api/location
// body: { deviceId, lat, lon, ts? }
app.post("/api/location", async (req, res) => {
  try {
    const { deviceId = "dev1", lat, lon, ts } = req.body ?? {};
    if (typeof lat !== "number" || typeof lon !== "number") {
      return res.status(400).json({ error: "lat/lon must be numbers" });
    }

    const date = ts ? new Date(ts) : new Date();
    if (isNaN(date.getTime())) return res.status(400).json({ error: "invalid ts" });

    await col.insertOne({
      deviceId,
      ts: date,
      loc: { type: "Point", coordinates: [lon, lat] }, // GeoJSON is [lon, lat]
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/latest?deviceId=dev1
app.get("/api/latest", async (req, res) => {
  const deviceId = req.query.deviceId ?? "dev1";
  const doc = await col.find({ deviceId }).sort({ ts: -1 }).limit(1).next();
  if (!doc) return res.status(404).json({ error: "no data" });

  const [lon, lat] = doc.loc.coordinates;
  res.json({ deviceId, ts: doc.ts, lat, lon });
});

// GET /api/track?deviceId=dev1&limit=500
app.get("/api/track", async (req, res) => {
  const deviceId = req.query.deviceId ?? "dev1";
  const limit = Math.min(parseInt(req.query.limit ?? "500", 10) || 500, 5000);

  const docs = await col
    .find({ deviceId })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();

  // return oldest → newest for drawing a line
  const points = docs.reverse().map(d => {
    const [lon, lat] = d.loc.coordinates;
    return { ts: d.ts, lat, lon };
  });

  res.json({ deviceId, points });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
});

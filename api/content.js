const defaults = require("../content-defaults.json");

let cachedClientPromise = null;

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeContent(base, override) {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (!isPlainObject(base)) return override === undefined || override === null ? base : override;
  const next = { ...base };
  if (!isPlainObject(override)) return next;
  for (const key of Object.keys(override)) {
    next[key] = key in base ? mergeContent(base[key], override[key]) : override[key];
  }
  return next;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

async function getCollection() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) return null;

  const { MongoClient } = require("mongodb");
  if (!cachedClientPromise) {
    const client = new MongoClient(uri);
    cachedClientPromise = client.connect();
  }

  const client = await cachedClientPromise;
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || "portfolio_cms";
  const collectionName = process.env.MONGODB_COLLECTION || "content";
  return client.db(dbName).collection(collectionName);
}

function meta(storage, hasSavedContent) {
  return {
    backendConfigured: storage === "mongodb",
    storage,
    hasSavedContent: Boolean(hasSavedContent)
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, PUT, OPTIONS");
    return sendJson(res, 204, {});
  }

  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT, OPTIONS");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const collection = await getCollection();
    const docId = process.env.CMS_DOC_ID || "tunbridge-portfolio-site";

    if (req.method === "GET") {
      if (!collection) {
        return sendJson(res, 200, {
          content: defaults,
          meta: meta("static-defaults", false)
        });
      }

      const saved = await collection.findOne({ _id: docId });
      const content = mergeContent(defaults, saved?.content || {});
      return sendJson(res, 200, {
        content,
        meta: meta("mongodb", Boolean(saved?.content))
      });
    }

    const password = process.env.CMS_PASSWORD;
    if (!password) {
      return sendJson(res, 500, { error: "CMS_PASSWORD is not configured on Vercel." });
    }

    const body = await readBody(req);
    if (body.password !== password) {
      return sendJson(res, 401, { error: "Invalid CMS password." });
    }

    if (!collection) {
      return sendJson(res, 500, { error: "MONGODB_URI is not configured on Vercel." });
    }

    const incoming = body.content;
    if (!isPlainObject(incoming)) {
      return sendJson(res, 400, { error: "Missing CMS content object." });
    }

    const serializedSize = Buffer.byteLength(JSON.stringify(incoming), "utf8");
    if (serializedSize > 4 * 1024 * 1024) {
      return sendJson(res, 413, { error: "CMS content is larger than 4MB." });
    }

    const content = mergeContent(defaults, incoming);
    await collection.updateOne(
      { _id: docId },
      { $set: { content, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    return sendJson(res, 200, {
      content,
      meta: meta("mongodb", true)
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "CMS API failed." });
  }
};

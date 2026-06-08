const crypto = require("crypto");

function getKey() {
  const secret = process.env.JWT_SECRET || process.env.MS_GRAPH_TOKEN_KEY || "change-me-ms-graph-key";
  return crypto.scryptSync(secret, "mtc-ms-graph-v1", 32);
}

function encrypt(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(payload) {
  if (!payload) return null;
  try {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function signOAuthState(userId) {
  const ts = Date.now();
  const payload = `${userId}:${ts}`;
  const sig = crypto.createHmac("sha256", getKey()).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ userId, ts, sig })).toString("base64url");
}

function verifyOAuthState(state) {
  try {
    const { userId, ts, sig } = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    if (!userId || !ts || !sig) return null;
    if (Date.now() - ts > 15 * 60 * 1000) return null;
    const expected = crypto.createHmac("sha256", getKey()).update(`${userId}:${ts}`).digest("hex");
    if (sig !== expected) return null;
    return Number(userId);
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt, signOAuthState, verifyOAuthState };

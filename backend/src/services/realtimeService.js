const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const STAFF_ROLES = ["admin", "executive_staff", "supervisor", "manager", "gm"];

/** @type {import("socket.io").Server | null} */
let io = null;
const staffEmitTimers = new Map();

function userRoom(userId) {
  return `user:${userId}`;
}

function roleRoom(role) {
  return `role:${role}`;
}

function serialize(payload) {
  if (payload && typeof payload.toJSON === "function") {
    return payload.toJSON();
  }
  return payload;
}

function resourcesFromNotificationType(type) {
  const t = String(type || "").toLowerCase();
  if (t === "ticket" || t === "sla" || t === "escalation") return ["tickets", "dashboard"];
  if (t === "visit" || t === "rating") return ["visits", "dashboard"];
  if (t === "lead") return ["leads", "dashboard"];
  if (t === "assignment" || t === "role") return ["corporates", "dashboard", "tickets"];
  if (t === "vehicle") return ["vehicles"];
  if (t === "broadcast") return ["notifications"];
  return ["notifications"];
}

function emitToUser(userId, event, payload) {
  if (!io || userId == null) return;
  io.to(userRoom(userId)).emit(event, serialize(payload));
}

function emitToUsers(userIds, event, payload) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  for (const id of unique) {
    emitToUser(id, event, payload);
  }
}

function emitToStaff(event, payload) {
  if (!io) return;
  const body = serialize(payload);
  for (const role of STAFF_ROLES) {
    io.to(roleRoom(role)).emit(event, body);
  }
}

function broadcastResources(resources, extra = {}) {
  if (!io || !resources?.length) return;
  const unique = [...new Set(resources)];
  const key = unique.slice().sort().join(",");
  const prev = staffEmitTimers.get(key);
  if (prev) clearTimeout(prev);
  staffEmitTimers.set(
    key,
    setTimeout(() => {
      staffEmitTimers.delete(key);
      emitToStaff("data:changed", { resources: unique, ...extra });
    }, 40)
  );
}

function emitNotificationCreated(notification) {
  if (!notification) return;
  const plain = serialize(notification);
  const userId = plain.userId ?? notification.userId;
  const resources = resourcesFromNotificationType(plain.type ?? notification.type);
  emitToUser(userId, "notification:new", plain);
  emitToUser(userId, "data:changed", { resources, notificationType: plain.type });
  broadcastResources(resources);
}

function initRealtime(httpServer, allowedOrigins) {
  const originSet = new Set((allowedOrigins || []).filter(Boolean));

  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const normalized = String(origin).trim().replace(/\/$/, "");
        if (originSet.has(normalized)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (typeof socket.handshake.query?.token === "string" ? socket.handshake.query.token : null);
      if (!token) {
        return next(new Error("No token provided"));
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.userId);
      if (!user) {
        return next(new Error("User not found"));
      }
      socket.data.userId = user.id;
      socket.data.role = user.role;
      return next();
    } catch {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    const role = socket.data.role;
    if (userId) socket.join(userRoom(userId));
    if (role) socket.join(roleRoom(role));
  });

  return io;
}

module.exports = {
  initRealtime,
  emitToUser,
  emitToUsers,
  emitToStaff,
  broadcastResources,
  emitNotificationCreated,
  resourcesFromNotificationType,
};

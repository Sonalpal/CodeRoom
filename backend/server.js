import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { YSocketIO } from "y-socket.io/dist/server";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*", // fine for a demo; restrict to your site URL later
    methods: ["GET", "POST"],
  },
});

const ySocketio = new YSocketIO(io);
ySocketio.initialize();

// ---------- Rooms + unique usernames (per room) ----------
const ROOM_REGEX = /^[a-z0-9-]{1,32}$/;

// socket.id -> { room, key }. Removed when that socket disconnects.
const activeUsers = new Map();

io.on("connection", (socket) => {
  socket.on("join", (payload, callback) => {
    if (typeof callback !== "function") return;

    const name =
      typeof payload?.username === "string" ? payload.username.trim() : "";
    const room =
      typeof payload?.room === "string" ? payload.room.trim().toLowerCase() : "";

    if (!name || name.length > 20) {
      return callback({ ok: false, error: "Username must be 1-20 characters" });
    }

    if (!ROOM_REGEX.test(room)) {
      return callback({
        ok: false,
        error: "Room code can only use letters, numbers and dashes",
      });
    }

    const key = name.toLowerCase(); // "Sonal" and "sonal" count as the same name
    const taken = [...activeUsers.entries()].some(
      ([id, user]) => id !== socket.id && user.room === room && user.key === key,
    );

    if (taken) {
      return callback({
        ok: false,
        error: "That username is already taken in this room",
      });
    }

    activeUsers.set(socket.id, { room, key });
    callback({ ok: true });
  });

  socket.on("disconnect", () => {
    activeUsers.delete(socket.id);
  });
});
// ---------------------------------------------------------

// Health check (used by Render / AWS load balancer)
app.get("/health", (req, res) => {
  res.status(200).json({
    message: "ok",
    success: true,
  });
});

// Serve the built React app (copied into backend/public)
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
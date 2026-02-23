import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import db from "./db.ts";
import { v4 as uuidv4 } from "uuid";

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/trips/:id", (req, res) => {
    const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    
    const itinerary = db.prepare("SELECT * FROM itinerary WHERE trip_id = ? ORDER BY start_time ASC").all(req.params.id);
    const expenses = db.prepare("SELECT * FROM expenses WHERE trip_id = ? ORDER BY date ASC").all(req.params.id);
    const documents = db.prepare("SELECT * FROM documents WHERE trip_id = ?").all(req.params.id);

    res.json({ ...trip, itinerary, expenses, documents });
  });

  app.post("/api/trips", (req, res) => {
    const { name, destination, start_date, end_date } = req.body;
    const id = uuidv4();
    db.prepare("INSERT INTO trips (id, name, destination, start_date, end_date) VALUES (?, ?, ?, ?, ?)")
      .run(id, name, destination, start_date, end_date);
    res.json({ id, name, destination, start_date, end_date });
  });

  // WebSocket for Real-time Collaboration
  const rooms = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const tripId = url.searchParams.get("tripId");

    if (!tripId) {
      ws.close();
      return;
    }

    if (!rooms.has(tripId)) {
      rooms.set(tripId, new Set());
    }
    rooms.get(tripId)!.add(ws);

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      const { type, payload } = message;

      // Handle updates and broadcast
      try {
        switch (type) {
          case "ADD_ITINERARY": {
            const id = uuidv4();
            db.prepare("INSERT INTO itinerary (id, trip_id, type, title, description, location, start_time, end_time, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
              .run(id, tripId, payload.type, payload.title, payload.description, payload.location, payload.start_time, payload.end_time, payload.photo_url);
            broadcast(tripId, { type: "ITINERARY_ADDED", payload: { ...payload, id } });
            break;
          }
          case "UPDATE_ITINERARY_PHOTO": {
            db.prepare("UPDATE itinerary SET photo_url = ? WHERE id = ?").run(payload.photo_url, payload.id);
            broadcast(tripId, { type: "ITINERARY_PHOTO_UPDATED", payload: { id: payload.id, photo_url: payload.photo_url } });
            break;
          }
          case "DELETE_ITINERARY": {
            db.prepare("DELETE FROM itinerary WHERE id = ?").run(payload.id);
            broadcast(tripId, { type: "ITINERARY_DELETED", payload: { id: payload.id } });
            break;
          }
          case "ADD_EXPENSE": {
            const id = uuidv4();
            db.prepare("INSERT INTO expenses (id, trip_id, description, amount, currency, category, date) VALUES (?, ?, ?, ?, ?, ?, ?)")
              .run(id, tripId, payload.description, payload.amount, payload.currency, payload.category, payload.date);
            broadcast(tripId, { type: "EXPENSE_ADDED", payload: { ...payload, id } });
            break;
          }
          case "DELETE_EXPENSE": {
            db.prepare("DELETE FROM expenses WHERE id = ?").run(payload.id);
            broadcast(tripId, { type: "EXPENSE_DELETED", payload: { id: payload.id } });
            break;
          }
        }
      } catch (err) {
        console.error("DB Error:", err);
      }
    });

    ws.on("close", () => {
      rooms.get(tripId)?.delete(ws);
      if (rooms.get(tripId)?.size === 0) {
        rooms.delete(tripId);
      }
    });
  });

  function broadcast(tripId: string, message: any) {
    const clients = rooms.get(tripId);
    if (clients) {
      const data = JSON.stringify(message);
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

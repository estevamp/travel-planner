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
      try {
        const message = JSON.parse(data.toString());
        const { type, payload } = message;
        console.log(`Received message: ${type} for trip: ${tripId}`);

        switch (type) {
          case "ADD_ITINERARY": {
            const id = uuidv4();
            const amount = Number(payload.amount) || 0;
            const startTime = payload.start_time || new Date().toISOString();
            const endTime = payload.end_time || new Date().toISOString();
            db.prepare("INSERT INTO itinerary (id, trip_id, type, title, description, location, start_time, end_time, amount, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
              .run(id, tripId, payload.type || 'activity', payload.title || 'Untitled', payload.description || '', payload.location || '', startTime, endTime, amount, payload.photo_url || null);

            if (amount > 0) {
              const expenseId = uuidv4();
              const expensePayload = {
                id: expenseId,
                description: payload.title || "Item do itinerário",
                amount,
                currency: "BRL",
                category: "itinerary",
                date: new Date().toISOString().split("T")[0],
              };
              db.prepare("INSERT INTO expenses (id, trip_id, description, amount, currency, category, date) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .run(expenseId, tripId, expensePayload.description, expensePayload.amount, expensePayload.currency, expensePayload.category, expensePayload.date);
              broadcast(tripId, { type: "EXPENSE_ADDED", payload: expensePayload });
            }

            broadcast(tripId, {
              type: "ITINERARY_ADDED",
              payload: {
                id,
                type: payload.type || "activity",
                title: payload.title || "Untitled",
                description: payload.description || "",
                location: payload.location || "",
                start_time: startTime,
                end_time: endTime,
                amount,
                photo_url: payload.photo_url || null,
              },
            });
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
              .run(id, tripId, payload.description || 'Expense', payload.amount || 0, payload.currency || 'BRL', payload.category || 'other', payload.date || new Date().toISOString().split('T')[0]);
            broadcast(tripId, { type: "EXPENSE_ADDED", payload: { ...payload, id } });
            break;
          }
          case "DELETE_EXPENSE": {
            db.prepare("DELETE FROM expenses WHERE id = ?").run(payload.id);
            broadcast(tripId, { type: "EXPENSE_DELETED", payload: { id: payload.id } });
            break;
          }
          case "ADD_DOCUMENT": {
            const id = uuidv4();
            const documentPayload = {
              id,
              name: payload.name || "Documento",
              url: payload.url || "",
            };
            db.prepare("INSERT INTO documents (id, trip_id, name, url) VALUES (?, ?, ?, ?)")
              .run(id, tripId, documentPayload.name, documentPayload.url);
            broadcast(tripId, { type: "DOCUMENT_ADDED", payload: documentPayload });
            break;
          }
          case "DELETE_DOCUMENT": {
            db.prepare("DELETE FROM documents WHERE id = ?").run(payload.id);
            broadcast(tripId, { type: "DOCUMENT_DELETED", payload: { id: payload.id } });
            break;
          }
        }
      } catch (err) {
        console.error("WebSocket Message Error:", err);
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

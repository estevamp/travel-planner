import Database from 'better-sqlite3';

const db = new Database('voyage.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    destination TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS itinerary (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    type TEXT NOT NULL, -- flight, bus, hotel, activity
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TEXT,
    end_time TEXT,
    amount REAL DEFAULT 0,
    photo_url TEXT,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    category TEXT,
    date TEXT,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  );

  -- Ensure photo_url column exists (migration)
  PRAGMA table_info(itinerary);
`);

try {
  db.exec("ALTER TABLE itinerary ADD COLUMN photo_url TEXT;");
} catch (e) {
  // Column might already exist
}

try {
  db.exec("ALTER TABLE itinerary ADD COLUMN amount REAL DEFAULT 0;");
} catch (e) {
  // Column might already exist
}

export default db;

# FareWise web app (Stage 4)

Express + MySQL back end and a plain HTML/CSS/JS front end. It reads and writes the
Stage 3 tables on Cloud SQL (`Airports`, `Airlines`, `Booking_Window`, `Users`,
`Saved_Route`, `Fare_Prices`).

## What it does

| Page | Feature | Database work |
|---|---|---|
| Explore | Pick origin, destination, airline, departure day and stops; see average fare per booking window, the best window, and an airline leaderboard. Optional second filter set (B) to compare on the same chart. | Retrieval: joins `Fare_Prices` with `Booking_Window` (range join on days before departure) and `Airlines`, with GROUP BY aggregation |
| Explore | Airport search box | Retrieval: `Airports` LIKE search |
| Explore | "Save route & set a target" | **Create**: INSERT into `Saved_Route` |
| My routes | Boarding-pass list with a live recommendation per route | Retrieval: `Saved_Route` joined with `Airports`, `Airlines`, `Booking_Window`, plus fare aggregates |
| My routes | Edit a pass | **Update**: UPDATE `Saved_Route` |
| My routes | Archive / Restore | **Delete** (soft): sets `Saved_Route.is_archived`, as in the Stage 2 design |

The green **DB connected** strip at the top shows the live MySQL version, host and
row counts, which makes the front-end-to-database connection easy to show at the checkpoint.

## Run it against Cloud SQL

1. Install Node.js 18 or newer.
2. Allow your computer to reach the database: GCP Console → SQL → the instance →
   **Connections → Networking → Authorized networks → Add a network**, and add your
   public IP (search "what is my ip") as `x.x.x.x/32`.
3. Set up the app:
   ```bash
   cd app
   npm install
   cp .env.example .env
   ```
4. Edit `.env`: set `DB_USER`, `DB_PASSWORD` (your MySQL user on the instance) and
   check `DB_HOST` / `DB_NAME`. Never commit `.env`.
5. Check the connection, then start the app:
   ```bash
   npm run db:check
   npm start
   ```
6. Open http://localhost:3000.

`npm run db:check` prints each table's row count, or a plain-English reason if it
cannot connect (blocked IP, wrong password, wrong database name, SSL).

## Notes about the Stage 3 schema

- `Airports.aiport_name` is spelled that way in Stage 3. The app detects whichever of
  `aiport_name` / `airport_name` exists, so it keeps working if the column is renamed.
- `Saved_Route.route_id` has no AUTO_INCREMENT, so new routes take `MAX(route_id) + 1`
  inside a transaction that locks the table.
- There is no login yet. The app acts as one user (`DEFAULT_USER_ID` in `.env`, or the
  lowest `user_id`), and the menu at the top right switches users.
- "Holiday" means departures around Memorial Day, July 4, Labor Day, Thanksgiving and
  Christmas to New Year's, matching the Stage 2 design doc.

## Local test database (optional)

To try the app without Cloud SQL, run MySQL 8 in Docker and load synthetic data shaped
like Stage 3. The seed script only runs against localhost, because it drops and
recreates every table.

```bash
docker run -d --name farewise-mysql -e MYSQL_ROOT_PASSWORD=localdev -p 3307:3306 mysql:8.0
```

Then set `.env` to `DB_HOST=127.0.0.1`, `DB_PORT=3307`, `DB_USER=root`,
`DB_PASSWORD=localdev`, `DB_SSL=off`, and run:

```bash
npm run seed:local
npm start
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Connection status and row counts |
| GET | `/api/meta` | Airlines and booking windows for the filters |
| GET | `/api/airports?q=` | Airport search |
| GET | `/api/routes/popular` | Most observed routes |
| GET | `/api/explore?origin&destination&airline&day&stops` | Fare summary, booking windows, airline leaderboard |
| GET | `/api/users?q=` · `/api/users/default` | Users for the account switcher |
| GET | `/api/users/:id/routes?archived=0\|1` | Saved routes with recommendations |
| GET | `/api/users/:id/routes/count` | Active and archived counts |
| POST | `/api/routes` | Create a saved route |
| PUT | `/api/routes/:id` | Update a saved route |
| DELETE | `/api/routes/:id?userId=` | Archive a saved route |
| POST | `/api/routes/:id/restore` | Restore an archived route |

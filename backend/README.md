# Minimal local Flask API

Keep the Cloud SQL proxy running on `127.0.0.1:3307`. The proxy and API run in
separate terminals. There is no deployment or database schema change.

## Setup and run

From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python backend/app.py
```

Press Enter to use database username `Anish`, then enter your MySQL password.
It is hidden and kept only in memory. Keep this terminal running.

Visit **http://localhost:5001/api/airports** to retrieve five airports from
`cs411_project`. Database connectivity is checked when you request this endpoint.
The existing database column `aiport_name` is returned as `airport_name`.

The previously downloaded Python environment also works after installing the
updated dependencies into it:

```bash
/private/tmp/farewise-cloud-tools/venv/bin/python -m pip install -r backend/requirements.txt
/private/tmp/farewise-cloud-tools/venv/bin/python backend/app.py
```

## Frontend connection

The frontend can fetch the endpoint and render the returned array:

```js
const response = await fetch('http://localhost:5001/api/airports');
if (!response.ok) throw new Error('Could not load airports');
const airports = await response.json();
// Render airports using airport_code, airport_name, city, and country.
```

Browser requests from `localhost` and `127.0.0.1` on ports 5173 and 3000 are
allowed. If the frontend uses a different origin, specify it when starting Flask:

```bash
FRONTEND_ORIGINS=http://localhost:5500 backend/.venv/bin/python backend/app.py
```

For the checkpoint, run the frontend, Flask, and proxy, then show the airports on
the webpage. Frontend files can be integrated after your teammate pushes them.

If the API returns 503, check that the proxy is running and the database
credentials are correct. To change credentials, stop Flask with Ctrl+C and restart.
Port 5001 avoids the common macOS AirPlay conflict on port 5000.

The original standalone script is still available as `backend/query.py`.

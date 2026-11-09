# FareWise frontend

The basic origin/destination search calls the Python Flask backend at
`http://localhost:5001/api/flights`. It displays up to 20 historical fare records,
cheapest first. Other features remain previews; additional filters and saving
are disabled until their Python endpoints are implemented.

## Run locally

Keep the Cloud SQL proxy running on port 3307. From the repository root, start
Flask in another terminal:

```bash
/private/tmp/farewise-cloud-tools/venv/bin/python backend/app.py
```

Flask loads database credentials from `backend/.env`. Start the frontend in a third terminal:

```bash
cd app
npm start
```

Open http://localhost:3000, enter airport codes such as EWR and LAX, then click
**Search flights**. No npm dependencies are needed for the static frontend.
The API response is rendered into a table; no matching records shows an empty
state, and failed requests show an error. Search uses airport codes, not city names.

The Python backend is in `../backend/`. No Express backend is used.
`db/schema.sql` is retained only as a reference and is not executed.

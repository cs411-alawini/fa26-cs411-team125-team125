# Start FareWise

Run these commands in three separate terminals, starting from the repository root.
Make sure `backend/.env` contains your database credentials.

## 1. Start the Cloud SQL proxy

```bash
/private/tmp/farewise-cloud-tools/cloud-sql-proxy \
  --port 3307 \
  'project-f1c5e4ab-48d1-4f90-a76:us-east1:free-trial-first-project'
```

## 2. Start the Python backend

```bash
/private/tmp/farewise-cloud-tools/venv/bin/python backend/app.py
```

## 3. Start the frontend

```bash
cd app
npm start
```

Open http://localhost:3000. Keep all three terminals running.

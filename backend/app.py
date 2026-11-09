"""A local API that retrieves five airports from Cloud SQL."""

import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
import pymysql


def create_app(username, password):
    app = Flask(__name__)
    origins = os.environ.get(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000",
    ).split(",")
    CORS(app, resources={r"/api/*": {"origins": [origin.strip() for origin in origins]}})

    @app.get("/api/flights")
    def getFlights():
        origin = request.args.get("origin", "").strip().upper()
        destination = request.args.get("destination", "").strip().upper()
        if not origin or not destination: 
            return jsonify(error = "Origin and destination are required"), 400
        connection = None 
        try:
            connection = pymysql.connect(
                host="127.0.0.1",
                port=3307,
                user=username,
                password=password,
                database="cs411_project",
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=10,
                read_timeout=15,
            )

            with connection.cursor() as cursor:
                cursor.execute(
                """
                select f.fare_id,f.origin_airport,f.destination_airport,a.airline_name,f.departure_date, f.fare,f.num_stops,f.duration_min
                from Fare_Prices f 
                Join Airlines a on a.airline_id = f.airline_id
                Where f.origin_airport = %s and f.destination_airport = %s
                order by f.fare ASC, f.fare_id ASC
                limit 20
                """, 
                (origin, destination)
                )
                return jsonify(cursor.fetchall())
        except pymysql.MySQLError:
            app.logger.error("Flight query failed")
            return jsonify(error="Could not retrieve flights"), 503
        finally:
            if connection is not None: 
                connection.close()
    return app


if __name__ == "__main__":
    load_dotenv(Path(__file__).parent / ".env")
    username = os.environ.get("DB_USER")
    password = os.environ.get("DB_PASSWORD")
    if not username or not password:
        raise SystemExit("Set DB_USER and DB_PASSWORD in backend/.env before starting Flask.")
    app = create_app(username, password)
    app.run(host="127.0.0.1", port=5001, debug=False)

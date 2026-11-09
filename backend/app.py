"""A local API that retrieves five airports from Cloud SQL."""

from getpass import getpass
import os

from flask import Flask, jsonify
from flask_cors import CORS
import pymysql


def create_app(username, password):
    app = Flask(__name__)
    origins = os.environ.get(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000",
    ).split(",")
    CORS(app, resources={r"/api/*": {"origins": [origin.strip() for origin in origins]}})

    @app.get("/api/airports")
    def airports():
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
                # The existing schema spells this column "aiport_name".
                cursor.execute(
                    "SELECT airport_code, aiport_name AS airport_name, city, country "
                    "FROM Airports ORDER BY airport_code LIMIT 5"
                )
                return jsonify(cursor.fetchall())
        except pymysql.MySQLError:
            app.logger.error("Airport query failed; check the proxy and database credentials.")
            return jsonify(error="Could not retrieve airports. Check the backend terminal."), 503
        finally:
            if connection is not None:
                connection.close()

    return app


if __name__ == "__main__":
    username = input("Database username [Anish]: ").strip() or "Anish"
    password = getpass("Database password: ")
    app = create_app(username, password)
    # No reloader: credentials are entered once and stay only in memory.
    app.run(host="127.0.0.1", port=5001, debug=False)

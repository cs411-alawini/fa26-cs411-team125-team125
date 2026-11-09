"""Run one read-only query through the local Cloud SQL proxy."""

from getpass import getpass

import pymysql

def main():
    connection = pymysql.connect(
        host="127.0.0.1",
        port=3307,
        user=input("Database username [Anish]: ").strip() or "Anish",
        password=getpass("Database password: "),
        database="cs411_project",
        connect_timeout=10,
        read_timeout=15,
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM Airports LIMIT 5")
            print(" | ".join(column[0] for column in cursor.description))
            for row in cursor.fetchall():
                print(" | ".join(str(value) for value in row))
    finally:
        connection.close()


if __name__ == "__main__":
    main()

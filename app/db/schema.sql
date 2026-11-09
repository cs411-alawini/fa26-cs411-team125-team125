-- FareWise schema, copied from the Stage 3 tables on Cloud SQL (doc/DatabaseDesign.md).
-- Used only to build a LOCAL test database; the GCP database already has these tables.
-- Note: Airports.aiport_name keeps the Stage 3 spelling so local matches GCP.

DROP TABLE IF EXISTS Fare_Prices;
DROP TABLE IF EXISTS Saved_Route;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Booking_Window;
DROP TABLE IF EXISTS Airlines;
DROP TABLE IF EXISTS Airports;

CREATE TABLE Airports (
  airport_code varchar(10) NOT NULL,
  aiport_name varchar(255) DEFAULT NULL,
  city varchar(255) DEFAULT NULL,
  country varchar(100) DEFAULT NULL,
  PRIMARY KEY (airport_code)
);

CREATE TABLE Airlines (
  airline_id int NOT NULL,
  airline_code varchar(10) DEFAULT NULL,
  airline_name varchar(255) DEFAULT NULL,
  PRIMARY KEY (airline_id)
);

CREATE TABLE Booking_Window (
  window_id int NOT NULL,
  label varchar(100) DEFAULT NULL,
  min_days int DEFAULT NULL,
  max_days int DEFAULT NULL,
  PRIMARY KEY (window_id)
);

CREATE TABLE Users (
  user_id int NOT NULL,
  username varchar(255) DEFAULT NULL,
  email varchar(255) DEFAULT NULL,
  password_hash varchar(255) DEFAULT NULL,
  airport_home varchar(10) NOT NULL,
  PRIMARY KEY (user_id),
  KEY airport_home (airport_home),
  FOREIGN KEY (airport_home) REFERENCES Airports(airport_code)
);

CREATE TABLE Saved_Route (
  route_id INT NOT NULL,
  departure_day_filter VARCHAR(100) DEFAULT NULL,
  stop_type VARCHAR(50) DEFAULT NULL,
  target_price DECIMAL(10,2) DEFAULT NULL,
  note VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT NULL,
  is_archived TINYINT(1) DEFAULT NULL,
  user_id INT NOT NULL,
  origin_airport VARCHAR(10) NOT NULL,
  destination_airport VARCHAR(10) NOT NULL,
  airline_id INT DEFAULT NULL,
  window_id INT DEFAULT NULL,
  PRIMARY KEY (route_id),
  KEY user_id (user_id),
  KEY origin_airport (origin_airport),
  KEY destination_airport (destination_airport),
  KEY airline_id (airline_id),
  KEY window_id (window_id),
  FOREIGN KEY (user_id) REFERENCES Users(user_id),
  FOREIGN KEY (origin_airport) REFERENCES Airports(airport_code),
  FOREIGN KEY (destination_airport) REFERENCES Airports(airport_code),
  FOREIGN KEY (airline_id) REFERENCES Airlines(airline_id),
  FOREIGN KEY (window_id) REFERENCES Booking_Window(window_id)
);

CREATE TABLE Fare_Prices (
  fare_id INT NOT NULL,
  origin_airport VARCHAR(10) NOT NULL,
  destination_airport VARCHAR(10) NOT NULL,
  airline_id INT NOT NULL,
  search_date DATE DEFAULT NULL,
  departure_date DATE DEFAULT NULL,
  fare DECIMAL(10,2) DEFAULT NULL,
  num_stops INT DEFAULT NULL,
  duration_min INT DEFAULT NULL,
  PRIMARY KEY (fare_id),
  KEY destination_airport (destination_airport),
  KEY origin_airport (origin_airport),
  KEY airline_id (airline_id),
  FOREIGN KEY (origin_airport) REFERENCES Airports(airport_code),
  FOREIGN KEY (destination_airport) REFERENCES Airports(airport_code),
  FOREIGN KEY (airline_id) REFERENCES Airlines(airline_id)
);

-- Stage 3 final indexes (doc/DatabaseDesign.md, Part 2)
CREATE INDEX idx_q1_airline_covering ON Fare_Prices (airline_id, origin_airport, destination_airport, fare);
CREATE INDEX idx_q2_covering ON Fare_Prices (origin_airport, destination_airport, airline_id, fare);
CREATE INDEX idx_q3_covering ON Fare_Prices (origin_airport, destination_airport, search_date, departure_date, fare);

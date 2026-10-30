# FareWise — Database Design

## Part 1: Database Implementation

### 1. Database Schema
Our relational database consists of six tables : 
Airports:
```sql
CREATE TABLE Airports
(
  airport_code varchar(10) NOT NULL,
  aiport_name varchar(255) DEFAULT NULL,
  city varchar(255) DEFAULT NULL,
  country varchar(100) DEFAULT NULL,
  PRIMARY KEY (airport_code)
  );
```
Airlines:

```sql
CREATE TABLE Airlines
(
  airline_id int NOT NULL,
  airline_code varchar(10) DEFAULT NULL,
  airline_name varchar(255) DEFAULT NULL,
  PRIMARY KEY (airline_id)
);
```
Booking_Window:

```sql 
CREATE TABLE Booking_Window
(
  window_id int NOT NULL,
  label varchar(100) DEFAULT NULL,
  min_days int DEFAULT NULL,
  max_days int DEFAULT NULL,
  PRIMARY KEY (window_id)
);
```
Users: 
```sql 
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
```
Saved_Route: 

```sql
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
```
Fare_Prices:
```sql
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
```
### 2. Data Population
We populated FareWise database with synthetic data to simulate users, saved flight routes, and airlines far observations.
To verify that at least three tables have at least 1000 rows we provided a screenshot of the row counts for Users, Saved_Route, and Fare_Prices.
![Row Count Results](screenshots/RowLength.png)

### 3. Advanced SQL Queries
#### Query 1: Airline Fare Comparison
This query compares flight prices across differnt airlines and routes by calucalting the average fare, minimum fare, and total number of fare observations.

```sql
select f.origin_airport, f.destination_airport, a.airline_name, AVG(fare) as avg_price, MIN(fare) as min_price, COUNT(*) as total_flights
from Fare_Prices f
join Airlines a on a.airline_id = f.airline_id
group by f.origin_airport, f.destination_airport, a.airline_id, a.airline_name
having total_flights >= 5
order by avg_price asc
limit 15; 
```
![Row Count Results](screenshots/Query1Result.png)
#### Query 2: Competing Airline Fare Comparison



#### Query 3: Booking Window Analysis

## Part 2: Indexing Analysis

### Query 1: Indexing Experiments

### Query 2: Indexing Experiments

### Query 3: Indexing Experiments

### Final Indexing Design
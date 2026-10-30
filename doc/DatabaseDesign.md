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
This query compares flight prices across differnt airlines and routes by calucalting the average fare, minimum fare, and total number of fare observations. We only included observations with flight paths that had more than 5 observations. 

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
This query identifies fares that are cheaper than the average flgith offered by every competing airline on the same route. It also calculates overall average fare for that route and the potential savings that come with choosing that specific flight and route. 

```sql
select f.origin_airport, f.destination_airport, a.airline_name, f.fare, f.departure_date, 
(
    select AVG(f2.fare)
    from Fare_Prices f2
    where f2.origin_airport = f.origin_airport and f2.destination_airport = f.destination_airport
) as avg_price,
(
    select AVG(f3.fare)
    from Fare_Prices f3
    where f3.origin_airport = f.origin_airport
    and f3.destination_airport = f.destination_airport
) - f.fare AS savings
from Fare_Prices f
join Airlines a on f.airline_id = a.airline_id
where f.fare < ALL (
    select AVG(f2.fare)
    from Fare_Prices f2
    where f2.origin_airport = f.origin_airport
    and f2.destination_airport = f.destination_airport
    and f2.airline_id != f.airline_id
    group by f2.airline_id
)
order by f.fare asc
limit 15; 
```
![Row Count Results](screenshots/Query2Result.png)
#### Query 3: Booking Window Analysis
This query compares average prices across diffrent booking windows for a specific route. In this example, we used JFK and LAX but can be changed for user preference in filter selection. It calculates the average fare and toal number of fare observation for each booking window to help determine which window period offers the best average price. 

```sql
select
    f.origin_airport,
    f.destination_airport,
    b.label as booking_window,
    AVG(f.fare) as avg_fare,
    COUNT(*) as total_fares
from Fare_Prices f
join Booking_Window b on DATEDIFF(f.departure_date, f.search_date) between b.min_days and b.max_days
where f.origin_airport = 'JFK' and f.destination_airport = 'LAX'
group by
    f.origin_airport,
    f.destination_airport,
    b.window_id,
    b.label
having count(*) >= 5
order by avg_fare asc
limit 15;
```
![Row Count Results](screenshots/Query3Result.png)

Query 3 only retuens five rows beacuse our database defines five booking window categoires. Since the query filters for only a single route and each booking window group classified as, Medium, Early, Long term, Last minute, Short term, only have the best prices assiocited with that window. 

## Part 2: Indexing Analysis
### Query 1: Indexing Experiments
We tested three composite indexes on Fare_Prices to improve the JOIN and GROUP BY operations. Before adding the experimental indexes the estimated nested loop join cost was 2042, with MySQL using the exisiting airline_id index. The baseline EXPLAIN ANALYZE output showed Nested loop inner join (cost=2042 rows=13132) and Index lookup on f using airline_id (airline_id=a.airline_id) (cost=85.9 rows=1313).

For Index Design 1 we created a composite key on Fare_Price(origin_airport, destination_airport) to test whether organizing fare records by route would improve query performance. The estimated joint cost remained at 2042, showing no improvement after adding this index. The ‘EXPLAIN ANALYZE’ output showed that the MySQL continued using the existing ‘airline_id’ index instead of the new composite index. Specifically, the output showed Nested loop inner join (cost=2042 rows=13132) and Index lookup on f using airline_id (airline_id=a.airline_id) (cost=85.9 rows=1313). This probably happened because the query processes fares across all routes rather than specifically filtering for a specific origin and destination. 

For Index Design 2 we created a composite index on ‘Fare_Prices(origin_airport, destination_airport, airline_id)’. We added ‘airline_id’ because it is used in both the JOIN and GROUP BY clauses, trying to see if including it would reduce the cost of grouping fares by route and airline. However, after running ‘EXPLAIN ANALYZE’, the estimated nested-loop join cost remained 2042, the same as both the baseline and the Index Design 1. This once again shows no improvement in the estimated join cost. The output again showed Nested loop inner join (cost=2042 rows=13132) and Index lookup on f using airline_id (airline_id=a.airline_id) (cost=85.9 rows=1313).

For the third indexing experiment, we created a composite index on Fare_Prices(airline_id, origin_airport, destination_airport, fare). Unlike the other previous two designs, this index places airline_id first to support the JOIN condition which includes all the Fare_Prices attributes required by the query. After adding the index, the estimated nested-loop join cost decreased from 2042 to 1475, approximately a 27.8% reduction. This shows that MySQL used idx_q1_airline_covering through an index lookup. Specifically, EXPLAIN ANALYZE showed Nested loop inner join (cost=1475 rows=13132) and Covering index lookup on f using idx_q1_airline_covering (airline_id=a.airline_id) (cost=29.2 rows=1313).

This improvement occurred because MySQL could find records by airline and retrieve the required route and fare information directly from the index without accessing the full table rows. Since the first two indexing designs produced no improvement, we selected Design 3 as the most effective choice based on the estimated join costs. The only trade-offs are additional index storage and maintenance overhead during inserts and updates. 

| Configuration | Join Cost | Improvement |
|---|---:|---:|
| Baseline | 2042 | — |
| Index Design 1 | 2042 | 0% |
| Index Design 2 | 2042 | 0% |
| Index Design 3 | 1475 | 27.8% |

Baseline Results: 
![Row Count Results](screenshots/indexing/query1/Query1Baseline.png)
Index 1:
![Row Count Results](screenshots/indexing/query1/Query1Index1Test.png)
Index 2:
![Row Count Results](screenshots/indexing/query1/Query1Index2Test.png)
Index 3:
![Row Count Results](screenshots/indexing/query1/Query1Index3Test.png)

### Query 2: Indexing Experiments
For Query 2, we tested three diffrent composite indexes to improve the performance of comparing flight prices against competing airlines average fares. Before adding any experimental indexes, the estimated cost for airline lookup cost was 76.7 with the default using destination_airport as the index. 

For the first indexing experiment, we created a composite index on Fare_Prices(origin_airport, destination_airport). The goal was to improve the efficiency of the subqueries and search for fares that belonged to the same origin and destination. Before adding the index it examined around 451 rows per lookup. After adding the composite index, MySQL switched to ‘idx_q2_route’, reducing the average number of rows examined to approximately 22.8. The estimated cost of repeated comparison subquery lookup decreased from 76.7 to 5.13, representing around a 93.3% reduction. This was shown by Index lookup on f2 using idx_q2_route
(origin_airport=f.origin_airport, destination_airport=f.destination_airport)
(cost=5.13 rows=15.1) (actual time=0.0194..0.0316 rows=22.8 loops=13200)
However, the top-level estimated query cost was still unchanged at 5934. This shows that the new index reduced the estimated cost of the subquery’s lookup, while the overall optimizer cost estimate did not change.

For the second indexing experiment, we created a composite index on Fare_Prices(origin_airport, destination_airport, fare). This design extends the route index from Design 1 by including the fare attribute, which is used in the subqueries to calculate average flight prices. Adding this index reduced the estimated lookup cost for the average-fare subqueries from 5.28 to 2.63, about a 50.2% reduction compared to Design 1. This was shown by the output "Covering index lookup on f2 using idx_q2_route_fare (cost=2.63 rows=15.1)". However, the comparison subquery’s estimated lookup cost remained at 5.13, because it also requires ‘airline_id’, not included in this index. The top-level estimated query cost remained unchanged at 5934. Overall, Index Design 2 improved the efficiency of the average-fare calculations, even though it didn’t reduce the top-level estimated cost.

For the third indexing experiment, we created a composite index on Fare_Prices(origin_airport, destination_airport, airline_id, fare). This design includes all the attributes needed by the  subquery that compares fares against competing airlines average prices.After adding the index, the estimated cost of the competing-airline lookup decreased from 76.7 in the baseline to 2.49, representing a 96.8% reduction. This can be shown by the output "Covering index lookup on f2 using idx_q2_covering (cost=2.49 rows=15.1)" 

In conclusion we selected Index Design 3 because it produced the lowest estimated competing airline cost. The index that covered all routes, allowed MySQL to get all required columns from the index itself without accessing full table rows. 
| Configuration | Competing-Airline Lookup Cost | Improvement |
|---|---:|---:|
| Baseline | 76.7 | — |
| Index Design 1 | 5.13 | 93.3% |
| Index Design 2 | 5.13 | 93.3% |
| Index Design 3 | 2.49 | 96.8% |


Baseline Results: 
![Row Count Results](screenshots/indexing/query2/Query2Baseline.png)
Index 1:
![Row Count Results](screenshots/indexing/query2/Query2Index1Test.png)
Index 2:
![Row Count Results](screenshots/indexing/query2/Query2Index2Test.png)
Index 3:
![Row Count Results](screenshots/indexing/query2/Query2Index3Test.png)

### Query 3: Indexing Experiments

For Query 3, we tested three diffrent indexes to improve performace. Before adding any experimental index, the estimated join cost was 87.9 with the baseline index using origin_aiport and destination_airport to find records. 


For the first indexing experiment, we went with a composite index on Fare_Prices(origin_airport, destination_airport) to improve the retrieval of fares for a specific route, JFK to LAX.
After adding the index, MySQL switched from using separate airport indexes with a hash join to using the composite index with a nested-loop join. This resulted in the estimated join cost increasing from 87.9 to 132, an approximately 50.2% increase. "Nested loop inner join (cost=132 rows=375)".

Although the composite index was successfully used, it did not improve the estimated cost and instead actually increased it.


For the second indexing experiment, we went with a composite index on Fare_Prices(origin_airport, destination_airport, fare). The goal was to improve route-specific fare retrieval while including the ‘fare’ attribute used to calculate average booking-window prices.

The estimated joint cost decreased from 87.9 to 57.7, representing around a 34.4% reduction. "Inner hash join (no condition) (cost=57.7 rows=109)". However, the execution plan that MySQL continued using the existing ‘origin_airport’ and ‘destination_airport’ indexes rather than the new composite index. 

For the third indexing experiment, we created a composite index on Fare_Prices(origin_airport, destination_airport, search_date, departure_date, fare). This index includes all the Fare_Prices attributes used in Query 3, allowing MySQL to retrieve route, date, and fare information directly from the index. After adding all the indexes, the estimated join cost decreased 87.9 to 47.5, representing a 46.0% reduction compared to the baseline. "Covering index lookup on f using idx_q3_covering (origin_airport='JFK' destination_airport='LAX') (cost=3.35 rows=75)" and "Nested loop inner join (cost=47.5 rows=375)."

We selected using Index Design 3 because it produced the lowest estimated join cost and allowed MySQL to retrive all the required information direcrtly from the index provided. 

| Configuration | Join Cost | Improvement |
|---|---:|---:|
| Baseline | 87.9 | — |
| Index Design 1 | 132 | 50.2% increase |
| Index Design 2 | 57.7 | 34.4% decrease |
| Index Design 3 | 47.5 | 46.0% decrease |


Baseline Results: 
![Row Count Results](screenshots/indexing/query3/Query3Baseline.png)
Index 1:
![Row Count Results](screenshots/indexing/query3/Query3Index1.png)
Index 2:
![Row Count Results](screenshots/indexing/query3/Query3Index2.png)
Index 3:
![Row Count Results](screenshots/indexing/query3/Query3Index3.png)

### Final Indexing Design
| Query | Baseline Cost | Final Cost | Reduction |
|---|---:|---:|---:|
| Query 1 | 2042 | 1476 | 27.7% |
| Query 2 | 76.7 | 2.49 | 96.8% |
| Query 3 | 87.9 | 47.5 | 46.0% |

These costs represent specific operations that were reduced instead of complete query costs. Queries 1 and 3 compare estimated join costs whereas Query 2 compares the estimated look up costs. For Query 1 we seleceted Fare_Prices(airline_id, origin_airport, destination_airport, fare). This reduced the estimated join cost from 2042 down to 1476, a 27.7% reduction. 
For Query 2 we selected Fare_Prices(origin_airport, destination_airport, airline_id, fare). This index reduced the estimated look up cost from 76.7 to 2.49 showing a 96.8% decrease. It improved the subquery lookup costs. 
For Query 3 we selected Fare_Prices(origin_airport, destination_airport, search_date, departure_date, fare). This index reduced the join cost from 87.9 to 47.5 showing a 46% decrease. All three indexes were used when put together, confirming that they support different query operations. Although maintaining these indexes requires extra storage the added overhead is a good tradeoff for the increased cost improvements. 
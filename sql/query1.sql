select f.origin_airport, f.destination_airport, a.airline_name, AVG(fare) as avg_price, MIN(fare) as min_price, COUNT(*) as total_flights
from Fare_Prices f
join Airlines a on a.airline_id = f.airline_id
group by f.origin_airport, f.destination_airport, a.airline_id, a.airline_name
having total_flights >= 5
order by avg_price asc
limit 15; 

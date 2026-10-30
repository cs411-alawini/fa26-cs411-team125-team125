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



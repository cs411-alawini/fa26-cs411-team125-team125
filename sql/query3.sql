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
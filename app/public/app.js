/* Basic flight search uses the local Python API. Other features are previews. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  function showView() {
    const routes = location.hash === '#routes';
    $('#view-explore').hidden = routes;
    $('#view-routes').hidden = !routes;
    $$('.tab').forEach(tab => tab.classList.toggle('active',
      tab.dataset.view === (routes ? 'routes' : 'explore')));
  }

  function updateBoard() {
    for (const [input, board] of [['#originInput', '#flapOrigin'], ['#destInput', '#flapDest']]) {
      const text = ($(input).value.trim() || '---').toUpperCase().slice(0, 4);
      $(board).replaceChildren(...[...text].map(letter => {
        const cell = document.createElement('span');
        cell.textContent = letter;
        return cell;
      }));
    }
  }

  function updateClock() {
    $('#clock').textContent = 'LOCAL ' + new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  $('#statusText').textContent = 'Flight search ready · Enter origin and destination';
  $('#userName').textContent = 'Preview';
  $('#userChip').disabled = true;
  $('#userChip').title = 'User accounts will be connected to the Python backend.';
  $('#chart').textContent = 'Fare charts will appear here once the Python backend is connected.';
  $('#leaderboard').textContent = 'No fare data loaded.';
  $('#popularChips').textContent = 'No routes loaded.';
  $('#passes').textContent = 'Saved routes will appear here once the Python backend is connected.';
  $('#saveRouteBtn').disabled = true;
  $('#saveRouteBtn').title = 'Saving routes requires the Python backend.';
  $('#delayed').hidden = true;

  async function searchFlights(event) {
    event.preventDefault();
    const origin = $('#originInput').value.trim().toUpperCase();
    const destination = $('#destInput').value.trim().toUpperCase();
    const status = $('#flightStatus');
    $('#flightRows').replaceChildren();
    $('#flightTableWrap').hidden = true;
    if (![origin, destination].every(code => /^[A-Z0-9]{2,10}$/.test(code))) {
      status.textContent = 'Enter airport codes such as EWR and LAX.';
      return;
    }
    const button = $('#searchFlightsBtn');
    button.disabled = true;
    status.textContent = `Searching ${origin} → ${destination}…`;
    try {
      const params = new URLSearchParams({ origin, destination });
      const response = await fetch(`http://localhost:5001/api/flights?${params}`, {
        signal: AbortSignal.timeout(30000),
      });
      const flights = await response.json();
      if (!response.ok) throw new Error(flights.error || `Search failed (${response.status}).`);
      if (!Array.isArray(flights)) throw new Error('The API returned an unexpected response.');
      for (const flight of flights) {
        const row = document.createElement('tr');
        const date = flight.departure_date ? new Date(flight.departure_date) : null;
        const values = [
          flight.origin_airport, flight.destination_airport, flight.airline_name,
          date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—',
          flight.fare == null ? '—' : Number(flight.fare).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
          flight.num_stops ?? '—',
          flight.duration_min == null ? '—' : `${flight.duration_min} min`,
        ];
        row.replaceChildren(...values.map(value => {
          const cell = document.createElement('td');
          cell.textContent = value ?? '—';
          return cell;
        }));
        $('#flightRows').appendChild(row);
      }
      $('#flightTableWrap').hidden = flights.length === 0;
      status.textContent = flights.length
        ? `${origin} → ${destination}: ${flights.length} fare records, cheapest first (maximum 20).`
        : `No fare records found for ${origin} → ${destination}.`;
      $('#statusText').textContent = 'Connected to Python API · Cloud SQL search complete';
    } catch (error) {
      status.textContent = error.name === 'TimeoutError'
        ? 'Search timed out. Check Flask and the Cloud SQL proxy.'
        : error instanceof TypeError
          ? 'Cannot reach the API. Start Flask on port 5001 and check the Cloud SQL proxy.'
          : error.message;
      $('#statusText').textContent = 'Search failed · Check the Python backend';
    } finally {
      button.disabled = false;
    }
  }

  // Only origin/destination search is connected to the Python backend.
  $('#airlineSelect').disabled = true;
  $('#compareToggle').disabled = true;
  $$('.seg[data-key] button, #compareControls select').forEach(control => { control.disabled = true; });
  $('#results').hidden = true;
  $$('form').forEach(form => form.addEventListener('submit', event => event.preventDefault()));
  $('#controls').addEventListener('submit', searchFlights);
  $('#originInput').addEventListener('input', updateBoard);
  $('#destInput').addEventListener('input', updateBoard);
  $('#swapBtn').addEventListener('click', () => {
    const origin = $('#originInput');
    const destination = $('#destInput');
    [origin.value, destination.value] = [destination.value, origin.value];
    updateBoard();
  });
  $$('.seg').forEach(segment => segment.addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    [...segment.querySelectorAll('button')].forEach(item => {
      item.classList.toggle('on', item === button);
    });
  }));
  $('#compareToggle').addEventListener('click', event => {
    const button = event.currentTarget;
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    $('#compareControls').hidden = !expanded;
  });
  window.addEventListener('hashchange', showView);
  showView();
  updateBoard();
  updateClock();
  setInterval(updateClock, 15000);
})();

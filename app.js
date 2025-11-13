// ASOS Weather Explorer - Main Application

// WindBorne Systems Challenge



const API_BASE = 'https://sfc.windbornesystems.com';

const RATE_LIMIT = 20; // requests per minute

let stations = [];

let map;

let markerCluster;

let requestQueue = [];

let requestCount = 0;

let currentCharts = {};



// Initialize the application

async function init() {

    try {

        // Initialize map

        map = L.map('map', {

            center: [20, 0],

            zoom: 2.5,

            minZoom: 2,

            maxZoom: 18,

            zoomControl: true

        });



        // Add dark theme tile layer

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {

            attribution: '©OpenStreetMap, ©CartoDB | ASOS Data via WindBorne Systems',

            subdomains: 'abcd',

            maxZoom: 19

        }).addTo(map);



        // Initialize marker cluster

        markerCluster = L.markerClusterGroup({

            chunkedLoading: true,

            spiderfyOnMaxZoom: true,

            showCoverageOnHover: false,

            zoomToBoundsOnClick: true,

            maxClusterRadius: 50

        });



        // Fetch stations

        await fetchStations();

        

        // Setup search

        setupSearch();

        

        // Hide loading

        document.getElementById('loading').style.display = 'none';

    } catch (error) {

        console.error('Initialization error:', error);

        document.getElementById('loading').innerHTML = `

            <div class="error-message">

                Failed to load weather stations. Please refresh the page.

            </div>

        `;

    }

}



// Fetch all stations from API

async function fetchStations() {

    try {

        const response = await fetch(`${API_BASE}/stations`);

        if (!response.ok) throw new Error('Failed to fetch stations');

        

        stations = await response.json();

        

        // Update stats

        document.getElementById('total-stations').textContent = stations.length.toLocaleString();

        

        const countries = new Set(stations.map(s => s.station_network.split('_')[0]));

        document.getElementById('total-countries').textContent = countries.size;

        

        // Add markers to map

        addStationsToMap(stations);

        

    } catch (error) {

        console.error('Error fetching stations:', error);

        throw error;

    }

}



// Add station markers to map

function addStationsToMap(stationsToAdd) {

    stationsToAdd.forEach(station => {

        const marker = L.circleMarker([station.latitude, station.longitude], {

            radius: 6,

            fillColor: '#3b82f6',

            color: '#60a5fa',

            weight: 1,

            opacity: 0.8,

            fillOpacity: 0.6

        });



        const popupContent = `

            <div class="station-popup">

                <h3>${station.station_name}</h3>

                <p><strong>ID:</strong> ${station.station_id}</p>

                <p><strong>Network:</strong> ${station.station_network}</p>

                <p><strong>Elevation:</strong> ${station.elevation.toFixed(0)}m</p>

                <p><strong>Timezone:</strong> ${station.timezone}</p>

                <button onclick="loadStationData('${station.station_id}')">

                    View Weather Data

                </button>

            </div>

        `;



        marker.bindPopup(popupContent);

        markerCluster.addLayer(marker);

    });



    map.addLayer(markerCluster);

}



// Setup search functionality

function setupSearch() {

    const searchInput = document.getElementById('search-input');

    let searchTimeout;



    searchInput.addEventListener('input', (e) => {

        clearTimeout(searchTimeout);

        searchTimeout = setTimeout(() => {

            const query = e.target.value.toLowerCase().trim();

            

            if (query.length === 0) {

                // Reset to show all stations

                markerCluster.clearLayers();

                addStationsToMap(stations);

                return;

            }



            // Filter stations

            const filtered = stations.filter(s => 

                s.station_name.toLowerCase().includes(query) ||

                s.station_id.toLowerCase().includes(query) ||

                s.station_network.toLowerCase().includes(query)

            );



            // Update map

            markerCluster.clearLayers();

            addStationsToMap(filtered);



            // Zoom to results if any

            if (filtered.length > 0 && filtered.length < 50) {

                const bounds = L.latLngBounds(

                    filtered.map(s => [s.latitude, s.longitude])

                );

                map.fitBounds(bounds, { padding: [50, 50] });

            }

        }, 300);

    });

}



// Load weather data for a specific station

async function loadStationData(stationId) {

    try {

        const station = stations.find(s => s.station_id === stationId);

        if (!station) return;



        // Update selected station

        document.getElementById('selected-station').textContent = stationId;



        // Show detail panel

        const panel = document.getElementById('detail-panel');

        panel.classList.add('active');



        // Update header

        document.getElementById('station-name').textContent = station.station_name;

        document.getElementById('station-location').textContent = 

            `${station.latitude.toFixed(4)}°, ${station.longitude.toFixed(4)}°`;

        document.getElementById('station-elevation').textContent = 

            `${station.elevation.toFixed(0)}m`;

        document.getElementById('station-id').textContent = stationId;

        document.getElementById('station-network').textContent = station.station_network;



        // Show loading in weather stats

        document.getElementById('weather-stats').innerHTML = 

            '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">Loading weather data...</div>';



        // Fetch historical weather

        const response = await fetch(`${API_BASE}/historical_weather?station=${stationId}`);

        if (!response.ok) throw new Error('Failed to fetch weather data');

        

        const data = await response.json();

        const points = data.points || [];



        if (points.length === 0) {

            document.getElementById('weather-stats').innerHTML = 

                '<div style="grid-column: 1/-1; text-align: center; color: var(--danger-color);">No weather data available for this station.</div>';

            return;

        }



        // Display current weather stats

        displayWeatherStats(points);



        // Create charts

        createTemperatureChart(points);

        createWindChart(points);

        createPrecipChart(points);



    } catch (error) {

        console.error('Error loading station data:', error);

        document.getElementById('weather-stats').innerHTML = `

            <div class="error-message" style="grid-column: 1/-1;">

                Error loading weather data. The data may be corrupted or unavailable.

            </div>

        `;

    }

}



// Display current weather statistics

function displayWeatherStats(points) {

    // Get latest valid readings

    const latest = points[points.length - 1];

    const temps = points.map(p => p.temperature).filter(t => t !== null);

    const pressures = points.map(p => p.pressure).filter(p => p !== null);

    

    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;

    const avgPressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;

    const maxTemp = Math.max(...temps);

    const minTemp = Math.min(...temps);



    // Calculate wind speed from components

    let avgWindSpeed = 0;

    let windCount = 0;

    points.forEach(p => {

        if (p.wind_x !== null && p.wind_y !== null) {

            avgWindSpeed += Math.sqrt(p.wind_x ** 2 + p.wind_y ** 2);

            windCount++;

        }

    });

    avgWindSpeed = windCount > 0 ? avgWindSpeed / windCount : 0;



    const statsHTML = `

        <div class="weather-card">

            <div class="weather-card-label">Current Temp</div>

            <div class="weather-card-value">

                ${latest.temperature?.toFixed(1) || '-'}

                <span class="weather-card-unit">°F</span>

            </div>

        </div>

        <div class="weather-card">

            <div class="weather-card-label">Avg Temp</div>

            <div class="weather-card-value">

                ${avgTemp.toFixed(1)}

                <span class="weather-card-unit">°F</span>

            </div>

        </div>

        <div class="weather-card">

            <div class="weather-card-label">Temp Range</div>

            <div class="weather-card-value">

                ${(maxTemp - minTemp).toFixed(1)}

                <span class="weather-card-unit">°F</span>

            </div>

        </div>

        <div class="weather-card">

            <div class="weather-card-label">Pressure</div>

            <div class="weather-card-value">

                ${avgPressure.toFixed(1)}

                <span class="weather-card-unit">mb</span>

            </div>

        </div>

        <div class="weather-card">

            <div class="weather-card-label">Avg Wind</div>

            <div class="weather-card-value">

                ${avgWindSpeed.toFixed(1)}

                <span class="weather-card-unit">m/s</span>

            </div>

        </div>

        <div class="weather-card">

            <div class="weather-card-label">Data Points</div>

            <div class="weather-card-value">

                ${points.length}

                <span class="weather-card-unit">hrs</span>

            </div>

        </div>

    `;



    document.getElementById('weather-stats').innerHTML = statsHTML;

}



// Create temperature chart

function createTemperatureChart(points) {

    const ctx = document.getElementById('tempChart');

    

    // Destroy existing chart

    if (currentCharts.temp) {

        currentCharts.temp.destroy();

    }



    const labels = points.map(p => {

        const date = new Date(p.timestamp);

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    });



    const temps = points.map(p => p.temperature);

    const dewpoints = points.map(p => p.dewpoint);



    currentCharts.temp = new Chart(ctx, {

        type: 'line',

        data: {

            labels: labels,

            datasets: [

                {

                    label: 'Temperature',

                    data: temps,

                    borderColor: '#ef4444',

                    backgroundColor: 'rgba(239, 68, 68, 0.1)',

                    borderWidth: 2,

                    tension: 0.4,

                    fill: true,

                    pointRadius: 0,

                    pointHoverRadius: 4

                },

                {

                    label: 'Dewpoint',

                    data: dewpoints,

                    borderColor: '#3b82f6',

                    backgroundColor: 'rgba(59, 130, 246, 0.1)',

                    borderWidth: 2,

                    tension: 0.4,

                    fill: true,

                    pointRadius: 0,

                    pointHoverRadius: 4

                }

            ]

        },

        options: {

            responsive: true,

            maintainAspectRatio: true,

            aspectRatio: 3,

            plugins: {

                legend: {

                    display: true,

                    labels: { color: '#cbd5e1', font: { size: 12 } }

                },

                tooltip: {

                    mode: 'index',

                    intersect: false,

                    backgroundColor: 'rgba(15, 23, 42, 0.95)',

                    titleColor: '#f1f5f9',

                    bodyColor: '#cbd5e1',

                    borderColor: '#475569',

                    borderWidth: 1

                }

            },

            scales: {

                x: {

                    grid: { color: '#334155' },

                    ticks: { 

                        color: '#94a3b8',

                        maxRotation: 45,

                        minRotation: 45,

                        maxTicksLimit: 15

                    }

                },

                y: {

                    grid: { color: '#334155' },

                    ticks: { 

                        color: '#94a3b8',

                        callback: (value) => value + '°F'

                    }

                }

            },

            interaction: {

                mode: 'nearest',

                axis: 'x',

                intersect: false

            }

        }

    });

}



// Create wind and pressure chart

function createWindChart(points) {

    const ctx = document.getElementById('windChart');

    

    if (currentCharts.wind) {

        currentCharts.wind.destroy();

    }



    const labels = points.map(p => {

        const date = new Date(p.timestamp);

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    });



    // Calculate wind speed from components

    const windSpeeds = points.map(p => {

        if (p.wind_x === null || p.wind_y === null) return null;

        return Math.sqrt(p.wind_x ** 2 + p.wind_y ** 2);

    });



    const pressures = points.map(p => p.pressure);



    currentCharts.wind = new Chart(ctx, {

        type: 'line',

        data: {

            labels: labels,

            datasets: [

                {

                    label: 'Wind Speed (m/s)',

                    data: windSpeeds,

                    borderColor: '#10b981',

                    backgroundColor: 'rgba(16, 185, 129, 0.1)',

                    borderWidth: 2,

                    tension: 0.4,

                    fill: true,

                    pointRadius: 0,

                    pointHoverRadius: 4,

                    yAxisID: 'y'

                },

                {

                    label: 'Pressure (mb)',

                    data: pressures,

                    borderColor: '#a78bfa',

                    backgroundColor: 'rgba(167, 139, 250, 0.1)',

                    borderWidth: 2,

                    tension: 0.4,

                    fill: false,

                    pointRadius: 0,

                    pointHoverRadius: 4,

                    yAxisID: 'y1'

                }

            ]

        },

        options: {

            responsive: true,

            maintainAspectRatio: true,

            aspectRatio: 3,

            plugins: {

                legend: {

                    display: true,

                    labels: { color: '#cbd5e1', font: { size: 12 } }

                },

                tooltip: {

                    mode: 'index',

                    intersect: false,

                    backgroundColor: 'rgba(15, 23, 42, 0.95)',

                    titleColor: '#f1f5f9',

                    bodyColor: '#cbd5e1',

                    borderColor: '#475569',

                    borderWidth: 1

                }

            },

            scales: {

                x: {

                    grid: { color: '#334155' },

                    ticks: { 

                        color: '#94a3b8',

                        maxRotation: 45,

                        minRotation: 45,

                        maxTicksLimit: 15

                    }

                },

                y: {

                    type: 'linear',

                    display: true,

                    position: 'left',

                    grid: { color: '#334155' },

                    ticks: { 

                        color: '#10b981',

                        callback: (value) => value.toFixed(1) + ' m/s'

                    }

                },

                y1: {

                    type: 'linear',

                    display: true,

                    position: 'right',

                    grid: { drawOnChartArea: false },

                    ticks: { 

                        color: '#a78bfa',

                        callback: (value) => value.toFixed(0) + ' mb'

                    }

                }

            }

        }

    });

}



// Create precipitation chart

function createPrecipChart(points) {

    const ctx = document.getElementById('precipChart');

    

    if (currentCharts.precip) {

        currentCharts.precip.destroy();

    }



    const labels = points.map(p => {

        const date = new Date(p.timestamp);

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    });



    const precips = points.map(p => p.precip || 0);



    currentCharts.precip = new Chart(ctx, {

        type: 'bar',

        data: {

            labels: labels,

            datasets: [

                {

                    label: 'Precipitation (inches)',

                    data: precips,

                    backgroundColor: '#3b82f6',

                    borderColor: '#60a5fa',

                    borderWidth: 1

                }

            ]

        },

        options: {

            responsive: true,

            maintainAspectRatio: true,

            aspectRatio: 3,

            plugins: {

                legend: {

                    display: true,

                    labels: { color: '#cbd5e1', font: { size: 12 } }

                },

                tooltip: {

                    backgroundColor: 'rgba(15, 23, 42, 0.95)',

                    titleColor: '#f1f5f9',

                    bodyColor: '#cbd5e1',

                    borderColor: '#475569',

                    borderWidth: 1,

                    callbacks: {

                        label: (context) => `Precipitation: ${context.parsed.y.toFixed(3)} inches`

                    }

                }

            },

            scales: {

                x: {

                    grid: { color: '#334155' },

                    ticks: { 

                        color: '#94a3b8',

                        maxRotation: 45,

                        minRotation: 45,

                        maxTicksLimit: 15

                    }

                },

                y: {

                    grid: { color: '#334155' },

                    ticks: { 

                        color: '#94a3b8',

                        callback: (value) => value.toFixed(2) + '"'

                    },

                    beginAtZero: true

                }

            }

        }

    });

}



// Close detail panel

function closeDetailPanel() {

    const panel = document.getElementById('detail-panel');

    panel.classList.remove('active');

    document.getElementById('selected-station').textContent = 'None';

}



window.loadStationData = loadStationData;

window.closeDetailPanel = closeDetailPanel;



// Initialize on page load

document.addEventListener('DOMContentLoaded', init);
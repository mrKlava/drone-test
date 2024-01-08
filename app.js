"use strict"

/*
- Launch drone
- Move up for 50 m
  - 1s - 5m
- Start moving towards destination:
  - Start -     10 km/h for 100 m
  - Way -       100 km/h
  - Approach -  20 km/h for 10 m
  - Final -     1 km/h for 1 m

Update each 1sec
*/

/* =========================================================================
============================================================================
                                   CONST
============================================================================
============================================================================
*/

const ZERO = 0
const SAFE_ALT = 50

const MS = 1000
const VECTOR_MS = 6000

const SAFE_SPEED_MAX = 100
const SAFE_SPEED_MIN = 20
const LANDING_SPEED = 1

const SAFE_DIST = 0.06
const LANDING_DIST = 0.01
const LANDING_AREA = 0.001

const POS_ZERO = [0, 0]
const POS_MAP_CENTER = [43.3191259, -0.3663409]
const POS_ZENITH = [43.33558464986342, -0.3649574518203736]
const POS_BEAUMONT = [43.29563668171526, -0.3604459762573243]
const POS_MUSEEM = [43.29467620219394, -0.3752624988555908]
const POS_TEST = [43.295843612308786, -0.3687769174575806]

const POS_DEST = [43.29563668171526, -0.37]
const POS_DEST2 = [43.29563668171526, -0.355]

const POS_NORTH = [43.30481122955551, -0.3604459762573243]
const POS_EAST = [43.29563668171526, -0.3479361534118653]
const POS_SOUTH = [43.28656032553821, -0.3604459762573243]
const POS_WEST = [43.29563668171526, -0.3728055953979493]

// const EARTH_RADIUS = 6378.137
const EARTH_RADIUS = 6371

const DRONE_ICON = L.icon({
  iconUrl: './assets/icons/drone.png',
  iconSize: [25, 25],
  iconAnchor: [14, 14],
  popupAnchor: [-3, -76],
})

const HOME_ICON = L.icon({
  iconUrl: './assets/icons/home.png',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [-3, -76],
})

const DEST_ICON = L.icon({
  iconUrl: './assets/icons/dest.png',
  iconSize: [30, 30],
  iconAnchor: [5, 30],
  popupAnchor: [-3, -76],
})

let DRONE_ID = 1

/* =========================================================================
============================================================================
                                   DOM
============================================================================
============================================================================
*/

const inDroneId = document.getElementById('inDroneId')
const inLat = document.getElementById('inLat')
const inLong = document.getElementById('inLong')
const inLaunch = document.getElementById('inLaunch')

const droneQueue = document.getElementById('droneQueue')


/* =========================================================================
============================================================================
                                CLASS
============================================================================
============================================================================
*/

class Destination {
  constructor(pos) {
    this.pos = pos

    this.marker = L.marker(pos, { icon: DEST_ICON }).addTo(map)

    // this.eta
  }
}

class Drone {
  constructor(id, pos, dest) {
    this.id = id                              // drone ID
    this.state = null                         // 
    this.status = null                        // current 
    this.pos = pos                            // current pos of drone [0] - lat [1] - long  
    this.alt                                  // current alt of drone
    this.cog                                  // current heading of drone
    this.sog                                  // current speed of drone km/h
    this.brg                                  // current bearing to destination
    this.dis                                  // distance remaining to destination
    this.destination = new Destination(dest)  // destination OBJECT
    this.flight                               // stores setInterval of flight
    this.log = []                             // flight log
    // UI 
    this.ui
    // handle map - map
    this.marker = L.marker(pos, { icon: DRONE_ICON, title: this.id }).addTo(map)
    this.track = L.polyline(this.log, { color: 'grey' }).addTo(map)
    this.path = L.polyline(this.log, { color: 'red' }).addTo(map)
    this.vector = L.polyline([this.pos], { color: 'blue' }).addTo(map)
  }

  /* Setters */

  setDestination(pos) {
    this.destination = new Destination(pos)
  }

  setAltitude(alt) {
    this.alt = alt
  }

  setCog(deg) {
    this.cog = deg ? deg : this.getBearing()
  }

  setBearing(brg) {
    this.brg = brg ? brg : this.getBearing()
  }

  setSog(speed) {
    this.sog = speed
  }

  setDistance() {
    this.distance = this.getDistance()
  }

  setPosition(ms) {
    this.pos = this.getPosition(ms)
  }

  setState(state) {
    this.state = state ? state : 'pending'
  }

  setStatus(status) {
    this.status = status ? status : 'pending'
  }

  setLog() {
    const time = new Date()

    this.log.push([time.toUTCString(), this.status, this.state, this.pos, this.alt, this.cog, this.sog])
  }

  /* Getters */

  getDistance(pos = this.pos, target = this.destination.pos) {
    let latDrone = this.toRadians(pos[0]);
    let longDrone = this.toRadians(pos[1]);
    let latDest = this.toRadians(target[0]);
    let longDest = this.toRadians(target[1]);

    // Haversine formula
    let dlong = longDest - longDrone;
    let dlat = latDest - latDrone;
    let a = Math.pow(Math.sin(dlat / 2), 2)
      + Math.cos(latDrone) * Math.cos(latDest)
      * Math.pow(Math.sin(dlong / 2), 2);

    let c = 2 * Math.asin(Math.sqrt(a));

    // calculate the result

    const dist = c * EARTH_RADIUS

    return dist;
  }

  getBearing(pos = this.pos, target = this.destination.pos) {
    let latDrone = this.toRadians(pos[0]);
    let longDrone = this.toRadians(pos[1]);
    let latDest = this.toRadians(target[0]);
    let longDest = this.toRadians(target[1]);

    let y = Math.sin(longDest - longDrone) * Math.cos(latDest)
    let x = Math.cos(latDrone) * Math.sin(latDest) -
      Math.sin(latDrone) * Math.cos(latDest) * Math.cos(longDest - longDrone)
    let brng = Math.atan2(y, x)
    brng = this.toDegrees(brng)

    const bearing = (brng + 360) % 360

    return bearing
  }

  getPosition(ms, speed = this.sog, pos = this.pos) {
    const distance = speed * (ms / 3600000)

    const bearing_rad = this.toRadians(this.brg)

    const latPrev = this.toRadians(pos[0])
    const longPrev = this.toRadians(pos[1])

    const lat2 = Math.asin(Math.sin(latPrev) * Math.cos(distance / EARTH_RADIUS) + Math.cos(latPrev) * Math.sin(distance / EARTH_RADIUS) * Math.cos(bearing_rad))
    const lon2 = longPrev + Math.atan2(
      Math.sin(bearing_rad) * Math.sin(distance / EARTH_RADIUS) * Math.cos(latPrev),
      Math.cos(distance / EARTH_RADIUS) - Math.sin(latPrev) * Math.sin(lat2)
    )

    return [this.toDegrees(lat2), this.toDegrees(lon2)]
  }

  /* Functional */

  launch() {
    /* Init drone metrics */
    this.setAltitude(ZERO)
    this.setSog(ZERO)
    this.setCog()
    this.setBearing()
    this.setDistance()
    this.setState('launched')
    this.setStatus('delivering')

    this.createTrack()
    /* Start drone and set first log */
    this.setLog()
    this.fly(MS)
  }

  fly(ms) {
    /* creates a interval which will be executed each ms */ 
    this.flight = setInterval(() => {
      this.setBearing()
      this.setCog()
      this.setDistance()
      this.setPosition(ms)

      this.flyController()
      this.createVector(VECTOR_MS)

      this.setLog()
      this.updateUI()
    }, ms)
  }

  flyController() {
    /* handel alt, speed, course, state and status of drone */ 
    if (this.alt < SAFE_ALT && this.distance > SAFE_DIST) {               // handle lift off
      this.setAltitude(this.alt += 5)
      this.setSog(ZERO)
      this.setState('lift off')
    } else if (this.alt <= SAFE_ALT && this.distance <= LANDING_AREA) {   // handle landing
      if (this.alt > ZERO) {                // if landing
        this.setSog(ZERO)
        this.setAltitude(this.alt - 5)
        this.setState('landing')
      } else {                               // if landed
        this.flyStop()
        this.setState('landed')
        this.flyHome()
        if (this.status === 'delivering') {  // update if delivered
          this.setStatus('delivered')
        }
      }
    } else if (this.alt <= SAFE_ALT && this.distance < LANDING_DIST) {    // handle approach to landing
      this.setSog(LANDING_SPEED)
      this.setState('approach landing')
    } else if (this.alt <= SAFE_ALT && this.distance < SAFE_DIST) {       // handle approach
      this.setSog(SAFE_SPEED_MIN)
      this.setState('approach')
    } else if (this.alt <= SAFE_ALT && this.distance > SAFE_DIST) {       // handle passage
      this.setSog(SAFE_SPEED_MAX)
      this.setState('passage')
    }
  }

  flyHome() {
    /* Check status of drone if it's home and delivered or canceled set full log for flight */
    if (this.state === "landed" && (this.status === "delivered" || this.status === "canceled")) {
      this.flyStop()
      this.setStatus('home')

      return setTimeout(() => {
        LOGS.addFlight(this)
        this.destroyDrone()
      }, 3000)
    }

    /* else set new destination to home */
    map.removeLayer(this.destination.marker)

    this.setDestination(POS_BEAUMONT)
    this.fly(MS)
  }

  flyCancel() {
    this.flyStop()
    this.setStatus('canceled')
    this.flyHome()
  }

  flyStop() {
    clearInterval(this.flight)
  }

  updateUI() {
    this.ui.children[1].children[0].textContent = this.state
    this.ui.children[2].children[0].textContent = this.status
    this.ui.children[3].children[0].textContent = this.pos[0]
    this.ui.children[4].children[0].textContent = this.pos[1]
    this.ui.children[5].children[0].textContent = `${this.alt} m`
    this.ui.children[6].children[0].textContent = `${this.distance.toFixed(2)} km`
    this.ui.children[7].children[0].textContent = `${this.cog.toFixed(1)}°`
    this.ui.children[8].children[0].textContent = `${this.sog} km/h`

    this.path.addLatLng(this.pos)
    this.marker.setLatLng(this.pos)
  }

  createTrack() {
    let speed = SAFE_SPEED_MAX
    this.track.addLatLng(this.pos)

    let dist = this.getDistance()
    let brg = this.getBearing()
    let pos = this.getPosition(MS, speed, this.pos)

    while (dist >= LANDING_AREA) {
      if (dist <= SAFE_DIST) speed = SAFE_SPEED_MIN
      if (dist <= LANDING_DIST) speed = LANDING_SPEED

      dist = this.getDistance(pos)
      brg = this.getBearing(pos)
      pos = this.getPosition(MS, speed, pos)
      
      this.track.addLatLng(pos)
    }
  }

  createVector(ms) {
    // reset old vector arr
    this.vector._latlngs.length = 0

    let pos = this.getPosition(ms, this.sog, this.pos)
    
    this.vector.addLatLng(pos)
    this.vector.addLatLng(this.pos)
  }

  destroyDrone() {
    // clear all UI elements and remove drone
    map.removeLayer(this.marker)
    map.removeLayer(this.path)
    map.removeLayer(this.track)
    map.removeLayer(this.vector)
    map.removeLayer(this.destination.marker)
    this.ui.remove()
  }

  /* Helpers */

  toRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  toDegrees(radians) {
    return radians * 180 / Math.PI;
  }
}

class Flights {
  constructor() {
    this.logs = []
  }

  addFlight(drone) {
    this.logs.push(new Flight(drone))

    console.log(this)     // log all flights
  }
}

class Flight {
  constructor(drone) {
    this.id = Date.now()
    this.droneId = drone.id
    this.log = drone.log
  }
}

/* =========================================================================
============================================================================
                              UI
============================================================================
============================================================================
*/

const createElem = (elem, str = null, children = null) => {
  const createQueueItem = document.createElement(elem)
  createQueueItem.textContent = str

  if (children) children.forEach(child => createQueueItem.appendChild(child))

  return createQueueItem
}

const createQueueItem = (drone) => {
  const elements = [
    createElem("h4", 'Drone ID:', [createElem('span', drone.id)]),
    createElem("p", 'State', [createElem('span', drone.state)]),
    createElem("p", 'Status', [createElem('span', drone.status)]),
    createElem("p", 'Lat:', [createElem('span', drone.lat)]),
    createElem("p", 'Long:', [createElem('span', drone.long)]),
    createElem("p", "Altitude:", [createElem('span', drone.alt)]),
    createElem("p", "Distance:", [createElem('span', drone.distance)]),
    createElem("p", "Course:", [createElem('span', drone.cog)]),
    createElem("p", "Speed:", [createElem('span', drone.sog)])
  ]

  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = "Cancel"

  const item = createElem("div", null, elements)
  item.classList.add('drone-queue_item')
  item.appendChild(cancelBtn)

  cancelBtn.addEventListener('click', function () {
    drone.flyCancel()
  })


  return item
}

const resetForm = () => {
  inDroneId.value = ++DRONE_ID

  inLat.value = 0
  inLong.value = 0
}

/* =========================================================================
============================================================================
                                  MAP
============================================================================
============================================================================
*/

// init map
const map = L.map('map').setView(POS_MAP_CENTER, 14.3)
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map)

const homeLocation = L.marker(POS_BEAUMONT, { icon: HOME_ICON }).addTo(map);
const selectLocation = L.marker(POS_ZERO).addTo(map)

// on click get position
map.on('click', (e) => {
  const lat = e.latlng.lat
  const long = e.latlng.lng

  inLat.value = lat
  inLong.value = long

  selectLocation.setLatLng(e.latlng)
})

/* =========================================================================
============================================================================
                             EVENTS
============================================================================
============================================================================
*/

inLaunch.addEventListener('click', handleLaunch)

function handleLaunch(e) {
  e.preventDefault()

  const id = inDroneId.value
  const lat = inLat.value
  const long = inLong.value

  const drone = new Drone(id, POS_BEAUMONT, [lat, long])

  drone.ui = createQueueItem(drone)

  droneQueue.appendChild(drone.ui)

  selectLocation.setLatLng(POS_ZERO)

  drone.launch()

  resetForm()
}

/* =========================================================================
============================================================================
                              START
============================================================================
============================================================================
*/

const LOGS = new Flights()

inDroneId.value = DRONE_ID
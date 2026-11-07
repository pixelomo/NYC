# PIXEL NYC

A living, isometric pixel-art New York City diorama that runs in the browser. Everything you see
and hear is generated procedurally at load time: no image or sound files.

![Pixel NYC](docs/preview.png)

## Run it

Just open `index.html` in a browser — it loads the pre-built bundle `dist/pixel-nyc.js`, so it
works straight from disk, from any static server, or on GitHub Pages. Requires WebGL2 (any recent
Chrome, Edge, Firefox or Safari).

For development, `dev.html` loads the ES modules in `src/` directly (serve the folder, e.g.
`python3 -m http.server 8000`, then open `http://localhost:8000/dev.html`). After changing the
sources, rebuild the bundle with:

```bash
npm install
npm run build
```

## What's in the city

![The whole city from above: Midtown's towers and Times Square, Central Park, the Financial District, the East River, the Brooklyn Bridge and the Statue of Liberty](docs/city.png)

- **12×12 blocks** of Manhattan-style city on a floating diorama slab, laid out roughly like the
  real island: **Central Park** fills four blocks uptown between brownstone and walk-up streets,
  Midtown packs in the towers, landmarks and a four-block **Times Square**, the Village, SoHo-style
  lofts and **Chinatown** sit below it, and the Financial District fills the southern tip. The
  **East River** runs down the east side past a granite quay, with the **Brooklyn Bridge** striding
  out over it and the **Statue of Liberty** on her island at the harbour mouth. Pick a place from
  the **GO TO** menu to glide there, or press **V** for a bird's-eye view (top-down, tilted just
  enough to show the building fronts). The slab's cross-section reveals soil, schist and utility
  pipes — and a **subway tunnel** where silver trains loop around the city and stop at a tiled
  station with passengers waiting on the platform.
  - an art-deco skyscraper with stepped setbacks and a crown that lights up at night in seasonal
    colours, a blue glass curtain-wall tower, a dark bronze modernist tower with plaza fountains,
    a limestone office with a copper roof, and a hotel with a vertical neon sign and marquee
  - rows of **brownstones** with stoops, iron railings, cornices, areaway gardens and backyards
  - red-brick **walk-ups** with zig-zag fire escapes, storefronts (bodega, pizza, laundromat,
    coffee, bar, florist…), awnings, roll-down graffiti gates at night, ghost signs on side walls
  - cast-iron **lofts** with a sidewalk shed, a firehouse, a movie theater marquee
  - rooftops packed with water towers (some painted like flags), billboards, bulkheads, HVAC,
    chimneys, satellite dishes, roof decks and gardens
  - pre-war **red-brick apartment houses**, six and seven storeys, with fire escapes, water
    towers and canvas entrance canopies reaching to the kerb
  - **shopping streets**: a storefront in every building (shoes, fashion, electronics, toys,
    jewellery, bakery, records, sports…) with window displays, awnings, sandwich boards and
    district banners on the lamp posts, and a limestone **department store** with lit display
    windows, revolving doors and flags
- **Landmarks**, each built from the same pixel kit as the rest of the town (and each on the
  GO TO menu):
  - an **Empire State**-style art-deco tower with five setbacks, full-height aluminium piers, a
    crown lit in seasonal colours and the mooring mast on top — the tallest thing in Midtown
  - a **Chrysler**-style tower: white brick, steel eagles at the setback, a crown of stacked
    stainless sunbursts with triangular windows, and the needle spire
  - **One World Trade Center**, its square glass shaft twisting into eight triangular facets as
    it rises to a parapet and a long spire
  - **Rockefeller Center**: the limestone slab over the sunken plaza (fountains in summer, a rink
    in winter) with the golden statue, a ring of flags, and the big tree at Christmas
  - the **Flatiron** wedge on its triangular lot, prow pointing up the avenue, beside a plaza with
    tables and a sidewalk clock
  - **Grand Central**'s Beaux-Arts front (three great arched windows, the clock and sculpture on
    top) with the office slab rising behind it
  - the **Public Library**, a marble palace behind wide steps and two stone lions, with **Bryant
    Park**'s lawn, gravel walks, plane trees, benches and fountain behind it
  - an **arena**: a great drum of concrete fins on a glass podium wrapped in marquee screens
  - the **Stock Exchange**'s temple front — six giant columns, a sculpted pediment and a huge flag
  - **Washington Square**: lawns, paths, the round fountain and the white marble arch
  - **Chinatown**: red-and-gold shopfronts (dumplings, tea, herbs, seafood, bakeries), red
    lanterns strung along the street and a gate with a green-tiled roof
  - the **Brooklyn Bridge**: a granite abutment at the quay, a deck with a raised boardwalk running
    through the Gothic stone tower, and the main cables sweeping down with their suspenders and web
    of diagonal stays
  - the **Statue of Liberty** on a grassy island with the star-shaped fort and granite pedestal,
    torch held high, floodlit at night
- **Times Square** takes over four blocks: the streets inside are closed to traffic and paved
  into one pedestrian plaza, ringed by towers whose facades are stacked with animated screens, lit
  billboards and a scrolling news ticker. Its south-east corner is left open as a square of its
  own, where red bleacher steps rise behind a ticket booth, crowded with people taking in the
  lights, among café tables, planters, carts and floodlights. A bronze statue stands at the north
  end and a tower with a crystal ball on its mast at the south end (the ball drops at midnight on
  winter nights, then fireworks). The city opens on this view. All the ads are made up; at night
  the screens wash the square in colour.
- A **basketball court** with chain-link fence, hoops and floodlights, a playground with a swing
  set (kids pump the swings on their chains), a slide with a ladder, deck and roof, a sprinkler,
  and a handball wall with a mural.
- **Central Park** takes over the streets between its four blocks:
  a stone wall with gate pillars, a loop drive for joggers, an elm-lined promenade leading to a
  tiered fountain on a paved terrace, a mown oval Great Lawn, a lake with an island, rocky
  shores, a boat dock and rowboats (an ice rink in winter), a statue garden with formal flower
  beds, a cherry grove, a wooded ramble with pines and boulders, a dog run, and over a hundred
  trees, lanterns and benches. Benches line its outer wall, and the bus loops round it.
- Streets with crosswalks, working **traffic and pedestrian signals**, street lamps, hydrants,
  mailboxes, newspaper boxes, bus shelters, subway entrances with green globes, food carts, and
  steel **vent grates in the sidewalks** and manholes that puff steam (most in winter).

## Life

- **People** with routines: commuters heading for the subway, office workers, lunch at the halal
  cart, kids after school, joggers, dog walkers, tourists, retirees feeding pigeons, stoop sitters
  on summer evenings, trick-or-treaters in autumn. They path-find along sidewalks, wait for the
  WALK signal, climb stoops, enter shops and come out with bags, and open umbrellas in the rain.
- **Traffic**: yellow cabs, cars, vans, trucks and buses obey signals, turn, yield to pedestrians
  and oncoming traffic, park and pull out. A bus loops round the park between stops; a fire truck sometimes races
  out with sirens; garbage trucks run in the morning; an ice-cream truck plays its jingle in summer;
  snow plows clear winter streets. Late at night signals switch to flashing yellow/red.
- **Animals**: pigeon flocks peck, scatter when people pass, perch on lamps and water towers and
  wheel over the rooftops; dogs on leashes stop to sniff; squirrels, ducks, bodega cats, rats at
  night and migrating geese in autumn.

## Time, seasons and weather

- A full **day/night cycle** with a moving sun and real-time shadows, moonlight, stars, lit windows
  that switch on through the evening, street lamps with light pools, neon, headlights and bloom.
- **The season changes every day**: spring (cherry blossoms, tulips, showers) → summer (pickup
  basketball, open fire hydrant, sprinklers, fireflies, fireworks) → autumn (orange foliage,
  falling leaves, pumpkins, geese) → winter (snow, snowball fights, snowmen, skating, Christmas
  tree and lights, heavier steam).
- **Weather**: clear, cloudy, rain (wet reflective streets and puddles), thunderstorms with
  lightning, snow and fog. Cloud shadows drift across the city.

## Sound

All sound effects are synthesised live with WebAudio and positioned by where they happen on
screen: city hum, wind, rain and thunder, birdsong, crickets, car horns, sirens, bus air brakes,
the ice-cream truck, ball dribbles/rim/swish, snowballs, pigeon coos and wing flaps, barking dogs,
geese, subway rumble, crosswalk chirps and fireworks. Click **♪** to turn sound on.

## Play mode

Press **P** (or **PLAY** in the toolbar) to take over whoever you are following, or the person
nearest the middle of the screen; the camera switches to the bird's-eye view and follows you.

- Walk with **WASD** / arrows (relative to the screen), **Shift** to run. Buildings, walls,
  fences and cars are solid.
- **F** next to a car gets you in: a parked car (it may set off its alarm) or a moving one — the
  driver gets out and runs off shouting. **F** again gets you out; the car stays where you left it.
- Drive with **W/S** to accelerate and brake/reverse, **A/D** to steer, **Space** for the
  handbrake (the tail slides out). Cars are rigid bodies with momentum and spin: hits push, spin
  and stop cars instead of passing through them, lane traffic gets knocked off its lane in a real
  crash (or nudged back onto it after a bump), and parked cars get shoved.
- **Damage** collects on the side that took the hit: the front or back crumples, the sides dent
  where they were struck, panels get scraped to bare metal, lamps smash and glass cracks. A badly
  hurt engine smokes (grey, then black), then catches fire; a burning car explodes a few seconds
  later — a fireball, debris in the car's own paint, a scorch mark, a jolt of the camera — throwing
  nearby cars about (chain reactions included) and knocking people flat. What's left is a burnt-out
  shell that smoulders for a while.
- **The pistol**: aim with the mouse and **click** to shoot (hold to keep firing), or **Space** on
  foot to shoot at whoever is in front of you; **R** reloads the 12-round clip. It works out of a
  car window too. People who are shot go down in a spreading pool of blood; police officers take
  two hits. Gunfire sends everyone nearby running and the pigeons into the air; shooting a car
  dents it, breaks its glass and eventually sets it on fire.
- **Wanted level**: the moment the police come after you, you get **one star** out of five. The
  longer the chase runs and the more damage you do (cars wrecked, people hurt, officers down),
  the more stars — and the more police cars, faster and pushier: from three stars they cut you
  off, from four they ram. Crimes the police don't see still get reported by witnesses a few
  seconds later. Cars pull up and officers jump out to chase you on foot, guns drawn; if they
  grab you (or their cars box you in) you're **BUSTED** and released across town with a clean
  slate. Break line of sight and keep out of view (a low wall or a bench won't hide you); when the
  stars start blinking they're searching, and if they don't find you, you've lost them. Hide
  somewhere a car can't reach — inside the park walls, up on a plaza — and the patrol car parks as
  close as it can get while its crew comes in after you on foot.
- **Esc** (or **P**) hands the person back to their day.

## Controls

| Input | Action |
| --- | --- |
| Drag | Pan |
| Wheel / pinch / `+` `-` | Zoom (pixel-perfect steps) |
| `Q` / `E` | Rotate the view 90° |
| Click a person | Follow them (see their name and what they're thinking) |
| `WASD` / arrows | Pan |
| GO TO menu | Glide to the park, Times Square, the landmarks, the bridge, the statue… |
| `V` | Bird's-eye / isometric view |
| `P` | Play as someone (see Play mode) |
| Click / `Space` / `R` (playing) | Shoot / shoot on foot or handbrake in a car / reload |
| `Space` | Pause / resume time |
| `T` | Time speed (1×, 3×, 10×, 30×) |
| `1`–`4` / `0` | Pick a season / back to daily seasons |
| `F` / `Esc` | Follow a random person / stop following |
| `X` | Fireworks |
| `M` | Sound on/off |
| `H` | Help |

URL parameters are handy for jumping straight to a moment, e.g.
`?hour=21&season=3&weather=snow&zoom=3&rot=1`.

## How it works

- `src/render/` – a WebGL2 renderer with a true 2:1 pixel projection rendered into a low-res buffer
  and scaled up with nearest-neighbour filtering. The art is authored at 32 texels per world unit
  (one unit is 2 m, so 16 pixels per metre); the default zoom shows one art pixel per CSS pixel. Passes: sun shadow map → world-space light map
  (lamps, shop windows, headlights, fireworks) → scene (MRT colour + glow + depth) → bloom →
  composite with sub-pixel smooth scrolling and depth-based outlines.
- `src/world/` – the procedural city: a pixel painter writes facades, roofs and the ground into a
  texture-array atlas (the alpha channel encodes when each window lights up), and a mesh builder
  creates boxes, prisms, cylinders and alpha-tested quads (railings, fences, fire escapes).
  `layout.js` is the 12×12 block map (with merged regions for Central Park and Times Square and
  the river column), `landmarks.js` and `timessq.js` build the one-off places. To keep the big map
  quick to build and light on memory, ordinary blocks come in a few seeded variants per type whose
  atlas art is painted once and reused, and the ground is painted at half the art resolution with
  the fine grain added back in the shader.
- `src/render/sprites.js` – palette-indexed sprites: one person template covers every skin, hair
  and clothing colour (26×42-pixel figures with faces, hairstyles, hats, coats, bags and a shaded
  outline); trees swap palettes per season (leaves hide in winter, revealing branches).
- `src/render/carLayer.js` – instanced 3D vehicles. Bodies are lofted from cross-sections
  (chamfered corners, sloped hoods and windshields, cabins that narrow towards the roof) with
  10-sided wheels, hubcaps, bumpers, mirrors and light bars. Their textures are projected from the
  palette atlas, so headlights, brake lights, sirens and lit bus windows switch via palette rows.
  Crash damage is per instance: the vertex shader crumples the ends and dents the sides around
  the point of impact, the fragment shader scrapes paint, smashes lamps, crazes glass and chars
  burnt-out shells.
- `src/render/decalLayer.js` – flat marks on the ground (blood pools that spread, splatter, scorch
  marks) as instanced quads lying on the ground plane, lit like everything else.
- `src/sim/` – environment (clock, sun, seasons, weather), traffic, pedestrians and navigation,
  activities, animals and particles. The simulation keeps its detail around where you're looking
  (or who you're playing): people and cars appear nearby and quietly retire far off-screen, so the
  whole city stays alive without simulating every street at once. `vehicles.js` is the car physics (boxes with momentum and
  spin, tyre grip, wall contacts from the collision grid, separating-axis contacts with impulses
  between cars, damage, fire and explosions) and `player.js` the play mode (driving, the pistol,
  the wanted level, police in cars and on foot).
- `src/audio/` – the procedural sound engine.

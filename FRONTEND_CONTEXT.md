# TripCanvas Frontend Context

## Product
TripCanvas is an AI-native travel planner that turns saved Instagram Reels plus user preferences into a visual, actionable trip world.

The backend agent pipeline is handled by teammates and already works:
- Live Instagram Reel extraction is tested.
- Agents extract places from Reels.
- Agents perform live travel research.
- Agents can stream hotel comparison / recommendation output.

My responsibility is the frontend experience.

## Frontend Goal
Build a cinematic 3D map-backed travel planning interface.

The frontend should make users understand:
1. Which real places were extracted from their saved Reels.
2. Where those places are spatially.
3. How those places fit into a day-by-day itinerary.
4. Why the agent recommends certain hotels or actions.

The frontend should feel premium and visual, but must remain practical and demo-safe.

## Core UX
The main screen should have:

- Full-screen 3D / tilted map background.
- Left panel for trip summary, destination, dates, preferences, detected places, and day selector.
- Center map with pins, selected place cards, route lines, and camera movement.
- Right panel for streaming AI agent output.
- Bottom rail for saved places / itinerary cards.

## Important Design Principle
The screenshot reference is a mood reference, not an exact product spec.

Do not build a fully custom 3D city from scratch.
Use a real map engine for geospatial accuracy.

Preferred frontend direction:
- Mapbox GL JS or MapLibre GL for the main 3D map.
- React DOM overlays for cards and panels.
- Tailwind CSS for styling.
- Framer Motion for controlled transitions.
- React Three Fiber only for optional decorative elements, not the core map.

## What To Build First
Priority order:

1. Data contract integration with backend sample payload.
2. 3D map prototype centered on destination.
3. Place pins from backend data.
4. Click pin -> selected place card -> camera fly-to.
5. Day selector -> filter pins and route.
6. Right-side agent panel using SSE streaming.
7. Hotel comparison UI.
8. Loading, empty, and error states.
9. Visual polish after everything works.

## What Not To Build For v0
Avoid:
- Full custom Three.js city.
- Flipbook/page-turn interaction.
- Nested pages inside nested pages.
- Real booking checkout.
- Too many pin types.
- Heavy overanimation.
- Rendering all UI inside Three.js.
- Letting raw streamed text control the layout.

## Suggested Data Shape

```ts
type TripResponse = {
  tripId: string;
  destination: {
    city: string;
    country: string;
    center: {
      lat: number;
      lng: number;
    };
    zoom: number;
  };
  userPreferences: string[];
  sourceReels: {
    id: string;
    url: string;
    thumbnailUrl?: string;
    extractedPlaces: string[];
  }[];
  places: Place[];
  itineraryDays: {
    day: number;
    title: string;
    summary: string;
    placeIds: string[];
    route?: {
      coordinates: [number, number][];
      durationMinutes?: number;
      distanceKm?: number;
    };
  }[];
};

type Place = {
  id: string;
  name: string;
  type: "restaurant" | "hotel" | "landmark" | "station" | "activity";
  lat: number;
  lng: number;
  imageUrl?: string;
  sourceReelUrl?: string;
  confidence?: number;
  day?: number;
  summary?: string;
};
import type { Stop } from "./types";

/** Seed campus stops for the XSI Swing Bus POC. */
export const DEFAULT_STOPS: Stop[] = [
  {
    id: "hq-lobby",
    name: "HQ Lobby",
    shortCode: "HQ",
    lat: 37.3861,
    lng: -122.0839,
    description: "Main lobby pickup — front circle",
  },
  {
    id: "building-b",
    name: "Building B",
    shortCode: "B",
    lat: 37.3872,
    lng: -122.0815,
    description: "South entrance near the bike racks",
  },
  {
    id: "garage-p3",
    name: "Garage P3",
    shortCode: "P3",
    lat: 37.3848,
    lng: -122.0852,
    description: "Level 1 shuttle bay",
  },
  {
    id: "cafe-row",
    name: "Cafe Row",
    shortCode: "CR",
    lat: 37.388,
    lng: -122.0844,
    description: "Across from the cafeteria plaza",
  },
  {
    id: "remote-lot",
    name: "Remote Lot",
    shortCode: "RL",
    lat: 37.3829,
    lng: -122.0798,
    description: "Overflow parking shuttle stop",
  },
  {
    id: "lab-wing",
    name: "Lab Wing",
    shortCode: "LW",
    lat: 37.3891,
    lng: -122.0821,
    description: "East lab entrance",
  },
];

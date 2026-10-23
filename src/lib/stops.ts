import type { Stop, StopService } from "./types";

/**
 * MEM (Memphis / Macroharder) shuttle stops from “MEM Shuttle Info”.
 *
 * Lat/lng are approximate placeholders clustered around Stateline Rd /
 * Southaven–Memphis for ETA math. Replace with pin-accurate coords when
 * available — ETAs and “next shuttle” ranking depend on them.
 */
export const DEFAULT_STOPS: Stop[] = [
  {
    id: "food-trucks-war-room",
    name: "Food Trucks / War Room",
    shortCode: "FT",
    lat: 35.0024,
    lng: -90.0148,
    description: "Onsite pickup",
    service: "onsite",
  },
  {
    id: "crossroads",
    name: "Crossroads",
    shortCode: "XR",
    lat: 35.0018,
    lng: -90.0126,
    description: "Onsite + offsite pickup",
    service: "both",
  },
  {
    id: "macroharder-west",
    name: "Macroharder West",
    shortCode: "MW",
    lat: 35.0012,
    lng: -90.0162,
    description: "Onsite · 2400 Stateline Rd campus west",
    service: "onsite",
  },
  {
    id: "macroharder-east",
    name: "Macroharder East",
    shortCode: "ME",
    lat: 35.0015,
    lng: -90.0104,
    description: "Onsite + offsite · east lot / contractor parking",
    service: "both",
  },
  {
    id: "church-lot",
    name: "Church Parking Lot",
    shortCode: "CH",
    lat: 35.0048,
    lng: -90.0082,
    description: "Offsite · Surge Concierge / Onboarding",
    service: "offsite",
  },
  {
    id: "southland-mall",
    name: "Southland Mall Parking Lot",
    shortCode: "SM",
    // Approximate public mall pin — refine to the shuttle curb.
    lat: 35.0475,
    lng: -90.025,
    description: "Offsite · Southland Mall, Memphis",
    service: "offsite",
  },
  {
    id: "duke",
    name: "Duke",
    shortCode: "DK",
    lat: 34.9996,
    lng: -90.0138,
    description: "Onsite · Control Room / Beer Garden / Rockstar Camp",
    service: "onsite",
  },
  {
    id: "gun-range",
    name: "Gun Range",
    shortCode: "GR",
    lat: 34.9988,
    lng: -90.0112,
    description: "Onsite pickup",
    service: "onsite",
  },
  {
    id: "spam-nexus",
    name: "Spam / Nexus",
    shortCode: "SN",
    lat: 35.0006,
    lng: -90.0155,
    description: "Onsite · Spam shuttle stop · Stateline Rd",
    service: "onsite",
  },
];

export function serviceLabel(service: StopService | undefined): string {
  switch (service) {
    case "onsite":
      return "Onsite";
    case "offsite":
      return "Offsite";
    case "both":
      return "Onsite + Offsite";
    default:
      return "";
  }
}

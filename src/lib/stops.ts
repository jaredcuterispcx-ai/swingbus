import type { Stop, StopService } from "./types";

/**
 * MEM (Memphis / Southaven) shuttle stops from “MEM Shuttle Info”.
 *
 * Pins mark the pickup spot (lot or drive aisle), not the building center.
 * Stops marked “Placeholder” still need a real pin, here and in /admin for
 * running stores; ETAs and “next shuttle” ranking depend on it.
 */
export const DEFAULT_STOPS: Stop[] = [
  {
    id: "food-trucks-war-room",
    name: "Food Trucks / War Room",
    shortCode: "FT",
    // Placeholder: real pickup spot unknown.
    lat: 35.0024,
    lng: -90.0148,
    description: "Onsite pickup",
    service: "onsite",
  },
  {
    id: "crossroads",
    name: "Crossroads",
    shortCode: "XR",
    // Placeholder: real pickup spot unknown.
    lat: 35.0018,
    lng: -90.0126,
    description: "Onsite + offsite pickup",
    service: "both",
  },
  {
    id: "macroharder-west",
    name: "Macroharder West",
    shortCode: "MW",
    lat: 34.99352,
    lng: -90.03669,
    description: "Onsite · 2400 Stateline Rd campus west",
    service: "onsite",
  },
  {
    id: "macroharder-east",
    name: "Macroharder East",
    shortCode: "ME",
    lat: 34.99352,
    lng: -90.03172,
    description: "Onsite + offsite · east lot / contractor parking",
    service: "both",
  },
  {
    id: "church-lot",
    name: "Church Parking Lot",
    shortCode: "CH",
    // Placeholder: real pickup spot unknown.
    lat: 35.0048,
    lng: -90.0082,
    description: "Offsite · Surge Concierge / Onboarding",
    service: "offsite",
  },
  {
    id: "southland-mall",
    name: "Southland Mall Parking Lot",
    shortCode: "SM",
    lat: 35.02019,
    lng: -90.02188,
    description: "Offsite · Southland Mall, Memphis",
    service: "offsite",
  },
  {
    id: "duke",
    name: "Duke",
    shortCode: "DK",
    lat: 34.98184,
    lng: -90.03984,
    description: "Onsite · Control Room / Beer Garden / Rockstar Camp",
    service: "onsite",
  },
  {
    id: "gun-range",
    name: "Gun Range",
    shortCode: "GR",
    lat: 34.97982,
    lng: -90.04397,
    description: "Onsite pickup",
    service: "onsite",
  },
  {
    id: "spam-nexus",
    name: "Spam / Nexus",
    shortCode: "SN",
    // Placeholder: real pickup spot unknown.
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

/**
 * crmNominatimAddress.test.
 *
 * Asserts Nominatim hit → CRM address row/value mapping for US, UK, and edge-case OSM address shapes.
 *
 * Under test: `crmNominatimAddress` (`nominatimHitToAddressFormRow`, `nominatimHitToAddressValue`).
 */
import { describe, expect, it } from "vitest";

import { nominatimHitToAddressFormRow, nominatimHitToAddressValue } from "./crmNominatimAddress.js";

describe("nominatimHitToAddressFormRow", () => {
  it("maps US hit: house on houseNumber, road on line1, city state postcode country", () => {
    const row = nominatimHitToAddressFormRow({
      display_name: "Google Building 41, 1600 Amphitheatre Parkway, Mountain View, CA 94043, United States",
      address: {
        house_number: "1600",
        road: "Amphitheatre Parkway",
        city: "Mountain View",
        state: "California",
        postcode: "94043",
        country: "United States",
        country_code: "us"
      }
    });
    expect(row.houseNumber).toBe("1600");
    expect(row.addressLine1).toBe("Amphitheatre Parkway");
    expect(row.city).toBe("Mountain View");
    expect(row.state).toBe("California");
    expect(row.postalCode).toBe("94043");
    expect(row.country).toBe("United States");
  });

  it("maps UK-style Nominatim address (quarter, suburb, state_district on line2)", () => {
    const row = nominatimHitToAddressFormRow({
      display_name:
        "10 Downing Street, 10, Downing Street, Westminster, Covent Garden, City of Westminster, Greater London, England, SW1A 2AA, United Kingdom",
      address: {
        office: "10 Downing Street",
        house_number: "10",
        road: "Downing Street",
        quarter: "Westminster",
        suburb: "Covent Garden",
        city: "City of Westminster",
        state_district: "Greater London",
        state: "England",
        postcode: "SW1A 2AA",
        country: "United Kingdom",
        country_code: "gb"
      }
    });
    expect(row.houseNumber).toBe("10");
    expect(row.addressLine1).toBe("Downing Street");
    expect(row.city).toBe("City of Westminster");
    expect(row.state).toBe("England");
    expect(row.postalCode).toBe("SW1A 2AA");
    expect(row.country).toBe("United Kingdom");
    expect(row.addressLine2).toContain("Greater London");
    expect(row.addressLine2).toContain("Covent Garden");
    expect(row.addressLine2).toContain("Westminster");
  });

  it("maps German-style keys", () => {
    const row = nominatimHitToAddressFormRow({
      display_name: "Unter den Linden, Berlin, Germany",
      address: {
        house_number: "1",
        road: "Unter den Linden",
        suburb: "Mitte",
        postcode: "10117",
        city: "Berlin",
        state: "Berlin",
        country: "Deutschland",
        country_code: "de"
      }
    });
    expect(row.houseNumber).toBe("1");
    expect(row.addressLine1).toBe("Unter den Linden");
    expect(row.postalCode).toBe("10117");
    expect(row.city).toBe("Berlin");
    expect(row.state).toBe("Berlin");
    expect(row.country).toBe("Deutschland");
  });

  it("extracts NL postcode from display_name when postcode missing in address", () => {
    const row = nominatimHitToAddressFormRow({
      display_name: "Dam 1, 1012 JS Amsterdam, Netherlands",
      address: {
        road: "Dam",
        house_number: "1",
        city: "Amsterdam",
        country: "Nederland",
        country_code: "nl"
      }
    });
    expect(row.postalCode).toBe("1012 JS");
    expect(row.city).toBe("Amsterdam");
    expect(row.houseNumber).toBe("1");
    expect(row.addressLine1).toBe("Dam");
  });

  it("parses first display_name segment when address block is empty", () => {
    const row = nominatimHitToAddressFormRow({
      display_name: "22 Acacia Avenue, London, United Kingdom",
      address: {}
    });
    expect(row.houseNumber).toBe("22");
    expect(row.addressLine1).toBe("Acacia Avenue");
  });

  it("parses POI-led display_name when house and street are split across segments (no address object)", () => {
    const row = nominatimHitToAddressFormRow({
      display_name:
        "Google Building 41, 1600, Amphitheatre Parkway, Mountain View, Santa Clara County, California, 94043, United States",
      address: {}
    });
    expect(row.houseNumber).toBe("1600");
    expect(row.addressLine1).toBe("Amphitheatre Parkway");
    expect(row.postalCode).toBe("94043");
  });
});

describe("nominatimHitToAddressValue", () => {
  it("merges house number and road into address line 1", () => {
    const v = nominatimHitToAddressValue({
      display_name: "1600 Amphitheatre Parkway, Mountain View, CA 94043, United States",
      address: {
        house_number: "1600",
        road: "Amphitheatre Parkway",
        city: "Mountain View",
        state: "California",
        postcode: "94043",
        country: "United States",
        country_code: "us"
      }
    });
    expect(v.addressLine1).toBe("1600 Amphitheatre Parkway");
    expect(v.city).toBe("Mountain View");
    expect(v.postalCode).toBe("94043");
  });
});

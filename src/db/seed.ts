// Minimal seed so the demo story runs on an empty database.
// The data/seed stream can extend this; keep the ids stable.
export const BUILDING_ID = "bld_spring_court";
export const DAY_MANAGER = "Datte Bayo";

export const SEED = {
  building: { id: BUILDING_ID, name: "Spring Court" },
  locations: [
    { id: "loc_main_entrance", name: "Main entrance", aliases: "front door, reception, lobby" },
    { id: "loc_side_gate", name: "Side gate", aliases: "back gate, garden gate" },
    { id: "loc_bin_store", name: "Bin store", aliases: "refuse room, bin room, level minus one bin area" },
    { id: "loc_car_park", name: "Car park", aliases: "basement parking, level minus one car park" },
    { id: "loc_flat_304", name: "Flat 304", aliases: "" },
  ],
  facts: [
    { id: "fct_side_gate", text: "Side gate is open for residents and is the usual way in from the garden path." },
    { id: "fct_parcels", text: "Parcels are kept in the concierge office until residents collect them." },
  ],
};

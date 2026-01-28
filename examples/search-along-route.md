# Search Along Route Examples

This document provides examples for testing the `search-along-route` prompt in the MCP Inspector or any MCP client.

## Basic Usage

### Example 1: Coffee Shops on a Road Trip

**Prompt Arguments:**

```json
{
  "from": "Seattle, WA",
  "to": "Portland, OR",
  "search_for": "Starbucks"
}
```

**Expected behavior:**

- Geocodes Seattle and Portland
- Gets driving route (~175 miles)
- Creates 1km buffer corridor on each side of I-5
- Searches for Starbucks locations
- Filters to corridor, orders by route progress
- Displays map with route line and coffee shop markers

---

### Example 2: Gas Stations on Highway Route

**Prompt Arguments:**

```json
{
  "from": "Los Angeles, CA",
  "to": "San Francisco, CA",
  "search_for": "gas stations",
  "mode": "driving",
  "buffer_meters": "2000"
}
```

**Expected behavior:**

- Gets driving route along I-5/US-101 (~380 miles)
- Creates 2km buffer (wider for highway)
- Finds all gas stations within corridor
- Orders by position along route
- Shows results with distance markers

---

### Example 3: Rest Stops on Long Drive

**Prompt Arguments:**

```json
{
  "from": "Denver, CO",
  "to": "Salt Lake City, UT",
  "search_for": "rest stops",
  "mode": "driving"
}
```

**Expected behavior:**

- Gets I-70 route (~520 miles)
- Searches for rest areas and travel plazas
- Shows results ordered by route progress

---

### Example 4: Restaurants on Walking Route

**Prompt Arguments:**

```json
{
  "from": "Times Square, New York, NY",
  "to": "Central Park, New York, NY",
  "search_for": "restaurants",
  "mode": "walking",
  "buffer_meters": "500"
}
```

**Expected behavior:**

- Gets walking route
- Creates 500m buffer (narrower for walking)
- Finds restaurants within walking corridor
- Shows results ordered by route position

---

### Example 5: Bike Shops on Cycling Route

**Prompt Arguments:**

```json
{
  "from": "Golden Gate Bridge, San Francisco",
  "to": "Sausalito, CA",
  "search_for": "bike shops",
  "mode": "cycling",
  "buffer_meters": "750"
}
```

**Expected behavior:**

- Gets cycling route across bridge
- Searches for bike shops and repair stations
- Orders by route progress
- Shows on map with cycling-friendly visualization

---

## Testing in MCP Inspector

1. **Start the inspector:**

   ```bash
   npm run inspect:build
   ```

2. **Navigate to Prompts section**

3. **Select `search-along-route` prompt**

4. **Fill in arguments:**
   - from: `Seattle, WA`
   - to: `Portland, OR`
   - search_for: `Starbucks`
   - (leave mode and buffer_meters as defaults)

5. **Click "Run Prompt"**

6. **Expected output:**
   The AI will receive instructions to:
   - Geocode both locations
   - Get the route using `directions_tool`
   - Create buffer using `buffer_tool`
   - Search using `category_search_tool` or `search_and_geocode_tool`
   - Filter using `point_in_polygon_tool`
   - Order using `distance_tool`
   - Visualize on map

---

## Advanced Examples

### Multiple Segments (Long Routes)

For very long routes (>100km), the prompt suggests searching in segments:

**Prompt Arguments:**

```json
{
  "from": "Boston, MA",
  "to": "Miami, FL",
  "search_for": "rest stops",
  "mode": "driving",
  "buffer_meters": "3000"
}
```

**Expected behavior:**

- Route is ~1,500 miles
- Prompt instructs to search in segments
- Avoids overwhelming API with single large bbox
- Results grouped by route section

---

### Adjusting Buffer for Different Contexts

**Urban area (narrow):**

```json
{
  "from": "Union Station, Chicago",
  "to": "Navy Pier, Chicago",
  "search_for": "parking garages",
  "mode": "driving",
  "buffer_meters": "250"
}
```

**Highway (wide):**

```json
{
  "from": "Phoenix, AZ",
  "to": "Las Vegas, NV",
  "search_for": "truck stops",
  "mode": "driving",
  "buffer_meters": "5000"
}
```

---

## Verification Checklist

When testing, verify the prompt output includes:

- ✅ Geocoding instructions (if needed)
- ✅ Route retrieval with correct travel mode
- ✅ Buffer creation with specified distance
- ✅ Search within bounding box
- ✅ Point-in-polygon filtering
- ✅ Distance calculation and ordering
- ✅ Map visualization instructions
- ✅ Result formatting (name, address, distance, route position)
- ✅ Contextual information (route distance, travel time)
- ✅ Helpful notes (adjust buffer if no results, segment for long routes)

---

## Common Use Cases

- **Road trip planning**: Find chain restaurants along highway routes
- **EV charging**: Locate charging stations on long drives
- **Fuel planning**: Find gas stations with optimal spacing
- **Amenities**: Rest stops, hotels, restaurants on travel routes
- **Emergency services**: Hospitals, urgent care along routes
- **Tourist stops**: Attractions, viewpoints along scenic routes
- **Delivery logistics**: Pickup/dropoff locations near planned routes

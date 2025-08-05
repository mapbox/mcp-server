import { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';

// Full list of supported categories
const SUPPORTED_CATEGORIES = [
  'services',
  'shopping',
  'food_and_drink',
  'food',
  'health_services',
  'office',
  'restaurant',
  'education',
  'transportation',
  'grocery',
  'apartment_or_condo',
  'place_of_worship',
  'outdoors',
  'school',
  'lodging',
  'financial_services',
  'clothing_store',
  'supermarket',
  'wholesale_store',
  'beauty_store',
  'auto_repair',
  'cafe',
  'salon',
  'bus_stop',
  'government',
  'real_estate_agent',
  'tourist_attraction',
  'park',
  'medical_practice',
  'temple',
  'sports',
  'doctors_office',
  'hotel',
  'fast_food',
  'bank',
  'hairdresser',
  'nightlife',
  'entertainment',
  'pharmacy',
  'bar',
  'church',
  'consulting',
  'farm',
  'coffee',
  'medical_clinic',
  'lawyer',
  'coffee_shop',
  'bakery',
  'repair_shop',
  'fitness_center',
  'dentist',
  'factory',
  'shipping_store',
  'photographer',
  'electronics_shop',
  'home',
  'furniture_store',
  'shopping_mall',
  'atm',
  'car_dealership',
  'historic_site',
  'travel_agency',
  'hospital',
  'insurance_broker',
  'clothing',
  'post_office',
  'advertising_agency',
  'alternative_healthcare',
  'it',
  'gas_station',
  'hospital_unit',
  'hardware_store',
  'monument',
  'phone_store',
  'mosque',
  'parking_lot',
  'commercial',
  'jewelry_store',
  'river',
  'elementary_school',
  'lake',
  'convenience_store',
  'physiotherapist',
  'dessert_shop',
  'psychotherapist',
  'playground',
  'gift_shop',
  'tailor',
  'nongovernmental_organization',
  'bed_and_breakfast',
  'laundry',
  'warehouse',
  'market',
  'shoe_store',
  'car_wash',
  'pet_store',
  'kindergarten',
  'cemetery',
  'sports_club',
  'field',
  'butcher_shop',
  'landscaping',
  'care_services',
  'florist',
  'spa',
  'garden',
  'psychological_services',
  'chiropractor',
  'photo_store',
  'charging_station',
  'car_rental',
  'college',
  'womens_clothing_store',
  'public_transportation_station',
  'internet_cafe',
  'design_studio',
  'mountain',
  'social_club',
  'copyshop',
  'paper_goods_store',
  'ice_cream',
  'liquor_store',
  'art',
  'pizza_restaurant',
  'event_planner',
  'medical_supply_store',
  'employment_agency',
  'museum',
  'community_center',
  'book_store',
  'massage_shop',
  'childcare',
  'nail_salon',
  'teahouse',
  'tobacco_shop',
  'taxi',
  'tax_advisor',
  'veterinarian',
  'mexican_restaurant',
  'event_space',
  'university',
  'studio',
  'assisted_living_facility',
  'medical_laboratory',
  'equipment_rental',
  'hostel',
  'forest',
  'indian_restaurant',
  'driving_school',
  'asian_restaurant',
  'high_school',
  'optician',
  'deli',
  'sports_shop',
  'bicycle_shop',
  'library',
  'arts_and_craft_store',
  'island',
  'department_store',
  'boutique',
  'dance_studio',
  'food_court',
  'diner_restaurant',
  'storage',
  'art_gallery',
  'fashion_accessory_shop',
  'health_food_store',
  'counselling',
  'bridge',
  'tutor',
  'tattoo_parlour',
  'dry_cleaners',
  'motorcycle_dealer',
  'nightclub',
  'fire_station',
  'police_station',
  'yoga_studio',
  'indonesian_restaurant',
  'fabric_store',
  'chinese_restaurant',
  'video_game_store',
  'news_kiosk',
  'music_school',
  'funeral_home',
  'theme_park',
  'breakfast_restaurant',
  'seafood_restaurant',
  'toy_store',
  'buddhist_temple',
  'brunch_restaurant',
  'japanese_restaurant',
  'soccer_field',
  'notary',
  'juice_bar',
  'noodle_restaurant',
  'fishing_store',
  'language_school',
  'government_offices',
  'baby_goods_shop',
  'theatre',
  'university_building',
  'furniture_maker',
  'bus_station',
  'burger_restaurant',
  'townhall',
  'swimming_pool',
  'winery',
  'dormitory',
  'recording_studio',
  'conference_center',
  'charity',
  'campground',
  'taco_shop',
  'pub',
  'snack_bar',
  'nature_reserve',
  'italian_restaurant',
  'music_shop',
  'public_artwork',
  'outdoor_sculpture',
  'laboratory',
  'antique_shop',
  'cinema',
  'music_venue',
  'barbeque_restaurant',
  'garden_store',
  'sandwich_shop',
  'american_restaurant',
  'stadium',
  'tourist_information',
  'waste_transfer_station',
  'recycling_center',
  'tours',
  'canal',
  'tennis_courts',
  'lighting_store',
  'pawnshop',
  'rehabilitation_center',
  'motel',
  'railway_station',
  'psychic',
  'mattress_store',
  'thrift_shop',
  'vape_shop',
  'golf_course',
  'rest_area',
  'radio_studio',
  'locksmith',
  'thai_restaurant',
  'watch_store',
  'labor_union',
  'vacation_rental',
  'bridal_shop',
  'boat_rental',
  'arts_center',
  'video_store',
  'brewery',
  'sushi_restaurant',
  'recreation_center',
  'basketball_court',
  'cobbler',
  'party_store',
  'kitchen_store',
  'shoe_repair',
  'bubble_tea',
  'airport',
  'leather_goods',
  'martial_arts_studio',
  'coworking_space',
  'home_repair',
  'outlet_store',
  'sewing_shop',
  'courthouse',
  'cannabis_dispensary',
  'beach',
  'fair_grounds',
  'pilates_studio',
  'stable',
  'concert_hall',
  'currency_exchange',
  'trade_school',
  'hobby_shop',
  'gymnastics',
  'herbalist',
  'discount_store',
  'donut_shop',
  'casino',
  'carpet_store',
  'frame_store',
  'tanning_salon',
  'karaoke_bar',
  'viewpoint',
  'camera_shop',
  'gun_store',
  'sports_center',
  'marina',
  'buffet_restaurant',
  'animal_shelter',
  'turkish_restaurant',
  'wine_bar',
  'tapas_restaurant',
  'pier',
  'spanish_restaurant',
  'television_studio',
  'korean_restaurant',
  'billiards',
  'vietnamese_restaurant',
  'baseball_field',
  'french_restaurant',
  'waste_disposal',
  'cocktail_bar',
  'picnic_shelter',
  'dog_park',
  'photo_lab',
  'steakhouse',
  'skatepark',
  'bookmaker',
  'resort',
  'fish_and_chips_restaurant',
  'greek_restaurant',
  'cheese_shop',
  'fireworks_store',
  'military_office',
  'sauna',
  'sports_bar',
  'vineyard',
  'beer_bar',
  'hookah_lounge',
  'mediterranean_restaurant',
  'african_restaurant',
  'gastropub',
  'community_college',
  'middle_eastern_restaurant',
  'salad_bar',
  'prison',
  'zoo',
  'racetrack',
  'dam',
  'climbing',
  'climbing_gym',
  'dialysis_center',
  'coffee_roaster',
  'bowling_alley',
  'boxing_gym',
  'emergency_room',
  'hunting_store',
  'synagogue',
  'waterfall',
  'luggage_store',
  'filipino_restaurant',
  'bagel_shop',
  'fishing',
  'cricket_club',
  'light_rail_station',
  'aquarium',
  'hot_dog_stand',
  'german_restaurant',
  'motorsports_store',
  'carribean_restaurant',
  'ice_rink',
  'ski_area',
  'frozen_yogurt_shop',
  'military_base',
  'summer_camp',
  'fishmonger',
  'distillery',
  'embassy',
  'exhibit',
  'treecare',
  'biergarten',
  'ramen_restaurant',
  'fountain',
  'surfboard_store',
  'check_cashing',
  'boat_or_ferry',
  'hunting_area',
  'disc_golf_course',
  'miniature_golf',
  'gay_bar',
  'optometrist',
  'water_park',
  'observatory',
  'cable_car',
  'cave',
  'plaza',
  'lounge',
  'korean_barbeque_restaurant',
  'hawaiian_restaurant',
  'town',
  'portuguese_restaurant',
  'latin_american_restaurant',
  'duty_free_shop',
  'brazilian_restaurant',
  'skydiving_drop_zone',
  'english_restaurant',
  'cuban_restaurant',
  'train',
  'persian_restaurant',
  'rugby_stadium',
  'gluten_free_restaurant',
  'creole_restaurant',
  'trailhead',
  'airport_terminal',
  'carpet_cleaner',
  'tiki_bar',
  'street',
  'intersection',
  'windmill',
  'information_technology_company',
  'bike_rental',
  'food_truck',
  'veterans_service',
  'wings_joint',
  'arcade',
  'outdoors_store',
  'irish_pub',
  'surf_spot',
  'peruvian_restaurant',
  'track',
  'chocolate_shop',
  'soccer_stadium',
  'cruise',
  'mountain_hut',
  'theme_park_attraction',
  'service_area',
  'ski_shop',
  'lighthouse',
  'airport_gate',
  'baseball_stadium',
  'basketball_stadium',
  'football_stadium',
  'go_kart_racing',
  'tech_startup',
  'dive_bar',
  'states_and_municipalities',
  'hockey_stadium',
  'laser_tag',
  'political_party_office',
  'driving_range',
  'stripclub',
  'well',
  'beach_bar',
  'tunnel',
  'waffle_shop',
  'ski_trail',
  'tennis_stadium',
  'boat_launch',
  'meeting_room',
  'rafting_spot',
  'scuba_diving_shop',
  'speakeasy',
  'university_book_store',
  'university_laboratory',
  'zoo_exhibit',
  'chairlift',
  'corporate_amenity',
  'indoor_cycling',
  'racecourse',
  'tree',
  'turkish_coffeehouse',
  'baggage_claim',
  'champagne_bar',
  'planetarium',
  'sake_bar',
  'village',
  'airport_ticket_counter',
  'beer_festival',
  'bus_line',
  'city',
  'country',
  'county',
  'graffiti',
  'hotel_bar',
  'lgbtq_organization',
  'moving_target',
  'neighbourhood',
  'pop_up_shop',
  'railway_platform',
  'road',
  'state',
  'variety_store',
  'whiskey_bar'
].join(', ');

const CategorySearchInputSchema = z.object({
  category: z
    .string()
    .describe(
      `The canonical category ID to search for. Supported categories include: ${SUPPORTED_CATEGORIES}`
    ),
  language: z
    .string()
    .optional()
    .describe(
      'ISO language code for the response (e.g., "en", "es", "fr", "de", "ja")'
    ),
  limit: z
    .number()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (1-25)'),
  proximity: z
    .union([
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90)
      }),
      z.string().transform((val) => {
        // Handle special case of 'ip'
        if (val === 'ip') {
          return 'ip' as const;
        }
        // Handle JSON-stringified object: "{\"longitude\": -82.458107, \"latitude\": 27.937259}"
        if (val.startsWith('{') && val.endsWith('}')) {
          try {
            const parsed = JSON.parse(val);
            if (
              typeof parsed === 'object' &&
              parsed !== null &&
              typeof parsed.longitude === 'number' &&
              typeof parsed.latitude === 'number'
            ) {
              return { longitude: parsed.longitude, latitude: parsed.latitude };
            }
          } catch {
            // Fall back to other formats
          }
        }
        // Handle string that looks like an array: "[-82.451668, 27.942964]"
        if (val.startsWith('[') && val.endsWith(']')) {
          const coords = val
            .slice(1, -1)
            .split(',')
            .map((s) => Number(s.trim()));
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            return { longitude: coords[0], latitude: coords[1] };
          }
        }
        // Handle comma-separated string: "-82.451668,27.942964"
        const parts = val.split(',').map((s) => Number(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return { longitude: parts[0], latitude: parts[1] };
        }
        throw new Error(
          'Invalid proximity format. Expected {longitude, latitude}, "longitude,latitude", or "ip"'
        );
      })
    ])
    .optional()
    .describe(
      'Location to bias results towards. Either coordinate object with longitude and latitude or "ip" for IP-based location'
    ),
  bbox: z
    .object({
      minLongitude: z.number().min(-180).max(180),
      minLatitude: z.number().min(-90).max(90),
      maxLongitude: z.number().min(-180).max(180),
      maxLatitude: z.number().min(-90).max(90)
    })
    .optional()
    .describe('Bounding box to limit results within specified bounds'),
  country: z
    .array(z.string().length(2))
    .optional()
    .describe('Array of ISO 3166 alpha 2 country codes to limit results'),
  poi_category_exclusions: z
    .array(z.string())
    .optional()
    .describe('Array of POI categories to exclude from results'),
  format: z
    .enum(['json_string', 'formatted_text'])
    .optional()
    .default('formatted_text')
    .describe(
      'Output format: "json_string" returns raw GeoJSON data as a JSON string that can be parsed; "formatted_text" returns human-readable text with place names, addresses, and coordinates. Both return as text content but json_string contains parseable JSON data while formatted_text is for display.'
    )
});

export class CategorySearchTool extends MapboxApiBasedTool<
  typeof CategorySearchInputSchema
> {
  name = 'category_search_tool';
  description =
    "Return all places that match a category (industry, amenity, or NAICS‑style code). Use when the user asks for a type of place, plural or generic terms like 'museums', 'coffee shops', 'electric‑vehicle chargers', or when the query includes is‑a phrases such as 'any', 'all', 'nearby'. Do not use when a unique name or brand is provided. Supports both JSON and text output formats.";

  constructor() {
    super({ inputSchema: CategorySearchInputSchema });
  }

  private formatGeoJsonToText(geoJsonResponse: any): string {
    if (
      !geoJsonResponse ||
      !geoJsonResponse.features ||
      geoJsonResponse.features.length === 0
    ) {
      return 'No results found.';
    }

    const results = geoJsonResponse.features.map(
      (feature: any, index: number) => {
        const props = feature.properties || {};
        const geom = feature.geometry || {};

        let result = `${index + 1}. `;

        // POI name
        result += `${props.name}`;
        if (props.name_preferred) {
          result += ` (${props.name_preferred})`;
        }

        // Full address
        if (props.full_address) {
          result += `\n   Address: ${props.full_address}`;
        } else if (props.place_formatted) {
          result += `\n   Address: ${props.place_formatted}`;
        }

        // Geographic coordinates
        if (geom.coordinates && Array.isArray(geom.coordinates)) {
          const [lng, lat] = geom.coordinates;
          result += `\n   Coordinates: ${lat}, ${lng}`;
        }

        // Feature type
        if (props.feature_type) {
          result += `\n   Type: ${props.feature_type}`;
        }

        // Category information
        if (props.poi_category && Array.isArray(props.poi_category)) {
          result += `\n   Category: ${props.poi_category.join(', ')}`;
        } else if (props.category) {
          result += `\n   Category: ${props.category}`;
        }

        return result;
      }
    );

    return results.join('\n\n');
  }

  protected async execute(
    input: z.infer<typeof CategorySearchInputSchema>,
    accessToken: string
  ): Promise<{ type: 'text'; text: string }> {
    // Build URL with required parameters
    const url = new URL(
      `${MapboxApiBasedTool.MAPBOX_API_ENDPOINT}search/searchbox/v1/category/${encodeURIComponent(input.category)}`
    );

    // Add access token
    url.searchParams.append('access_token', accessToken);

    // Add optional parameters
    if (input.language) {
      url.searchParams.append('language', input.language);
    }

    if (input.limit !== undefined) {
      url.searchParams.append('limit', input.limit.toString());
    }

    if (input.proximity) {
      if (input.proximity === 'ip') {
        url.searchParams.append('proximity', 'ip');
      } else {
        const { longitude, latitude } = input.proximity;
        url.searchParams.append('proximity', `${longitude},${latitude}`);
      }
    }

    if (input.bbox) {
      const { minLongitude, minLatitude, maxLongitude, maxLatitude } =
        input.bbox;
      url.searchParams.append(
        'bbox',
        `${minLongitude},${minLatitude},${maxLongitude},${maxLatitude}`
      );
    }

    if (input.country && input.country.length > 0) {
      url.searchParams.append('country', input.country.join(','));
    }

    if (
      input.poi_category_exclusions &&
      input.poi_category_exclusions.length > 0
    ) {
      url.searchParams.append(
        'poi_category_exclusions',
        input.poi_category_exclusions.join(',')
      );
    }

    // Make the request
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Failed to search category: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (input.format === 'json_string') {
      return { type: 'text', text: JSON.stringify(data, null, 2) };
    } else {
      return { type: 'text', text: this.formatGeoJsonToText(data) };
    }
  }
}

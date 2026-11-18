// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Part of the map page's script: Selecting a place on the map: a pin, a result card or a base map label, with its highlight.
 * renderMapAppHtml splices it into the page's single <script>, so it shares
 * that scope and uses the page's state and helpers (map, sendRequest,
 * stageRender, ...) directly.
 */
export const MAP_APP_SELECTION_JS = `
  // --- Selection ---------------------------------------------------------------
  // The place the user selected: a pin without a result card, a result
  // card (activePlaceId), or a label of the Standard base map.
  var pinnedPlace = null;

  function coord(n) { return Math.round(n * 1e5) / 1e5; }

  // The place the user picked last: a plain pin they clicked (pinnedPlace),
  // or the active result card.
  function selectedPlace() {
    if (pinnedPlace) return pinnedPlace;
    var entry = activePlaceId ? markersById[activePlaceId] : null;
    if (!entry || !entry.name) return null;
    var at = entry.marker.getLngLat();
    return {
      name: entry.name,
      longitude: coord(at.lng),
      latitude: coord(at.lat),
      mapbox_id: activePlaceId
    };
  }

  function placeKey(place) {
    return place ? place.mapbox_id || (place.name + '@' + place.longitude + ',' + place.latitude) : null;
  }

  // A pin without a result card (add_places, a hand-composed marker) has no
  // other way to be selected than a click.
  function selectPinnedPlace(place) {
    setSelectedLabel(null);
    pinnedPlace = place;
    dismissedPlaceKey = null;
    shareMapContext();
  }

  function clearPinnedPlace() {
    setSelectedLabel(null);
    pinnedPlace = null;
  }

  // A label on the Standard base map (a point of interest, a place name, a
  // landmark), selected like a pin so the user can ask about it. The base
  // map has no mapbox_id for it, so the model gets its name, category and
  // coordinates. Each featureset shows the selection its own way: poi has
  // only a hide state, so the label is hidden and drawn again as a selected
  // pin; place-labels and indoor-labels have a select state; landmark-icons
  // has no state, so a pin goes on top. Road and water labels aren't in any
  // featureset, so they can't be picked.
  var selectedLabel = null;
  var selectedLabelMarker = null;

  function setLabelState(label, on) {
    if (!map || label.show === 'pin') return;
    var state = {};
    state[label.show] = on;
    try { map.setFeatureState(label.feature, state); } catch (_) { /* style switched */ }
  }

  function setSelectedLabel(label) {
    if (selectedLabel) setLabelState(selectedLabel, false);
    if (selectedLabelMarker) selectedLabelMarker.remove();
    selectedLabel = label;
    selectedLabelMarker = null;
    if (!label || !map) return;
    setLabelState(label, true);
    if (label.show === 'select') return;
    var place = label.place;
    var el = buildPlaceElement(placeIcon(label.feature.properties.maki, place.category));
    el.className += ' active';
    var nameEl = document.createElement('span');
    nameEl.className = 'marker-name';
    nameEl.textContent = place.name;
    el.appendChild(nameEl);
    // A second click on the selected label lands on this pin: deselect it.
    // Stopping the click keeps the hidden label under it from being picked
    // again.
    el.addEventListener('click', function(e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      deselectBaseMapLabel();
    });
    selectedLabelMarker = new mapboxgl.Marker({ element: el })
      .setLngLat([place.longitude, place.latitude])
      .addTo(map);
  }

  function labelCategory(props) {
    var kind = typeof props.maki === 'string' && props.maki !== 'marker' ? props.maki
      : [props.class, props.type].filter(function(v) { return typeof v === 'string' && v; })[0] || '';
    return kind.replace(/[-_]/g, ' ');
  }

  function selectBaseMapLabel(featuresetId, show, feature) {
    var props = (feature && feature.properties) || {};
    var at = feature && feature.geometry && feature.geometry.coordinates;
    if (typeof props.name !== 'string' || !props.name || !Array.isArray(at) ||
        typeof at[0] !== 'number' || typeof at[1] !== 'number') return;
    var place = { name: props.name, longitude: coord(at[0]), latitude: coord(at[1]) };
    var category = labelCategory(props);
    if (category) place.category = category;
    // A second click on a label shown with its select state.
    if (selectedLabel && selectedLabel.featuresetId === featuresetId &&
        placeKey(selectedLabel.place) === placeKey(place)) {
      deselectBaseMapLabel();
      return;
    }
    selectPinnedPlace(place);
    setSelectedLabel({ featuresetId: featuresetId, show: show, feature: feature, place: place });
  }

  function deselectBaseMapLabel() {
    if (!selectedLabel) return;
    clearPinnedPlace();
    shareMapContext();
  }

  function addLabelInteractions() {
    if (typeof map.addInteraction !== 'function') return;
    // Declared here, not beside the selection state: the map can load, and
    // call this, before the script reaches those lines.
    var labels = [
      { featuresetId: 'poi', show: 'hide' },
      { featuresetId: 'place-labels', show: 'select' },
      { featuresetId: 'landmark-icons', show: 'pin' },
      { featuresetId: 'indoor-labels', show: 'select' }
    ];
    labels.forEach(function(label) {
      var target = { featuresetId: label.featuresetId, importId: 'basemap' };
      map.addInteraction('select-base-map-' + label.featuresetId, {
        type: 'click', target: target,
        handler: function(e) { selectBaseMapLabel(label.featuresetId, label.show, e.feature); }
      });
      map.addInteraction('base-map-' + label.featuresetId + '-pointer-in', {
        type: 'mouseenter', target: target,
        handler: function() { map.getCanvas().style.cursor = 'pointer'; }
      });
      map.addInteraction('base-map-' + label.featuresetId + '-pointer-out', {
        type: 'mouseleave', target: target,
        handler: function() { map.getCanvas().style.cursor = ''; }
      });
    });
  }
`;

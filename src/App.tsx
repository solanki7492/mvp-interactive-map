import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Define types
interface AreaInfo {
  name: string;
  population: number;
  households: number;
  meanIncome: number;
}

const App = () => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON<any> | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [curacaoGeoJSON, setCuracaoGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [areas, setAreas] = useState<AreaInfo[]>([]);
  const [filteredAreas, setFilteredAreas] = useState<AreaInfo[]>([]);

  // Load GeoJSON data
  useEffect(() => {
    const loadGeoJSON = async () => {
      try {
        const response = await fetch('/cw.json');
        const data = await response.json();
        setCuracaoGeoJSON(data);
        
        // Extract area information
        const areaList: AreaInfo[] = data.features.map((feature: any) => ({
          name: feature.properties.NAME || 'Unknown',
          population: feature.properties.pop || 0,
          households: feature.properties.HH || 0,
          meanIncome: feature.properties.meanPinc || 0
        })).sort((a: AreaInfo, b: AreaInfo) => a.name.localeCompare(b.name));
        
        setAreas(areaList);
        setFilteredAreas(areaList);
      } catch (error) {
        console.error('Error loading GeoJSON:', error);
      }
    };
    
    loadGeoJSON();
  }, []);

  // Generate unique color for each area
  const getAreaColor = (areaName: string) => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
      '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
      '#C44569', '#F8B500', '#6C5CE7', '#A55EEA', '#26DE81',
      '#FD79A8', '#E17055', '#00B894', '#0984E3', '#6C5CE7',
      '#F39C12', '#E74C3C', '#9B59B6', '#3498DB', '#1ABC9C',
      '#E67E22', '#95A5A6', '#34495E', '#2ECC71', '#F1C40F'
    ];
    
    // Generate a consistent color based on area name
    let hash = 0;
    for (let i = 0; i < areaName.length; i++) {
      hash = areaName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % colors.length;
    return colors[colorIndex];
  };

  // Style function for GeoJSON features
  const style = (feature: GeoJSON.Feature<GeoJSON.Geometry, any> | undefined) => {
    if (!feature || !feature.properties) return {};
    
    const areaName = feature.properties.NAME || 'Unknown';
    const isSelected = selectedArea === areaName;
    
    return {
      fillColor: getAreaColor(areaName),
      weight: isSelected ? 3 : 1,
      opacity: 1,
      color: isSelected ? '#1d4ed8' : '#ffffff',
      dashArray: '',
      fillOpacity: isSelected ? 0.9 : 0.7
    };
  };

  // Fetch area information from MediaWiki API
  const fetchAreaInfo = async (areaName: string) => {
    try {
      // Step 1: Search for the page with area name + Curaçao first
      let searchQuery = `${areaName} Curaçao`;
      let searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          searchQuery
        )}&format=json&origin=*`
      );
      let searchData = await searchRes.json();
      
      // If no results with Curaçao, try just the area name
      if (!searchData.query.search.length) {
        searchQuery = areaName;
        searchRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
            searchQuery
          )}&format=json&origin=*`
        );
        searchData = await searchRes.json();
      }
      
      // If still no results, return default info
      if (!searchData.query.search.length) {
        return {
          title: areaName,
          extract: 'No Wikipedia information available for this area.',
          thumbnail: null,
          pageUrl: null
        };
      }

      const firstTitle = searchData.query.search[0].title;

      // Step 2: Fetch summary for the first search result
      const summaryRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`
      );
      const summaryData = await summaryRes.json();
      
      return {
        title: summaryData.title || areaName,
        extract: summaryData.extract || 'No description available.',
        thumbnail: summaryData.thumbnail?.source || null,
        pageUrl: summaryData.content_urls?.desktop?.page || null
      };
    } catch (error) {
      console.error('Error fetching area info:', error);
      return {
        title: areaName,
        extract: 'Information not available.',
        thumbnail: null,
        pageUrl: null
      };
    }
  };

  // Create popup content with area details from MediaWiki
  const createPopupContent = async (props: any) => {
    const areaName = props.NAME || 'Unknown';
    
    // Fetch information from MediaWiki API
    const areaInfo = await fetchAreaInfo(areaName);
    
    // Fallback image if no Wikipedia image is available
    const imageUrl = areaInfo.thumbnail || `https://source.unsplash.com/300x150/?curacao,${encodeURIComponent(areaName)}`;
    
    // Truncate extract if too long
    const maxLength = 300;
    const truncatedExtract = areaInfo.extract.length > maxLength 
      ? areaInfo.extract.substring(0, maxLength) + '...' 
      : areaInfo.extract;
    
    return `
      <div style="
        width: 280px; 
        max-width: 280px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        overflow: hidden;
      ">
        <div style="
          width: 100%; 
          height: 140px; 
          overflow: hidden; 
          border-radius: 8px; 
          margin-bottom: 12px;
          background: #f3f4f6;
        ">
          <img 
            src="${imageUrl}" 
            alt="${areaName}" 
            style="
              width: 100%; 
              height: 100%; 
              object-fit: cover;
              display: block;
            " 
            onerror="this.src='https://source.unsplash.com/300x150/?curacao,landscape';" 
          />
        </div>
        
        <h3 style="
          margin: 0 0 8px 0; 
          color: #1f2937; 
          font-size: 16px; 
          font-weight: 600;
          word-wrap: break-word;
          overflow-wrap: break-word;
        ">${areaInfo.title}</h3>
        
        <div style="
          color: #6b7280; 
          font-size: 13px; 
          line-height: 1.5; 
          margin-bottom: 12px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          max-height: 120px;
          overflow-y: auto;
        ">
          ${truncatedExtract}
        </div>
        
      </div>
    `;
  };

  // Event handlers
  const highlightFeature = (e: L.LeafletEvent) => {
    const layer = e.target;
    const feature = layer.feature;
    
    if (!feature || !feature.properties) return;

    layer.setStyle({
      weight: 3,
      color: '#1d4ed8',
      dashArray: '',
      fillOpacity: 0.9
    });

    // Show label on hover
    if ((layer as any)._label && mapInstanceRef.current) {
      (layer as any)._label.addTo(mapInstanceRef.current);
    }
  };

  // Reset highlight
  const resetHighlight = (e: L.LeafletMouseEvent) => {
    const layer = e.target;
    
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.resetStyle(layer as L.Path);
    }

    // Hide label when not hovering (unless area is selected)
    const feature = (layer as any).feature;
    const isSelected = selectedArea === feature?.properties?.NAME;
    
    if ((layer as any)._label && mapInstanceRef.current && !isSelected) {
      mapInstanceRef.current.removeLayer((layer as any)._label);
    }
  };

  // Handle area click - show popup and select area
  const selectArea = async (areaName: string, layer?: L.Layer) => {
    setSelectedArea(areaName);
    
    if (layer && mapInstanceRef.current) {
      // Zoom to the area
      mapInstanceRef.current.fitBounds((layer as any).getBounds());
      
      // Create and bind popup
      const feature = (layer as any).feature;
      if (feature && feature.properties) {
        const popupContent = await createPopupContent(feature.properties);
        layer.bindPopup(popupContent, {
          maxWidth: 300,
          minWidth: 280,
          className: 'custom-popup'
        }).openPopup();
      }
    }
    
    // Update map styling to highlight selected area
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.eachLayer((mapLayer) => {
        const layerFeature = (mapLayer as any).feature;
        if (layerFeature && layerFeature.properties.NAME === areaName) {
          (mapLayer as L.Path).setStyle({
            weight: 3,
            color: '#1d4ed8',
            fillOpacity: 0.9
          });
          
          // Show and update label style for selected area
          if ((mapLayer as any)._label && mapInstanceRef.current) {
            // Add label to map if not already added
            if (!mapInstanceRef.current.hasLayer((mapLayer as any)._label)) {
              (mapLayer as any)._label.addTo(mapInstanceRef.current);
            }
            
            const labelElement = (mapLayer as any)._label.getElement();
            if (labelElement) {
              const div = labelElement.querySelector('div');
              if (div) {
                div.style.color = '#1d4ed8';
                div.style.fontWeight = 'bold';
                div.style.fontSize = '13px';
                div.style.textShadow = '1px 1px 2px rgba(255, 255, 255, 0.9), -1px -1px 2px rgba(255, 255, 255, 0.9), 1px -1px 2px rgba(255, 255, 255, 0.9), -1px 1px 2px rgba(255, 255, 255, 0.9)';
              }
            }
          }
        } else {
          (mapLayer as L.Path).setStyle({
            weight: 1,
            color: '#ffffff',
            fillOpacity: 0.7
          });
          
          // Hide label for non-selected areas
          if ((mapLayer as any)._label && mapInstanceRef.current) {
            if (mapInstanceRef.current.hasLayer((mapLayer as any)._label)) {
              mapInstanceRef.current.removeLayer((mapLayer as any)._label);
            }
          }
        }
      });
    }
  };

  // Zoom to feature on click
  const zoomToFeature = async (e: L.LeafletEvent) => {
    const layer = e.target;
    const feature = layer.feature;
    
    if (!feature || !feature.properties) return;
    
    const areaName = feature.properties.NAME || 'Unknown';
    await selectArea(areaName, layer);
  };

  // Add event listeners to each feature and create labels
  const onEachFeature = (feature: GeoJSON.Feature, layer: L.Layer) => {
    layer.on({
      mouseover: highlightFeature,
      mouseout: resetHighlight,
      click: zoomToFeature
    });

    // Create area name label (but don't add to map yet)
    if (feature.properties && feature.properties.NAME) {
      // Calculate centroid more accurately for polygon
      let center;
      if (feature.geometry.type === 'Polygon') {
        const coordinates = feature.geometry.coordinates[0];
        let x = 0, y = 0;
        for (let i = 0; i < coordinates.length - 1; i++) {
          x += coordinates[i][0];
          y += coordinates[i][1];
        }
        center = L.latLng(y / (coordinates.length - 1), x / (coordinates.length - 1));
      } else {
        const bounds = (layer as any).getBounds();
        center = bounds.getCenter();
      }
      
      // Create a simple text label without background (but don't add to map yet)
      const label = L.marker(center, {
        icon: L.divIcon({
          className: 'area-label',
          html: `<div style="
            font-size: 12px;
            font-weight: bold;
            color: #1f2937;
            text-align: center;
            white-space: nowrap;
            text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.8), -1px -1px 2px rgba(255, 255, 255, 0.8), 1px -1px 2px rgba(255, 255, 255, 0.8), -1px 1px 2px rgba(255, 255, 255, 0.8);
            pointer-events: none;
          ">${feature.properties.NAME}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        })
      });

      // Store label reference for later use
      (layer as any)._label = label;
    }
  };

  // Handle search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredAreas(areas);
    } else {
      const filtered = areas.filter(area =>
        area.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredAreas(filtered);
    }
  }, [searchTerm, areas]);

  // Find area layer by name
  const findAreaLayer = (areaName: string) => {
    if (!geoJsonLayerRef.current) return null;
    
    let foundLayer = null;
    geoJsonLayerRef.current.eachLayer((layer) => {
      const feature = (layer as any).feature;
      if (feature && feature.properties.NAME === areaName) {
        foundLayer = layer;
      }
    });
    return foundLayer;
  };

  // Initialize map
  useEffect(() => {
    if (!mapInstanceRef.current && mapRef.current) {
      const map = L.map(mapRef.current).setView([12.1696, -68.9900], 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map layer when data loads or area selection changes
  useEffect(() => {
    if (mapInstanceRef.current && curacaoGeoJSON) {
      // Remove existing GeoJSON layer and its labels
      if (geoJsonLayerRef.current) {
        geoJsonLayerRef.current.eachLayer((layer) => {
          // Remove associated label if it exists and is on the map
          if ((layer as any)._label && mapInstanceRef.current && mapInstanceRef.current.hasLayer((layer as any)._label)) {
            mapInstanceRef.current.removeLayer((layer as any)._label);
          }
        });
        mapInstanceRef.current.removeLayer(geoJsonLayerRef.current);
      }

      // Add new GeoJSON layer with updated styling
      const geoJsonLayer = L.geoJSON(curacaoGeoJSON, {
        style: style,
        onEachFeature: onEachFeature
      }).addTo(mapInstanceRef.current);

      geoJsonLayerRef.current = geoJsonLayer;
    }
  }, [curacaoGeoJSON, selectedArea]);

  return (
    <div className="w-full h-screen relative bg-gray-50">
      {/* Search Panel */}
      <div className="fixed top-4 left-4 z-[1000] bg-white p-4 rounded-lg shadow-lg max-w-sm pointer-events-auto">
        <h3 className="text-lg font-bold mb-4 text-gray-800">Curacao Areas</h3>
        
        {/* Search Box */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Areas:
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Type area name..."
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Selected Area */}
        {selectedArea && (
          <div className="mb-4 p-2 bg-green-50 rounded border-l-4 border-green-400">
            <p className="text-sm text-green-800">
              <strong>Selected:</strong> {selectedArea}
            </p>
          </div>
        )}

        {/* Area List */}
        <div className="max-h-96 overflow-y-auto">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Areas ({filteredAreas.length})
          </h4>
          <div className="space-y-1">
            {filteredAreas.map((area) => (
              <div
                key={area.name}
                onClick={async () => {
                  const layer = findAreaLayer(area.name);
                  await selectArea(area.name, layer || undefined);
                }}
                className={`p-2 rounded cursor-pointer text-sm transition-colors ${
                  selectedArea === area.name
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
              >
                <div className="flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: getAreaColor(area.name) }}
                  ></div>
                  <div className="flex-1">
                    <div className="font-medium">{area.name}</div>
                    <div className="text-xs text-gray-500">
                      Pop: {area.population.toLocaleString()} | HH: {area.households.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div ref={mapRef} className="w-full h-full z-0" />

      {/* Instructions */}
      <div className="fixed bottom-4 right-4 z-[1000] bg-white p-3 rounded-lg shadow-lg max-w-xs pointer-events-auto">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Instructions:</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• Search for areas by name</li>
          <li>• Click on area names to select and zoom</li>
          <li>• Click on map areas for details popup</li>
          <li>• Each area has a unique color</li>
        </ul>
      </div>
    </div>
  );
};

export default App;
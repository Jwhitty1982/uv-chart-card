# UV Index Chart Card - Development & Deployment Guide

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- Home Assistant with HACS installed
- OpenWeatherMap One Call 3.0 integration configured

### Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/uv-index-chart-card.git
cd uv-index-chart-card

# Install dependencies
npm install

# Build for production
npm run build

# Watch mode (rebuilds on file changes)
npm run dev
```

### Build Output

After running `npm run build`, the compiled card will be available at:
```
dist/uv-index-chart-card.js
```

## Installation Methods

### Method 1: HACS Installation (Recommended)

1. Open Home Assistant and go to **HACS** > **Frontend**
2. Click **⋮** (top-right) and select **Custom repositories**
3. Add repository URL: `https://github.com/yourusername/uv-index-chart-card`
4. Select **Lovelace** as the category
5. Click **Install**
6. Restart Home Assistant (Settings > System > Restart)
7. Add to dashboard as documented below

### Method 2: Manual Installation

1. Build the project: `npm run build`
2. Create directory: `config/www/community/uv-index-chart-card/`
3. Copy `dist/uv-index-chart-card.js` to that directory
4. Add to `configuration.yaml`:
   ```yaml
   frontend:
     extra_module_url:
       - /local/community/uv-index-chart-card/uv-index-chart-card.js
   ```
5. Restart Home Assistant

## Dashboard Configuration

### YAML Configuration

Add to your Lovelace dashboard YAML:

```yaml
type: custom:uv-index-chart-card
entity: sensor.openweathermap_uv_index
hours_back: 12
hours_forward: 24
```

### UI Configuration

1. Edit your dashboard
2. Click **+ Add card**
3. Scroll to find **UV Index Chart Card**
4. Select entity and optional parameters
5. Save

## Configuration Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `entity` | string | **required** | Sensor entity with hourly UV data |
| `hours_back` | integer | 12 | Number of synthetic historical hours to display |
| `hours_forward` | integer | 24 | Number of forecast hours to display |

### Entity Requirements

The card requires a sensor with:
- **State**: Current UV index value (0-16)
- **Attribute `hourly`**: Array of hourly forecast objects

Example from OpenWeatherMap One Call 3.0:
```json
{
  "state": "5.2",
  "attributes": {
    "hourly": [
      { "uv": 4.5 },
      { "uv": 6.2 },
      { "uv": 7.1 },
      ...
    ]
  }
}
```

## Features Explained

### Data Sources

1. **Synthetic Past Data**: Generated from current UV value, fading backward
2. **Real Forecast**: Loaded from entity's hourly attribute
3. **Sunrise/Sunset**: From `sun.sun` entity for day/night shading

### Color Coding

- **Green (#4CAF50)**: UV 0-3 - Safe, no protection needed
- **Yellow (#FFEB3B)**: UV 3-6 - Moderate, wear sunscreen
- **Orange (#FF9800)**: UV 6-8 - High, take precautions
- **Red (#F44336)**: UV 8-11 - Very High, limit sun exposure
- **Purple (#9C27B0)**: UV 11+ - Extreme, avoid sun exposure

### Visual Indicators

- **Rounded bars**: Smooth, modern appearance
- **Now line**: Dashed vertical line showing current time
- **Peak marker**: Glowing golden dot on highest UV hour
- **Day/night shading**: Semi-transparent overlay for nighttime periods
- **Glassmorphism styling**: Blurred background with translucent card

## Architecture

### Component Structure

```
uv-index-chart-card/
├── src/
│   └── uv-index-chart-card.ts    # Main LitElement component
├── dist/
│   └── uv-index-chart-card.js    # Bundled output
├── package.json                   # Dependencies & scripts
├── rollup.config.js              # Build configuration
├── tsconfig.json                 # TypeScript configuration
├── manifest.json                 # Home Assistant manifest
├── hacs.json                     # HACS metadata
└── README.md
```

### Code Flow

1. **Config Validation** (`setConfig()`)
   - Validates required `entity` parameter
   - Sets defaults for optional parameters

2. **Data Loading** (`prepareChartData()`)
   - Fetches entity state and hourly attribute
   - Calls synthetic data generator
   - Calls forecast processor

3. **Synthetic Data** (`generateSyntheticPastData()`)
   - Creates fade effect from current UV backward
   - Adds random variation for realism
   - Returns array of historical data points

4. **Forecast Processing** (`processForecastData()`)
   - Extracts UV values from hourly attribute
   - Maps to proper timestamps
   - Returns array of forecast data points

5. **Color Application** (`getUVColor()`)
   - Maps UV values to risk-based color codes
   - Applied per-bar in chart dataset

6. **Chart Creation** (`createChart()`)
   - Initializes Chart.js with plugins
   - Registers custom drawing plugins
   - Returns chart instance

7. **Plugin Rendering**
   - **beforeDraw**: Sunrise/sunset shading
   - **afterDatasetsDraw**: Now line, peak marker

## Styling

### Glassmorphism Implementation

The card uses modern CSS properties for the glass effect:
- `backdrop-filter: blur(20px) saturate(180%)`
- `-webkit-backdrop-filter` for webkit browsers
- Semi-transparent background: `rgba(255, 255, 255, 0.08)`
- Subtle borders and shadows

### Responsive Design

- **Desktop**: Full width with 300px chart height
- **Tablet**: Adjusted padding and font sizes
- **Mobile**: Vertical layout, reduced chart height (240px)

## Troubleshooting

### Card Not Showing

1. **Check browser console** (F12) for errors
2. **Verify entity exists**: 
   ```yaml
   # In Developer Tools > States
   sensor.openweathermap_uv_index
   ```
3. **Clear browser cache** and reload
4. **Restart Home Assistant** after installation

### Data Not Loading

1. **Verify entity state** in Developer Tools > States
2. **Check hourly attribute** is array with `uv` property
3. **Review HA logs** for integration errors
4. **Ensure sun.sun exists** for shading features

### Chart Not Rendering

1. **Check browser console** for Chart.js errors
2. **Verify Canvas support** in browser
3. **Check GPU acceleration** settings
4. **Try in incognito mode** (exclude extensions)

### Performance Issues

1. **Reduce forecast hours**: Set `hours_forward: 12`
2. **Disable shading**: Remove `sun.sun` entity reference
3. **Check GPU usage**: Monitor in DevTools > Performance
4. **Update browser** to latest version

## Development

### Project Structure for Custom Builds

```typescript
// Import Chart.js
import Chart from 'chart.js/auto';

// LitElement component
@customElement('uv-index-chart-card')
export class UVIndexChartCard extends LitElement {
  // Component logic
}
```

### Extending the Card

To customize, modify in `src/uv-index-chart-card.ts`:

```typescript
// Change colors
const UV_COLORS = {
  0: '#YOUR_COLOR',
  // ... 
};

// Modify synthetic data generation
private generateSyntheticPastData() {
  // Your logic
}

// Add custom plugins
const customPlugin = {
  id: 'customId',
  beforeDraw: (chart) => { /* ... */ }
};
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires support for:
- ES2020 JavaScript
- CSS backdrop-filter
- Canvas 2D API

## License

MIT License - See LICENSE file

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/yourusername/uv-index-chart-card/issues
- Discussions: https://github.com/yourusername/uv-index-chart-card/discussions

## Credits

- Built with [LitElement](https://lit.dev/)
- Charts powered by [Chart.js v4](https://www.chartjs.org/)
- Home Assistant integration via [Home Assistant Frontend API](https://github.com/home-assistant/frontend)

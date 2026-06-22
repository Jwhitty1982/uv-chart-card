# UV Index Chart Card

A premium Home Assistant Lovelace custom card featuring a beautiful UV Index bar chart with glassmorphism styling, powered by Chart.js v4.

## Features

- 📊 **Bar Chart Visualization**: Real-time UV index forecast with historical data
- 🎨 **Risk-Based Color Coding**: UV levels color-coded from green (safe) to purple (extreme)
- ⏰ **36-Hour Timeline**: Past 12 hours (synthetic) + Next 24 hours (forecast)
- 🌅 **Sunrise/Sunset Shading**: Visual indication of day/night periods
- ✨ **Glassmorphism Design**: Modern, translucent card with blur effects
- 📱 **Fully Responsive**: Optimized for mobile and desktop
- 🔝 **Peak UV Indicator**: Glowing dot highlights the highest UV hour
- ⏱️ **Now Indicator**: Vertical line shows current time

## Installation

### HACS Installation (Recommended)

1. Install [HACS](https://hacs.xyz/) if you haven't already
2. Go to HACS > Frontend > Custom repositories
3. Add this repository: `https://github.com/yourusername/uv-index-chart-card`
4. Click Install
5. Restart Home Assistant

### Manual Installation

1. Clone or download this repository
2. Run `npm install && npm run build`
3. Copy `dist/uv-index-chart-card.js` to `config/www/community/uv-index-chart-card/`
4. Add to your `configuration.yaml`:
   ```yaml
   frontend:
     extra_module_url:
       - /local/community/uv-index-chart-card/uv-index-chart-card.js
   ```

## Configuration

Add to your Lovelace dashboard:

```yaml
type: custom:uv-index-chart-card
entity: sensor.openweathermap_uv_index
hours_back: 12
hours_forward: 24
```

### Options

- **entity** (required): Sensor with hourly UV data attribute
- **hours_back** (optional): Synthetic historical hours (default: 12)
- **hours_forward** (optional): Forecast hours to display (default: 24)

## Requirements

- Home Assistant 2024.1.0+
- OpenWeatherMap One Call 3.0 integration or similar with hourly UV data

## Development

```bash
npm install
npm run dev  # Watch mode
npm run build  # Production build
```

## License

MIT

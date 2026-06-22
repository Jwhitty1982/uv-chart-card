# Example Home Assistant Integrations & Configurations

## OpenWeatherMap One Call 3.0 Integration

### Setup Integration

In `configuration.yaml`:

```yaml
openweathermap:
  api_key: YOUR_API_KEY
  latitude: YOUR_LATITUDE
  longitude: YOUR_LONGITUDE
  forecast_mode: onecall_pro
  scan_interval:
    minutes: 10
```

### Verify Sensor

After restart, check Developer Tools > States for:
```
sensor.openweathermap_uv_index
```

State should contain current UV index, attributes should include hourly data.

## Dashboard Examples

### Simple Configuration

```yaml
type: custom:uv-index-chart-card
entity: sensor.openweathermap_uv_index
```

### Full Configuration with All Options

```yaml
type: custom:uv-index-chart-card
entity: sensor.openweathermap_uv_index
hours_back: 12
hours_forward: 24
title: "UV Index Forecast"
```

### In a Grid Card

```yaml
type: grid
columns: 2
cards:
  - type: custom:uv-index-chart-card
    entity: sensor.openweathermap_uv_index
    hours_back: 12
    hours_forward: 24

  - type: weather-forecast
    entity: weather.openweathermap
```

### Multiple Locations

Create separate sensors for each location:

```yaml
# configuration.yaml
homeassistant:
  customize:
    sensor.openweathermap_location1_uv_index:
      friendly_name: "UV Index - Location 1"
    sensor.openweathermap_location2_uv_index:
      friendly_name: "UV Index - Location 2"
```

Then add multiple cards to dashboard:

```yaml
type: vertical-stack
cards:
  - type: custom:uv-index-chart-card
    entity: sensor.openweathermap_location1_uv_index
    
  - type: custom:uv-index-chart-card
    entity: sensor.openweathermap_location2_uv_index
```

## Advanced Customization

### Custom Template Sensor

Create a template sensor to transform data:

```yaml
# configuration.yaml
template:
  - sensor:
      - name: "UV Risk Level"
        unique_id: uv_risk_level
        state: >
          {% set uv = states('sensor.openweathermap_uv_index') | float(0) %}
          {% if uv < 3 %}
            Low
          {% elif uv < 6 %}
            Moderate
          {% elif uv < 8 %}
            High
          {% elif uv < 11 %}
            Very High
          {% else %}
            Extreme
          {% endif %}
        attributes:
          numeric_value: "{{ states('sensor.openweathermap_uv_index') }}"
```

### Automation Example

Trigger automations based on UV levels:

```yaml
# automation.yaml
- alias: "UV Index Alert"
  trigger:
    platform: state
    entity_id: sensor.openweathermap_uv_index
  condition:
    condition: template
    value_template: "{{ states('sensor.openweathermap_uv_index') | float(0) > 8 }}"
  action:
    service: notify.mobile_app_iphone
    data:
      message: "UV Index is {{ states('sensor.openweathermap_uv_index') }} - Very High!"
      title: "UV Index Alert"
```

## Data Format Reference

### Entity State Format

```
State: "5.2" (current UV index)
```

### Entity Attributes

```json
{
  "hourly": [
    {
      "dt": 1624320000,
      "uv": 4.5,
      "clouds": 10,
      "weather": [{"main": "Clear"}]
    },
    {
      "dt": 1624323600,
      "uv": 6.2,
      "clouds": 15,
      "weather": [{"main": "Clear"}]
    }
  ],
  "friendly_name": "OpenWeatherMap UV Index",
  "attribution": "Data provided by Open-Meteo"
}
```

## Troubleshooting Integration Issues

### Check Entity Data

In Developer Tools > States:
1. Search for `openweathermap_uv_index`
2. Verify state is numeric (0-16)
3. Click icon to see full attributes
4. Confirm `hourly` array exists with 24+ entries

### Verify Forecast Data

```yaml
# In automation or template
{% set hourly = state_attr('sensor.openweathermap_uv_index', 'hourly') %}
Hourly data: {{ hourly | length }} hours
First UV: {{ hourly[0].uv if hourly else 'N/A' }}
```

### Check Logs

Monitor Home Assistant logs:
```bash
tail -f config/home-assistant.log | grep openweathermap
```

## Alternative Weather Services

The card works with any weather service that provides hourly UV data:

### Dark Sky (Historical)
- Uses: `weather.dark_sky` with forecast
- Note: Dark Sky API discontinued for new users

### Weather.gov (US Only)
- Provides forecast but limited UV data
- Not recommended for this card

### Custom REST Sensor

Create a custom sensor from any HTTP API:

```yaml
# configuration.yaml
rest:
  - resource: https://api.weather.service/uv
    scan_interval: 600
    sensor:
      - name: "Custom UV Index"
        unique_id: custom_uv_index
        value_template: "{{ value_json.current_uv }}"
        json_attributes:
          - hourly_forecast
```

Then use in card:
```yaml
type: custom:uv-index-chart-card
entity: sensor.custom_uv_index
```

## Performance Optimization

### Reduce Update Frequency

If updates are too frequent, adjust scan interval:

```yaml
openweathermap:
  api_key: YOUR_API_KEY
  scan_interval:
    minutes: 30  # Check every 30 minutes instead of 10
```

### Limit Historical Hours

Reduce synthetic data:

```yaml
type: custom:uv-index-chart-card
entity: sensor.openweathermap_uv_index
hours_back: 6    # Only 6 hours of synthetic data
hours_forward: 12 # Only 12 hours of forecast
```

### Conditional Loading

Only load card when needed:

```yaml
type: conditional
conditions:
  - entity: input_boolean.show_uv_card
    state: "on"
card:
  type: custom:uv-index-chart-card
  entity: sensor.openweathermap_uv_index
```

## Mobile App Considerations

### iOS/Android Optimization

The card is fully responsive and works on mobile:
- Auto-detects screen size
- Reduces chart height on mobile (240px vs 300px)
- Responsive grid layout

### App-Specific Issues

If using Home Assistant Companion App:
1. Check app is updated to latest version
2. Clear app cache (Settings > Storage > Clear Cache)
3. Re-authenticate to Home Assistant
4. Restart app

## API Rate Limiting

### OpenWeatherMap Limits

- Free tier: 60 calls/minute, 1000 calls/day
- Card with 10-minute scan interval = 144 calls/day
- Well within free tier limits

### Multiple Cards

If using multiple UV cards:
- Share same entity (no additional API calls)
- Don't create separate integrations per card
- Use template sensors to share data

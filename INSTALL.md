# UV Index Chart Card - Installation & Setup Guide

Complete step-by-step guide to install and configure the UV Index Chart Card custom card for Home Assistant.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Recommended)](#quick-start-recommended)
3. [Installation Methods](#installation-methods)
4. [Configuration](#configuration)
5. [Verification](#verification)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Home Assistant Requirements

- Home Assistant Core 2024.1.0 or later
- HACS installed (for HACS installation method)
- A weather integration with hourly UV data
- Administrator access to Home Assistant

### Recommended: OpenWeatherMap One Call 3.0

The easiest way to get hourly UV data is using OpenWeatherMap One Call 3.0 integration.

**Get API Key:**
1. Go to [openweathermap.org](https://openweathermap.org)
2. Sign up for free account
3. Get API key from Settings page
4. Free tier includes 1,000 calls/day (more than enough)

### Browser Requirements

- Modern browser with Canvas 2D API support:
  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+

---

## Quick Start (Recommended)

### Step 1: Set Up Weather Integration

Add to `configuration.yaml`:

```yaml
openweathermap:
  api_key: !secret openweathermap_api_key
  latitude: !secret latitude
  longitude: !secret longitude
  forecast_mode: onecall_pro
  scan_interval:
    minutes: 10
```

Add to `secrets.yaml`:

```yaml
openweathermap_api_key: "YOUR_API_KEY_HERE"
latitude: 40.7128
longitude: -74.0060
```

Then restart Home Assistant.

### Step 2: Verify Integration

Check Developer Tools > States:
1. Search for `sensor.openweathermap_uv_index`
2. Verify state shows a number (0-16)
3. Click to see full attributes
4. Confirm `hourly` array exists with `uv` values

### Step 3: Install Card via HACS (Easiest)

1. Open Home Assistant
2. Navigate to **HACS** (should be in sidebar)
3. Click **Frontend** tab
4. Click the **⋮** menu (top-right)
5. Select **Custom repositories**
6. Paste: `https://github.com/yourusername/uv-index-chart-card`
7. Select category: **Lovelace**
8. Click **Create**
9. Find "UV Index Chart Card" in the list
10. Click **Install**
11. Restart Home Assistant (Settings > System > Restart)

### Step 4: Add to Dashboard

#### Option A: YAML Mode

Edit your Lovelace YAML:

```yaml
views:
  - title: Weather
    cards:
      - type: custom:uv-index-chart-card
        entity: sensor.openweathermap_uv_index
```

#### Option B: UI Mode

1. Go to your dashboard
2. Click **Edit dashboard** (pencil icon)
3. Click **+ Add card**
4. Scroll down and find **UV Index Chart Card**
5. Select entity: `sensor.openweathermap_uv_index`
6. Click **Save**

### Step 5: Verify Installation

- Card should appear on dashboard
- Chart should show 36 bars (12 past + 24 future)
- Current UV value shown in top-right
- Hover over bars for details

---

## Installation Methods

### Method 1: HACS Installation (Recommended)

**Pros:**
- One-click installation
- Automatic updates
- Easy to remove

**Steps:**

1. Install HACS if not already installed: https://hacs.xyz/docs/setup/prerequisites
2. In Home Assistant, go to HACS > Frontend
3. Click menu (⋮) > Custom repositories
4. Add: `https://github.com/yourusername/uv-index-chart-card`
5. Category: **Lovelace**
6. Click Create
7. Find and click on "UV Index Chart Card"
8. Click Install
9. Restart Home Assistant

**Browser cache clear:**
```
Chrome: Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
Firefox: Ctrl+Shift+Delete
Safari: Develop > Empty Caches
```

### Method 2: Manual Installation

**For users without HACS or preferring manual control:**

#### 2a. Build from Source

```bash
# Clone repository
git clone https://github.com/yourusername/uv-index-chart-card.git
cd uv-index-chart-card

# Install dependencies
npm install

# Build for production
npm run build

# Output: dist/uv-index-chart-card.js
```

#### 2b. Copy to Home Assistant

```bash
# Navigate to Home Assistant config directory
cd /path/to/homeassistant/config

# Create community directory
mkdir -p www/community/uv-index-chart-card

# Copy built file
cp /path/to/uv-index-chart-card/dist/uv-index-chart-card.js \
   www/community/uv-index-chart-card/
```

#### 2c. Configure Home Assistant

Add to `configuration.yaml`:

```yaml
homeassistant:
  customize: {}

frontend:
  extra_module_url:
    - /local/community/uv-index-chart-card/uv-index-chart-card.js
```

#### 2d. Restart

Restart Home Assistant for changes to take effect.

### Method 3: Docker/Container

If using Home Assistant in Docker:

```bash
# Inside container
docker exec -it homeassistant bash

# Navigate to config
cd /config

# Create directory
mkdir -p www/community/uv-index-chart-card

# Copy file (from host)
docker cp uv-index-chart-card.js homeassistant:/config/www/community/uv-index-chart-card/
```

---

## Configuration

### Basic Configuration

Minimal working configuration:

```yaml
type: custom:uv-index-chart-card
entity: sensor.openweathermap_uv_index
```

### Full Configuration

All available options:

```yaml
type: custom:uv-index-chart-card
entity: sensor.openweathermap_uv_index
hours_back: 12
hours_forward: 24
```

### Configuration Parameters

| Parameter | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `type` | string | - | ✓ | Must be `custom:uv-index-chart-card` |
| `entity` | string | - | ✓ | Sensor with UV index and hourly forecast |
| `hours_back` | integer | 12 | ✗ | Historical hours to display (synthetic data) |
| `hours_forward` | integer | 24 | ✗ | Forecast hours to display |

### Entity Requirements

The entity must have:

1. **State**: Current UV index as a number
   ```
   State: "5.2"
   ```

2. **Attribute: hourly**: Array of hourly forecast objects
   ```json
   {
     "hourly": [
       {"uv": 4.5},
       {"uv": 6.2},
       {"uv": 7.1},
       ...
     ]
   }
   ```

### Example Configurations

#### Minimal
```yaml
type: custom:uv-index-chart-card
entity: sensor.openweathermap_uv_index
```

#### With Grid Layout
```yaml
type: grid
columns: 2
cards:
  - type: custom:uv-index-chart-card
    entity: sensor.openweathermap_uv_index
    
  - type: weather-forecast
    entity: weather.openweathermap
```

#### In Vertical Stack
```yaml
type: vertical-stack
title: UV Forecast
cards:
  - type: custom:uv-index-chart-card
    entity: sensor.openweathermap_uv_index
    hours_back: 24
    hours_forward: 48
```

#### Conditional Display
```yaml
type: conditional
conditions:
  - entity: input_boolean.show_weather
    state: "on"
card:
  type: custom:uv-index-chart-card
  entity: sensor.openweathermap_uv_index
```

---

## Verification

### Step 1: Check Entity

**Developer Tools > States:**

```
Search: openweathermap_uv_index
Expected state: Number between 0-16
Expected attribute: hourly (array)
```

### Step 2: Check Browser Console

Press F12 in browser, go to Console tab:

```
✓ No errors about custom:uv-index-chart-card
✓ No 404 errors for uv-index-chart-card.js
✓ No CORS errors
```

### Step 3: Check Card Display

```
✓ Card appears on dashboard
✓ Chart loads with bars
✓ Title shows "UV Index Forecast"
✓ Current UV value in top-right
✓ Legend visible at bottom
✓ 36 bars visible (12 + 24)
```

### Step 4: Interactive Tests

```
✓ Hover over bars → Tooltip shows UV value
✓ Bars have different colors (risk levels)
✓ Top bar has golden dot (peak marker)
✓ Vertical dashed line shows NOW
✓ Layout responsive on mobile
```

---

## Troubleshooting

### Card Not Appearing

**Symptom:** "Custom element not defined" or similar error

**Solutions:**

1. **Clear browser cache:**
   - Chrome: Ctrl+Shift+Delete
   - Firefox: Ctrl+Shift+Delete
   - Safari: Develop > Empty Caches

2. **Reload Home Assistant page:**
   - Press F5 (or Ctrl+R)
   - Or open in incognito/private mode

3. **Verify file is served:**
   - Open DevTools (F12) > Network tab
   - Look for `uv-index-chart-card.js`
   - If 404: Check file path in configuration.yaml

4. **Restart Home Assistant:**
   - Settings > System > Restart

### Entity Not Found

**Symptom:** "Entity sensor.openweathermap_uv_index not found"

**Solutions:**

1. **Verify entity exists:**
   - Developer Tools > States
   - Search for exact entity name
   - Check spelling (case-sensitive)

2. **Check integration installed:**
   - Settings > Devices & Services
   - Search "OpenWeatherMap"
   - Should show as configured

3. **Wait for integration to update:**
   - Initial setup takes 1-2 minutes
   - Check State History (Developer Tools)

4. **Check integration errors:**
   - Settings > System > Logs
   - Search for "openweathermap"
   - Look for error messages

### Data Not Loading

**Symptom:** Chart appears but no bars or bars are empty

**Solutions:**

1. **Verify state value:**
   ```
   Developer Tools > States > sensor.openweathermap_uv_index
   Should show: State = number (not "unknown" or "unavailable")
   ```

2. **Check hourly attribute:**
   ```
   Click on entity in Developer Tools
   Scroll down to Attributes
   Should see: hourly = [array with 24+ items]
   Each item should have "uv" property
   ```

3. **Increase forecast hours:**
   ```yaml
   hours_forward: 48  # Try more hours
   ```

4. **Check integration refresh rate:**
   - Default: 10 minutes
   - Wait 10 minutes after restart
   - Then refresh browser

### Chart Rendering Issues

**Symptom:** Chart appears broken or doesn't render

**Solutions:**

1. **Check browser support:**
   - Canvas 2D API support: https://caniuse.com/canvas
   - Upgrade to latest browser version

2. **Disable browser extensions:**
   - Ad blockers
   - Content filters
   - Script blockers
   - Try in incognito mode

3. **Check GPU acceleration:**
   - Chrome: Settings > System > Use hardware acceleration
   - Firefox: about:config > layers.acceleration.enabled
   - Disable and try again

4. **Check console for errors:**
   - F12 > Console
   - Look for red error messages
   - Note full error text for support

### Performance Issues

**Symptom:** Dashboard slow, chart jittery, high CPU

**Solutions:**

1. **Reduce data points:**
   ```yaml
   hours_back: 6
   hours_forward: 12
   ```

2. **Increase scan interval:**
   ```yaml
   openweathermap:
     scan_interval:
       minutes: 30  # Update less frequently
   ```

3. **Disable animations:**
   - Remove other animated cards
   - Check for resource-intensive custom cards

4. **Monitor browser dev tools:**
   - F12 > Performance tab
   - Record 5 seconds
   - Look for bottlenecks

### Mobile Display Issues

**Symptom:** Chart doesn't fit on mobile screen

**Solutions:**

1. **Use responsive view:**
   - F12 > Toggle device toolbar
   - Test different screen sizes

2. **Reduce chart height:**
   - Chart auto-adjusts on mobile (240px)
   - Should fit within screen

3. **Check theme colors:**
   - May not be visible on some themes
   - Try different dashboard theme

### API Rate Limiting

**Symptom:** Entity shows "unavailable" or no data

**Solutions:**

1. **Check API limit:**
   - Free: 1,000 calls/day
   - With 10-min scan: 144 calls/day (OK)
   - With 1-min scan: 1,440 calls/day (Over limit)

2. **Increase scan interval:**
   ```yaml
   openweathermap:
     scan_interval:
       minutes: 15  # Don't update too frequently
   ```

3. **Check status page:**
   - https://status.openweathermap.org
   - May be experiencing outage

4. **Verify API key:**
   - Check it's valid and active
   - Check account hasn't been suspended

### Home Assistant Restart Issues

**Symptom:** Card disappears after restart

**Solutions:**

1. **Clear cache and reload:**
   - Ctrl+Shift+Delete (browser cache)
   - F5 (page reload)

2. **Hard refresh:**
   - Ctrl+F5 (Chrome/Firefox)
   - Cmd+Shift+R (Mac)

3. **Check logs:**
   - Settings > System > Logs
   - Look for JavaScript errors

4. **Verify file still exists:**
   - Check www/community directory
   - Re-copy file if needed

---

## Getting Help

### Check These Resources

1. **Logs:** Settings > System > Logs
2. **Console:** F12 > Console tab
3. **States:** Developer Tools > States
4. **GitHub Issues:** https://github.com/yourusername/uv-index-chart-card/issues
5. **HA Community:** https://community.home-assistant.io

### When Reporting Issues

Include:

- Home Assistant version
- Browser and version
- Error message from F12 console (full text)
- Entity state and attributes
- Configuration YAML
- Screenshots of the issue

---

## Updating

### HACS Installation

1. HACS will notify when update available
2. Click the notification or go to HACS > Frontend
3. Find "UV Index Chart Card"
4. Click menu (⋮) > Reinstall
5. Restart Home Assistant

### Manual Installation

```bash
# Update source
cd uv-index-chart-card
git pull origin main

# Rebuild
npm install
npm run build

# Copy to Home Assistant
cp dist/uv-index-chart-card.js \
   /path/to/homeassistant/www/community/uv-index-chart-card/

# Refresh browser
# Clear cache: Ctrl+Shift+Delete
# Reload: F5
```

---

## Uninstalling

### HACS Installation

1. Go to HACS > Frontend
2. Find "UV Index Chart Card"
3. Click menu (⋮) > Uninstall
4. Remove from dashboard
5. Restart Home Assistant (optional)

### Manual Installation

1. Delete directory: `www/community/uv-index-chart-card/`
2. Remove from `configuration.yaml`
3. Restart Home Assistant

---

## Next Steps

After successful installation:

1. ✓ Customize dashboard layout
2. ✓ Set up automations based on UV levels
3. ✓ Configure additional sensors if needed
4. ✓ Explore advanced features
5. ✓ Share dashboard with family

See [EXAMPLES.md](EXAMPLES.md) for advanced configuration examples!

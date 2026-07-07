import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import Chart from 'chart.js/auto';

/**
 * UV Index Chart Card for Home Assistant
 *
 * A premium Lovelace custom card displaying hourly UV index forecasts
 * with glassmorphism styling, risk-based color coding, and advanced features.
 *
 * Architecture:
 * 1. Config validation: Accepts entity, hours_back, hours_forward
 * 2. Data loading: Fetches entity state and hourly UV array from attributes
 * 3. Data synthesis: Generates synthetic past UV values fading from current UV
 * 4. Chart rendering: Uses Chart.js v4 with custom plugins for Now line & peak marker
 * 5. Sunrise/Sunset: Loads sun.sun entity to shade day/night periods
 * 6. Styling: Modern glassmorphism with blur, translucency, and soft shadows
 */

/**
 * UV Risk Color Map
 * Maps UV index ranges to color codes for visual risk indication
 */
interface UVColorMap {
  [key: number]: string;
}

const UV_COLORS: UVColorMap = {
  0: '#4CAF50',   // 0-3: Green (Safe)
  3: '#FFEB3B',   // 3-6: Yellow (Moderate)
  6: '#FF9800',   // 6-8: Orange (High)
  8: '#F44336',   // 8-11: Red (Very High)
  11: '#9C27B0'   // 11+: Purple (Extreme)
};

/**
 * Hourly data point for UV index chart
 */
interface UVDataPoint {
  timestamp: number;
  uv: number;
  isSynthetic: boolean;
  isForecast: boolean;
}

/**
 * Sunrise/sunset times for shading
 */
interface SunTimes {
  // Arrays so we can cover the full 36-hour window (may span 2 days)
  sunrises: number[];
  sunsets: number[];
}

/**
 * Configuration object for the custom card
 */
interface UVCardConfig {
  entity: string;
  /** Real-time UV sensor (e.g. Hubitat) used to populate the historical past bars */
  uv_realtime_entity?: string;
  hours_back?: number;
  hours_forward?: number;
  [key: string]: any;
}

@customElement('uv-index-chart-card')
export class UVIndexChartCard extends LitElement {
  // Use a setter so we only redraw when the relevant entity actually changes,
  // not on every hass update (which fires every second).
  private _hass: any;
  private _lastEntityState: string = '';
  private _lastEntityHourly: string = '';
  /** Incremented on every updateChart() call; stale async runs abort when token mismatches */
  private _updateToken = 0;

  set hass(h: any) {
    this._hass = h;
    // Always re-render the Lit template (cheap) so the realtime UV value in the
    // header stays current even when the forecast hasn't changed yet.
    this.requestUpdate();
    // Only rebuild the chart when forecast data actually changes (expensive async op).
    const entity = h?.states?.[this.config?.entity!];
    const newState = entity?.state ?? '';
    const newHourly = JSON.stringify(entity?.attributes?.hourly?.[0]) ?? '';
    if (newState !== this._lastEntityState || newHourly !== this._lastEntityHourly) {
      this._lastEntityState = newState;
      this._lastEntityHourly = newHourly;
      this.updateChart();
    }
  }
  get hass() { return this._hass; }

  @property() config: UVCardConfig = { entity: '' };

  private chart: Chart | null = null;
  private chartContainer: HTMLCanvasElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  /** Tells Lovelace which element to render in the visual card editor */
  static getConfigElement() {
    return document.createElement('uv-index-chart-card-editor');
  }

  /** Provides a default config when the card is added from the UI */
  static getStubConfig(hass: any): UVCardConfig {
    const uvForecast = Object.keys(hass?.states ?? {}).find(e =>
      e.startsWith('sensor.') && (e.includes('uv') || e.includes('ultraviolet'))
    );
    return {
      entity: uvForecast ?? 'sensor.openweathermap_uv_index',
      hours_back: 12,
      hours_forward: 24
    };
  }

  /**
   * Validate configuration when it's set
   */
  setConfig(config: UVCardConfig) {
    if (!config.entity) {
      throw new Error('You must define an entity');
    }
    this.config = {
      hours_back: 12,
      hours_forward: 24,
      ...config
    };
  }

  /**
   * Lifecycle: first render — draw chart once the canvas is in the DOM
   */
  protected firstUpdated() {
    setTimeout(() => this.updateChart(), 0);

    // Rebuild chart when the card is resized (e.g. dashboard panel resizes)
    this._resizeObserver = new ResizeObserver(() => {
      this.updateChart();
    });
    this._resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this.chart?.destroy();
  }

  /**
   * Initialize or update the Chart.js instance.
   * Async so history can be fetched from the HA Recorder API.
   */
  private async updateChart() {
    const canvas = this.shadowRoot?.querySelector('#uvChart') as HTMLCanvasElement;
    if (!canvas) return;

    const token = ++this._updateToken;
    try {
      const data = await this.prepareChartData();
      if (token !== this._updateToken) return; // a newer call superseded this one

      // Entity not available yet — retry in 3 s rather than crash / show blank card
      if (!data?.datasets?.[0]?.data) {
        if (token === this._updateToken) setTimeout(() => this.updateChart(), 3000);
        return;
      }

      if (this.chart) this.chart.destroy();
      this.chart = this.createChart(canvas, data);
    } catch (error) {
      console.error('UV Chart Card Error:', error);
      // Retry on transient errors (e.g. history API timeout on first load)
      if (token === this._updateToken) setTimeout(() => this.updateChart(), 5000);
    }
  }

  /**
   * Prepare data for Chart.js
   * Combines synthetic past data and real forecast data
   *
   * Process:
   * 1. Load current UV value from entity state
   * 2. Generate synthetic past hours (fade from current UV downward)
   * 3. Load real forecast hours from entity hourly attribute
   * 4. Create labels with timestamps
   * 5. Apply risk-based colors to each bar
   */
  /**
   * Prepare data for Chart.js.
   *
   * Past segment: if uv_realtime_entity is configured, real measured values are
   * fetched from the HA Recorder history API and bucketed into hourly slots.
   * Falls back to synthetic fade when history is unavailable.
   *
   * Forecast segment: hourly UV from the OWM entity's `hourly` attribute.
   */
  private async prepareChartData(): Promise<any> {
    const entity = this._hass?.states[this.config.entity!];
    if (!entity) {
      console.warn(`Entity ${this.config.entity} not found`);
      return { labels: [], datasets: [] };
    }

    const hoursBack = this.config.hours_back || 12;
    const hoursForward = this.config.hours_forward || 24;
    const hourlyData = entity.attributes?.hourly || [];

    // Get the true current UV value (prefer realtime sensor over forecast)
    let currentUV = parseFloat(entity.state) || 0;
    if (this.config.uv_realtime_entity) {
      const rtEntity = this._hass?.states[this.config.uv_realtime_entity];
      if (rtEntity) {
        const rtUV = parseFloat(rtEntity.state ?? '');
        if (isFinite(rtUV)) currentUV = rtUV;
      }
    }

    // Forecast segment
    const forecastData = this.processForecastData(hourlyData, hoursForward);
    const firstForecastTimestamp = forecastData[0]?.timestamp ?? Date.now();

    // Past segment — real history when available, synthetic fade otherwise
    let pastData: UVDataPoint[];
    if (this.config.uv_realtime_entity) {
      const history = await this.loadPastDataFromHistory(
        this.config.uv_realtime_entity,
        firstForecastTimestamp,
        hoursBack
      );
      if (history.length > 0) {
        pastData = history;
      } else {
        // History unavailable — use current sensor value as anchor
        pastData = this.generateSyntheticPastData(currentUV, firstForecastTimestamp, hoursBack);
      }
    } else {
      // No realtime sensor — use current forecast or entity state as anchor
      pastData = this.generateSyntheticPastData(currentUV, firstForecastTimestamp, hoursBack);
    }

    const allData = [...pastData, ...forecastData];
    const labels = allData.map(p =>
      new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    );
    const colors = allData.map(p => this.getUVColor(p.uv));
    const sunTimes = this.getSunTimes();

    return {
      labels,
      datasets: [{
        label: 'UV Index',
        data: allData.map(p => p.uv),
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 0,
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.9,
        categoryPercentage: 1.0,
        metadata: { dataPoints: allData, sunTimes, currentTime: new Date() }
      }]
    };
  }

  /**
   * Generate synthetic past UV data
   *
   * Creates synthetic historical data points by:
   * 1. Starting with the current UV value
   * 2. Fading down to a lower baseline as we go backward in time
   * 3. Adding slight random variation for realism
   *
   * @param anchorUV - UV index value at the first forecast point
   * @param anchorTimestamp - Timestamp of the first forecast point
   * @param hoursBack - Number of synthetic hours to generate
   * @returns Array of synthetic UV data points
   */
  private generateSyntheticPastData(anchorUV: number, anchorTimestamp: number, hoursBack: number): UVDataPoint[] {
    const data: UVDataPoint[] = [];

    for (let i = hoursBack; i > 0; i--) {
      // Build a smooth fade from low UV (older) up to anchorUV (newer)
      const progress = (hoursBack - i + 1) / hoursBack;
      const baselineUV = anchorUV * 0.2;
      const syntheticUV = baselineUV + (anchorUV - baselineUV) * progress;
      const finalUV = Math.max(0, syntheticUV);

      data.push({
        timestamp: anchorTimestamp - i * 3600000,
        uv: Math.round(finalUV * 10) / 10,
        isSynthetic: true,
        isForecast: false
      });
    }

    return data;
  }

  /**
   * Fetch real UV history from the HA Recorder API for the past window.
   *
   * Calls GET /api/history/period/{start} and buckets the returned state
   * changes into one UVDataPoint per hour, using the last recorded reading
   * within each slot. Falls back to an empty array on any error.
   *
   * @param entityId   - e.g. "sensor.weather_ultravioleetindx"
   * @param anchorTs   - the start of the forecast (end of the history window)
   * @param hoursBack  - how many 1-hour buckets to build
   */
  private async loadPastDataFromHistory(
    entityId: string,
    anchorTs: number,
    hoursBack: number
  ): Promise<UVDataPoint[]> {
    const start = new Date(anchorTs - hoursBack * 3600000).toISOString();
    const end   = new Date(anchorTs).toISOString();
    console.log(`UV Chart Card: fetching history for ${entityId} from ${start} to ${end}`);
    try {
      // NOTE: do NOT use minimal_response=true — with that flag HA only returns
      // `last_changed` (not `last_updated`) on all records after the first, so
      // every timestamp lookup would yield NaN and all slots would be empty.
      // no_attributes=true still keeps the payload small while preserving
      // last_updated on every record.
      const result: Array<Array<{ state: string; last_updated?: string; last_changed?: string }>> =
        await this._hass.callApi(
          'GET',
          `history/period/${start}?filter_entity_id=${entityId}&end_time=${end}&no_attributes=true&significant_changes_only=false`
        );
      const records = result?.[0] ?? [];
      console.log(`UV Chart Card: got ${records.length} raw records from API for ${entityId}`);
      if (!records.length) {
        console.warn(`UV Chart Card: no history found for ${entityId} (${start} → ${end}) — this may mean the entity has no recorded state changes, or the recorder isn't tracking it`);
        return [];
      }

      // Parse, validate, and sort ascending so forward-fill works correctly
      const sorted = records
        .map(r => ({ ts: new Date(r.last_updated || r.last_changed || '').getTime(), uv: parseFloat(r.state) }))
        .filter(r => isFinite(r.ts) && isFinite(r.uv) && r.uv >= 0)
        .sort((a, b) => a.ts - b.ts);

      if (!sorted.length) {
        console.warn(`UV Chart Card: history for ${entityId} contained no parseable states (first record: state=${records[0]?.state}, last_updated=${records[0]?.last_updated}, last_changed=${records[0]?.last_changed})`);
        return [];
      }

      console.debug(`UV Chart Card: ${sorted.length} history readings for ${entityId}`);

      // Seed from the oldest record HA returned — HA includes the state active at
      // window-start as the first entry even if it was recorded before the window.
      let lastKnownUV = sorted[0].uv;
      const data: UVDataPoint[] = [];

      for (let i = hoursBack; i > 0; i--) {
        const slotEnd   = anchorTs - (i - 1) * 3600000;
        const slotStart = slotEnd - 3600000;

        // Use the highest value reached in the slot for the displayed bar,
        // but carry the last known state forward across empty slots so future
        // empty intervals preserve the current descending/ascending trend.
        const inSlot = sorted.filter(r => r.ts >= slotStart && r.ts < slotEnd);
        let slotUV = lastKnownUV;
        if (inSlot.length > 0) {
          const slotPeakUV = Math.max(...inSlot.map(r => r.uv));
          const slotLastUV = inSlot[inSlot.length - 1].uv;
          lastKnownUV = slotLastUV;
          slotUV = slotPeakUV;
        }

        data.push({
          timestamp: slotStart + 1800000, // midpoint of the slot
          uv: slotUV,
          isSynthetic: false,
          isForecast: false
        });
      }
      return data;
    } catch (err) {
      console.warn('UV Chart Card: history API error, falling back to synthetic data', err);
      return [];
    }
  }

  /**
   * Process forecast data from entity hourly attribute
   *
   * Extracts UV forecast data from OpenWeatherMap format:
   * Each hourly item contains a uv property with the forecasted UV index
   *
   * @param hourlyData - Array of hourly forecast data from entity
   * @param hoursForward - Maximum number of forecast hours to use
   * @returns Array of forecast UV data points
   */
  private processForecastData(hourlyData: any[], hoursForward: number): UVDataPoint[] {
    const data: UVDataPoint[] = [];
    const nowTs = Date.now();

    for (let i = 0; i < Math.min(hoursForward, hourlyData.length); i++) {
      const hourlyItem = hourlyData[i];
      const uvValue = parseFloat(hourlyItem?.uvi ?? hourlyItem?.uv ?? hourlyItem?.value) || 0;

      // OpenWeatherMap uses Unix seconds in `dt`.
      const rawDt = Number(hourlyItem?.dt);
      const timestamp = Number.isFinite(rawDt) && rawDt > 0
        ? (rawDt > 1e12 ? rawDt : rawDt * 1000)
        : nowTs + i * 3600000;

      data.push({
        timestamp,
        uv: uvValue,
        isSynthetic: false,
        isForecast: true
      });
    }

    return data;
  }

  /**
   * Get sunrise/sunset times from sun.sun entity
   *
   * Uses Home Assistant's sun.sun entity to determine day/night periods
   * for background shading visualization
   *
   * @returns Object with sunrise and sunset timestamps
   */
  private getSunTimes(): SunTimes {
    const sunEntity = this._hass?.states['sun.sun'];
    if (!sunEntity) {
      console.warn('sun.sun entity not found for shading');
      return { sunrises: [], sunsets: [] };
    }

    // HA only gives us next_sunrise / next_sunset. We approximate the previous
    // ones by subtracting 24 h so we cover the full synthetic-past window.
    const nextRise = new Date(sunEntity.attributes?.next_rising ?? sunEntity.attributes?.next_sunrise).getTime();
    const nextSet  = new Date(sunEntity.attributes?.next_setting ?? sunEntity.attributes?.next_sunset).getTime();
    const DAY = 86400000;

    return {
      sunrises: [nextRise - DAY, nextRise],
      sunsets:  [nextSet  - DAY, nextSet]
    };
  }

  /**
   * Get color for UV index value based on risk levels
   *
   * Risk mapping:
   * - 0-3: Green (#4CAF50) - Safe
   * - 3-6: Yellow (#FFEB3B) - Moderate
   * - 6-8: Orange (#FF9800) - High
   * - 8-11: Red (#F44336) - Very High
   * - 11+: Purple (#9C27B0) - Extreme
   *
   * @param uvValue - UV index value
   * @returns Hex color code for the risk level
   */
  private getUVColor(uvValue: number): string {
    if (uvValue < 3) return UV_COLORS[0];
    if (uvValue < 6) return UV_COLORS[3];
    if (uvValue < 8) return UV_COLORS[6];
    if (uvValue < 11) return UV_COLORS[8];
    return UV_COLORS[11];
  }

  /**
   * Create Chart.js instance with custom plugins
   *
   * Plugins:
   * 1. beforeDraw: Renders sunrise/sunset shading and now line
   * 2. afterDatasetsDraw: Renders peak UV indicator (glowing dot)
   *
   * @param canvas - Canvas element for Chart.js
   * @param data - Chart data object
   * @returns Chart instance
   */
  private createChart(canvas: HTMLCanvasElement, data: any): Chart {
    const ctx = canvas.getContext('2d')!;

    // Register plugins for custom rendering.
    // ALL drawing goes in afterDraw so Chart.js has already calculated
    // bar positions (getDatasetMeta(0).data[i].x is only valid post-layout).
    const nowLinePlugin = {
      id: 'nowLinePlugin',
      afterDraw: (chart: any) => {
        const metadata = data.datasets[0]?.metadata;
        if (!metadata?.dataPoints?.length) return;
        this.drawSunriseSetShading(chart, metadata);
        this.drawMidnightLines(chart, metadata);
        this.drawNowLine(chart);
        this.drawPeakUVMarker(chart, metadata);
      }
    };

    const cardWidth = this.offsetWidth || 400;
    const axisFontSize = Math.max(8, Math.min(11, cardWidth / 42));
    const titleFontSize = Math.max(9, Math.min(12, cardWidth / 36));

    return new Chart(ctx, {
      type: 'bar',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              label: (context: any) => {
                return `UV Index: ${context.parsed.y.toFixed(1)}`;
              },
              afterLabel: (context: any) => {
                const point = data.datasets[0].metadata.dataPoints[context.dataIndex];
                if (point.isSynthetic) return '(Synthetic Data)';
                if (point.isForecast) return '(Forecast)';
                return '(Current)';
              }
            }
          }
        },
        scales: {
          x: {
            stacked: false,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            border: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)',
              font: {
                size: axisFontSize
              },
              maxRotation: 90,
              minRotation: 90
            }
          },
          y: {
            beginAtZero: true,
            // Dynamic max: at least 12, or peak UV rounded up to next even + 2
            max: Math.max(12, Math.ceil(Math.max(...(data.datasets[0].data as number[])) / 2) * 2 + 2),
            stacked: false,
            grid: {
              color: 'rgba(255, 255, 255, 0.08)'
            },
            border: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)',
              font: {
                size: axisFontSize
              },
              stepSize: 2
            },
            title: {
              display: true,
              text: 'UV Index',
              color: 'rgba(255, 255, 255, 0.7)',
              font: {
                size: titleFontSize,
                weight: 600 as const
              }
            }
          }
        }
      },
      plugins: [nowLinePlugin]
    });
  }

  /**
   * Draw vertical "Now" line at the current timestamp
   *
   * Calculates the pixel position based on current time
   * and draws a semi-transparent vertical line with a label
   *
   * @param chart - Chart.js instance
   */
  private drawNowLine(chart: any) {
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    if (!xScale || !yScale) return;

    // Draw the NOW line at the boundary between synthetic past and forecast.
    // Using timestamp-proximity caused off-by-one: the first forecast bar is at
    // the next hourly boundary (e.g. 2:00 PM), which wins over the last synthetic
    // bar (1:00 PM) even when the actual time is 1:41 PM.
    const dataPoints = chart.data.datasets[0].metadata?.dataPoints || [];
    if (!dataPoints.length) return;

    // Find the index of the first forecast bar; the NOW line sits on its left edge.
    const splitIndex = dataPoints.findIndex((p: UVDataPoint) => p.isForecast);
    if (splitIndex < 1) return; // nothing to draw if no split

    // Left edge of the first forecast bar = right edge of last synthetic bar
    const numBars = chart.data.labels?.length || 1;
    const barStep = (xScale.right - xScale.left) / numBars;
    const xPos = xScale.left + splitIndex * barStep;

    // Draw dashed vertical line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(xPos, yScale.top);
    ctx.lineTo(xPos, yScale.bottom);
    ctx.stroke();
    ctx.restore();

    // Label inside the chart area
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NOW', xPos, yScale.top + 14);
    ctx.restore();
  }

  /**
   * Draw peak UV indicator (glowing dot)
   *
   * Finds the maximum UV value in the dataset and places
   * a glowing dot on top of that bar with a shadow effect
   *
   * @param chart - Chart.js instance
   * @param metadata - Chart metadata containing data points
   */
  private drawPeakUVMarker(chart: any, metadata: any) {
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    if (!xScale || !yScale || !metadata?.dataPoints) return;

    // Find peak UV value
    let peakIndex = 0;
    let peakUV = 0;
    metadata.dataPoints.forEach((point: UVDataPoint, i: number) => {
      if (point.uv > peakUV) {
        peakUV = point.uv;
        peakIndex = i;
      }
    });

    // Bar center x: evenly spaced across the plot area
    const numBars = chart.data.labels?.length || 1;
    const barStep = (xScale.right - xScale.left) / numBars;
    const xPos = xScale.left + (peakIndex + 0.5) * barStep;
    const yPos = yScale.getPixelForValue(peakUV);

    // Draw glowing halo
    ctx.save();
    const gradient = ctx.createRadialGradient(xPos, yPos, 0, xPos, yPos, 10);
    gradient.addColorStop(0, 'rgba(255, 200, 0, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 200, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(xPos, yPos, 10, 0, Math.PI * 2);
    ctx.fill();

    // Draw dot
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(xPos, yPos, 5, 0, Math.PI * 2);
    ctx.fill();

    // White border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // "PEAK" label below the dot
    ctx.fillStyle = 'rgba(255, 220, 0, 0.9)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PEAK', xPos, yPos + 18);

    ctx.restore();
  }

  /**
   * Draw smooth gradient sky shading across the full chart window.
   *
   * For each hour we interpolate a sky-darkness value (0 = full day, 1 = full night)
   * based on distance to the nearest sunrise/sunset, then render it as a
   * top-anchored semi-transparent gradient band so bars are still clearly visible.
   */
  private drawSunriseSetShading(chart: any, metadata: any) {
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    if (!xScale || !yScale || !metadata?.sunTimes) return;

    const { sunrises, sunsets } = metadata.sunTimes as SunTimes;
    if (!sunrises.length && !sunsets.length) return;

    const dataPoints: UVDataPoint[] = metadata.dataPoints;
    if (!dataPoints.length) return;

    const numBars = dataPoints.length;
    const barStep = (xScale.right - xScale.left) / numBars;
    // Twilight half-width in ms: 45-minute fade on each side of sunrise/sunset
    const TWILIGHT = 45 * 60 * 1000;

    // Helper: 0 = day, 1 = night for a given timestamp
    const skyDarkness = (ts: number): number => {
      // Build sorted list of all events tagged as 'rise' or 'set'
      type Event = { t: number; type: 'rise' | 'set' };
      const events: Event[] = [
        ...sunrises.map(t => ({ t, type: 'rise' as const })),
        ...sunsets.map(t => ({ t, type: 'set' as const }))
      ].sort((a, b) => a.t - b.t);

      if (!events.length) return 0;

      // Find the two bracketing events
      let before = events[0];
      let after  = events[events.length - 1];
      for (let i = 0; i < events.length - 1; i++) {
        if (events[i].t <= ts && events[i + 1].t > ts) {
          before = events[i];
          after  = events[i + 1];
          break;
        }
      }

      // During day (between rise and next set): darkness = 0
      // During night (between set and next rise): darkness = 1
      // In twilight window: linear ramp
      const inTwilight = (edge: Event): number => {
        const dist = Math.abs(ts - edge.t);
        if (dist >= TWILIGHT) return edge.type === 'rise' ? (ts < edge.t ? 1 : 0)
                                                           : (ts < edge.t ? 0 : 1);
        const frac = dist / TWILIGHT;
        return edge.type === 'rise'
          ? (ts < edge.t ? frac : 1 - frac)
          : (ts < edge.t ? 1 - frac : frac);
      };

      // If close to any event use its twilight ramp, otherwise use midpoint state
      for (const ev of events) {
        if (Math.abs(ts - ev.t) < TWILIGHT) return inTwilight(ev);
      }

      // Midpoint: fully day or night depending on bracket
      return before.type === 'rise' ? 0 : 1;
    };

    // Draw one vertical strip per bar
    for (let i = 0; i < numBars; i++) {
      const ts  = dataPoints[i]?.timestamp ?? 0;
      const darkness = skyDarkness(ts);
      if (darkness < 0.04) continue; // skip fully-lit bars

      const x = xScale.left + i * barStep;
      const h = yScale.bottom - yScale.top;

      // Gradient: dark at top, transparent at bottom so bars show through
      const grad = ctx.createLinearGradient(x, yScale.top, x, yScale.bottom);
      const alpha = darkness * 0.38;
      grad.addColorStop(0,   `rgba(10, 15, 60, ${alpha})`);
      grad.addColorStop(0.6, `rgba(10, 15, 60, ${alpha * 0.5})`);
      grad.addColorStop(1,   'rgba(10, 15, 60, 0)');

      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(x, yScale.top, barStep, h);
      ctx.restore();
    }
  }

  /**
   * Draw a subtle vertical line + date label at every midnight boundary
   * that falls within the chart's time window.
   */
  private drawMidnightLines(chart: any, metadata: any) {
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    const dataPoints: UVDataPoint[] = metadata?.dataPoints;
    if (!dataPoints?.length || !xScale || !yScale) return;

    const numBars = dataPoints.length;
    const barStep = (xScale.right - xScale.left) / numBars;
    const firstTs = dataPoints[0].timestamp;
    const lastTs  = dataPoints[numBars - 1].timestamp;

    // Find every midnight (local time) between firstTs and lastTs
    const midnights: number[] = [];
    const d = new Date(firstTs);
    d.setHours(24, 0, 0, 0); // next midnight from start
    while (d.getTime() <= lastTs) {
      midnights.push(d.getTime());
      d.setDate(d.getDate() + 1);
    }

    for (const midnight of midnights) {
      // Find the bar index immediately after midnight
      const idx = dataPoints.findIndex(p => p.timestamp >= midnight);
      if (idx < 0) continue;

      const xPos = xScale.left + idx * barStep;

      // Thin dashed line
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(xPos, yScale.top);
      ctx.lineTo(xPos, yScale.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Date label (e.g. "Mon 23") just inside the top of the chart
      const label = new Date(midnight).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, xPos + 3, yScale.top + 12);
      ctx.restore();
    }
  }

  /**
   * @deprecated replaced by gradient shading — kept as no-op for safety
   */
  private drawShading(_ctx: CanvasRenderingContext2D, _x1: number, _x2: number, _y1: number, _y2: number, _type: string) {}

  /**
   * Define component styles with glassmorphism
   */
  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      /* Defaults — all overridable via style: in Lovelace */
      background: var(--uv-card-background, rgba(0, 0, 0, 0.28));
      backdrop-filter: var(--uv-card-backdrop, blur(14px) saturate(160%));
      -webkit-backdrop-filter: var(--uv-card-backdrop, blur(14px) saturate(160%));
      border: var(--uv-card-border, 1px solid rgba(255, 255, 255, 0.12));
      border-radius: var(--uv-card-radius, 16px);
      padding: var(--uv-card-padding, 20px);
      color: rgba(255, 255, 255, 0.87);
      box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.3);
      transition: box-shadow 0.3s ease;
      overflow: hidden;
    }

    ha-card:hover {
      box-shadow: 0 6px 24px 0 rgba(0, 0, 0, 0.4);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .title {
      font-size: 18px;
      font-weight: 700;
      margin: 0;
      color: rgba(255, 255, 255, 0.95);
    }

    .current-uv {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .current-uv-value {
      font-size: 24px;
      font-weight: 800;
      color: #FFD700;
    }

    .current-uv-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .chart-wrapper {
      position: relative;
      width: 100%;
      /* Scale height with width: ~2.5:1 ratio looks good on all breakpoints */
      aspect-ratio: 2.5 / 1;
      min-height: 160px;
      max-height: 340px;
      margin-bottom: 16px;
    }

    #uvChart {
      width: 100% !important;
      height: 100% !important;
    }

    .legend {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 12px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: rgba(255, 255, 255, 0.7);
    }

    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    .info-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .info-item {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
    }

    .info-label {
      display: block;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .info-value {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
    }

    .error {
      background: rgba(244, 67, 54, 0.1);
      border: 1px solid rgba(244, 67, 54, 0.3);
      color: #ff6b6b;
      padding: 16px;
      border-radius: 12px;
      font-size: 13px;
    }

    /* Mobile responsiveness */
    @media (max-width: 600px) {
      ha-card {
        padding: 14px;
      }

      .title {
        font-size: 16px;
      }

      .current-uv-value {
        font-size: 20px;
      }

      .legend {
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      }

      .info-row {
        grid-template-columns: 1fr;
      }
    }
  `;

  /**
   * Render the custom card component
   */
  protected render() {
    const entity = this._hass?.states[this.config.entity!];

    if (!entity) {
      return html`
        <ha-card>
          <div class="error">
            Entity <strong>${this.config.entity}</strong> not found. Please verify your configuration.
          </div>
        </ha-card>
      `;
    }

    // Prefer the realtime sensor (e.g. Hubitat) for the current UV display value
    const rtEntity = this.config.uv_realtime_entity
      ? this._hass?.states[this.config.uv_realtime_entity]
      : null;
    const currentUV = parseFloat(rtEntity?.state ?? entity.state) || 0;
    const currentTime = new Date();

    return html`
      <ha-card>
        <div class="header">
          <h2 class="title">UV Index Forecast</h2>
          <div class="current-uv">
            <span class="current-uv-value">${currentUV.toFixed(1)}</span>
            <span class="current-uv-label">Current</span>
          </div>
        </div>

        <div class="chart-wrapper">
          <canvas id="uvChart"></canvas>
        </div>

        <div class="legend">
          <div class="legend-item">
            <div class="legend-color" style="background-color: #4CAF50;"></div>
            <span>0-3: Safe</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background-color: #FFEB3B;"></div>
            <span>3-6: Moderate</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background-color: #FF9800;"></div>
            <span>6-8: High</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background-color: #F44336;"></div>
            <span>8-11: Very High</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background-color: #9C27B0;"></div>
            <span>11+: Extreme</span>
          </div>
        </div>

        <div class="info-row">
          <div class="info-item">
            <span class="info-label">Time Range</span>
            <span class="info-value">${this.config.hours_back || 12}h Past + ${this.config.hours_forward || 24}h Future</span>
          </div>
          <div class="info-item">
            <span class="info-label">Last Updated</span>
            <span class="info-value">${currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        </div>
      </ha-card>
    `;
  }
}

/**
 * Visual card editor — rendered inside the Lovelace "Edit card" dialog.
 * Uses ha-form + HA selectors so entity pickers, number steppers etc. are
 * provided automatically without custom UI code.
 */
@customElement('uv-index-chart-card-editor')
export class UVIndexChartCardEditor extends LitElement {
  @property() hass: any;
  @property() config: UVCardConfig = { entity: '' };

  setConfig(config: UVCardConfig) {
    this.config = config;
  }

  private get _schema() {
    return [
      {
        name: 'entity',
        required: true,
        label: 'Forecast entity  (needs hourly UV attribute — e.g. OWM)',
        selector: { entity: { domain: 'sensor' } }
      },
      {
        name: 'uv_realtime_entity',
        label: 'Realtime UV sensor  (historical bars — e.g. Hubitat)',
        selector: { entity: { domain: 'sensor' } }
      },
      {
        name: 'hours_back',
        label: 'Hours of history to show',
        selector: { number: { min: 1, max: 48, step: 1, mode: 'box' } }
      },
      {
        name: 'hours_forward',
        label: 'Forecast hours to show',
        selector: { number: { min: 1, max: 48, step: 1, mode: 'box' } }
      }
    ];
  }

  private _valueChanged(ev: CustomEvent) {
    const config = { ...this.config, ...(ev.detail.value as UVCardConfig) };
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config } }));
  }

  protected render() {
    if (!this.hass) return html``;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this._schema}
        .computeLabel=${(s: { label?: string; name: string }) => s.label ?? s.name}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

// Register the custom elements
declare global {
  interface HTMLElementTagNameMap {
    'uv-index-chart-card': UVIndexChartCard;
    'uv-index-chart-card-editor': UVIndexChartCardEditor;
  }
}

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
  sunrise: number;
  sunset: number;
}

/**
 * Configuration object for the custom card
 */
interface UVCardConfig {
  entity: string;
  hours_back?: number;
  hours_forward?: number;
  [key: string]: any;
}

@customElement('uv-index-chart-card')
export class UVIndexChartCard extends LitElement {
  @property() hass: any;
  @property() config: UVCardConfig = { entity: '' };

  private chart: Chart | null = null;
  private chartContainer: HTMLCanvasElement | null = null;

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
   * Lifecycle: Component is ready to update
   */
  protected firstUpdated() {
    setTimeout(() => {
      this.updateChart();
    }, 0);
  }

  /**
   * Lifecycle: Component updates
   */
  protected updated() {
    this.updateChart();
  }

  /**
   * Initialize or update the Chart.js instance
   */
  private updateChart() {
    const canvas = this.shadowRoot?.querySelector('#uvChart') as HTMLCanvasElement;
    if (!canvas) return;

    try {
      // Destroy existing chart to prevent memory leaks
      if (this.chart) {
        this.chart.destroy();
      }

      const data = this.prepareChartData();
      this.chart = this.createChart(canvas, data);
    } catch (error) {
      console.error('UV Chart Card Error:', error);
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
  private prepareChartData(): any {
    const entity = this.hass.states[this.config.entity!];
    if (!entity) {
      console.warn(`Entity ${this.config.entity} not found`);
      return { labels: [], datasets: [] };
    }

    const hoursBack = this.config.hours_back || 12;
    const hoursForward = this.config.hours_forward || 24;
    const currentUV = parseFloat(entity.state) || 0;
    const hourlyData = entity.attributes?.hourly || [];

    // Process forecast data from entity attributes (OpenWeatherMap One Call style)
    // Supports hourly items such as: { dt: 1719032400, uvi: 4.2 }.
    const forecastData = this.processForecastData(hourlyData, hoursForward);

    // Add a synthetic past segment before the first forecast point.
    // This creates the desired 12h past + 24h future window.
    const firstForecastTimestamp = forecastData[0]?.timestamp ?? Date.now();
    const firstForecastUV = forecastData[0]?.uv ?? currentUV;
    const pastData = this.generateSyntheticPastData(firstForecastUV, firstForecastTimestamp, hoursBack);

    // Combine all data points
    const allData = [...pastData, ...forecastData];

    // Generate labels from each data point timestamp
    const now = new Date();
    const labels = allData.map((point) => {
      const time = new Date(point.timestamp);
      return time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });

    // Apply color coding based on UV risk levels
    const colors = allData.map(point => this.getUVColor(point.uv));

    // Load sunrise/sunset shading
    const sunTimes = this.getSunTimes();

    return {
      labels,
      datasets: [
        {
          label: 'UV Index',
          data: allData.map(p => p.uv),
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.9,
          categoryPercentage: 1.0,
          // Store original data for use in plugins
          metadata: {
            dataPoints: allData,
            sunTimes,
            currentTime: now
          }
        }
      ]
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
    const sunEntity = this.hass.states['sun.sun'];
    if (!sunEntity) {
      console.warn('sun.sun entity not found for shading');
      return { sunrise: 0, sunset: 0 };
    }

    const sunrise = new Date(sunEntity.attributes?.next_sunrise).getTime();
    const sunset = new Date(sunEntity.attributes?.next_sunset).getTime();

    return { sunrise, sunset };
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

    // Register plugins for custom rendering
    const nowLinePlugin = {
      id: 'nowLinePlugin',
      beforeDraw: (chart: any) => {
        this.drawNowLine(chart);
        this.drawSunriseSetShading(chart, data.datasets[0].metadata);
      },
      afterDatasetsDraw: (chart: any) => {
        this.drawPeakUVMarker(chart, data.datasets[0].metadata);
      }
    };

    return new Chart(ctx, {
      type: 'bar',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: 'rgba(255, 255, 255, 0.7)',
              font: {
                size: 12,
                weight: 600 as const
              },
              padding: 15
            }
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
                size: 11
              },
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            beginAtZero: true,
            max: 16,
            stacked: false,
            grid: {
              color: 'rgba(255, 255, 255, 0.08)'
            },
            border: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)',
              font: {
                size: 11
              },
              stepSize: 2
            },
            title: {
              display: true,
              text: 'UV Index',
              color: 'rgba(255, 255, 255, 0.7)',
              font: {
                size: 12,
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

    // Position the line at the bar closest to current time.
    const dataPoints = chart.data.datasets[0].metadata?.dataPoints || [];
    if (!dataPoints.length) return;

    const nowTs = Date.now();
    let currentIndex = 0;
    let minDelta = Number.POSITIVE_INFINITY;

    dataPoints.forEach((p: UVDataPoint, index: number) => {
      const delta = Math.abs(p.timestamp - nowTs);
      if (delta < minDelta) {
        minDelta = delta;
        currentIndex = index;
      }
    });

    // Use the actual bar's pixel x — getPixelForTick() indexes visible ticks, not bars
    const barMeta = chart.getDatasetMeta(0);
    const xPos: number = barMeta.data[currentIndex]?.x ?? xScale.getPixelForValue(currentIndex);

    // Draw line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(xPos, yScale.top);
    ctx.lineTo(xPos, yScale.bottom);
    ctx.stroke();
    ctx.restore();

    // Draw label inside the chart area so it can't be clipped
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
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

    // Use the actual bar's pixel x — getPixelForTick() indexes visible ticks, not bars
    const barMeta = chart.getDatasetMeta(0);
    const xPos: number = barMeta.data[peakIndex]?.x ?? xScale.getPixelForValue(peakIndex);
    const yPos = yScale.getPixelForValue(peakUV);

    // Draw glowing effect
    ctx.save();
    const gradient = ctx.createRadialGradient(xPos, yPos, 0, xPos, yPos, 12);
    gradient.addColorStop(0, 'rgba(255, 255, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(xPos, yPos, 12, 0, Math.PI * 2);
    ctx.fill();

    // Draw dot
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(xPos, yPos, 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(xPos, yPos, 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw sunrise/sunset shading on the chart background
   *
   * Creates a semi-transparent overlay for night periods
   * based on sun.sun entity data to show when UV exposure is minimal
   *
   * @param chart - Chart.js instance
   * @param metadata - Chart metadata with sun times
   */
  private drawSunriseSetShading(chart: any, metadata: any) {
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    if (!xScale || !yScale || !metadata?.sunTimes) return;

    const { sunrise, sunset } = metadata.sunTimes;
    const { currentTime } = metadata;
    const dataPoints = metadata.dataPoints;

    // Find indices for sunrise/sunset within the chart's data range
    const firstTime = dataPoints[0]?.timestamp || 0;
    const lastTime = dataPoints[dataPoints.length - 1]?.timestamp || 0;

    // Use actual bar pixel positions — getPixelForTick() indexes visible ticks, not bars
    const barMeta = chart.getDatasetMeta(0);
    const barX = (i: number): number =>
      barMeta.data[i]?.x ?? xScale.getPixelForValue(i);

    // Shade night period before sunrise
    if (sunrise > firstTime && sunrise < lastTime) {
      const sunriseIndex = dataPoints.findIndex((p: UVDataPoint) => p.timestamp >= sunrise);
      if (sunriseIndex > 0) {
        this.drawShading(ctx, xScale.left, barX(sunriseIndex), yScale.top, yScale.bottom, 'night');
      }
    }

    // Shade night period after sunset
    if (sunset > firstTime && sunset < lastTime) {
      const sunsetIndex = dataPoints.findIndex((p: UVDataPoint) => p.timestamp >= sunset);
      if (sunsetIndex >= 0) {
        this.drawShading(ctx, barX(sunsetIndex), xScale.right, yScale.top, yScale.bottom, 'night');
      }
    }
  }

  /**
   * Helper function to draw semi-transparent shading areas
   *
   * @param ctx - Canvas context
   * @param x1 - Start x position
   * @param x2 - End x position
   * @param y1 - Start y position
   * @param y2 - End y position
   * @param type - Shading type ('night' or other)
   */
  private drawShading(ctx: CanvasRenderingContext2D, x1: number, x2: number, y1: number, y2: number, type: string) {
    ctx.save();
    ctx.fillStyle = type === 'night' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 0, 0.05)';
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.restore();
  }

  /**
   * Define component styles with glassmorphism
   */
  static styles = css`
    :host {
      display: block;
      --card-background: rgba(255, 255, 255, 0.08);
      --card-border-color: rgba(255, 255, 255, 0.15);
    }

    .card {
      background: var(--card-background);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid var(--card-border-color);
      border-radius: 20px;
      padding: 24px;
      color: rgba(255, 255, 255, 0.87);
      box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
      transition: all 0.3s ease;
    }

    .card:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.25);
      box-shadow: 0 8px 40px 0 rgba(31, 38, 135, 0.45);
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
      height: 300px;
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
      .card {
        padding: 16px;
        border-radius: 16px;
      }

      .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }

      .chart-wrapper {
        height: 240px;
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
    const entity = this.hass.states[this.config.entity!];

    if (!entity) {
      return html`
        <div class="card">
          <div class="error">
            Entity <strong>${this.config.entity}</strong> not found. Please verify your configuration.
          </div>
        </div>
      `;
    }

    const currentUV = parseFloat(entity.state) || 0;
    const currentTime = new Date();

    return html`
      <div class="card">
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
      </div>
    `;
  }
}

// Register the custom element
declare global {
  interface HTMLElementTagNameMap {
    'uv-index-chart-card': UVIndexChartCard;
  }
}

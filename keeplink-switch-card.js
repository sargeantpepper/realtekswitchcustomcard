/*
 * Keeplink Switch Card for Home Assistant
 *
 * Install:
 *   1. Copy this file to /config/www/keeplink-switch-card.js
 *   2. Settings > Dashboards > (menu) Resources > Add resource
 *        URL:  /local/keeplink-switch-card.js     Type: JavaScript module
 *   3. Add a card:
 *        type: custom:keeplink-switch-card
 *
 * Options (all optional):
 *   title: Keeplink 2.5G Managed Switch
 *   prefix: keeplink        # entity prefix, e.g. binary_sensor.<prefix>_port_1_link
 *   ports: 8                # number of RJ45 ports (numbered from 1)
 *   sfp_ports: 1            # SFP ports, numbered after the RJ45 ports
 *   poe_budget: 120         # watts, sets the scale of the PoE bar
 *   details_collapsed: false  # start with the port statistics folded away
 *   port_names:             # friendly names shown in the detail panel
 *     1: NAS
 *     9: Uplink
 *
 * Entities used:
 *   binary_sensor.<prefix>_port_<n>_link   (attributes: speed, flow_control,
 *       tx_packets, rx_packets, tx_errors, rx_errors, poe_power_w,
 *       poe_current_ma, poe_voltage_v)
 *   switch.<prefix>_port_<n>_state
 *   sensor.<prefix>_port_<n>_poe_power
 *   sensor.<prefix>_poe_total_power
 *   button.<prefix>_clear_statistics
 */

const VERSION = '1.1.0';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const num = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const fmtInt = (v) => {
  const n = num(v);
  return n === null ? '–' : Math.round(n).toLocaleString();
};

function shortSpeed(raw) {
  if (!raw) return '';
  const m = String(raw).match(/(\d+(?:\.\d+)?)\s*([gm])?/i);
  if (!m) return String(raw);
  let v = parseFloat(m[1]);
  if ((m[2] || 'm').toLowerCase() === 'g') v *= 1000;
  return v >= 1000 ? `${v / 1000}G` : `${v}M`;
}

const STYLE = `
  :host { display: block; container-type: inline-size; }
  ha-card { overflow: hidden; }
  .hdr {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    padding: 12px 16px; background: #2c3e50; color: #ecf0f1;
  }
  .title { font-weight: 700; letter-spacing: 2px; text-transform: uppercase; font-size: 14px; }
  .sum { font-size: 12px; opacity: .8; white-space: nowrap; font-variant-numeric: tabular-nums; }

  .face {
    display: flex; align-items: stretch; justify-content: center; gap: 5px;
    padding: 14px 10px; background: #1b1f24;
    box-shadow: inset 0 0 18px rgba(0,0,0,.6);
  }
  .sep { flex: 0 0 1px; background: rgba(255,255,255,.12); margin: 4px 2px; }
  .port {
    flex: 1 1 0; max-width: 64px; min-width: 0; overflow: hidden;
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 6px 2px 5px; margin: 0; font: inherit; cursor: pointer;
    color: #cfd6dd; background: #262b31;
    border: 2px solid #111; border-radius: 6px;
    transition: border-color .15s, background .15s;
  }
  .port:hover { background: #2e343b; }
  .port:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 1px; }
  .port.sel { border-color: var(--primary-color, #03a9f4); }
  .port .lbl { font-size: 11px; font-weight: 700; }
  .port svg { width: 100%; max-width: 34px; height: auto; display: block; }
  .port .spd { font-size: 10px; line-height: 12px; height: 12px; opacity: .85; }
  .port .poe { font-size: 11px; line-height: 13px; height: 13px; font-weight: 700; color: #f1c40f; font-variant-numeric: tabular-nums; }

  @container (max-width: 420px) {
    .face { gap: 3px; padding: 12px 6px; }
    .port { border-width: 1px; padding: 5px 1px 4px; }
    .port .lbl { font-size: 10px; }
    .port .spd { font-size: 9px; }
    .port .poe { font-size: 9px; letter-spacing: -.3px; }
  }

  .jack { fill: #0c0e10; stroke: #4a525b; stroke-width: 1.5; }
  .pins { stroke: #4a525b; stroke-width: 1; }
  .led { fill: #3a4047; }
  .up .jack { stroke: #2ecc71; }
  .up .pins { stroke: #c9a227; }
  .up .led.link { fill: #2ecc71; filter: drop-shadow(0 0 2px #2ecc71); }
  .down .led.link { fill: #c0392b; }
  .powered .led.pwr { fill: #f1c40f; filter: drop-shadow(0 0 2px #f1c40f); }
  .disabled { opacity: .45; }
  .disabled .jack { stroke-dasharray: 3 2; }
  .unavail { opacity: .3; }

  .detail { padding: 12px 16px; border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.3)); }
  .hint { color: var(--secondary-text-color); font-size: 13px; }
  .dhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .dname {
    display: flex; align-items: center; flex-wrap: wrap; gap: 4px; min-width: 0;
    font: inherit; font-weight: 600; font-size: 15px; text-align: left; cursor: pointer;
    color: var(--primary-text-color); background: none; border: 0; padding: 4px 0; margin: 0;
  }
  .dname:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; border-radius: 4px; }
  .chev { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; opacity: .7; transition: transform .2s; }
  .closed .chev { transform: rotate(-90deg); }
  .closed .dhead { margin-bottom: 0; }
  .closed .stats { display: none; }
  .pill {
    display: inline-block; margin-left: 4px; padding: 1px 8px; border-radius: 10px;
    font-size: 11px; font-weight: 600; color: #fff; vertical-align: middle;
  }
  .pill.up { background: var(--success-color, #27ae60); }
  .pill.down { background: var(--error-color, #c0392b); }
  .pill.disabled, .pill.unavail { background: #777; opacity: 1; }
  .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px 12px; }
  .stat .k { font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .5px; }
  .stat .v { font-size: 14px; font-variant-numeric: tabular-nums; }
  .stat .v.bad { color: var(--error-color, #c0392b); font-weight: 600; }

  .foot { display: flex; align-items: center; gap: 16px; padding: 12px 16px; }
  .poebox { flex: 1; min-width: 0; }
  .poetop { display: flex; justify-content: space-between; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px; }
  .poetop b { color: var(--primary-text-color); font-size: 14px; font-variant-numeric: tabular-nums; }
  .bar { height: 8px; border-radius: 4px; background: var(--divider-color, rgba(127,127,127,.3)); overflow: hidden; }
  .fill { height: 100%; border-radius: 4px; transition: width .4s; }

  .btn {
    font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
    padding: 6px 12px; border-radius: 6px;
    color: var(--primary-text-color); background: transparent;
    border: 1px solid var(--divider-color, rgba(127,127,127,.4));
  }
  .btn:hover { background: rgba(127,127,127,.15); }
  .btn.armed { color: #fff; background: var(--error-color, #c0392b); border-color: transparent; }
`;

const RJ45_SVG = `
  <svg viewBox="0 0 34 28" aria-hidden="true">
    <circle class="led link" cx="5" cy="3" r="2"/>
    <circle class="led pwr" cx="29" cy="3" r="2"/>
    <path class="jack" d="M3 8 H31 V21 H24 V26 H10 V21 H3 Z"/>
    <path class="pins" d="M9 8v5 M13 8v5 M17 8v5 M21 8v5 M25 8v5"/>
  </svg>`;

const SFP_SVG = `
  <svg viewBox="0 0 34 28" aria-hidden="true">
    <circle class="led link" cx="5" cy="3" r="2"/>
    <circle class="led pwr" cx="29" cy="3" r="2"/>
    <rect class="jack" x="3" y="9" width="28" height="15" rx="1.5"/>
    <path class="pins" d="M7 20 H27"/>
  </svg>`;

class KeeplinkSwitchCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._selected = null;
    this._armed = null;
    this._armTimer = null;
    this._sig = '';
    this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
  }

  static getStubConfig() {
    return { prefix: 'keeplink' };
  }

  setConfig(config) {
    this._config = {
      title: 'Keeplink 2.5G Managed Switch',
      prefix: 'keeplink',
      ports: 8,
      sfp_ports: 1,
      poe_budget: 120,
      port_names: {},
      details_collapsed: false,
      ...(config || {}),
    };
    this._open = !this._config.details_collapsed;
    try {
      const saved = localStorage.getItem(`keeplink-switch-card:${this._config.prefix}:open`);
      if (saved !== null) this._open = saved === '1';
    } catch (e) { /* storage unavailable */ }
    this._sig = '';
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 5;
  }

  _ids(n) {
    const p = this._config.prefix;
    return {
      link: `binary_sensor.${p}_port_${n}_link`,
      admin: `switch.${p}_port_${n}_state`,
      poe: `sensor.${p}_port_${n}_poe_power`,
    };
  }

  _portNumbers() {
    const total = Number(this._config.ports) + Number(this._config.sfp_ports);
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  _port(n) {
    const s = this._hass.states;
    const ids = this._ids(n);
    const link = s[ids.link];
    const admin = s[ids.admin];
    const poe = s[ids.poe];
    const attrs = (link && link.attributes) || {};
    const sfp = n > Number(this._config.ports);
    const unavail = !link || link.state === 'unavailable' || link.state === 'unknown';
    const disabled = !!admin && admin.state === 'off';
    const up = !unavail && !disabled && link.state === 'on';
    let poeW = poe ? num(poe.state) : null;
    if (poeW === null) poeW = num(attrs.poe_power_w);
    const status = unavail ? 'unavail' : disabled ? 'disabled' : up ? 'up' : 'down';
    const names = this._config.port_names || {};
    return {
      n, ids, sfp, attrs, admin, up, disabled, unavail, poeW, status,
      label: sfp ? 'SFP+' : `P${n}`,
      name: names[n] || names[String(n)] || '',
    };
  }

  _signature() {
    const s = this._hass.states;
    const p = this._config.prefix;
    const ids = [`sensor.${p}_poe_total_power`, `button.${p}_clear_statistics`];
    this._portNumbers().forEach((n) => ids.push(...Object.values(this._ids(n))));
    return ids.map((id) => (s[id] ? s[id].last_updated : 'x')).join('|') + `|${this._selected}|${this._armed}|${this._open}`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const sig = this._signature();
    if (sig === this._sig) return;
    this._sig = sig;

    const cfg = this._config;
    const ports = this._portNumbers().map((n) => this._port(n));
    const upCount = ports.filter((p) => p.up).length;

    const totalObj = this._hass.states[`sensor.${cfg.prefix}_poe_total_power`];
    let total = totalObj ? num(totalObj.state) : null;
    if (total === null) total = ports.reduce((a, p) => a + (p.poeW || 0), 0);
    const budget = Number(cfg.poe_budget) || 120;
    const pct = Math.max(0, Math.min(100, (total / budget) * 100));
    const barColor =
      pct >= 83 ? 'var(--error-color, #c0392b)' : pct >= 50 ? 'var(--warning-color, #f39c12)' : 'var(--success-color, #27ae60)';

    const portHtml = (p) => `
      <button class="port ${p.status} ${p.poeW > 0 ? 'powered' : ''} ${this._selected === p.n ? 'sel' : ''}"
              data-port="${p.n}" title="${esc(p.name || p.label)}" aria-pressed="${this._selected === p.n}">
        <span class="lbl">${p.label}</span>
        ${p.sfp ? SFP_SVG : RJ45_SVG}
        <span class="spd">${p.up ? esc(shortSpeed(p.attrs.speed)) : p.disabled ? 'off' : '&nbsp;'}</span>
        <span class="poe">${p.poeW > 0 ? p.poeW.toFixed(1) + 'W' : '&nbsp;'}</span>
      </button>`;

    const rj = ports.filter((p) => !p.sfp).map(portHtml).join('');
    const sfp = ports.filter((p) => p.sfp).map(portHtml).join('');

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="hdr">
          <div class="title">${esc(cfg.title)}</div>
          <div class="sum">${upCount}/${ports.length} up · ${total.toFixed(1)} W</div>
        </div>
        <div class="face">${rj}${sfp ? '<div class="sep"></div>' + sfp : ''}</div>
        <div class="detail">${this._detailHtml(ports.find((p) => p.n === this._selected))}</div>
        <div class="foot">
          <div class="poebox">
            <div class="poetop"><span>Total PoE load</span><span><b>${total.toFixed(1)} W</b> / ${budget} W</span></div>
            <div class="bar"><div class="fill" style="width:${pct}%;background:${barColor}"></div></div>
          </div>
          <button class="btn ${this._armed === 'clear' ? 'armed' : ''}" data-action="clear">
            ${this._armed === 'clear' ? 'Tap again to clear' : 'Clear port stats'}
          </button>
        </div>
      </ha-card>`;
  }

  _detailHtml(p) {
    if (!p) return '<div class="hint">Select a port to see its details.</div>';
    const a = p.attrs;
    const statusText = { up: 'Link up', down: 'Link down', disabled: 'Disabled', unavail: 'Unavailable' }[p.status];
    const stat = (k, v, bad) => `<div class="stat"><div class="k">${k}</div><div class="v ${bad ? 'bad' : ''}">${v}</div></div>`;
    const txErr = num(a.tx_errors) || 0;
    const rxErr = num(a.rx_errors) || 0;

    let stats =
      stat('Speed', esc(a.speed || 'Unknown')) +
      stat('Flow control', esc(a.flow_control || 'Unknown')) +
      stat('Tx packets', fmtInt(a.tx_packets || 0)) +
      stat('Rx packets', fmtInt(a.rx_packets || 0)) +
      stat('Tx errors', fmtInt(txErr), txErr > 0) +
      stat('Rx errors', fmtInt(rxErr), rxErr > 0);

    if (a.poe_power_w !== undefined || p.poeW !== null) {
      stats += stat('PoE power', `${(p.poeW || 0).toFixed(1)} W`);
      if (a.poe_current_ma !== undefined) stats += stat('PoE current', `${esc(a.poe_current_ma)} mA`);
      if (a.poe_voltage_v !== undefined) stats += stat('PoE voltage', `${esc(a.poe_voltage_v)} V`);
    }

    let toggle = '';
    if (p.admin && p.admin.state !== 'unavailable') {
      const armed = this._armed === 'toggle';
      const text = p.disabled ? 'Enable port' : armed ? 'Tap again to disable' : 'Disable port';
      toggle = `<button class="btn ${armed ? 'armed' : ''}" data-action="toggle">${text}</button>`;
    }

    return `
      <div class="${this._open ? '' : 'closed'}">
      <div class="dhead">
        <button class="dname" data-action="collapse" aria-expanded="${this._open}">
          <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          <span>${p.sfp ? 'SFP+ port' : 'Port'} ${p.n}${p.name ? ' · ' + esc(p.name) : ''}</span>
          <span class="pill ${p.status}">${statusText}</span></button>
        ${toggle}
      </div>
      <div class="stats">${stats}</div>
      </div>`;
  }

  _arm(what) {
    clearTimeout(this._armTimer);
    this._armed = what;
    if (what) {
      this._armTimer = setTimeout(() => {
        this._armed = null;
        this._render();
      }, 3000);
    }
  }

  _onClick(e) {
    const portEl = e.target.closest('.port');
    const actionEl = e.target.closest('[data-action]');
    if (portEl) {
      const n = Number(portEl.dataset.port);
      this._selected = this._selected === n ? null : n;
      this._arm(null);
    } else if (actionEl && actionEl.dataset.action === 'collapse') {
      this._open = !this._open;
      try {
        localStorage.setItem(`keeplink-switch-card:${this._config.prefix}:open`, this._open ? '1' : '0');
      } catch (e) { /* storage unavailable */ }
    } else if (actionEl && actionEl.dataset.action === 'clear') {
      if (this._armed === 'clear') {
        this._hass.callService('button', 'press', { entity_id: `button.${this._config.prefix}_clear_statistics` });
        this._arm(null);
      } else {
        this._arm('clear');
      }
    } else if (actionEl && actionEl.dataset.action === 'toggle' && this._selected) {
      const p = this._port(this._selected);
      if (p.disabled) {
        this._hass.callService('switch', 'turn_on', { entity_id: p.ids.admin });
        this._arm(null);
      } else if (this._armed === 'toggle') {
        this._hass.callService('switch', 'turn_off', { entity_id: p.ids.admin });
        this._arm(null);
      } else {
        this._arm('toggle');
      }
    } else {
      return;
    }
    this._render();
  }
}

if (!customElements.get('keeplink-switch-card')) {
  customElements.define('keeplink-switch-card', KeeplinkSwitchCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'keeplink-switch-card',
  name: 'Keeplink Switch Card',
  description: 'Faceplate view of a Keeplink managed PoE switch with per-port details.',
});

console.info(`%c KEEPLINK-SWITCH-CARD %c v${VERSION} `, 'background:#2c3e50;color:#ecf0f1;font-weight:700', 'background:#27ae60;color:#fff');

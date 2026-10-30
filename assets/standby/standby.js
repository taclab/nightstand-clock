(function () {
  'use strict';
  // KS supplies the plugin's rendering options in the URL fragment.
  var options = {};
  try { options = JSON.parse(decodeURIComponent(location.hash.slice(1))); } catch (_) {}
  function color(value, fallback) {
    return typeof value === 'string' && /^#[a-fA-F0-9]{6}$/.test(value) ? value : fallback;
  }
  function pick(value, allowed, fallback) {
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }
  function number(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  var o = {
    layout: pick(options.layout, ['widget', 'full'], 'widget'),
    widget: pick(options.widget, ['calendar', 'weather', 'date', 'none'], 'calendar'),
    seconds: options.seconds !== false,
    secondHand: pick(options.secondHand, ['60', '30', 'tick'], '30'),
    night: pick(options.night, ['off', 'always', 'schedule', 'entity'], 'off'),
    nightStart: number(options.nightStart, 22),
    nightEnd: number(options.nightEnd, 7),
    nightActive: options.nightActive === true
  };
  o.clock = o.layout === 'full'
    ? pick(options.clock, ['analog', 'digital'], 'analog')
    : pick(options.clock, ['analog', 'analog-round', 'digital'], 'analog');

  var style = document.documentElement.style;
  style.setProperty('--user-primary', color(options.primary, '#FFFFFF'));
  style.setProperty('--user-accent', color(options.accent, '#FF3B30'));
  style.setProperty('--user-seconds', color(options.secondsColor, '#FF9F0A'));
  style.setProperty('--user-background', color(options.background, '#000000'));
  style.setProperty('--night', color(options.nightColor, '#FF2A1F'));
  style.setProperty('--night-opacity', Math.max(20, Math.min(100, number(options.nightBrightness, 70))) / 100);

  // Language, time format and first day of the week.
  var locale = typeof options.locale === 'string' && options.locale ? options.locale : (navigator.language || 'en');
  try { new Intl.DateTimeFormat(locale); } catch (_) { locale = 'en'; }
  var language = locale.slice(0, 2).toLowerCase();
  // Building a formatter costs far more than using one, and the full screen analog clock asks every frame.
  var formatters = {};
  function format(date, fields) {
    var key = JSON.stringify(fields);
    return (formatters[key] || (formatters[key] = new Intl.DateTimeFormat(locale, fields))).format(date);
  }
  function capitalized(text) {
    return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
  }
  function isoDate(date) {
    var month = date.getMonth() + 1, day = date.getDate();
    return date.getFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
  }
  function upper(text) {
    return text.replace(/\.$/, '').toLocaleUpperCase(locale);
  }
  var hour12 = options.timeFormat === '12-hour' || (options.timeFormat !== '24-hour' && (function () {
    var resolved = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions();
    return resolved.hour12 !== undefined ? resolved.hour12 : resolved.hourCycle === 'h12' || resolved.hourCycle === 'h11';
  }()));
  var firstDay = { monday: 1, sunday: 0, saturday: 6 }[options.weekStart];
  if (firstDay === undefined) {
    try {
      var info = new Intl.Locale(locale);
      info = info.getWeekInfo ? info.getWeekInfo() : info.weekInfo;
      firstDay = info.firstDay % 7;
    } catch (_) {
      var region = (locale.split(/[-_]/)[1] || '').toUpperCase();
      firstDay = ['US', 'CA', 'MX', 'BR', 'JP', 'KR', 'IL', 'PH', 'IN', 'ZA'].indexOf(region) >= 0 || locale === 'en' ? 0 : 1;
    }
  }

  var LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl'];
  var CONDITIONS = {
    'clear-night': ['Clear', 'Dégagé', 'Klar', 'Despejado', 'Sereno', 'Limpo', 'Helder'],
    'cloudy': ['Cloudy', 'Nuageux', 'Bewölkt', 'Nublado', 'Nuvoloso', 'Nublado', 'Bewolkt'],
    'exceptional': ['Exceptional', 'Exceptionnel', 'Außergewöhnlich', 'Excepcional', 'Eccezionale', 'Excepcional', 'Uitzonderlijk'],
    'fog': ['Fog', 'Brouillard', 'Nebel', 'Niebla', 'Nebbia', 'Nevoeiro', 'Mist'],
    'hail': ['Hail', 'Grêle', 'Hagel', 'Granizo', 'Grandine', 'Granizo', 'Hagel'],
    'lightning': ['Thunderstorms', 'Orages', 'Gewitter', 'Tormentas', 'Temporali', 'Trovoada', 'Onweer'],
    'lightning-rainy': ['Thunderstorms', 'Orages et pluie', 'Gewitter mit Regen', 'Tormentas con lluvia', 'Temporali con pioggia', 'Trovoada com chuva', 'Onweer en regen'],
    'partlycloudy': ['Partly Cloudy', 'Partiellement nuageux', 'Teilweise bewölkt', 'Parcialmente nublado', 'Parzialmente nuvoloso', 'Parcialmente nublado', 'Gedeeltelijk bewolkt'],
    'pouring': ['Heavy Rain', 'Averses', 'Starkregen', 'Lluvia intensa', 'Pioggia forte', 'Chuva forte', 'Stortregen'],
    'rainy': ['Rain', 'Pluie', 'Regen', 'Lluvia', 'Pioggia', 'Chuva', 'Regen'],
    'snowy': ['Snow', 'Neige', 'Schnee', 'Nieve', 'Neve', 'Neve', 'Sneeuw'],
    'snowy-rainy': ['Sleet', 'Pluie et neige', 'Schneeregen', 'Aguanieve', 'Nevischio', 'Chuva e neve', 'Natte sneeuw'],
    'sunny': ['Sunny', 'Ensoleillé', 'Sonnig', 'Soleado', 'Soleggiato', 'Ensolarado', 'Zonnig'],
    'windy': ['Windy', 'Venteux', 'Windig', 'Ventoso', 'Ventoso', 'Ventoso', 'Winderig'],
    'windy-variant': ['Windy', 'Venteux', 'Windig', 'Ventoso', 'Ventoso', 'Ventoso', 'Winderig']
  };
  var WORDS = {
    high: ['H:', 'H:', 'H:', 'Máx:', 'Max:', 'Máx:', 'H:'],
    low: ['L:', 'B:', 'T:', 'Mín:', 'Min:', 'Mín:', 'L:'],
    weather: ['Weather', 'Météo', 'Wetter', 'Tiempo', 'Meteo', 'Tempo', 'Weer'],
    choose: ['Choose a weather entity in the plugin settings.', 'Choisissez une entité météo dans les réglages du plugin.',
      'Wählen Sie eine Wetter-Entität in den Plugin-Einstellungen.', 'Elija una entidad meteorológica en los ajustes del plugin.',
      'Scegli un\'entità meteo nelle impostazioni del plugin.', 'Escolha uma entidade de tempo nas definições do plugin.',
      'Kies een weerentiteit in de plugin-instellingen.']
  };
  var languageIndex = Math.max(0, LANGUAGES.indexOf(language));
  function word(key) { return WORDS[key][languageIndex]; }
  function conditionName(condition) {
    if (CONDITIONS[condition]) return CONDITIONS[condition][languageIndex];
    return typeof condition === 'string' ? condition.charAt(0).toUpperCase() + condition.slice(1).replace(/[-_]/g, ' ') : '';
  }

  // SVG helpers. Angles are radians from 12 o'clock, clockwise.
  var NS = 'http://www.w3.org/2000/svg';
  function svg(parent, viewBox) {
    var element = document.createElementNS(NS, 'svg');
    element.setAttribute('viewBox', viewBox);
    element.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    parent.appendChild(element);
    return element;
  }
  function add(parent, name, attributes) {
    var element = document.createElementNS(NS, name);
    for (var key in attributes) element.setAttribute(key, attributes[key]);
    parent.appendChild(element);
    return element;
  }
  function text(parent, x, y, content, size, weight, className, anchor) {
    var element = add(parent, 'text', {
      x: x, y: y, 'font-size': size, 'font-weight': weight, 'class': className,
      'text-anchor': anchor || 'middle', 'dominant-baseline': 'central'
    });
    element.textContent = content;
    return element;
  }
  function point(angle, radius) {
    return [Math.sin(angle) * radius, -Math.cos(angle) * radius];
  }
  // Distance from the center to the superellipse |x/a|^n + |y/b|^n = 1 at this angle.
  function edge(angle, a, b, n) {
    var x = Math.abs(Math.sin(angle)) / a, y = Math.abs(Math.cos(angle)) / b;
    return 1 / Math.pow(Math.pow(x, n) + Math.pow(y, n), 1 / n);
  }
  function ray(parent, angle, from, to, width, className) {
    var start = point(angle, from), end = point(angle, to);
    return add(parent, 'line', {
      x1: start[0].toFixed(2), y1: start[1].toFixed(2), x2: end[0].toFixed(2), y2: end[1].toFixed(2),
      'stroke-width': width, 'class': className
    });
  }

  /** Hour, minute and second hands around (0, 0), sized by the dial radius. */
  function hands(parent, radius, minuteLength) {
    function hand(length, width) {
      var group = add(parent, 'g', {});
      add(group, 'line', { x1: 0, y1: 0, x2: 0, y2: -radius * 0.13, 'stroke-width': width * 0.38, 'class': 'stroke' });
      add(group, 'line', {
        x1: 0, y1: -radius * 0.13, x2: 0, y2: -length, 'stroke-width': width, 'stroke-linecap': 'round', 'class': 'stroke'
      });
      return group;
    }
    var hour = hand(radius * 0.52, radius * 0.054);
    var minute = hand(radius * (minuteLength || 0.84), radius * 0.054);
    add(parent, 'circle', { r: radius * 0.048, 'class': 'fill' });
    if (o.seconds) sweepHand(parent, radius);
    return function (now) {
      var minutes = now.getMinutes() + now.getSeconds() / 60;
      hour.setAttribute('transform', 'rotate(' + (((now.getHours() % 12) + minutes / 60) * 30).toFixed(3) + ')');
      minute.setAttribute('transform', 'rotate(' + (minutes * 6).toFixed(3) + ')');
    };
  }

  /**
   * The second hand sweeps in a layer of its own over the dial, turned by the compositor. Redrawing the SVG on every
   * frame kept a weak tablet's processor busy. The layer is only as large as the hand and pivots on the dial's center,
   * so each frame redraws a thin strip of the screen. At 30 fps each step is under a pixel at the tip, a touch less
   * fluid than 60 for less work. A ticking hand needs no animation: the once a second update moves the layer, and the
   * screen is still in between.
   */
  var sweep = null, ticking = null;
  function sweepHand(parent, radius) {
    var dial = parent.ownerSVGElement || parent, panel = dial.parentNode;
    var matrix = parent.getScreenCTM(), box = panel.getBoundingClientRect();
    // Not laid out yet. The resize that follows draws the clock again.
    if (!matrix) return;
    var scale = matrix.a, pivotX = matrix.e - box.left, pivotY = matrix.f - box.top;
    var half = radius * 0.036 + 1, top = radius * 0.93 + 1, height = top + radius * 0.18 + 1;
    var layer = document.createElement('div');
    layer.className = 'sweep';
    layer.style.left = (pivotX - half * scale) + 'px';
    layer.style.top = (pivotY - top * scale) + 'px';
    layer.style.width = 2 * half * scale + 'px';
    layer.style.height = height * scale + 'px';
    layer.style.transformOrigin = half * scale + 'px ' + top * scale + 'px';
    panel.appendChild(layer);
    var second = svg(layer, -half + ' ' + -top + ' ' + 2 * half + ' ' + height);
    add(second, 'line', {
      x1: 0, y1: radius * 0.18, x2: 0, y2: -radius * 0.93, 'stroke-width': Math.max(1, radius * 0.013), 'class': 'seconds-stroke'
    });
    add(second, 'circle', { r: radius * 0.036, 'class': 'seconds' });
    add(second, 'circle', { r: radius * 0.014, 'class': 'background' });
    if (o.secondHand === 'tick') {
      ticking = layer;
      return;
    }
    sweep = layer.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: 60000, iterations: Infinity, easing: o.secondHand === '60' ? 'linear' : 'steps(1800)' });
    keepSweep();
  }

  /** Put the hand back on the clock when the animation drifted, such as after the screen slept or the clock changed. */
  function keepSweep() {
    if (!sweep) return;
    var expected = Date.now() % 60000, drift = (sweep.currentTime - expected) % 60000;
    if (drift > 30000) drift -= 60000;
    if (drift < -30000) drift += 60000;
    if (!(Math.abs(drift) < 40)) sweep.currentTime = expected;
  }

  function time(now) {
    var hours = now.getHours();
    if (hour12) hours = hours % 12 || 12;
    var minutes = now.getMinutes();
    return hours + ':' + (minutes < 10 ? '0' : '') + minutes;
  }

  /** A rounded temperature with a true minus sign. */
  function degrees(value) {
    return String(Math.round(value)).replace('-', '\u2212') + '°';
  }

  /** AM or PM in the page's language, or nothing on a 24-hour clock. */
  var periodFormat = null;
  function period(date) {
    if (!hour12) return '';
    try {
      periodFormat = periodFormat || new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true });
      var parts = periodFormat.formatToParts(date);
      for (var i = 0; i < parts.length; i++) if (parts[i].type === 'dayPeriod') return parts[i].value.toLocaleUpperCase(locale);
    } catch (_) {}
    return date.getHours() < 12 ? 'AM' : 'PM';
  }

  // The kiosk's next alarm, from its Next alarm sensor. It shows once it rings within a day, as on the phone.
  var alarmAt = typeof options.alarm === 'string' ? Date.parse(options.alarm) : NaN;
  if (!isFinite(alarmAt)) alarmAt = null;
  function alarmDue(now) {
    return alarmAt !== null && alarmAt > now.getTime() && alarmAt - now.getTime() <= 24 * 3600 * 1000;
  }
  function alarmIcon(parent, x, y, size) {
    var g = add(parent, 'g', { transform: 'translate(' + x + ',' + y + ') scale(' + size / 32 + ')' });
    add(g, 'path', { d: 'M2.5 10.5a6.5 6.5 0 0 1 8-8zM29.5 10.5a6.5 6.5 0 0 0-8-8z', 'class': 'seconds' });
    add(g, 'path', { d: 'M8.5 26.5l-3 3.5M23.5 26.5l3 3.5', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'class': 'seconds-stroke' });
    add(g, 'circle', { cx: 16, cy: 18, r: 11.5, 'class': 'seconds' });
    add(g, 'path', { d: 'M16 11.5V18l4 2.5', fill: 'none', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'class': 'background-stroke' });
  }
  /**
   * The alarm's icon and time, hidden while no alarm is due. Beside the time on one line, or above it in a column.
   * y is the middle of the time's digits. Returns a function that updates it to the given time and tells whether it
   * changed. The function's group is the label.
   */
  function alarmLabel(parent, x, y, size, beside) {
    var g = add(parent, 'g', { display: 'none' }), icon = size * 1.1;
    if (beside) alarmIcon(g, x, y - icon * 0.55, icon);
    else alarmIcon(g, x, y - size * 0.55 - size * 0.45 - icon, icon);
    var label = text(g, beside ? x + icon * 1.3 : x, y, '', size, 600, 'fill', 'start');
    var shown;
    function update(now) {
      var due = alarmDue(now) ? alarmAt : null;
      if (due === shown) return false;
      shown = due;
      g.setAttribute('display', due === null ? 'none' : 'inline');
      if (due === null) return true;
      var at = new Date(due), suffix = period(at);
      label.textContent = time(at);
      if (suffix) add(label, 'tspan', { 'font-size': size * 0.72, dx: size * 0.06 }).textContent = suffix;
      return true;
    }
    update.group = g;
    return update;
  }
  /** How much an element drawn from anchor must shrink toward it to stay short of limit, at most 1. */
  function fitScale(element, anchor, limit) {
    var box;
    try { box = element.getBBox(); } catch (_) { return 1; }
    var far = limit > anchor ? box.x + box.width : box.x;
    return box.width > 0 && (far - anchor) / (limit - anchor) > 1 ? (limit - anchor) / (far - anchor) : 1;
  }
  function scaleFrom(element, anchor, scale) {
    element.setAttribute('transform', scale < 1 ? 'translate(' + anchor + ',0) scale(' + scale + ') translate(' + -anchor + ',0)' : '');
  }

  // Clocks. Each one draws into its panel and returns a function that moves it to the given time.
  var clocks = {
    'analog': function (panel) {
      var root = svg(panel, '-100 -100 200 200');
      for (var i = 0; i < 60; i++) {
        var angle = i * Math.PI / 30, r = edge(angle, 98, 98, 24);
        if (i % 15 === 0) {
          ray(root, angle, r - 13, r, 3, 'stroke');
          var at = point(angle, r - 39);
          text(root, at[0], at[1], String(i / 5 || 12), 36, 600, 'fill dial');
        } else if (i % 5 === 0) {
          ray(root, angle, r - 24, r, 3, 'stroke');
        } else {
          ray(root, angle, r - 8, r, 1.4, 'stroke dim');
        }
      }
      return hands(root, 94);
    },
    'analog-round': function (panel) {
      // Proportions measured on the phone's own dial: even ticks with the hours in white, numerals on one circle
      // with room to breathe, and two digit hours drawn in a little where their width points at the ticks. The wider
      // view box leaves a margin around the dial.
      var root = svg(panel, '-108 -108 216 216');
      for (var i = 0; i < 60; i++) {
        var angle = i * Math.PI / 30;
        ray(root, angle, 91.5, 98, 2.2, i % 5 === 0 ? 'stroke' : 'stroke dim');
        if (i % 5 === 0) {
          var label = String(i / 5 || 12);
          var at = point(angle, label.length > 1 ? 74.5 - 4.5 * Math.abs(Math.sin(angle)) : 76);
          text(root, at[0], at[1], label, 23, 600, 'fill dial');
        }
      }
      return hands(root, 94, 0.94);
    },
    'digital': function (panel) {
      var root = svg(panel, '-100 -100 200 200');
      var ticks = [];
      for (var i = 0; i < 60; i++) {
        var angle = i * Math.PI / 30, r = edge(angle, 98, 98, 4.6);
        ticks.push(ray(root, angle, r - 9, r, 3, 'stroke ' + (o.seconds ? 'off' : 'faint')));
      }
      var label = text(root, 0, 2, '', 54, 700, 'fill');
      label.setAttribute('letter-spacing', '-2');
      var shown = '', lit = -1;
      return function (now) {
        var value = time(now);
        if (value !== shown) {
          shown = value;
          label.textContent = value;
          label.setAttribute('font-size', value.length > 4 ? 54 : 66);
        }
        if (!o.seconds) return;
        var second = now.getSeconds();
        if (second === lit) return;
        lit = second;
        for (var j = 0; j < 60; j++) ticks[j].setAttribute('class', 'stroke' + (j <= second ? '' : ' off'));
      };
    },
    'full-analog': function (panel, now) {
      var width = panel.clientWidth || innerWidth, height = panel.clientHeight || innerHeight;
      var root = svg(panel, '0 0 ' + width + ' ' + height);
      var center = add(root, 'g', { transform: 'translate(' + width / 2 + ',' + height / 2 + ')' });
      var pad = Math.min(width, height) * 0.035, a = width / 2 - pad, b = height / 2 - pad;
      var small = Math.min(a, b), stroke = small / 100;
      // As on the phone, the 3 and the 9 sit out toward the edges on shorter ticks, leaving room for the date and the
      // alarm. The 12 and the 6 keep to the middle.
      var side = 0.7;
      for (var i = 0; i < 60; i++) {
        var angle = i * Math.PI / 30, r = edge(angle, a, b, 24);
        if (i % 15 === 0) {
          var across = i % 30 !== 0;
          ray(center, angle, r * (across ? 0.82 : 0.72), r, 3.2 * stroke, 'stroke');
          var at = point(angle, r * (across ? side : 0.56));
          text(center, at[0], at[1], String(i / 5 || 12), small * 0.32, 600, 'fill dial wide');
        } else if (i % 5 === 0) {
          ray(center, angle, r * 0.6, r, 2.6 * stroke, 'stroke');
        } else {
          ray(center, angle, r * 0.92, r, 1.3 * stroke, 'stroke dim');
        }
      }
      // The date ends a little before the 3.
      var dateEnd = a * side - small * 0.3, alarmStart = -(a * side - small * 0.33), hub = small * 0.1;
      var date = text(center, dateEnd, 0, '', small * 0.125, 600, 'accent', 'end');
      date.setAttribute('letter-spacing', small * 0.004);
      // The alarm starts a little further from the 9 than the date ends from the 3, as on the phone.
      var alarm = alarmLabel(center, alarmStart, 0, small * 0.125, true);
      var move = hands(center, small * 1.05), day = '';
      return function (now) {
        var today = now.toDateString(), changed = alarm(now);
        if (today !== day) {
          day = today;
          changed = true;
          date.textContent = upper(format(now, { weekday: 'short' })) + ' ';
          add(date, 'tspan', { 'class': 'fill' }).textContent = String(now.getDate());
        }
        if (changed) {
          // Screens less wide than the phone leave less room beside the hub. Both shrink alike to clear it.
          scaleFrom(date, dateEnd, 1);
          scaleFrom(alarm.group, alarmStart, 1);
          var scale = Math.min(fitScale(date, dateEnd, hub), alarm.group.getAttribute('display') === 'none' ? 1 : fitScale(alarm.group, alarmStart, -hub));
          scaleFrom(date, dateEnd, scale);
          scaleFrom(alarm.group, alarmStart, scale);
        }
        move(now);
      };
    },
    'full-digital': function (panel) {
      // The time as large as the screen allows, with a column beside it: the date and the temperature at the top of
      // the digits, the alarm at their foot.
      var width = panel.clientWidth || innerWidth, height = panel.clientHeight || innerHeight;
      var root = svg(panel, '0 0 ' + width + ' ' + height);
      var label = text(root, 0, 0, '00:00', 100, 700, 'fill', 'start');
      label.setAttribute('letter-spacing', -3);
      // Digits share one width, so 00:00 is as wide as any time. Measured, since the font decides it.
      var unit = label.getComputedTextLength() / 100 || 2.9, gap = 0.1, column = 0.5;
      var size = Math.min(height * 0.84, width * 0.9 / (unit + gap + column)), middle = height / 2;
      label.setAttribute('y', middle + size * 0.02);
      label.setAttribute('font-size', size);
      label.setAttribute('letter-spacing', -size * 0.03);
      // Digits are about 0.73 of the size tall, centered on the middle. The column moves with the time's width.
      var small = size * 0.11, top = middle - size * 0.365, bottom = middle + size * 0.365;
      var side = add(root, 'g', {});
      var date = text(side, 0, top + small * 0.37, '', small, 600, 'accent', 'start');
      if (options.weatherConfigured === true && typeof options.weatherTemperature === 'number') {
        text(side, 0, top + small * 1.75, degrees(options.weatherTemperature), small, 600, 'fill', 'start');
      }
      var alarm = alarmLabel(side, 0, bottom - small * 0.37, small, false);
      var shown = '', day = '';
      return function (now) {
        var value = time(now), today = now.toDateString();
        if (value !== shown) {
          label.textContent = shown = value;
          // A one digit hour is narrower. Keep the time and the column together in the middle of the screen.
          var wide = label.getComputedTextLength() || size * unit, left = (width - wide - size * (gap + column)) / 2;
          label.setAttribute('x', left);
          side.setAttribute('transform', 'translate(' + (left + wide + size * gap) + ',0)');
        }
        if (today !== day) {
          day = today;
          date.textContent = upper(format(now, { weekday: 'short' })) + ' ';
          add(date, 'tspan', { 'class': 'fill' }).textContent = String(now.getDate());
        }
        alarm(now);
      };
    }
  };

  // Widgets beside the clock. They are redrawn when the day changes.
  function weatherIcon(parent, condition, x, y, size) {
    var g = add(parent, 'g', { transform: 'translate(' + x + ',' + y + ') scale(' + size / 32 + ')' });
    var cloud = 'M9 27h15.5a6.5 6.5 0 0 0 .4-13A8.5 8.5 0 0 0 8.6 15.2 5.9 5.9 0 0 0 9 27z';
    function sun(cx, cy, r) {
      add(g, 'circle', { cx: cx, cy: cy, r: r, 'class': 'fill' });
      for (var i = 0; i < 8; i++) {
        var angle = i * Math.PI / 4;
        add(g, 'line', {
          x1: cx + Math.sin(angle) * r * 1.5, y1: cy - Math.cos(angle) * r * 1.5,
          x2: cx + Math.sin(angle) * r * 2.1, y2: cy - Math.cos(angle) * r * 2.1,
          'stroke-width': 2, 'stroke-linecap': 'round', 'class': 'stroke'
        });
      }
    }
    function drops(kind) {
      for (var i = 0; i < 3; i++) {
        var dx = 10 + i * 6;
        if (kind === 'snow') add(g, 'circle', { cx: dx, cy: 30 + (i % 2) * 2, r: 1.6, 'class': 'fill' });
        else add(g, 'line', { x1: dx + 1, y1: 29, x2: dx - 1, y2: 33, 'stroke-width': 2, 'stroke-linecap': 'round', 'class': 'stroke' });
      }
    }
    var upCloud = 'translate(0,-4)';
    switch (condition) {
      case 'sunny': sun(16, 16, 6); break;
      case 'clear-night': add(g, 'path', { d: 'M19 4a12 12 0 1 0 9 19A10 10 0 0 1 19 4z', 'class': 'fill' }); break;
      case 'partlycloudy':
        sun(21, 11, 4.5);
        add(g, 'path', { d: cloud, 'class': 'fill', transform: 'translate(-3,2) scale(0.9)' });
        break;
      case 'rainy': case 'pouring': case 'lightning-rainy': case 'hail': case 'snowy': case 'snowy-rainy':
        add(g, 'path', { d: cloud, 'class': 'fill', transform: upCloud });
        drops(condition === 'snowy' ? 'snow' : 'rain');
        if (condition === 'lightning-rainy') add(g, 'path', { d: 'M17 22l-4 6h4l-2 5 6-7h-4l2-4z', 'class': 'seconds' });
        break;
      case 'lightning':
        add(g, 'path', { d: cloud, 'class': 'fill', transform: upCloud });
        add(g, 'path', { d: 'M17 22l-4 6h4l-2 5 6-7h-4l2-4z', 'class': 'fill' });
        break;
      case 'fog':
        for (var i = 0; i < 4; i++) add(g, 'line', { x1: 5 + (i % 2) * 3, y1: 9 + i * 5, x2: 27 - (i % 2) * 3, y2: 9 + i * 5, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'class': 'stroke' });
        break;
      case 'windy': case 'windy-variant':
        add(g, 'path', { d: 'M4 12h17a4 4 0 1 0-4-4M4 18h22a4 4 0 1 1-4 4M4 24h10', fill: 'none', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'class': 'stroke' });
        break;
      default: add(g, 'path', { d: cloud, 'class': 'fill' });
    }
  }

  var widgets = {
    'calendar': function (panel, now) {
      var root = svg(panel, '0 0 200 200');
      var column = 200 / 7, year = now.getFullYear(), month = now.getMonth();
      // Sizes measured on the phone's calendar: digits about 45% of a column, in a regular weight.
      text(root, column / 2 - 6, 14, upper(format(now, { month: 'long' })), 16, 550, 'accent', 'start');
      for (var c = 0; c < 7; c++) {
        var weekday = (firstDay + c) % 7, x = column * (c + 0.5);
        var sample = new Date(2023, 0, 1 + weekday); // 1 January 2023 was a Sunday.
        text(root, x, 44, upper(format(sample, { weekday: 'narrow' })), 12, 600, 'fill' + (weekday % 6 === 0 ? ' dim' : ' soft'));
      }
      var offset = (new Date(year, month, 1).getDay() - firstDay + 7) % 7;
      var days = new Date(year, month + 1, 0).getDate(), rows = Math.ceil((offset + days) / 7);
      var rowHeight = rows > 5 ? 24.5 : 28;
      for (var d = 1; d <= days; d++) {
        var cell = offset + d - 1, cx = column * (cell % 7 + 0.5), cy = 72 + Math.floor(cell / 7) * rowHeight;
        var dayOfWeek = new Date(year, month, d).getDay();
        if (d === now.getDate()) {
          add(root, 'circle', { cx: cx, cy: cy, r: 11, 'class': 'accent' });
          text(root, cx, cy, String(d), 13, 500, 'today-text');
        } else {
          text(root, cx, cy, String(d), 13, 450, 'fill' + (dayOfWeek % 6 === 0 ? ' dim' : ' soft'));
        }
      }
    },
    'date': function (panel, now) {
      var root = svg(panel, '0 0 200 200');
      text(root, 6, 34, upper(format(now, { weekday: 'long' })), 21, 700, 'accent', 'start');
      text(root, 0, 108, String(now.getDate()), 124, 600, 'fill', 'start').setAttribute('letter-spacing', '-5');
      var month = format(now, { month: 'long', year: 'numeric' });
      text(root, 6, 178, capitalized(month), 21, 600, 'fill dim', 'start');
    },
    'weather': function (panel, now) {
      var root = svg(panel, '0 0 200 200');
      if (options.weatherConfigured !== true) {
        text(root, 6, 22, word('weather'), 17, 700, 'fill', 'start');
        var lines = word('choose').match(/.{1,26}(\s|$)/g) || [];
        for (var i = 0; i < lines.length; i++) text(root, 6, 56 + i * 20, lines[i].trim(), 15, 500, 'fill dim', 'start');
        return;
      }
      var place = typeof options.weatherPlace === 'string' ? options.weatherPlace : '';
      if (place.length > 20) place = place.slice(0, 19) + '…';
      text(root, 6, 20, place, 17, 600, 'fill', 'start');
      var temperature = typeof options.weatherTemperature === 'number' ? degrees(options.weatherTemperature) : '--°';
      text(root, 0, 86, temperature, 92, 500, 'fill', 'start').setAttribute('letter-spacing', '-4');
      var condition = typeof options.weatherCondition === 'string' ? options.weatherCondition : '';
      if (condition) weatherIcon(root, condition, 6, 134, 26);
      text(root, 6, 174, conditionName(condition), 17, 700, 'fill', 'start');
      // The plugin sends the day its high and low belong to. They go once that day is over.
      if (options.weatherDate === isoDate(now) && typeof options.weatherHigh === 'number' && typeof options.weatherLow === 'number') {
        text(root, 6, 194, word('high') + Math.round(options.weatherHigh) + '° ' + word('low') + Math.round(options.weatherLow) + '°', 17, 700, 'fill', 'start');
      }
    }
  };

  function nightNow(now) {
    if (o.night === 'always') return true;
    if (o.night === 'entity') return o.nightActive;
    if (o.night !== 'schedule' || o.nightStart === o.nightEnd) return false;
    var hour = now.getHours();
    return o.nightStart < o.nightEnd ? hour >= o.nightStart && hour < o.nightEnd : hour >= o.nightStart || hour < o.nightEnd;
  }

  var root = document.getElementById('root'), clockPanel = document.getElementById('clock'), widgetPanel = document.getElementById('widget');
  var update = null, widgetDay = '', night = null;

  function build() {
    var now = new Date();
    root.className = o.layout === 'full' ? 'full' : o.widget === 'none' ? 'alone' : '';
    if (sweep) sweep.cancel();
    sweep = ticking = null;
    clockPanel.textContent = '';
    update = clocks[o.layout === 'full' ? 'full-' + o.clock : o.clock](clockPanel, now);
    widgetDay = '';
    tick();
  }

  function tick() {
    var now = new Date();
    var dark = nightNow(now);
    if (dark !== night) {
      night = dark;
      document.documentElement.classList.toggle('night', dark);
    }
    var day = now.toDateString();
    if (o.layout === 'widget' && o.widget !== 'none' && day !== widgetDay) {
      widgetDay = day;
      widgetPanel.textContent = '';
      widgets[o.widget](widgetPanel, now);
    }
    update(now);
    keepSweep();
    if (ticking) ticking.style.transform = 'rotate(' + now.getSeconds() * 6 + 'deg)';
  }

  // The second hand sweeps on its own. Everything else changes once a second.
  function second() {
    tick();
    setTimeout(second, 1000 - Date.now() % 1000 + 5);
  }

  var resizeTimer = 0;
  addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });
  // A hidden page runs its timers late. Put the hands right as soon as it shows again.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) tick();
  });
  build();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  second();
}());

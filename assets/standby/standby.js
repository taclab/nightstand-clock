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
  style.setProperty('--background', color(options.background, '#000000'));
  style.setProperty('--night', color(options.nightColor, '#FF2A1F'));
  style.setProperty('--night-opacity', Math.max(20, Math.min(100, number(options.nightBrightness, 70))) / 100);

  // Language, time format and first day of the week.
  var locale = typeof options.locale === 'string' && options.locale ? options.locale : (navigator.language || 'en');
  try { new Intl.DateTimeFormat(locale); } catch (_) { locale = 'en'; }
  var language = locale.slice(0, 2).toLowerCase();
  function format(date, fields) {
    return new Intl.DateTimeFormat(locale, fields).format(date);
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
  function hands(parent, radius) {
    function hand(length, width) {
      var group = add(parent, 'g', {});
      add(group, 'line', { x1: 0, y1: 0, x2: 0, y2: -radius * 0.13, 'stroke-width': width * 0.38, 'class': 'stroke' });
      add(group, 'line', {
        x1: 0, y1: -radius * 0.13, x2: 0, y2: -length, 'stroke-width': width, 'stroke-linecap': 'round', 'class': 'stroke'
      });
      return group;
    }
    var hour = hand(radius * 0.5, radius * 0.064);
    var minute = hand(radius * 0.84, radius * 0.064);
    add(parent, 'circle', { r: radius * 0.048, 'class': 'fill' });
    var second = null;
    if (o.seconds) {
      second = add(parent, 'g', {});
      add(second, 'line', {
        x1: 0, y1: radius * 0.18, x2: 0, y2: -radius * 0.93, 'stroke-width': Math.max(1, radius * 0.013), 'class': 'seconds-stroke'
      });
      add(second, 'circle', { r: radius * 0.036, 'class': 'seconds' });
      add(second, 'circle', { r: radius * 0.014, 'class': 'background' });
    }
    return function (now) {
      var seconds = now.getSeconds() + (o.seconds ? now.getMilliseconds() / 1000 : 0);
      var minutes = now.getMinutes() + seconds / 60;
      hour.setAttribute('transform', 'rotate(' + (((now.getHours() % 12) + minutes / 60) * 30).toFixed(3) + ')');
      minute.setAttribute('transform', 'rotate(' + (minutes * 6).toFixed(3) + ')');
      if (second) second.setAttribute('transform', 'rotate(' + (seconds * 6).toFixed(3) + ')');
    };
  }

  function time(now) {
    var hours = now.getHours();
    if (hour12) hours = hours % 12 || 12;
    var minutes = now.getMinutes();
    return hours + ':' + (minutes < 10 ? '0' : '') + minutes;
  }

  // Clocks. Each one draws into its panel and returns a function that moves it to the given time.
  var clocks = {
    'analog': function (panel) {
      var root = svg(panel, '-100 -100 200 200');
      for (var i = 0; i < 60; i++) {
        var angle = i * Math.PI / 30, r = edge(angle, 98, 98, 4.6);
        if (i % 15 === 0) {
          ray(root, angle, r - 13, r, 3, 'stroke');
          var at = point(angle, r - 39);
          text(root, at[0], at[1], String(i / 5 || 12), 36, 600, 'fill');
        } else if (i % 5 === 0) {
          ray(root, angle, r - 24, r, 3, 'stroke');
        } else {
          ray(root, angle, r - 8, r, 1.4, 'stroke dim');
        }
      }
      return hands(root, 94);
    },
    'analog-round': function (panel) {
      var root = svg(panel, '-100 -100 200 200');
      for (var i = 0; i < 60; i++) {
        var angle = i * Math.PI / 30;
        if (i % 5 === 0) {
          ray(root, angle, 89, 98, 2.6, 'stroke');
          var at = point(angle, 75);
          text(root, at[0], at[1], String(i / 5 || 12), 25, 600, 'fill');
        } else {
          ray(root, angle, 93, 98, 1.2, 'stroke dim');
        }
      }
      return hands(root, 94);
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
      for (var i = 0; i < 60; i++) {
        var angle = i * Math.PI / 30, r = edge(angle, a, b, 7);
        if (i % 15 === 0) {
          ray(center, angle, r * 0.72, r, 3.2 * stroke, 'stroke');
          var at = point(angle, r * 0.56);
          text(center, at[0], at[1], String(i / 5 || 12), small * 0.27, 600, 'fill');
        } else if (i % 5 === 0) {
          ray(center, angle, r * 0.6, r, 2.6 * stroke, 'stroke');
        } else {
          ray(center, angle, r * 0.92, r, 1.3 * stroke, 'stroke dim');
        }
      }
      // Ends a little before the 3, which sits at 56% of the half width.
      var date = text(center, a * 0.56 - small * 0.22, 0, '', small * 0.11, 600, 'accent', 'end');
      date.setAttribute('letter-spacing', small * 0.004);
      var move = hands(center, small * 1.05), day = '';
      return function (now) {
        var today = upper(format(now, { weekday: 'short' })) + ' ' + now.getDate();
        if (today !== day) date.textContent = day = today;
        move(now);
      };
    },
    'full-digital': function (panel) {
      var width = panel.clientWidth || innerWidth, height = panel.clientHeight || innerHeight;
      var root = svg(panel, '0 0 ' + width + ' ' + height);
      var size = Math.min(height * 0.56, width * 0.34);
      var date = text(root, width / 2, height / 2 - size * 0.62, '', size * 0.15, 600, 'accent');
      var label = text(root, width / 2, height / 2 + size * 0.1, '', size, 700, 'fill');
      label.setAttribute('letter-spacing', -size * 0.03);
      var shown = '', day = '';
      return function (now) {
        var value = time(now), today = format(now, { weekday: 'long', day: 'numeric', month: 'long' });
        if (value !== shown) label.textContent = shown = value;
        if (today !== day) date.textContent = day = today.charAt(0).toLocaleUpperCase(locale) + today.slice(1);
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
      text(root, column / 2 - 7, 14, upper(format(now, { month: 'long' })), 18, 700, 'accent', 'start');
      for (var c = 0; c < 7; c++) {
        var weekday = (firstDay + c) % 7, x = column * (c + 0.5);
        var sample = new Date(2023, 0, 1 + weekday); // 1 January 2023 was a Sunday.
        text(root, x, 44, upper(format(sample, { weekday: 'narrow' })), 13, 600, 'fill' + (weekday % 6 === 0 ? ' dim' : ''));
      }
      var offset = (new Date(year, month, 1).getDay() - firstDay + 7) % 7;
      var days = new Date(year, month + 1, 0).getDate(), rows = Math.ceil((offset + days) / 7);
      var rowHeight = rows > 5 ? 24.5 : 28;
      for (var d = 1; d <= days; d++) {
        var cell = offset + d - 1, cx = column * (cell % 7 + 0.5), cy = 72 + Math.floor(cell / 7) * rowHeight;
        var dayOfWeek = new Date(year, month, d).getDay();
        if (d === now.getDate()) {
          add(root, 'circle', { cx: cx, cy: cy, r: 12, 'class': 'accent' });
          text(root, cx, cy, String(d), 15, 700, 'today-text');
        } else {
          text(root, cx, cy, String(d), 15, 600, 'fill' + (dayOfWeek % 6 === 0 ? ' dim' : ''));
        }
      }
    },
    'date': function (panel, now) {
      var root = svg(panel, '0 0 200 200');
      text(root, 6, 34, upper(format(now, { weekday: 'long' })), 21, 700, 'accent', 'start');
      text(root, 0, 108, String(now.getDate()), 124, 600, 'fill', 'start').setAttribute('letter-spacing', '-5');
      var month = format(now, { month: 'long', year: 'numeric' });
      text(root, 6, 178, month.charAt(0).toLocaleUpperCase(locale) + month.slice(1), 21, 600, 'fill dim', 'start');
    },
    'weather': function (panel) {
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
      var temperature = typeof options.weatherTemperature === 'number' ? Math.round(options.weatherTemperature) + '°' : '--°';
      text(root, 0, 86, temperature, 92, 500, 'fill', 'start').setAttribute('letter-spacing', '-4');
      var condition = typeof options.weatherCondition === 'string' ? options.weatherCondition : '';
      if (condition) weatherIcon(root, condition, 6, 134, 26);
      text(root, 6, 174, conditionName(condition), 17, 700, 'fill', 'start');
      if (typeof options.weatherHigh === 'number' && typeof options.weatherLow === 'number') {
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
  }

  // A sweeping second hand needs every frame. Everything else changes once a second.
  var sweeping = o.seconds && o.clock !== 'digital';
  function frame() {
    tick();
    requestAnimationFrame(frame);
  }
  function second() {
    tick();
    setTimeout(second, 1000 - Date.now() % 1000 + 5);
  }

  var resizeTimer = 0;
  addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });
  build();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  if (sweeping) requestAnimationFrame(frame); else second();
}());
